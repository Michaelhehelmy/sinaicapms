import { describe, it, expect } from 'vitest';
import {
  CHECKS_PREFIX,
  REPORTS_PREFIX,
  STATE_PREFIX,
  REPORT_KINDS,
  CHECKS_RETENTION_DAYS,
  REPORTS_RETENTION_DAYS,
  MAX_LIST_PAGES,
  dateStamp,
  timeStamp,
  secondsStamp,
  datePrefix,
  checksKey,
  reportKey,
  reportsPrefix,
  alertStateKey,
  summaryKey,
  historyKey,
  isOlderThan,
  readJson,
  writeJson,
  listPage,
  listAll,
  deleteKeys,
} from '../src/storage.js';

// Pure-key tests for the R2 layout (migration phase 1). These helpers are the
// contract every later phase (cron writes, the status/history reads, the
// intake writes) is written against, so the exact string is pinned here — a
// "cosmetic" change to a key would silently orphan every historical object.
//
// `monitor/tests/cron-r2.test.js` (phase 7) covers the WRITES against these
// keys; do not re-test the key strings there, assert on this module's output.

const T = (iso) => new Date(iso);

describe('storage key layout', () => {
  it('stamps dates and times in UTC, zero padded, in the sortable forms', () => {
    expect(dateStamp(T('2026-10-03T09:05:00.000Z'))).toBe('2026-10-03');
    // 23:55 is the case a naive local-time or unpadded implementation breaks:
    // `23` must not sort before `09`.
    expect(timeStamp(T('2026-10-03T23:55:07.000Z'))).toBe('23-55');
    expect(timeStamp(T('2026-10-03T00:00:00.000Z'))).toBe('00-00');
    expect(timeStamp(T('2026-10-03T09:05:00.000Z'))).toBe('09-05');
  });

  it('UTC, not local: a stamp near midnight UTC is the same instant everywhere', () => {
    // 23:30 UTC is the next day in UTC+2 and the previous evening in UTC-5.
    const d = T('2026-10-03T23:30:00.000Z');
    expect(dateStamp(d)).toBe('2026-10-03');
    expect(timeStamp(d)).toBe('23-30');
  });

  it('secondsStamp is the intake stamp: same rule, one field finer', () => {
    expect(secondsStamp(T('2026-10-03T09:05:07.000Z'))).toBe('09-05-07');
    expect(secondsStamp(T('2026-10-03T23:55:59.000Z'))).toBe('23-55-59');
    expect(secondsStamp(T('2026-10-03T00:00:00.000Z'))).toBe('00-00-00');
    // No colon survives (illegal unescaped in a URL path segment) and the field
    // is fixed width, so keys inside one minute still sort by arrival.
    expect(secondsStamp(T('2026-10-03T09:05:07.000Z'))).not.toMatch(/:/);
    const early = secondsStamp(T('2026-10-03T09:05:07.000Z'));
    const late = secondsStamp(T('2026-10-03T09:05:59.000Z'));
    expect([late, early].sort()).toEqual([early, late]);
    // UTC, like every other stamp in this layout.
    expect(secondsStamp(T('2026-10-03T23:30:00.000Z'))).toBe('23-30-00');
  });

  it('datePrefix always ends in a slash so day buckets cannot bleed', () => {
    const d = T('2026-10-03T09:05:00.000Z');
    expect(datePrefix(CHECKS_PREFIX, d)).toBe('checks/2026-10-03/');
    // Without the trailing slash, `checks/2026-10-0` would also match
    // `checks/2026-10-03/...` and one listing would return two days.
    expect(datePrefix('checks/2026-10-0', d)).toBe('checks/2026-10-0/2026-10-03/');
  });

  it('checksKey is one object per run, sortable across runs and across days', () => {
    const early = checksKey(T('2026-10-03T09:05:00.000Z'));
    const late = checksKey(T('2026-10-03T23:55:00.000Z'));
    const nextDay = checksKey(T('2026-10-04T00:00:00.000Z'));
    expect(early).toBe('checks/2026-10-03/09-05.json');
    expect(late).toBe('checks/2026-10-03/23-55.json');
    expect(nextDay).toBe('checks/2026-10-04/00-00.json');
    // The whole point of the HH-MM stamp: R2 lists keys in byte order, so
    // "newest run" is "last key" with no timestamp parsing.
    expect([nextDay, early, late].sort()).toEqual([early, late, nextDay]);
    // No colon or other URL-hostile character anywhere in the key.
    expect(early).not.toMatch(/[:?#\s]/);
  });

  it('checksKey defaults to now, so a caller can never write a null key', () => {
    expect(checksKey()).toMatch(/^checks\/\d{4}-\d{2}-\d{2}\/\d{2}-\d{2}\.json$/);
  });

  it('reportsPrefix scopes by kind and rejects an unknown one', () => {
    expect(reportsPrefix()).toBe('reports/');
    expect(reportsPrefix('errors')).toBe('reports/errors/');
    expect(reportsPrefix('feedback')).toBe('reports/feedback/');
    expect(REPORT_KINDS).toEqual(['errors', 'feedback']);
    // A typo must throw at the call site, not silently create a new collection
    // the retention sweep will never visit.
    expect(() => reportsPrefix('erorr')).toThrow(/unknown report kind/);
  });

  it('reportKey is unique per second and keeps the extension unambiguous', () => {
    const d = T('2026-10-03T09:05:07.000Z');
    const key = reportKey('errors', d, '09:05:07', 42);
    expect(key).toBe('reports/errors/2026-10-03/09-05-07-42.json');
    // Colons are illegal unescaped in a URL path segment and dots would sit
    // next to the extension, so the stamp is sanitized.
    expect(key).not.toMatch(/[:]/);
    expect(key.split('.').length).toBe(2);
    // Two reports in the same second get distinct keys (an overwrite would
    // silently lose intake data).
    expect(reportKey('errors', d, '09:05:07.123', 42)).not.toBe(
      reportKey('errors', d, '09:05:07.456', 42),
    );
  });

  it('reportKey rejects an unknown kind', () => {
    expect(() => reportKey('nope', T('2026-10-03T00:00:00.000Z'), '00-00-00', 1)).toThrow(
      /unknown report kind/,
    );
  });

  it('state keys are single, undated documents', () => {
    expect(alertStateKey()).toBe('state/alert_state.json');
    expect(summaryKey()).toBe('state/summary.json');
    // Neither may be swept by the age-based retention pass.
    expect(alertStateKey().startsWith(`${STATE_PREFIX}/`)).toBe(true);
    expect(summaryKey().startsWith(`${STATE_PREFIX}/`)).toBe(true);
    expect(alertStateKey()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('historyKey is per target, under state/, and rejects anything outside the name set', () => {
    // The read path builds this from a QUERY STRING, so the key is only ever
    // assembled from a closed character set: a `/` or a `..` would file a
    // document outside `state/history/`.
    expect(historyKey('marketplace')).toBe('state/history/marketplace.json');
    expect(historyKey('api-meals')).toBe('state/history/api-meals.json');
    expect(historyKey('self-check').startsWith(`${STATE_PREFIX}/history/`)).toBe(true);
    // Undated and undeletable by the age sweep, like the other state documents.
    expect(historyKey('marketplace')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    for (const bad of ['', '  ', 'Marketplace', '../alert_state', 'a/b', 'a.json', null, undefined]) {
      expect(() => historyKey(bad), String(bad)).toThrow(/invalid history target/);
    }
  });

  it('top-level prefixes are the three namespaced collections', () => {
    expect([CHECKS_PREFIX, REPORTS_PREFIX, STATE_PREFIX]).toEqual([
      'checks',
      'reports',
      'state',
    ]);
    expect(checksKey(T('2026-10-03T00:00:00.000Z')).startsWith(`${CHECKS_PREFIX}/`)).toBe(true);
    expect(reportKey('feedback', T('2026-10-03T00:00:00.000Z'), '00-00-00', 1).startsWith(`${REPORTS_PREFIX}/`)).toBe(true);
  });

  it('carries the D1 retention windows forward unchanged', () => {
    // 14 days is bounded by /api/history's 168h clamp; 30 by the fact that
    // reports have no time-windowed UI. Both must match what db.js used.
    expect(CHECKS_RETENTION_DAYS).toBe(14);
    expect(REPORTS_RETENTION_DAYS).toBe(30);
  });
});

describe('isOlderThan', () => {
  const now = T('2026-10-03T12:00:00.000Z');
  const daysAgo = (days, hours = 0) => new Date(now.getTime() - days * 86400000 - hours * 3600000);

  it('deletes strictly older than the window and keeps the boundary', () => {
    expect(isOlderThan(daysAgo(14, 1), now, 14)).toBe(true);
    // Strict `<`: an object exactly at the cutoff survives, matching the D1
    // prune's `ts < ?` semantics.
    expect(isOlderThan(daysAgo(14), now, 14)).toBe(false);
    expect(isOlderThan(daysAgo(13, 23), now, 14)).toBe(false);
  });

  it('accepts both a Date (real bucket) and an ISO string (JSON round-trip)', () => {
    expect(isOlderThan(daysAgo(15).toISOString(), now, 14)).toBe(true);
    expect(isOlderThan(daysAgo(15), now, 14)).toBe(true);
    expect(isOlderThan(daysAgo(1).toISOString(), now, 14)).toBe(false);
  });

  it('never deletes on an unreadable timestamp', () => {
    // Failing open here means "not old"; deleting on a value we could not
    // understand is the wrong direction to fail in.
    expect(isOlderThan(undefined, now, 14)).toBe(false);
    expect(isOlderThan(null, now, 14)).toBe(false);
    expect(isOlderThan('not-a-date', now, 14)).toBe(false);
  });

  it('honours a different window per collection', () => {
    expect(isOlderThan(daysAgo(20), now, 30)).toBe(false);
    expect(isOlderThan(daysAgo(31), now, 30)).toBe(true);
  });
});

// --- mechanics: read / write / list / delete -------------------------------
//
// An in-memory R2 double. `list()` returns keys in byte order with a cursor,
// exactly like the real binding, so the pagination contract is exercised here
// rather than assumed.

class FakeBucket {
  constructor({ pageSize = 2, throwOn = null } = {}) {
    this.store = new Map();
    this.pageSize = pageSize;
    this.throwOn = throwOn;
    this.puts = [];
    this.deletes = [];
  }
  seed(key, value, uploaded = '2026-10-01T00:00:00.000Z') {
    this.store.set(key, { json: async () => value, uploaded });
  }
  async get(key) {
    const hit = this.store.get(key);
    if (!hit) return null;
    return { json: hit.json };
  }
  async put(key, body, opts) {
    this.puts.push({ key, body, opts });
    const value = JSON.parse(body);
    this.store.set(key, { json: async () => value, uploaded: '2026-10-03T12:00:00.000Z' });
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const keys = [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + Math.min(limit, this.pageSize));
    const end = start + page.length;
    return {
      objects: page.map((key) => ({ key, uploaded: this.store.get(key).uploaded })),
      truncated: end < keys.length,
      cursor: end < keys.length ? String(end) : undefined,
    };
  }
  async delete(keys) {
    if (this.throwOn === 'delete') throw new Error('injected delete failure');
    const list = Array.isArray(keys) ? keys : [keys];
    this.deletes.push(list);
    for (const key of list) this.store.delete(key);
  }
}

describe('storage mechanics', () => {
  it('writeJson stores application/json and round-trips through readJson', async () => {
    const bucket = new FakeBucket();
    await writeJson(bucket, summaryKey(), { targets: { marketplace: { okCount: 2, totalCount: 3 } } });
    expect(bucket.puts[0].key).toBe('state/summary.json');
    expect(bucket.puts[0].opts.httpMetadata.contentType).toBe('application/json');
    expect(await readJson(bucket, 'state/summary.json')).toEqual({
      targets: { marketplace: { okCount: 2, totalCount: 3 } },
    });
  });

  it('readJson returns the fallback for an absent key (cold bucket = empty)', async () => {
    const bucket = new FakeBucket();
    expect(await readJson(bucket, alertStateKey(), {})).toEqual({});
  });

  it('readJson THROWS on a corrupt body rather than resetting state', async () => {
    const bucket = new FakeBucket();
    bucket.seed(alertStateKey(), null);
    bucket.get = async () => ({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    // A swallowed parse error would hand the caller the fallback and write that
    // back, silently dropping `last_state: 'down'` — so it must throw and let
    // the caller's try/catch skip the step with the file untouched.
    await expect(readJson(bucket, alertStateKey(), {})).rejects.toThrow();
  });

  it('listAll walks every page via the cursor and returns keys ascending', async () => {
    const bucket = new FakeBucket({ pageSize: 2 });
    for (const key of [
      'checks/2026-10-02/23-55.json',
      'checks/2026-10-03/09-05.json',
      'checks/2026-10-03/23-55.json',
      'state/alert_state.json',
    ]) {
      bucket.seed(key, {});
    }
    const all = await listAll(bucket, { prefix: 'checks/' });
    expect(all.map((o) => o.key)).toEqual([
      'checks/2026-10-02/23-55.json',
      'checks/2026-10-03/09-05.json',
      'checks/2026-10-03/23-55.json',
    ]);
    // The `uploaded` timestamp travels with each key so the sweep can decide
    // age without a per-object HEAD.
    expect(all[0].uploaded).toBe('2026-10-01T00:00:00.000Z');
  });

  it('listAll stops at maxKeys instead of walking the whole bucket', async () => {
    const bucket = new FakeBucket({ pageSize: 2 });
    for (let i = 0; i < 10; i += 1) bucket.seed(`checks/2026-10-03/0${i}-00.json`, {});
    expect(await listAll(bucket, { prefix: 'checks/', maxKeys: 3 })).toHaveLength(3);
  });

  it('listAll terminates when a truncated page comes back without a cursor', async () => {
    const bucket = new FakeBucket();
    bucket.list = async () => ({ objects: [{ key: 'checks/x.json', uploaded: null }], truncated: true });
    // A cursor that never advances would spin forever inside the cron; the
    // missing cursor is the stop signal.
    expect(await listAll(bucket, { prefix: 'checks/' })).toHaveLength(1);
    expect(MAX_LIST_PAGES).toBeGreaterThan(0);
  });

  it('listPage exposes one raw page for a manual cursor walk', async () => {
    const bucket = new FakeBucket({ pageSize: 2 });
    for (const key of ['checks/a.json', 'checks/b.json', 'checks/c.json']) bucket.seed(key, {});
    const first = await listPage(bucket, { prefix: 'checks/' });
    expect(first.objects.map((o) => o.key)).toEqual(['checks/a.json', 'checks/b.json']);
    expect(first.truncated).toBe(true);
    const second = await listPage(bucket, { prefix: 'checks/', cursor: first.cursor });
    expect(second.objects.map((o) => o.key)).toEqual(['checks/c.json']);
    expect(second.truncated).toBe(false);
  });

  it('deleteKeys batches at 1000 (R2 rejects an over-long array outright)', async () => {
    const bucket = new FakeBucket();
    const keys = Array.from({ length: 2500 }, (_, i) => `checks/2026-09-01/00-${String(i).padStart(2, '0')}.json`);
    expect(await deleteKeys(bucket, keys)).toBe(2500);
    expect(bucket.deletes.map((d) => d.length)).toEqual([1000, 1000, 500]);
    expect(bucket.store.size).toBe(0);
  });

  it('a failing delete propagates (the caller decides whether to continue)', async () => {
    const bucket = new FakeBucket({ throwOn: 'delete' });
    await expect(deleteKeys(bucket, ['a', 'b'])).rejects.toThrow(/injected delete failure/);
  });
});