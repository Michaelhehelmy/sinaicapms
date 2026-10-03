import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  app,
  timingSafeEqual,
  getBearerToken,
  isAuthorizedToken,
  checkReportRateLimit,
  clearPublicCache,
  FAVICON_CACHE_CONTROL,
  REPORT_RATE_LIMIT,
  HISTORY_MAX_WINDOW_HOURS,
  readRecentChecks,
} from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth.js';
import { TARGETS } from '../src/targets.js';
import { checksKey, historyKey } from '../src/storage.js';
import { makeR2, seedRun, seedSummary, seedAlertState, seedRing, ringEntry } from './helpers/fake-r2.js';

// In-memory D1 stand-in covering every SQL shape db.js still has: the intake
// reports (until phase 5 moves them to `/api/reports`) and the PIN gate.
//
// The PROBE table is deliberately not implemented any more. Phase 3 moved the
// status/history/dashboard reads to R2, and a stub that still answered `FROM
// checks` would quietly let a query back in: the assertion below throws on any
// probe-table SQL, so reintroducing one fails here instead of passing against a
// stale stub and reading a table the cron stopped writing in phase 2.
class FakeStmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async run() {
    return this.db.execRun(this.sql, this.args);
  }
  async all() {
    return { results: this.db.execAll(this.sql, this.args) };
  }
  async first() {
    const rows = this.db.execAll(this.sql, this.args);
    return rows[0] ?? null;
  }
}

class FakeDb {
  constructor() {
    this.reports = [];
    this.attempts = [];
    this.reportSeq = 0;
    this.tick = 0;
  }
  prepare(sql) {
    return new FakeStmt(this, sql);
  }
  seedReport(row) {
    this.reportSeq += 1;
    this.tick += 1;
    this.reports.push({
      id: this.reportSeq,
      kind: 'error',
      message: 'seeded',
      page_url: null,
      contact: null,
      status: 'new',
      created_at: `2026-09-29 00:01:${String(this.tick).padStart(2, '0')}`,
      ...row,
    });
    return this.reports[this.reports.length - 1];
  }
  execRun(sql, args) {
    if (sql.startsWith('INSERT INTO checks') || sql.startsWith('INSERT INTO alert_state')) {
      throw new Error(`FakeDb.run: ${sql} — probe history and alert state moved to R2 (phase 2)`);
    }
    if (sql.startsWith('INSERT INTO reports')) {
      const [kind, message, page_url, contact] = args;
      this.reportSeq += 1;
      this.tick += 1;
      this.reports.push({
        id: this.reportSeq,
        kind,
        message,
        page_url,
        contact,
        status: 'new',
        created_at: `2026-09-29 00:01:${String(this.tick).padStart(2, '0')}`,
      });
      return { success: true, meta: { last_row_id: this.reportSeq } };
    }
    if (sql.startsWith('INSERT INTO login_attempts')) {
      const [ip, success] = args;
      this.tick += 1;
      this.attempts.push({
        id: this.attempts.length + 1,
        ip,
        success,
        attempted_at: `2026-09-29 00:02:${String(this.tick).padStart(2, '0')}`,
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM login_attempts')) {
      this.attempts = [];
      return { success: true };
    }
    throw new Error(`FakeDb.run: unhandled SQL: ${sql}`);
  }
  execAll(sql, args) {
    if (sql.includes('FROM login_attempts')) {
      const [ip] = args;
      const fails = this.attempts.filter((r) => r.ip === ip && r.success === 0).length;
      return [{ fail_count: fails }];
    }
    if (sql.includes('FROM checks') || sql.includes('FROM alert_state')) {
      throw new Error(`FakeDb.all: ${sql} — probe history and alert state moved to R2 (phase 3)`);
    }
    if (sql.includes('FROM reports')) {
      const [limit] = args;
      return [...this.reports].sort((a, b) => b.id - a.id).slice(0, limit);
    }
    throw new Error(`FakeDb.all: unhandled SQL: ${sql}`);
  }
}

const REPORT_TOKEN = 'test-report-secret';
const DASHBOARD_PIN = '123456';
// The worker always has BOTH bindings. Phase 3 made the R2 bucket the source for
// the public reads too, so a test that wants to assert on them passes its own
// double in (the default is a fresh empty bucket = "nothing has ever run").
const envFor = (db, extra = {}) => ({
  DB: db,
  MONITOR_BUCKET: extra.MONITOR_BUCKET ?? makeR2(),
  REPORT_TOKEN,
  DASHBOARD_PIN,
  ...extra,
});

// A bucket holding one healthy run for every target, a fully-up rollup, and one
// history-ring entry each: the smallest fixture that renders a dashboard as OK
// with a populated "Recent checks" table.
function okBucket({ at = '2026-10-03T12:00:00.000Z', ok = () => true } = {}) {
  const bucket = makeR2();
  const when = new Date(at);
  seedRun(bucket, when, TARGETS.map((t) => ({ name: t.name, ok: ok(t) })));
  seedSummary(bucket, Object.fromEntries(TARGETS.map((t) => [t.name, { okCount: 12, totalCount: 12 }])));
  for (const t of TARGETS) {
    seedRing(bucket, t.name, [ringEntry(when, 5, { response_ms: 4321 })]);
  }
  return bucket;
}

function postReport(path, { token = REPORT_TOKEN, body = { message: 'help' }, ip = '10.9.0.1' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'cf-connecting-ip': ip };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, envFor(new FakeDb()));
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  // The 20s public read cache lives on globalThis (per-isolate in production).
  // Every test builds its own storage doubles, so a leftover entry would leak
  // one test's bucket into the next — clear it around every test.
  clearPublicCache();
});

describe('constant-time token helpers', () => {
  it('equal strings match, anything else denies', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(false);
    expect(timingSafeEqual(null, 'x')).toBe(false);
    expect(timingSafeEqual('x', null)).toBe(false);
  });

  it('bearer parsing + fail-closed auth', () => {
    expect(getBearerToken('Bearer s3cret')).toBe('s3cret');
    expect(getBearerToken('bearer s3cret')).toBeNull();
    expect(getBearerToken('Token s3cret')).toBeNull();
    expect(getBearerToken(null)).toBeNull();
    expect(isAuthorizedToken('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorizedToken('Bearer wrong', 's3cret')).toBe(false);
    expect(isAuthorizedToken(null, 's3cret')).toBe(false);
    expect(isAuthorizedToken('Bearer s3cret', null)).toBe(false);
    expect(isAuthorizedToken('Bearer s3cret', '')).toBe(false);
  });

  it('rate limiter allows 60/min then denies', () => {
    const ip = `rl-unit-${Date.now()}`;
    let last;
    for (let i = 0; i < REPORT_RATE_LIMIT; i++) {
      last = checkReportRateLimit(ip, 1_700_000_000_000);
      expect(last.allowed).toBe(true);
    }
    last = checkReportRateLimit(ip, 1_700_000_000_000);
    expect(last.allowed).toBe(false);
    expect(last.count).toBe(REPORT_RATE_LIMIT + 1);
    // Next minute window resets.
    expect(checkReportRateLimit(ip, 1_700_000_000_000 + 61_000).allowed).toBe(true);
  });
});

describe('GET /api/status (public aggregate, read from R2)', () => {
  it('returns {overall, checked_at, targets[]} with one row per target', async () => {
    const bucket = okBucket();
    const res = await app.request('/api/status', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall).toBe('ok');
    // `checked_at` is the newest run object's own `run_at` — the D1 version's
    // MAX(checked_at) over the probe table, same meaning, same ISO form.
    expect(body.checked_at).toBe('2026-10-03T12:00:00.000Z');
    // Top-level only: `cached` reports whether THIS response came out of the
    // 20s read cache. The per-target rows below must NOT gain the key.
    expect(body.cached).toBe(false);
    expect(body.targets).toHaveLength(TARGETS.length);
    for (const row of body.targets) {
      expect(Object.keys(row).sort()).toEqual(
        ['last_error', 'last_response_ms', 'last_status', 'name', 'up', 'uptime_24h', 'url'].sort(),
      );
      expect(row.up).toBe(true);
      expect(row.last_status).toBe(200);
      // The 12/12 rollup entry, as one decimal, exactly like getUptimeSince.
      expect(row.uptime_24h).toBe(100);
    }
  });

  it('mixed health degrades overall', async () => {
    const bucket = makeR2();
    const at = new Date('2026-10-03T12:00:00.000Z');
    seedRun(bucket, at, [
      { name: TARGETS[0].name, ok: true },
      { name: TARGETS[1].name, ok: false },
      ...TARGETS.slice(2).map((t) => ({ name: t.name, ok: true })),
    ]);
    const res = await app.request('/api/status', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }));
    const body = await res.json();
    expect(['degraded', 'down']).toContain(body.overall);
  });

  it('an empty bucket reports every target as never seen, not as an empty list', async () => {
    // The D1 cold-start shape: a configured target with no probe row rendered as
    // `up: false` with null details, so the dashboard shows six cards reading
    // "never checked" instead of vanishing. Returning `targets: []` here would
    // look like a working monitor with nothing to say.
    const res = await app.request('/api/status', {}, envFor(new FakeDb()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall).toBe('down');
    expect(body.checked_at).toBeNull();
    expect(body.targets).toHaveLength(TARGETS.length);
    for (const row of body.targets) {
      expect(row.up).toBe(false);
      expect(row.last_status).toBeNull();
      expect(row.last_response_ms).toBeNull();
      expect(row.uptime_24h).toBeNull();
    }
  });

  it('falls back to yesterday when today has no run yet', async () => {
    // A deploy at 00:02 UTC (or a cron that has not fired today) must still
    // render the last known state rather than "never checked".
    const bucket = makeR2();
    const yesterday = new Date('2026-10-02T23:55:00.000Z');
    seedRun(bucket, yesterday, TARGETS.map((t) => ({ name: t.name, ok: true })));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T00:02:00.000Z'));
    try {
      const res = await app.request('/api/status', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }));
      const body = await res.json();
      expect(body.overall).toBe('ok');
      expect(body.checked_at).toBe(yesterday.toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('the newest run wins, and a partial run does not blank the other cards', async () => {
    const bucket = makeR2();
    // Two runs on the same day: the newer key is the answer even though the
    // earlier one is also present.
    seedRun(
      bucket,
      new Date('2026-10-03T11:50:00.000Z'),
      TARGETS.map((t) => ({ name: t.name, ok: true })),
    );
    // ...and the newest run probes ONE host (what POST /internal/check writes).
    seedRun(bucket, new Date('2026-10-03T12:00:00.000Z'), [
      { name: TARGETS[0].name, ok: false, statusCode: 500, errorMessage: 'boom' },
    ]);
    // Alert state is the carry-forward for the five the run did not probe.
    seedAlertState(
      bucket,
      Object.fromEntries(
        TARGETS.slice(1).map((t) => [t.name, { last_state: 'up', consecutive_failures: 0, updated_at: '2026-10-03T11:50:00.000Z' }]),
      ),
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T12:01:00.000Z'));
    try {
      const res = await app.request('/api/status', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }));
      const body = await res.json();
      expect(body.checked_at).toBe('2026-10-03T12:00:00.000Z');
      expect(body.overall).toBe('degraded');
      const probed = body.targets.find((t) => t.name === TARGETS[0].name);
      expect(probed).toMatchObject({ up: false, last_status: 500, last_error: 'boom' });
      // The five unprobed targets keep their carried-forward state instead of
      // being reported down.
      for (const t of body.targets.slice(1)) {
        expect(t.up, t.name).toBe(true);
        expect(t.last_status).toBeNull();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('a target still under the alert threshold reads DOWN, not healthy', async () => {
    // `last_state` is sticky until three consecutive failures cross the
    // threshold, so `up` must come from the RUN's ok bit — otherwise one or two
    // bad probes would render as healthy.
    const bucket = makeR2();
    seedRun(bucket, new Date('2026-10-03T12:00:00.000Z'), [
      { name: TARGETS[0].name, ok: false, statusCode: 503 },
      ...TARGETS.slice(1).map((t) => ({ name: t.name, ok: true })),
    ]);
    seedAlertState(bucket, {
      [TARGETS[0].name]: { last_state: 'up', consecutive_failures: 1, updated_at: '2026-10-03T12:00:00.000Z' },
    });
    const res = await app.request('/api/status', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }));
    const body = await res.json();
    expect(body.targets.find((t) => t.name === TARGETS[0].name).up).toBe(false);
    expect(body.targets.find((t) => t.name === TARGETS[0].name).last_status).toBe(503);
  });

  it('reads no D1 probe table at all', async () => {
    // Any SQL against `checks` throws in the stub; a 200 here is the proof the
    // read path is entirely R2.
    const db = new FakeDb();
    const res = await app.request('/api/status', {}, envFor(db, { MONITOR_BUCKET: okBucket() }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/history (public, target required, read from R2)', () => {
  it('400 when target missing or unknown', async () => {
    const env = envFor(new FakeDb());
    expect((await app.request('/api/history', {}, env)).status).toBe(400);
    expect((await app.request('/api/history?target=nope', {}, env)).status).toBe(400);
  });

  it('every 400 lists the valid targets, and never the rejected one', async () => {
    const env = envFor(new FakeDb());
    const names = TARGETS.map((t) => t.name);

    const missing = await app.request('/api/history', {}, env);
    expect(missing.status).toBe(400);
    expect((await missing.json()).valid_targets).toEqual(names);

    // Case/near-miss spellings are the realistic typo, and all must be rejected
    // the same way -- with the same recovery hint.
    for (const bad of ['nope', 'Marketplace', 'marketplace ', 'api-meals-2', '', ' ']) {
      const res = await app.request(`/api/history?target=${encodeURIComponent(bad)}`, {}, env);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.valid_targets).toEqual(names);
      if (bad) expect(body.valid_targets).not.toContain(bad);
      expect(typeof body.error).toBe('string');
    }

    // Every name in the list is actually accepted (the list cannot drift into
    // advertising targets that 400).
    for (const name of names) {
      const res = await app.request(`/api/history?target=${encodeURIComponent(name)}`, {}, env);
      expect(res.status).toBe(200);
    }
  });

  it('200 shape for a known target, oldest first, from the stored ring', async () => {
    const at = new Date('2026-10-03T12:00:00.000Z');
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', [
      ringEntry(at, 30),
      ringEntry(at, 15, { status_code: 500, ok: 0, response_ms: 900 }),
      ringEntry(at, 5),
    ]);
    const res = await app.request(
      '/api/history?target=marketplace&hours=24',
      {},
      envFor(new FakeDb(), { MONITOR_BUCKET: bucket }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.target).toBe('marketplace');
    expect(body.hours).toBe(24);
    expect(Object.keys(body).sort()).toEqual(['checks', 'hours', 'target']);
    expect(body.checks).toHaveLength(3);
    // Exactly the four fields the D1 `rowToCheck` projected.
    for (const check of body.checks) {
      expect(Object.keys(check).sort()).toEqual(['checked_at', 'ok', 'response_ms', 'status_code']);
    }
    // Oldest first, so the sparkline draws left to right.
    expect(body.checks[0].checked_at).toBe('2026-10-03T11:30:00.000Z');
    expect(body.checks[2].checked_at).toBe('2026-10-03T11:55:00.000Z');
    expect(body.checks[1]).toMatchObject({ ok: 0, status_code: 500, response_ms: 900 });
  });

  it('reads only the requested window', async () => {
    const at = new Date('2026-10-03T12:00:00.000Z');
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', [
      ringEntry(at, 60 * 30), // 30h ago — outside a 24h window
      ringEntry(at, 60 * 25), // 25h ago — outside a 24h window
      ringEntry(at, 60 * 23), // 23h ago — inside
      ringEntry(at, 60 * 2), // 2h ago  — inside
    ]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    try {
      const body = await app
        .request('/api/history?target=marketplace&hours=24', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }))
        .then((r) => r.json());
      expect(body.checks.map((c) => c.checked_at)).toEqual([
        '2026-10-02T13:00:00.000Z',
        '2026-10-03T10:00:00.000Z',
      ]);
      // A wider window brings the older samples back, from the same object.
      const wider = await app
        .request('/api/history?target=marketplace&hours=48', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }))
        .then((r) => r.json());
      expect(wider.checks).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects hours over the R2 window with the ceiling named (never clamps)', async () => {
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', [ringEntry(new Date('2026-10-03T12:00:00.000Z'), 5)]);
    const res = await app.request(
      `/api/history?target=marketplace&hours=${HISTORY_MAX_WINDOW_HOURS + 1}`,
      {},
      envFor(new FakeDb(), { MONITOR_BUCKET: bucket }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('history max 48 hours in R2 mode');
    expect(body.max_hours).toBe(48);
    // The D1 version answered 168h; the ceiling moved and says so.
    expect(HISTORY_MAX_WINDOW_HOURS).toBe(48);
    // Exactly at the ceiling is fine.
    expect(
      (
        await app.request(
          `/api/history?target=marketplace&hours=${HISTORY_MAX_WINDOW_HOURS}`,
          {},
          envFor(new FakeDb(), { MONITOR_BUCKET: bucket }),
        )
      ).status,
    ).toBe(200);
  });

  it('an empty bucket answers an empty list, not an error', async () => {
    const res = await app.request('/api/history?target=marketplace&hours=24', {}, envFor(new FakeDb()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks).toEqual([]);
    expect(body.target).toBe('marketplace');
  });

  it('costs one bucket read for the whole window', async () => {
    // The reason the endpoint reads a rolling document instead of the run
    // objects its window covers: at the cron cadence `hours=24` is 288 objects.
    const at = new Date('2026-10-03T12:00:00.000Z');
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', Array.from({ length: 288 }, (_, i) => ringEntry(at, i)));
    const res = await app.request(
      '/api/history?target=marketplace&hours=24',
      {},
      envFor(new FakeDb(), { MONITOR_BUCKET: bucket }),
    );
    const body = await res.json();
    expect(body.checks).toHaveLength(288);
    expect(bucket.calls.get).toEqual([historyKey('marketplace')]);
    expect(bucket.calls.list).toEqual([]);
  });

  it('caps the response at 500 entries (the D1 LIMIT, unchanged)', async () => {
    const at = new Date('2026-10-03T12:00:00.000Z');
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', Array.from({ length: 520 }, (_, i) => ringEntry(at, i)));
    const body = await app
      .request('/api/history?target=marketplace&hours=48', {}, envFor(new FakeDb(), { MONITOR_BUCKET: bucket }))
      .then((r) => r.json());
    expect(body.checks).toHaveLength(500);
    // Newest survive: the cut is at the FRONT of the oldest-first list.
    expect(body.checks[499].checked_at).toBe('2026-10-03T12:00:00.000Z');
  });
});

describe('GET /favicon.ico (public, inline bytes)', () => {
  it('200 with an svg body and a long-lived Cache-Control', async () => {
    const env = envFor(new FakeDb());
    const res = await app.request('/favicon.ico', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe(FAVICON_CACHE_CONTROL);

    // The bytes are the icon itself, not an HTML error page or a redirect.
    const body = await res.text();
    expect(body.startsWith('<svg')).toBe(true);
    expect(body).toContain('</svg>');
    // Tiny and inline: no asset binding, no base64 payload.
    expect(body.length).toBeLessThan(1024);
    expect(body).not.toContain('data:image');
  });

  it('is public: no PIN configured, no session cookie, no D1', async () => {
    // An unconfigured dashboard (no DASHBOARD_PIN) still answers the icon, and
    // answers it with zero D1 work -- browsers ask for it with no cookies.
    const res = await app.request('/favicon.ico', {}, { DB: new FakeDb() });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('<svg');
  });

  it('every rendered page declares it, so no page keeps the generic 404 icon', async () => {
    const env = envFor(new FakeDb());

    // Unconfigured page.
    const unconfigured = await app.request('/', {}, { DB: new FakeDb() });
    expect(unconfigured.status).toBe(500);
    expect(await unconfigured.text()).toContain('rel="icon" href="/favicon.ico"');

    // Login page.
    const login = await app.request('/login', {}, env);
    expect(login.status).toBe(200);
    expect(await login.text()).toContain('rel="icon" href="/favicon.ico"');

    // Dashboard, behind a real session cookie.
    const value = await signSession(env.DASHBOARD_PIN, Date.now());
    const dash = await app.request('/', { headers: { cookie: `${SESSION_COOKIE}=${value}` } }, env);
    expect(dash.status).toBe(200);
    expect(await dash.text()).toContain('rel="icon" href="/favicon.ico"');
  });
});

describe('POST /report/* (tokened intake)', () => {
  it('401 without token and with wrong token', async () => {
    expect((await postReport('/report/error', { token: null })).status).toBe(401);
    expect((await postReport('/report/error', { token: 'wrong' })).status).toBe(401);
    expect((await postReport('/report/feedback', { token: null })).status).toBe(401);
  });

  it('400 when message missing or blank', async () => {
    expect((await postReport('/report/error', { body: {} })).status).toBe(400);
    expect((await postReport('/report/error', { body: { message: '  ' } })).status).toBe(400);
  });

  it('201 stores error + feedback rows', async () => {
    const errRes = await postReport('/report/error', {
      body: { message: 'checkout 500', page_url: 'https://x/book', contact: 'ops' },
    });
    expect(errRes.status).toBe(201);
    const errBody = await errRes.json();
    expect(errBody).toMatchObject({ kind: 'error', status: 'new' });
    expect(typeof errBody.id).toBe('number');

    const fbRes = await postReport('/report/feedback', {
      body: { message: 'love the new menu page' },
      ip: '10.9.0.2',
    });
    expect(fbRes.status).toBe(201);
    expect((await fbRes.json()).kind).toBe('feedback');
  });

  it('61st request in a minute → 429', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const ip = '10.9.9.9';
    let res;
    for (let i = 0; i < REPORT_RATE_LIMIT; i++) {
      res = await app.request(
        '/report/error',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${REPORT_TOKEN}`,
            'cf-connecting-ip': ip,
          },
          body: JSON.stringify({ message: `spam ${i}` }),
        },
        env,
      );
      expect(res.status).toBe(201);
    }
    res = await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${REPORT_TOKEN}`,
          'cf-connecting-ip': ip,
        },
        body: JSON.stringify({ message: 'one too many' }),
      },
      env,
    );
    expect(res.status).toBe(429);
  });
});

describe('POST /internal/check (tokened manual probe)', () => {
  it('401 without token', async () => {
    const res = await app.request('/internal/check', { method: 'POST' }, envFor(new FakeDb()));
    expect(res.status).toBe(401);
  });

  it('400 on unknown target', async () => {
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
        body: JSON.stringify({ target: 'nope' }),
      },
      envFor(new FakeDb()),
    );
    expect(res.status).toBe(400);
  });

  it('200 probes all targets and returns outcomes', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const db = new FakeDb();
    const bucket = makeR2();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${REPORT_TOKEN}` },
      },
      { ...envFor(db), MONITOR_BUCKET: bucket },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.checked_at).toBe('string');
    expect(body.results).toHaveLength(TARGETS.length);
    // The run is ONE object holding every result (not N D1 rows): same count,
    // one write, and nothing left in the probe table.
    const [key] = bucket.keys();
    expect(key).toMatch(/^checks\/\d{4}-\d{2}-\d{2}\/\d{2}-\d{2}\.json$/);
    expect(bucket.read(key).results).toHaveLength(TARGETS.length);
    // The read path's two rollups are written by the manual path as well, or a
    // hand-run check would show up on the dashboard for 20s and then vanish from
    // the sparkline.
    for (const t of TARGETS) {
      expect(bucket.read(historyKey(t.name)).entries).toHaveLength(1);
    }
    expect(bucket.read('state/summary.json').targets[TARGETS[0].name].totalCount).toBe(1);
  });

  it('200 probes a single target when scoped', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const db = new FakeDb();
    const bucket = makeR2();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
        body: JSON.stringify({ target: 'marketplace' }),
      },
      { ...envFor(db), MONITOR_BUCKET: bucket },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].target).toBe('marketplace');
    // A partial run is still a run object, with one result — the R2 read path
    // must never have to ask whether a document is a full or partial run.
    const [key] = bucket.keys();
    expect(bucket.read(key).results.map((r) => r.name)).toEqual(['marketplace']);
    // ...and it appends to ONE ring, not six: a target the run did not probe
    // must not gain a sample that was never observed.
    const rings = bucket.keys().filter((k) => k.startsWith('state/history/'));
    expect(rings).toEqual(['state/history/marketplace.json']);
    expect(bucket.read(historyKey('marketplace')).entries).toHaveLength(1);
  });
});

describe('readRecentChecks (dashboard table, merged from the rings)', () => {
  const at = new Date('2026-10-03T12:00:00.000Z');
  const env = (bucket) => envFor(new FakeDb(), { MONITOR_BUCKET: bucket });

  it('merges every target newest-first and honours the limit', async () => {
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', [ringEntry(at, 30), ringEntry(at, 10)]);
    seedRing(bucket, 'acacia', [ringEntry(at, 20, { status_code: 500, ok: 0 })]);
    // A target with no ring at all (never probed) contributes nothing.
    const rows = await readRecentChecks(env(bucket), 3);
    expect(rows.map((r) => `${r.checked_at} ${r.target}`)).toEqual([
      `${new Date(at.getTime() - 10 * 60_000).toISOString()} marketplace`,
      `${new Date(at.getTime() - 20 * 60_000).toISOString()} acacia`,
      `${new Date(at.getTime() - 30 * 60_000).toISOString()} marketplace`,
    ]);
    expect(rows[1]).toMatchObject({ target: 'acacia', ok: 0, status_code: 500 });
    // One GET per configured target, whatever the row count.
    expect(bucket.calls.get.sort()).toEqual(TARGETS.map((t) => historyKey(t.name)).sort());
    expect(bucket.calls.list).toEqual([]);
  });

  it('an empty bucket yields no rows (the table renders its own empty state)', async () => {
    expect(await readRecentChecks(env(makeR2()), 20)).toEqual([]);
  });
});

describe('GET / dashboard (cookie-session HTML)', () => {
  it('302 to /login without cookie; ?token= no longer authenticates', async () => {
    const db = new FakeDb();
    const bare = await app.request('/', {}, envFor(db));
    expect(bare.status).toBe(302);
    expect(bare.headers.get('location')).toContain('/login');
    const queryToken = await app.request('/?token=wrong', {}, envFor(db));
    expect(queryToken.status).toBe(302);
  });

  it('200 HTML contains status-pill, dark bg, Check Now, lists', async () => {
    const db = new FakeDb();
    const bucket = okBucket();
    const env = envFor(db, { MONITOR_BUCKET: bucket });
    const login = await app.request(
      '/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://status.sinaicamps.com',
          'cf-connecting-ip': '10.9.0.11',
        },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      env,
    );
    expect(login.status).toBe(302);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const res = await app.request('/', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('status-pill');
    expect(html).toContain('#0f172a');
    expect(html).toContain('check-now');
    expect(html).toContain('Check Now');
    expect(html).toContain('Recent checks');
    expect(html).toContain('Recent reports');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('marketplace');
    // The server-rendered "Recent checks" table is built from the rings now, so
    // the seeded `response_ms` appearing in the page is proof the page render
    // read the same documents /api/history serves.
    expect(html).toContain('4321');
  });

  it('accepts session cookie too and escapes report content', async () => {
    const db = new FakeDb();
    const bucket = makeR2();
    const at = new Date('2026-10-03T12:00:00.000Z');
    // The probe error string is operator-adjacent data (a probe URL can carry a
    // token), and it is the one server-rendered value left: it must arrive
    // escaped.
    seedRun(bucket, at, [
      { name: TARGETS[0].name, ok: false, errorMessage: '<img src=x>' },
      ...TARGETS.slice(1).map((t) => ({ name: t.name, ok: true })),
    ]);
    const env = envFor(db, { MONITOR_BUCKET: bucket });
    await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${REPORT_TOKEN}`,
          'cf-connecting-ip': '10.9.0.7',
        },
        body: JSON.stringify({ message: '<script>alert(1)</script>' }),
      },
      env,
    );
    const login = await app.request(
      '/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://status.sinaicamps.com',
          'cf-connecting-ip': '10.9.0.12',
        },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      env,
    );
    expect(login.status).toBe(302);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const res = await app.request('/', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});
