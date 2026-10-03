import { describe, it, expect, afterEach, vi } from 'vitest';
import { scheduled, runRetention } from '../src/index.js';
import { TARGETS } from '../src/targets.js';
import { CHECKS_RETENTION_DAYS, REPORTS_RETENTION_DAYS } from '../src/storage.js';
import { makeR2, stubFetch, HOUR_0 } from './helpers/fake-r2.js';

// Retention policy guard — real `runRetention()`, real `scheduled()` wiring.
//
// This file used to replay the three D1 migrations into `node:sqlite` and assert
// on surviving ROWS, because the D1 prunes were SQL and a SQL-dispatching stub
// could not tell "deleted the right rows" from "deleted none". Nothing under test
// is SQL any more: retention is now "list a prefix, delete what is over-age", so
// the equivalent proof is on KEYS in an R2 double that lists in byte order with
// a cursor — which is exactly the property a naive Map stub would fake away.
//
// `scheduled()` is still driven (with the clock pinned to UTC hour 0 via fake
// timers) so a sweep that works but is never wired in would fail here, as before.
//
// STILL D1, STILL CALLED: `scheduled()` runs `clearOldLoginAttempts` (the PIN
// brute-force table) and that is the last D1 write in the cron — phase 6 moves
// it. The stub below answers only that DELETE.

const HOUR_0_MINUS = (hours) => new Date(HOUR_0.getTime() - hours * 3600 * 1000);

// Windows under test, in days.
const CHECKS_DAYS = CHECKS_RETENTION_DAYS; // 14
const REPORTS_DAYS = REPORTS_RETENTION_DAYS; // 30

// Minimal D1 stub: the cron only issues one statement (the login_attempts
// prune). A throw here is a genuine failure, not something to swallow.
function makeDb() {
  return {
    prepare(sql) {
      return {
        sql,
        bind() {
          return this;
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };
}

const envWith = (bucket, extra = {}) => ({ DB: makeDb(), MONITOR_BUCKET: bucket, ...extra });

const checksKeys = (bucket) => bucket.keys().filter((k) => k.startsWith('checks/'));
const reportKeys = (bucket, kind) => bucket.keys().filter((k) => k.startsWith(`reports/${kind}/`));

// Seed an object whose `uploaded` is `hours` before HOUR_0. Age comes from the
// LISTING, so this is how a test says "this object is 15 days old".
function seed(bucket, key, hoursOld = 1) {
  bucket.seed(key, { seeded: true }, HOUR_0_MINUS(hoursOld).toISOString());
  return key;
}

const daysOld = (days) => days * 24;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('cron retention sweep (R2)', () => {
  it('deletes checks objects older than 14 days and keeps everything inside the window', async () => {
    const bucket = makeR2();
    seed(bucket, 'checks/2026-10-02/23-55.json', 1);
    seed(bucket, 'checks/2026-09-19/12-00.json', daysOld(CHECKS_DAYS) - 1); // just inside
    seed(bucket, 'checks/2026-09-19/11-55.json', daysOld(CHECKS_DAYS) + 1); // just outside
    seed(bucket, 'checks/2026-08-01/00-00.json', daysOld(40));

    await runRetention(envWith(bucket), HOUR_0);

    expect(checksKeys(bucket)).toEqual([
      'checks/2026-09-19/12-00.json', // boundary-inside survives
      'checks/2026-10-02/23-55.json',
    ]);
  });

  it('keeps the whole widest dashboard window (168h), so retention can never blank a rendered chart', async () => {
    const bucket = makeR2();
    seed(bucket, 'checks/2026-09-26/00-00.json', 168); // oldest edge of the largest legal query
    seed(bucket, 'checks/2026-09-19/12-00.json', daysOld(CHECKS_DAYS) - 1);

    await runRetention(envWith(bucket), HOUR_0);

    expect(checksKeys(bucket)).toHaveLength(2);
  });

  it('applies a DIFFERENT window per collection (a 20-day report outlives a 15-day check)', async () => {
    const bucket = makeR2();
    seed(bucket, 'checks/2026-09-19/00-00.json', daysOld(15));
    seed(bucket, 'reports/errors/2026-09-13/09-00-00-1.json', daysOld(20));
    seed(bucket, 'reports/errors/2026-08-20/09-00-00-2.json', daysOld(REPORTS_DAYS) + 1);
    seed(bucket, 'reports/feedback/2026-08-25/09-00-00-3.json', daysOld(31));

    await runRetention(envWith(bucket), HOUR_0);

    // 15 days kills the check but the 20-day report is well inside 30.
    expect(checksKeys(bucket)).toHaveLength(0);
    expect(reportKeys(bucket, 'errors')).toEqual(['reports/errors/2026-09-13/09-00-00-1.json']);
    expect(reportKeys(bucket, 'feedback')).toEqual([]);
  });

  it('never sweeps the state documents', async () => {
    const bucket = makeR2();
    bucket.seed('state/alert_state.json', { marketplace: { last_state: 'down' } }, HOUR_0_MINUS(daysOld(365)).toISOString());
    bucket.seed('state/summary.json', { targets: {} }, HOUR_0_MINUS(daysOld(365)).toISOString());

    await runRetention(envWith(bucket), HOUR_0);

    // A year-old state document is exactly the state that must survive a quiet
    // period — `state/` is rewritten in place, never aged out.
    expect(bucket.keys().sort()).toEqual(['state/alert_state.json', 'state/summary.json']);
  });

  it('runs ONLY at UTC hour 0, and deletes nothing at any other hour', async () => {
    const bucket = makeR2();
    seed(bucket, 'checks/2026-01-01/00-00.json', daysOld(400));

    // Every cron tick inside hour 0 sweeps (there are 12 of them) — the gate is
    // the HOUR, not a "first run of the day" flag that a lost write could skip.
    for (const iso of ['2026-10-03T00:00:00.000Z', '2026-10-03T00:12:00.000Z', '2026-10-03T00:55:00.000Z']) {
      expect(await runRetention(envWith(bucket), new Date(iso))).not.toMatchObject({ skipped: true });
      expect(checksKeys(bucket)).toHaveLength(0);
      seed(bucket, 'checks/2026-01-01/00-00.json', daysOld(400)); // re-seed for the next pass
    }

    // One minute before and one minute after the hour: no listing at all.
    const listsBefore = bucket.calls.list.length;
    for (const iso of ['2026-10-02T23:55:00.000Z', '2026-10-03T01:00:00.000Z', '2026-10-03T12:00:00.000Z']) {
      expect(await runRetention(envWith(bucket), new Date(iso))).toMatchObject({ skipped: true, reason: 'not-utc-hour-0' });
    }
    expect(checksKeys(bucket)).toHaveLength(1);
    expect(bucket.calls.list).toHaveLength(listsBefore); // a skipped sweep lists nothing at all
  });

  it('pages through the listing with the R2 cursor instead of assuming one page', async () => {
    // pageSize 2 against 9 keys = 5 pages; a single-page sweep would see 2.
    const bucket = makeR2({ pageSize: 2 });
    for (let i = 0; i < 9; i += 1) seed(bucket, `checks/2026-01-0${1 + Math.floor(i / 3)}/0${i}-00.json`, daysOld(40));

    const res = await runRetention(envWith(bucket), HOUR_0);

    expect(res.checks).toBe(9);
    expect(checksKeys(bucket)).toHaveLength(0);
    expect(bucket.calls.list.filter((c) => c.prefix === 'checks/').length).toBeGreaterThan(1);
    expect(bucket.calls.list.some((c) => c.cursor)).toBe(true); // the cursor was actually used
  });

  it('reports per-collection counts and never touches the other prefixes', async () => {
    const bucket = makeR2();
    seed(bucket, 'checks/2026-08-01/00-00.json', daysOld(40));
    seed(bucket, 'reports/errors/2026-08-01/00-00-00-1.json', daysOld(40));
    seed(bucket, 'reports/feedback/2026-09-30/00-00-00-2.json', 1);

    const res = await runRetention(envWith(bucket), HOUR_0);

    expect(res).toEqual({ checks: 1, 'reports/errors': 1, 'reports/feedback': 0 });
  });

  it('a failing sweep step never fails the cron, and the other steps still run', async () => {
    const bucket = makeR2({ failOn: { delete: 'checks/' } });
    seed(bucket, 'checks/2026-08-01/00-00.json', daysOld(40));
    seed(bucket, 'reports/errors/2026-08-01/00-00-00-1.json', daysOld(40));
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    // Must RESOLVE. A rejection here would silence the cron that produces the
    // alert reporting the broken bucket.
    await expect(runRetention(envWith(bucket), HOUR_0)).resolves.toBeDefined();

    // The failing step is the only casualty: its objects remain...
    expect(checksKeys(bucket)).toHaveLength(1);
    // ...while the report sweeps still pruned.
    expect(reportKeys(bucket, 'errors')).toHaveLength(0);
    expect(errors.map((e) => e.join(' '))).toEqual([
      expect.stringContaining('monitor retention step failed checks'),
    ]);
  });

  it('a failing LIST is contained too, and reported as null', async () => {
    const bucket = makeR2({ failOn: { list: 'checks/' } });
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    const res = await runRetention(envWith(bucket), HOUR_0);

    expect(res.checks).toBeNull();
    expect(res['reports/errors']).toBe(0); // later steps still ran
    expect(errors.map((e) => e.join(' ')).join('\n')).toContain(
      'monitor retention step failed checks',
    );
  });

  it('is idempotent — a second sweep in the same hour prunes nothing further', async () => {
    const bucket = makeR2();
    seed(bucket, 'checks/2026-08-01/00-00.json', daysOld(40));
    seed(bucket, 'reports/errors/2026-08-01/00-00-00-1.json', daysOld(40));
    seed(bucket, 'checks/2026-10-03/00-10.json', 1);

    await runRetention(envWith(bucket), HOUR_0);
    // All 12 cron runs inside UTC hour 0 do this; the last must find nothing.
    await runRetention(envWith(bucket), new Date('2026-10-03T00:55:00.000Z'));

    expect(checksKeys(bucket)).toEqual(['checks/2026-10-03/00-10.json']);
    expect(bucket.keys().sort()).toEqual(['checks/2026-10-03/00-10.json']);
  });

  it('a cold bucket sweeps cleanly (nothing to list, nothing to delete)', async () => {
    const bucket = makeR2();
    expect(await runRetention(envWith(bucket), HOUR_0)).toEqual({
      checks: 0,
      'reports/errors': 0,
      'reports/feedback': 0,
    });
  });
});

describe('scheduled() cron wiring (R2)', () => {
  // Pin the clock: `scheduled()` takes no clock argument (Cloudflare has none),
  // so fake timers are how a test reaches the UTC-hour-0 sweep through the real
  // entry point instead of asserting on a directly-called helper.
  function pinClock(iso = HOUR_0.toISOString()) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    vi.stubGlobal('fetch', stubFetch(200).impl);
  }

  it('writes one object per run and sweeps in the same pass, at hour 0', async () => {
    pinClock();
    const bucket = makeR2();
    seed(bucket, 'checks/2026-01-01/00-00.json', daysOld(400));

    await scheduled({}, envWith(bucket));

    const fresh = bucket.keys().filter((k) => k.startsWith('checks/2026-10-03/'));
    // Exactly one new run object for the whole cycle (5 targets, 1 object).
    expect(fresh).toEqual(['checks/2026-10-03/00-12.json']);
    expect(checksKeys(bucket)).toEqual(['checks/2026-10-03/00-12.json']); // the ancient one is gone
    const doc = bucket.read('checks/2026-10-03/00-12.json');
    expect(doc.run_at).toBe(HOUR_0.toISOString());
    expect(doc.results.map((r) => r.name)).toEqual(TARGETS.map((t) => t.name));
    // The read path's per-target rings are written by the same pass, so
    // /api/history is never a window behind the run objects it was cut from.
    for (const t of TARGETS) {
      const ring = bucket.read(`state/history/${t.name}.json`);
      expect(ring.entries.map((e) => e.checked_at)).toEqual([HOUR_0.toISOString()]);
    }
  });

  it('every cron run writes its own object — 5 targets, one object per tick', async () => {
    for (const stamp of ['00:05:00', '00:10:00', '00:15:00']) {
      pinClock(`2026-10-03T${stamp}.000Z`);
      const bucket = makeR2();
      await scheduled({}, envWith(bucket));
      expect(checksKeys(bucket)).toEqual([`checks/2026-10-03/${stamp.slice(0, 5).replace(':', '-')}.json`]);
      vi.useRealTimers();
    }
  });

  it('never writes to the D1 probe/alert/report tables (login_attempts only)', async () => {
    pinClock();
    const bucket = makeR2();
    const statements = [];
    const db = {
      prepare(sql) {
        statements.push(sql);
        return {
          bind() {
            return this;
          },
          async run() {
            return { success: true, meta: { changes: 0 } };
          },
        };
      },
    };

    await scheduled({}, { DB: db, MONITOR_BUCKET: bucket });

    // The ONLY D1 statement the cron may still issue is the login_attempts prune.
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/DELETE FROM login_attempts/);
  });

  it('a broken R2 put fails the run loudly (the monitor must not go quietly stale)', async () => {
    pinClock();
    const bucket = makeR2({ failOn: { put: 'checks/' } });
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    // Probe + write are deliberately NOT wrapped: a failure to record the run is
    // a real failure and must surface as a cron error, not a silent dashboard.
    await expect(scheduled({}, envWith(bucket))).rejects.toThrow(/injected R2 put failure/);
    expect(bucket.read('state/alert_state.json')).toBeUndefined(); // nothing after it ran
  });

  it('a rollup failure is swallowed: derived data must not cancel the alerting', async () => {
    pinClock();
    const bucket = makeR2({ failOn: { put: 'state/summary.json' } });
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    await expect(scheduled({}, envWith(bucket))).resolves.toBeUndefined();

    expect(errors.map((e) => e.join(' '))).toEqual([
      expect.stringContaining('monitor summary update failed'),
    ]);
    // The parts that matter still happened: the run object, the alert state, and
    // the rings — a failed summary must not skip the steps after it either.
    expect(bucket.keys().some((k) => k.startsWith('checks/2026-10-03/'))).toBe(true);
    expect(Object.keys(bucket.read('state/alert_state.json'))).toEqual(TARGETS.map((t) => t.name));
    expect(bucket.keys().filter((k) => k.startsWith('state/history/'))).toHaveLength(TARGETS.length);
  });

  it('a ring failure is swallowed with its own log line, and the cron still completes', async () => {
    pinClock();
    const bucket = makeR2({ failOn: { put: 'state/history/' } });
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    await expect(scheduled({}, envWith(bucket))).resolves.toBeUndefined();

    expect(errors.map((e) => e.join(' '))).toEqual([
      expect.stringContaining('monitor history ring update failed'),
    ]);
    // The alerting half and the sweep still ran.
    expect(bucket.keys().some((k) => k.startsWith('checks/2026-10-03/'))).toBe(true);
    expect(Object.keys(bucket.read('state/alert_state.json'))).toEqual(TARGETS.map((t) => t.name));
    expect(bucket.read('state/summary.json')).toBeTruthy();
  });

  it('probes every target over the network exactly once, and retention fetches nothing', async () => {
    pinClock();
    const bucket = makeR2();
    const urls = [];
    vi.stubGlobal('fetch', async (url) => {
      urls.push(String(url));
      return { status: 200, ok: true };
    });

    await scheduled({}, envWith(bucket));

    expect(urls).toHaveLength(TARGETS.length);
    for (const t of TARGETS) expect(urls).toContain(t.url);
  });
});