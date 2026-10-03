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
  REPORT_RATE_WINDOW_MS,
  HISTORY_MAX_WINDOW_HOURS,
  readRecentChecks,
  REPORT_USER_AGENT_MAX,
  REPORTS_MAX_READS,
  REPORTS_MAX_LIMIT,
  writeReport,
} from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth.js';
import { TARGETS } from '../src/targets.js';
import { checksKey, historyKey } from '../src/storage.js';
import {
  makeR2,
  seedRun,
  seedSummary,
  seedAlertState,
  seedRing,
  seedIntake,
  ringEntry,
  webhookCollector,
} from './helpers/fake-r2.js';

// PHASE 6: there is no database double in this file any more, and that is the
// strongest possible guard — `env` below has no `DB` key at all, so a handler
// that reached for the old binding would throw on `undefined` and 500 instead of
// quietly passing against a stub that still answered it. `noDatabase` makes the
// failure a named one. Every route here is proved to be served entirely from the
// object bucket by its response, not by what a fake store declined to answer.

function noDatabase(extra = {}) {
  return {
    get DB() {
      throw new Error('the monitor worker has no DB binding (phase 6)');
    },
    ...extra,
  };
}

const REPORT_TOKEN = 'test-report-secret';
const DASHBOARD_PIN = '123456';
// The worker binds ONE storage resource. A test that wants data in it passes its
// own double in; the default is a fresh empty bucket = "nothing has ever run".
const envFor = (extra = {}) =>
  noDatabase({
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

function postReport(
  path,
  {
    token = REPORT_TOKEN,
    body = { message: 'help' },
    ip = '10.9.0.1',
    bucket = makeR2(),
    headers: extra = {},
    env = {},
    executionCtx,
  } = {},
) {
  const headers = { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.request(
    path,
    { method: 'POST', headers, body: JSON.stringify(body) },
    envFor({ MONITOR_BUCKET: bucket, ...env }),
    executionCtx,
  );
}

// Configured alert channel. Every forwarding test passes this; the "unconfigured"
// case deliberately omits it.
const HOOK_ENV = { ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

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

  it('the limiter store is bounded: it sweeps windows older than the one it is tracking', () => {
    // One entry per `<ip>:<window>` in a per-isolate Map. With a 60/min budget and
    // a public intake endpoint, an attacker rotating IPs would otherwise grow
    // that Map forever inside one isolate. Past 2000 entries the store drops
    // everything from an earlier window — the counters are only ever read for the
    // CURRENT window, so an old one is dead weight, and the fresh entries (the
    // ones actually enforcing a limit) are the ones kept.
    const store = globalThis.__monitorReportRate;
    store.clear();
    const base = 1_700_000_000_000;
    for (let i = 0; i < 2_100; i += 1) {
      checkReportRateLimit(`sweep-${i}`, base);
    }
    expect(store.size).toBeGreaterThan(2000);
    // The NEXT call trips the sweep: every entry above belongs to the window that
    // just ended, so they are all removable.
    checkReportRateLimit('sweep-trigger', base + REPORT_RATE_WINDOW_MS);
    expect(store.size).toBe(1);
    // And the limiter still enforces: this is a cleanup, not a reset of policy.
    const ip = 'bounded';
    for (let i = 0; i < REPORT_RATE_LIMIT; i += 1) {
      expect(checkReportRateLimit(ip, base + 120_000).allowed).toBe(true);
    }
    expect(checkReportRateLimit(ip, base + 120_000).allowed).toBe(false);
    store.clear();
  });
});

describe('GET /api/status (public aggregate, read from R2)', () => {
  it('returns {overall, checked_at, targets[]} with one row per target', async () => {
    const bucket = okBucket();
    const res = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }));
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
    const res = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }));
    const body = await res.json();
    expect(['degraded', 'down']).toContain(body.overall);
  });

  it('an empty bucket reports every target as never seen, not as an empty list', async () => {
    // The D1 cold-start shape: a configured target with no probe row rendered as
    // `up: false` with null details, so the dashboard shows six cards reading
    // "never checked" instead of vanishing. Returning `targets: []` here would
    // look like a working monitor with nothing to say.
    const res = await app.request('/api/status', {}, envFor());
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
      const res = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }));
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
      const res = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }));
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
    const res = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }));
    const body = await res.json();
    expect(body.targets.find((t) => t.name === TARGETS[0].name).up).toBe(false);
    expect(body.targets.find((t) => t.name === TARGETS[0].name).last_status).toBe(503);
  });

  it('answers from the bucket with no database binding in the env at all', async () => {
    // `noDatabase` throws on `.DB`, so a read path that still wanted a query
    // would 500 here. A 200 IS the proof the aggregate is entirely object-backed.
    const res = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: okBucket() }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/history (public, target required, read from R2)', () => {
  it('400 when target missing or unknown', async () => {
    const env = envFor();
    expect((await app.request('/api/history', {}, env)).status).toBe(400);
    expect((await app.request('/api/history?target=nope', {}, env)).status).toBe(400);
  });

  it('every 400 lists the valid targets, and never the rejected one', async () => {
    const env = envFor();
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
      envFor({ MONITOR_BUCKET: bucket }),
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
        .request('/api/history?target=marketplace&hours=24', {}, envFor({ MONITOR_BUCKET: bucket }))
        .then((r) => r.json());
      expect(body.checks.map((c) => c.checked_at)).toEqual([
        '2026-10-02T13:00:00.000Z',
        '2026-10-03T10:00:00.000Z',
      ]);
      // A wider window brings the older samples back, from the same object.
      const wider = await app
        .request('/api/history?target=marketplace&hours=48', {}, envFor({ MONITOR_BUCKET: bucket }))
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
      envFor({ MONITOR_BUCKET: bucket }),
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
          envFor({ MONITOR_BUCKET: bucket }),
        )
      ).status,
    ).toBe(200);
  });

  it('an empty bucket answers an empty list, not an error', async () => {
    const res = await app.request('/api/history?target=marketplace&hours=24', {}, envFor());
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
      envFor({ MONITOR_BUCKET: bucket }),
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
      .request('/api/history?target=marketplace&hours=48', {}, envFor({ MONITOR_BUCKET: bucket }))
      .then((r) => r.json());
    expect(body.checks).toHaveLength(500);
    // Newest survive: the cut is at the FRONT of the oldest-first list.
    expect(body.checks[499].checked_at).toBe('2026-10-03T12:00:00.000Z');
  });
});

describe('GET /api/reports (public, newest-first per kind)', () => {
  const NOW = '2026-10-03T12:00:00.000Z';
  const at = (iso) => new Date(iso);
  const env = (bucket) => envFor({ MONITOR_BUCKET: bucket });

  // Five reports across today and yesterday, out of insertion order on purpose:
  // the listing must sort by KEY, not by anything the bucket remembers.
  function reportsBucket() {
    const bucket = makeR2();
    seedIntake(bucket, 'errors', at('2026-10-03T09:00:00.000Z'), { message: 'e today old' });
    seedIntake(bucket, 'errors', at('2026-10-03T11:59:00.000Z'), { message: 'e today newest' });
    seedIntake(bucket, 'errors', at('2026-10-02T23:00:00.000Z'), { message: 'e yesterday' });
    seedIntake(bucket, 'feedback', at('2026-10-03T10:00:00.000Z'), { message: 'f only' });
    return bucket;
  }

  it('lists only the requested kind, newest first, and defaults to errors', async () => {
    const bucket = reportsBucket();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(NOW));
    try {
      const res = await app.request('/api/reports', {}, env(bucket));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(['reports', 'truncated']);
      expect(body.reports.map((r) => r.message)).toEqual([
        'e today newest',
        'e today old',
        'e yesterday',
      ]);
      // The stored document is returned as-is: id, arrival time, severity and
      // user_agent included, because the triage view needs them.
      expect(body.reports[0]).toMatchObject({
        kind: 'error',
        status: 'new',
        severity: 'error',
        received_at: '2026-10-03T11:59:00.000Z',
      });
      expect(body.truncated).toBe(false);
      // Feedback lives in its own collection and is never mixed in.
      const feedback = await app.request('/api/reports?kind=feedback', {}, env(bucket)).then((r) => r.json());
      expect(feedback.reports.map((r) => r.message)).toEqual(['f only']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('limit + offset page the newest-first list', async () => {
    const bucket = reportsBucket();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(NOW));
    try {
      const page1 = await app.request('/api/reports?limit=2', {}, env(bucket)).then((r) => r.json());
      expect(page1.reports.map((r) => r.message)).toEqual(['e today newest', 'e today old']);
      const page2 = await app.request('/api/reports?limit=2&offset=2', {}, env(bucket)).then((r) => r.json());
      expect(page2.reports.map((r) => r.message)).toEqual(['e yesterday']);
      const past = await app.request('/api/reports?limit=2&offset=3', {}, env(bucket)).then((r) => r.json());
      expect(past.reports).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads only the objects it returns', async () => {
    const bucket = reportsBucket();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(NOW));
    try {
      await app.request('/api/reports?limit=1', {}, env(bucket));
      // Two day buckets listed, ONE object fetched: the page is cut from the KEY
      // ordering first, so no body is read that the response does not contain.
      expect(bucket.calls.list.map((l) => l.prefix)).toEqual([
        'reports/errors/2026-10-03/',
        'reports/errors/2026-10-02/',
      ]);
      expect(bucket.calls.get).toHaveLength(1);
      expect(bucket.calls.get[0]).toContain('11-59-00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('400 for an unknown kind, listing the valid ones', async () => {
    const bucket = makeR2();
    const res = await app.request('/api/reports?kind=erorr', {}, env(bucket));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.valid_kinds).toEqual(['errors', 'feedback']);
    expect(body.error).toBe('unknown kind');
    // Rejected before any bucket work, like every other validation here.
    expect(bucket.calls.list).toEqual([]);
  });

  it('rejects a page wider than one invocation can read, and never clamps it', async () => {
    const bucket = makeR2();
    const res = await app.request(
      `/api/reports?limit=${REPORTS_MAX_LIMIT}&offset=${REPORTS_MAX_READS - REPORTS_MAX_LIMIT + 1}`,
      {},
      env(bucket),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('reports max 40 objects per request in R2 mode');
    expect(body.max_reads).toBe(REPORTS_MAX_READS);
    expect(bucket.calls.list).toEqual([]);
  });

  it('caps limit silently and floors a nonsense one', async () => {
    const bucket = reportsBucket();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(NOW));
    try {
      // A limit over the cap is clamped DOWN (asking for more is harmless: it
      // cannot cost more than the cap) ...
      const capped = await app.request('/api/reports?limit=999', {}, env(bucket)).then((r) => r.json());
      expect(capped.reports).toHaveLength(3);
      // ... while nonsense values fall back to the default rather than erroring.
      for (const q of ['limit=abc', 'limit=-4', 'offset=-1', 'offset=abc']) {
        const res = await app.request(`/api/reports?${q}`, {}, env(bucket));
        expect(res.status, q).toBe(200);
        expect((await res.json()).reports.length).toBeGreaterThan(0);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('an empty bucket is an empty list, not an error', async () => {
    const res = await app.request('/api/reports', {}, env(makeR2()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reports: [], truncated: false });
  });

  it('reports `truncated` when a day holds more than the listing walks', async () => {
    // A sustained flood (the intake limiter allows 60/min/IP). The endpoint says
    // so instead of serving the oldest of the day's first N as if they were the
    // newest — the page-size stub makes 10 pages of 2 keys.
    const bucket = makeR2();
    for (let i = 0; i < 40; i += 1) {
      seedIntake(bucket, 'errors', new Date(Date.parse(NOW) - i * 1000), { message: `flood ${i}` });
    }
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(NOW));
    try {
      const body = await app.request('/api/reports?limit=20', {}, env(bucket)).then((r) => r.json());
      expect(body.truncated).toBe(true);
      // Even truncated, the page it does serve is newest-first — it just is not
      // the newest of the DAY, which is precisely what `truncated` is for: a
      // silent answer here would read as "nothing reported since".
      expect(body.reports[0].message).toBe('flood 20');
      expect(body.reports[19].message).toBe('flood 39');
      // ...and a bucket within the budget says so, so `truncated` cannot sit at
      // `true` forever as a permanent shrug.
      const small = makeR2();
      for (let i = 0; i < 4; i += 1) {
        seedIntake(small, 'errors', new Date(Date.parse(NOW) - i * 1000), { message: `few ${i}` });
      }
      // A different `limit` is a different cache entry, so this is a fresh read
      // of the fresh bucket rather than the cached answer for the flooded one.
      expect((await app.request('/api/reports?limit=10', {}, env(small)).then((r) => r.json())).truncated).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a listing that reports truncation with NO cursor stops walking and says so', async () => {
    // R2 signals "there is more" with `truncated` + a cursor. A truncated page
    // carrying no cursor cannot advance, and looping on it would burn the
    // invocation's subrequest budget forever inside a request — so the walk stops
    // and the response admits it is partial instead of pretending it is complete.
    const bucket = makeR2();
    seedIntake(bucket, 'errors', '2026-10-03T12:00:00.000Z');
    bucket.list = async ({ prefix = '' }) => {
      if (!prefix.startsWith('reports/errors/')) return { objects: [], truncated: false };
      return { objects: [{ key: 'reports/errors/2026-10-03/12-00-00-x.json', uploaded: null }], truncated: true };
    };
    const res = await app.request('/api/reports?kind=errors', {}, envFor({ MONITOR_BUCKET: bucket }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.reports).toEqual([]);
  });

  it('the 20s cache covers it too, keyed by every parameter', async () => {
    const bucket = reportsBucket();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(NOW));
    try {
      await app.request('/api/reports?kind=errors&limit=2', {}, env(bucket));
      const settled = bucket.calls.list.length + bucket.calls.get.length;
      expect(settled).toBeGreaterThan(0);
      // Same key → no bucket work at all.
      await app.request('/api/reports?kind=errors&limit=2', {}, env(bucket));
      expect(bucket.calls.list.length + bucket.calls.get.length).toBe(settled);
      // Any parameter change is a different entry.
      await app.request('/api/reports?kind=feedback', {}, env(bucket));
      await app.request('/api/reports?kind=errors&limit=1', {}, env(bucket));
      await app.request('/api/reports?kind=errors&limit=2&offset=1', {}, env(bucket));
      expect(bucket.calls.list.length + bucket.calls.get.length).toBeGreaterThan(settled);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a 400 never reaches the cache', async () => {
    const bucket = makeR2();
    expect((await app.request('/api/reports?kind=nope', {}, env(bucket))).status).toBe(400);
    expect(bucket.calls.list).toEqual([]);
    vi.setSystemTime(new Date(NOW));
    expect((await app.request('/api/reports?kind=nope', {}, env(bucket))).status).toBe(400);
    expect(bucket.calls.list).toEqual([]);
  });
});

describe('GET /favicon.ico (public, inline bytes)', () => {
  it('200 with an svg body and a long-lived Cache-Control', async () => {
    const env = envFor();
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
    const res = await app.request('/favicon.ico', {}, noDatabase());
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('<svg');
  });

  it('every rendered page declares it, so no page keeps the generic 404 icon', async () => {
    const env = envFor();

    // Unconfigured page.
    const unconfigured = await app.request('/', {}, noDatabase());
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

  it('400 on a malformed body, and 400 on every over-long field — nothing is stored', async () => {
    // Each limit is a separate bound with its own message, so an operator reading
    // a 400 knows WHICH field was too long rather than being handed one generic
    // rejection. Nothing is written in any of these cases: a rejected report must
    // leave no object behind.
    const bucket = makeR2();
    // `postReport` stringifies its body, so the malformed case drives the raw
    // request instead.
    const malformed = await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}`, 'cf-connecting-ip': '10.9.0.3' },
        body: '{not-json',
      },
      envFor({ MONITOR_BUCKET: bucket }),
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toMatch(/invalid JSON/i);

    const cases = [
      [{ message: 'x'.repeat(2001) }, /message too long/],
      [{ message: 'ok', page_url: `https://x.test/${'p'.repeat(500)}` }, /page_url too long/],
      [{ message: 'ok', contact: 'c'.repeat(201) }, /contact too long/],
    ];
    for (const [body, expected] of cases) {
      const res = await postReport('/report/error', { bucket, body });
      expect(res.status, JSON.stringify(Object.keys(body))).toBe(400);
      expect((await res.json()).error).toMatch(expected);
    }
    expect(bucket.keys()).toEqual([]);
  });

  it('400 when message missing or blank', async () => {
    expect((await postReport('/report/error', { body: {} })).status).toBe(400);
    expect((await postReport('/report/error', { body: { message: '  ' } })).status).toBe(400);
  });

  it('201 writes ONE object per report, under reports/<kind>/<date>/', async () => {
    const at = new Date('2026-10-03T12:34:56.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    try {
      const bucket = makeR2();
      const errRes = await postReport('/report/error', {
        body: { message: 'checkout 500', page_url: 'https://x/book', contact: 'ops' },
        bucket,
        headers: { 'user-agent': 'SinaiCamps/1.2 (test)' },
      });
      expect(errRes.status).toBe(201);
      const errBody = await errRes.json();
      expect(errBody).toMatchObject({ kind: 'error', status: 'new' });
      // The id is a string now: R2 has no sequence, so it is minted per report.
      expect(typeof errBody.id).toBe('string');
      expect(errBody.id).toMatch(/^[0-9a-z]+-[0-9a-f]{6}$/);

      const keys = bucket.keys();
      expect(keys).toHaveLength(1);
      const key = keys[0];
      // The layout the retention sweep and `GET /api/reports` both navigate by:
      // plural collection, kind, UTC day bucket, second-resolution stamp, id.
      expect(key).toMatch(
        /^reports\/errors\/2026-10-03\/12-34-56-[0-9a-z]+-[0-9a-f]{6}\.json$/,
      );
      // The id in the response IS the id in the key: one report, one identity.
      expect(key).toContain(errBody.id);

      const doc = bucket.read(key);
      expect(doc).toMatchObject({
        id: errBody.id,
        kind: 'error',
        received_at: '2026-10-03T12:34:56.000Z',
        message: 'checkout 500',
        page_url: 'https://x/book',
        contact: 'ops',
        status: 'new',
        severity: 'error',
        user_agent: 'SinaiCamps/1.2 (test)',
      });
      // Nothing is nulled out by omission: the key set is fixed, so a reader
      // never has to guess whether a missing field means "absent" or "old format".
      expect(Object.keys(doc).sort()).toEqual([
        'contact',
        'id',
        'kind',
        'message',
        'page_url',
        'received_at',
        'severity',
        'status',
        'user_agent',
      ]);

      const fbBucket = makeR2();
      const fbRes = await postReport('/report/feedback', {
        body: { message: 'love the new menu page' },
        ip: '10.9.0.2',
        bucket: fbBucket,
      });
      expect(fbRes.status).toBe(201);
      const fbBody = await fbRes.json();
      expect(fbBody.kind).toBe('feedback');
      const [fbKey] = fbBucket.keys();
      expect(fbKey).toMatch(/^reports\/feedback\/2026-10-03\/12-34-56-/);
      // No User-Agent sent, none stored.
      expect(fbBucket.read(fbKey).user_agent).toBeNull();
      expect(fbBucket.read(fbKey).contact).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('two reports in the same second get different keys (intake data is never overwritten)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z'));
    try {
      const bucket = makeR2();
      for (let i = 0; i < 5; i += 1) {
        const res = await postReport('/report/error', { body: { message: `same second ${i}` }, bucket, ip: `10.9.5.${i}` });
        expect(res.status).toBe(201);
      }
      expect(bucket.keys()).toHaveLength(5);
      expect(new Set(bucket.keys()).size).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an over-long severity is a 400 and writes nothing', async () => {
    const bucket = makeR2();
    const res = await postReport('/report/error', {
      body: { message: 'hi', severity: 'x'.repeat(64) },
      bucket,
    });
    expect(res.status).toBe(400);
    expect(bucket.keys()).toEqual([]);
  });

  it('the User-Agent is capped: a header cannot decide the stored object size', async () => {
    const bucket = makeR2();
    const res = await postReport('/report/error', {
      body: { message: 'hi' },
      bucket,
      headers: { 'user-agent': 'u'.repeat(4000) },
    });
    expect(res.status).toBe(201);
    const [key] = bucket.keys();
    expect(bucket.read(key).user_agent).toHaveLength(REPORT_USER_AGENT_MAX);
  });

  it('never inserts a D1 reports row', async () => {
    // `envFor` has no database binding (see noDatabase), so a 201 here is the
    // proof the intake path is entirely object-backed — and it stored an object.
    const bucket = makeR2();
    const res = await postReport('/report/error', { body: { message: 'no rows' }, bucket });
    expect(res.status).toBe(201);
    expect(bucket.keys().filter((k) => k.startsWith('reports/errors/'))).toHaveLength(1);
  });

  it('a failing bucket write is a 500, not a silent 201', async () => {
    const bucket = makeR2({ failOn: { put: 'reports/' } });
    const res = await postReport('/report/error', { body: { message: 'lost?' }, bucket });
    // The one failure mode an intake endpoint must surface rather than swallow.
    expect(res.status).toBe(500);
  });

  it('a paging error is forwarded to the alert channel, and the report is stored first', async () => {
    const webhooks = webhookCollector();
    const realFetch = globalThis.fetch;
    globalThis.fetch = webhooks.impl;
    try {
      const bucket = makeR2();
      const res = await postReport('/report/error', {
        body: { message: 'checkout 500 at /book', page_url: 'https://sinaicamps.com/book', contact: 'ops@x' },
        bucket,
        env: HOOK_ENV,
      });
      expect(res.status).toBe(201);

      // The record exists before the notification is even attempted: intake data
      // is the product, the channel is a convenience.
      expect(bucket.keys()).toHaveLength(1);
      expect(webhooks.calls).toHaveLength(1);
      expect(webhooks.calls[0].url).toBe('https://hooks.example/t');
      expect(webhooks.calls[0].body).toMatchObject({
        event: 'report',
        kind: 'error',
        severity: 'error',
        message: 'checkout 500 at /book',
        page_url: 'https://sinaicamps.com/book',
        contact: 'ops@x',
      });
      // The channel gets a readable line, not a raw JSON dump.
      expect(webhooks.calls[0].body.text).toContain('NEW error report');
      expect(webhooks.calls[0].body.text).toContain('checkout 500 at /book');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('severity=fatal pages too, and an unconfigured channel is a silent skip', async () => {
    const webhooks = webhookCollector();
    const realFetch = globalThis.fetch;
    globalThis.fetch = webhooks.impl;
    try {
      const fatal = await postReport('/report/error', {
        body: { message: 'db on fire', severity: 'Fatal' },
        env: HOOK_ENV,
      });
      expect(fatal.status).toBe(201);
      expect(webhooks.calls).toHaveLength(1);
      expect(webhooks.calls[0].body.severity).toBe('fatal');

      // No webhook configured: still 201, still stored, nothing sent.
      const bucket = makeR2();
      const noHook = await postReport('/report/error', { body: { message: 'nobody listening' }, bucket });
      expect(noHook.status).toBe(201);
      expect(bucket.keys()).toHaveLength(1);
      expect(webhooks.calls).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('feedback and a warning are stored but never page anyone', async () => {
    const webhooks = webhookCollector();
    const realFetch = globalThis.fetch;
    globalThis.fetch = webhooks.impl;
    try {
      const fb = await postReport('/report/feedback', {
        body: { message: 'menu page is lovely' },
        ip: '10.9.6.1',
        env: HOOK_ENV,
      });
      expect(fb.status).toBe(201);
      // A warning is stored with its severity so the dashboard can still show it,
      // but it does not interrupt anyone: an endpoint that forwarded everything
      // would make the channel useless within a day.
      const warn = await postReport('/report/error', {
        body: { message: 'odd spacing on /camps', severity: 'warning' },
        ip: '10.9.6.2',
        env: HOOK_ENV,
      });
      expect(warn.status).toBe(201);
      expect(webhooks.calls).toHaveLength(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('a dead webhook does not fail the intake (the report is already stored)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    try {
      const bucket = makeR2();
      const res = await postReport('/report/error', {
        body: { message: 'stored anyway' },
        bucket,
        env: HOOK_ENV,
      });
      expect(res.status).toBe(201);
      expect(bucket.keys()).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('hands the forward to waitUntil when the platform provides a context', async () => {
    // With an execution context the notification must not sit between the write
    // and the 201: a slow Telegram cannot delay the caller.
    const handed = [];
    const executionCtx = { waitUntil: (p) => handed.push(p) };
    const res = await postReport('/report/error', {
      body: { message: 'off the critical path' },
      env: HOOK_ENV,
      executionCtx,
    });
    expect(res.status).toBe(201);
    expect(handed).toHaveLength(1);
    // The promise is already resolved here (no webhook configured), and awaiting
    // it must not throw — the hand-off path must not swallow an error either.
    await expect(handed[0]).resolves.toBeTruthy();
  });

  it('61st request in a minute → 429', async () => {
    const env = envFor();
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
    const res = await app.request('/internal/check', { method: 'POST' }, envFor());
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
      envFor(),
    );
    expect(res.status).toBe(400);
  });

  it('200 probes all targets and returns outcomes', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const bucket = makeR2();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${REPORT_TOKEN}` },
      },
      envFor({ MONITOR_BUCKET: bucket }),
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
    const bucket = makeR2();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
        body: JSON.stringify({ target: 'marketplace' }),
      },
      envFor({ MONITOR_BUCKET: bucket }),
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

  it('400 on a malformed body — nothing is probed and nothing is written', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const bucket = makeR2();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
        body: '{not-json',
      },
      envFor({ MONITOR_BUCKET: bucket }),
    );
    // Same posture as `unknown target`: the body is parsed before any network or
    // storage work, so a typo cannot spend a probe or leave a run object behind.
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid JSON/i);
    expect(bucket.keys()).toEqual([]);
  });

  it('a 404 probe reaches /api/status as a NON-NULL last_error — the incident regression', async () => {
    // The 2026-10-03 false-positive investigation was undiagnosable from the
    // dashboard alone because a status mismatch persisted `error_message: null`:
    // the card showed a red dot and a bare `404`, with nothing saying what the
    // target expected or that the request was redirected. This walks the whole
    // chain the operator reads — real probe → real run object → real aggregate →
    // the public payload the dashboard renders.
    const realFetch = globalThis.fetch;
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
    clearPublicCache();
    globalThis.fetch = async (url) =>
      String(url).endsWith('/api/meals')
        ? { status: 404, redirected: false, url: String(url) }
        : { status: 200, redirected: true, url: String(url) };
    try {
      const bucket = makeR2();
      const res = await app.request(
        '/internal/check',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
          body: JSON.stringify({ target: 'api-meals' }),
        },
        envFor({ MONITOR_BUCKET: bucket }),
      );
      expect(res.status).toBe(200);

      // The stored row — the durable record — carries the reason.
      const [key] = bucket.keys().filter((k) => k.startsWith('checks/'));
      const stored = bucket.read(key).results[0];
      expect(stored).toMatchObject({ name: 'api-meals', status_code: 404, ok: 0 });
      expect(stored.error_message).toContain('expected HTTP 200');
      expect(stored.error_message).toContain('404');

      // And the public aggregate the dashboard polls surfaces it as `last_error`.
      clearPublicCache();
      const status = await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }));
      const body = await status.json();
      const card = body.targets.find((t) => t.name === 'api-meals');
      expect(card).toMatchObject({ up: false, last_status: 404 });
      expect(card.last_error).toContain('expected HTTP 200');
      expect(body.overall).toBe('down');

      // One log line for the one failed probe, naming url + status + redirect.
      const failures = errors.filter((l) => l.includes('monitor probe failed'));
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain('target=api-meals');
      expect(failures[0]).toContain('status=404');
    } finally {
      globalThis.fetch = realFetch;
      clearPublicCache();
    }
  });

  it('a 301→200 probe is recorded UP, so a redirect is not read as an outage', async () => {
    // The healthy mirror of the case above: the host answered with a hop and the
    // hop landed on the expected status. `redirect: 'follow'` is what makes this
    // true, so it is asserted through the real route rather than on the helper.
    const realFetch = globalThis.fetch;
    clearPublicCache();
    globalThis.fetch = async (url) => ({
      status: 200,
      redirected: true,
      url: `${String(url)}?landed=1`,
    });
    try {
      const bucket = makeR2();
      const res = await app.request(
        '/internal/check',
        { method: 'POST', headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
        envFor({ MONITOR_BUCKET: bucket }),
      );
      expect(res.status).toBe(200);
      clearPublicCache();
      const body = await (await app.request('/api/status', {}, envFor({ MONITOR_BUCKET: bucket }))).json();
      expect(body.overall).toBe('ok');
      for (const t of body.targets) {
        expect(t).toMatchObject({ up: true, last_status: 200, last_error: null });
      }
    } finally {
      globalThis.fetch = realFetch;
      clearPublicCache();
    }
  });

  it('a failing ring write is logged and still returns the outcomes the operator asked for', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const bucket = makeR2({ failOn: { put: 'state/history/' } });
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    const res = await app.request(
      '/internal/check',
      { method: 'POST', headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
      envFor({ MONITOR_BUCKET: bucket }),
    );

    // The ring is DERIVED data with a correct answer on the next run, so it must
    // not be able to cost the operator the outcome they asked for — the same
    // posture the cron takes, on the same write.
    expect(res.status).toBe(200);
    expect((await res.json()).results).toHaveLength(TARGETS.length);
    expect(errors.map((e) => e.join(' '))).toEqual([
      expect.stringContaining('monitor history ring update failed'),
    ]);
    // The alerting half and the rollup still ran.
    expect(bucket.keys().some((k) => k.startsWith('checks/'))).toBe(true);
    expect(Object.keys(bucket.read('state/alert_state.json'))).toEqual(TARGETS.map((t) => t.name));
    expect(bucket.read('state/summary.json')).toBeTruthy();
  });
});

// The intake write resolves its collection in exactly one place, and a typo must
// THROW there rather than mint a collection the retention sweep never visits —
// the failure mode is an operator who believes a report was stored and was not.
describe('writeReport kind guard', () => {
  it('an unmapped kind throws instead of filing a report nobody can find', async () => {
    const bucket = makeR2();
    const env = envFor({ MONITOR_BUCKET: bucket });
    await expect(writeReport(env, { kind: 'erorr', message: 'typo' })).rejects.toThrow(
      /unknown report kind/,
    );
    expect(bucket.keys()).toEqual([]);
  });
});

describe('the 404 envelope', () => {
  it('an unknown path is a JSON 404, never the dashboard and never an HTML error', async () => {
    for (const path of ['/nope', '/api/nope', '/admin', '/report']) {
      const res = await app.request(path, {}, envFor());
      expect(res.status, path).toBe(404);
      expect(await res.json(), path).toEqual({ error: 'not found' });
    }
  });
});

describe('readRecentChecks (dashboard table, merged from the rings)', () => {
  const at = new Date('2026-10-03T12:00:00.000Z');
  const env = (bucket) => envFor({ MONITOR_BUCKET: bucket });

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
    const bare = await app.request('/', {}, envFor());
    expect(bare.status).toBe(302);
    expect(bare.headers.get('location')).toContain('/login');
    const queryToken = await app.request('/?token=wrong', {}, envFor());
    expect(queryToken.status).toBe(302);
  });

  it('200 HTML contains status-pill, dark bg, Check Now, lists', async () => {
    const bucket = okBucket();
    const env = envFor({ MONITOR_BUCKET: bucket });
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

  it('renders the reports list as TABS the client fetches, and no longer server-side', async () => {
    const bucket = okBucket();
    // A report IS in the bucket — the endpoint can serve it — and the page still
    // does not render it. Proving the list is client-fetched therefore needs a
    // report that EXISTS, not one that a fake store declined to answer.
    seedIntake(bucket, 'errors', '2026-10-03T12:00:00.000Z', { message: 'seeded in the bucket' });
    const env = envFor({ MONITOR_BUCKET: bucket });
    const value = await signSession(env.DASHBOARD_PIN, Date.now());
    const res = await app.request('/', { headers: { cookie: `${SESSION_COOKIE}=${value}` } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    // The list is a shell: one tab per kind, and the rows arrive from
    // /api/reports when a tab is opened.
    expect(html).toContain('data-report-tab="errors"');
    expect(html).toContain('data-report-tab="feedback"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("fetch('/api/reports?kind='");
    expect(html).toContain('Loading…');
    expect(html).toContain('No recent reports');
    expect(html).toContain('openReportTab(\'errors\')');
    // Each kind is fetched ONCE per page view — six dashboards open in six
    // browsers must not mean six listings each — but "Check Now" forces a
    // re-read of the open tab, or a manual refresh would silently skip the one
    // panel an operator opens it to see.
    expect(html).toContain('if (reportTabsLoaded[kind] && !force) return;');
    expect(html).toContain("openReportTab(open.getAttribute('data-report-tab'), true)");
    // The stored report is NOT on the page: it is fetched per tab, and a
    // leftover server-rendered list would be a second copy of the data to keep
    // in step (and would re-introduce the escaping question this page avoids).
    expect(html).not.toContain('seeded in the bucket');
    // No reports read at all on a page render.
    expect(bucket.calls.get.filter((k) => k.startsWith('reports/'))).toEqual([]);
  });

  it('never hands report text to an HTML parser', async () => {
    const bucket = okBucket();
    const env = envFor({ MONITOR_BUCKET: bucket });
    const value = await signSession(env.DASHBOARD_PIN, Date.now());
    const html = await (
      await app.request('/', { headers: { cookie: `${SESSION_COOKIE}=${value}` } }, env)
    ).text();

    // Report messages are user-submitted prose and the list is now client-rendered,
    // so the escaping moved with it. There is exactly one sink for that text and
    // it cannot parse its input as HTML: the page's SCRIPT block assigns cells
    // with textContent and never hands a string to an HTML parser.
    const script = html.slice(html.indexOf('<script>'));
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'createContextualFragment']) {
      expect(script, sink).not.toContain(sink);
    }
    expect(script).toContain('td.textContent = values[i];');
    expect(script).toContain('td.textContent = text;');
  });

  it('accepts session cookie too and escapes report content', async () => {
    const bucket = makeR2();
    const at = new Date('2026-10-03T12:00:00.000Z');
    // The probe error string is operator-adjacent data (a probe URL can carry a
    // token), and it is the one server-rendered value left: it must arrive
    // escaped.
    seedRun(bucket, at, [
      { name: TARGETS[0].name, ok: false, errorMessage: '<img src=x>' },
      ...TARGETS.slice(1).map((t) => ({ name: t.name, ok: true })),
    ]);
    const env = envFor({ MONITOR_BUCKET: bucket });
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
