import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  app,
  withPublicCache,
  withPublicCacheInfo,
  clearPublicCache,
  PUBLIC_CACHE_TTL_MS,
} from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth.js';
import { TARGETS } from '../src/targets.js';

// Read-through cache coverage for the two PUBLIC dashboard endpoints
// (/api/status, /api/history). The contract under test:
//
//   - a second read inside the 20s TTL performs ZERO D1 prepares (no query)
//   - once the TTL expires the endpoint queries D1 again (never stale-past-TTL)
//   - /api/history entries are keyed by `target|hours`
//   - a failing query is NEVER cached — the next read retries D1
//
// Every assertion here counts `prepare()` calls on the D1 stub: that is the
// unit of work the cache exists to remove.

class SpyStmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async all() {
    return { results: this.db.execAll(this.sql, this.args) };
  }
  async first() {
    const rows = this.db.execAll(this.sql, this.args);
    return rows[0] ?? null;
  }
  async run() {
    return { success: true };
  }
}

class SpyDb {
  constructor({ throwOnPrepare = false } = {}) {
    this.prepareCount = 0;
    this.throwOnPrepare = throwOnPrepare;
    this.checks = [];
    this.reports = [];
    this.seq = 0;
    this.tick = 0;
  }
  prepare(sql) {
    this.prepareCount += 1;
    if (this.throwOnPrepare) throw new Error('D1 unavailable');
    return new SpyStmt(this, sql);
  }
  seedCheck(target, { ok = true, responseMs = 12 } = {}) {
    this.seq += 1;
    this.tick += 1;
    this.checks.push({
      id: this.seq,
      target,
      status_code: ok ? 200 : 500,
      ok: ok ? 1 : 0,
      response_ms: responseMs,
      error_message: null,
      checked_at: `2026-09-30 00:00:${String(this.tick).padStart(2, '0')}`,
    });
  }
  execAll(sql, args) {
    if (sql.includes('UNION ALL') && sql.includes('ORDER BY id DESC LIMIT 1')) {
      const rows = [];
      for (const target of args) {
        const newest = this.checks.filter((r) => r.target === target).pop();
        if (newest) {
          rows.push({
            target: newest.target,
            status_code: newest.status_code,
            ok: newest.ok,
            response_ms: newest.response_ms,
            error_message: newest.error_message,
            checked_at: newest.checked_at,
          });
        }
      }
      return rows;
    }
    if (sql.includes('SELECT MAX(checked_at)')) {
      const max = this.checks.reduce((m, r) => (!m || r.checked_at > m ? r.checked_at : m), null);
      return [{ last_check: max }];
    }
    if (sql.includes('SELECT COUNT(*) AS total')) {
      const [target] = args;
      const rows = this.checks.filter((r) => r.target === target);
      return [{ total: rows.length, ok_count: rows.reduce((n, r) => n + r.ok, 0) }];
    }
    if (sql.includes("datetime('now',")) {
      const [target] = args;
      return this.checks.filter((r) => r.target === target);
    }
    if (sql.includes('FROM reports')) {
      const [limit] = args;
      return this.reports.slice(0, limit);
    }
    if (sql.includes('ORDER BY id DESC')) {
      const [limit] = args;
      return [...this.checks].sort((a, b) => b.id - a.id).slice(0, limit);
    }
    throw new Error(`SpyDb.execAll: unhandled SQL: ${sql}`);
  }
}

const envFor = (db) => ({ DB: db, DASHBOARD_PIN: '123456' });
const get = (path, db) => app.request(path, {}, envFor(db));

const T0 = Date.parse('2026-09-30T12:00:00Z');

// The routes read the clock through Date.now(), so faking Date is what lets the
// test step across the TTL boundary deterministically (no sleeping).
beforeEach(() => {
  clearPublicCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  clearPublicCache();
});

describe('GET /api/status — 20s TTL cache', () => {
  it('second read inside the TTL performs zero D1 prepares', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    const first = await get('/api/status', db);
    expect(first.status).toBe(200);
    const afterFirst = db.prepareCount;
    expect(afterFirst).toBeGreaterThan(0);

    // 10s in: still inside the TTL.
    vi.setSystemTime(T0 + 10_000);
    const second = await get('/api/status', db);

    expect(second.status).toBe(200);
    expect(db.prepareCount).toBe(afterFirst);
    // Served from cache: the DATA is byte-identical, not a re-query. The
    // per-response `cached` flag is the one key that must differ (false on the
    // miss, true on the hit) -- it is not part of the cached value.
    const { cached: coldFlag, ...coldPayload } = await first.json();
    const { cached: warmFlag, ...warmPayload } = await second.json();
    expect(coldFlag).toBe(false);
    expect(warmFlag).toBe(true);
    expect(warmPayload).toEqual(coldPayload);
  });

  it('re-queries D1 once the TTL expires (never serves past TTL)', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    const first = await get('/api/status', db);
    const afterFirst = db.prepareCount;
    const firstBody = await first.json();

    // Fresh rows land in D1, but the cached entry is still valid at TTL - 1ms.
    db.seedCheck(TARGETS[0].name, { ok: false, responseMs: 999 });
    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS - 1);
    const justBefore = await get('/api/status', db);
    expect(db.prepareCount).toBe(afterFirst);
    expect((await justBefore.json()).overall).toBe(firstBody.overall);

    // At exactly TTL the entry is expired and D1 runs again.
    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS);
    const atTtl = await get('/api/status', db);
    expect(db.prepareCount).toBeGreaterThan(afterFirst);

    const freshBody = await atTtl.json();
    expect(freshBody.overall).not.toBe(firstBody.overall);
    expect(freshBody.targets.find((t) => t.name === TARGETS[0].name).last_response_ms).toBe(999);
  });

  it('serves a stale-free aggregate to every viewer in the window', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    await get('/api/status', db);
    const afterFirst = db.prepareCount;
    // Ten concurrent dashboards inside one TTL window share the single query.
    const bodies = await Promise.all(
      Array.from({ length: 10 }, () => get('/api/status', db).then((r) => r.json())),
    );
    expect(db.prepareCount).toBe(afterFirst);
    expect(new Set(bodies.map((b) => b.overall))).toEqual(new Set(['ok']));
  });
});

describe('GET /api/history — 20s TTL cache keyed by target|hours', () => {
  it('second read of the same key performs zero D1 prepares', async () => {
    const db = new SpyDb();
    db.seedCheck('marketplace', { ok: true });
    db.seedCheck('marketplace', { ok: false });

    const first = await get('/api/history?target=marketplace&hours=24', db);
    expect(first.status).toBe(200);
    const afterFirst = db.prepareCount;

    vi.setSystemTime(T0 + 5_000);
    const second = await get('/api/history?target=marketplace&hours=24', db);

    expect(db.prepareCount).toBe(afterFirst);
    expect(await second.json()).toEqual(await first.json());
  });

  it('a different hours window is a different cache entry', async () => {
    const db = new SpyDb();
    db.seedCheck('marketplace', { ok: true });

    await get('/api/history?target=marketplace&hours=24', db);
    const afterFirst = db.prepareCount;

    // Different key → must query.
    const seven = await get('/api/history?target=marketplace&hours=7', db);
    expect(db.prepareCount).toBeGreaterThan(afterFirst);
    expect((await seven.json()).hours).toBe(7);
    const afterSeven = db.prepareCount;

    // Same key again → cached.
    await get('/api/history?target=marketplace&hours=7', db);
    expect(db.prepareCount).toBe(afterSeven);
  });

  it('a different target is a different cache entry', async () => {
    const db = new SpyDb();
    const [a, b] = TARGETS;
    db.seedCheck(a.name, { ok: true });
    db.seedCheck(b.name, { ok: true });

    const firstBody = await get(`/api/history?target=${a.name}&hours=24`, db).then((r) => r.json());
    const afterFirst = db.prepareCount;

    const otherBody = await get(`/api/history?target=${b.name}&hours=24`, db).then((r) => r.json());
    expect(db.prepareCount).toBeGreaterThan(afterFirst);
    expect(otherBody.target).toBe(b.name);
    expect(otherBody).not.toEqual(firstBody);

    // Both keys now cached.
    const settled = db.prepareCount;
    await get(`/api/history?target=${a.name}&hours=24`, db);
    await get(`/api/history?target=${b.name}&hours=24`, db);
    expect(db.prepareCount).toBe(settled);
  });

  it('normalized hours collapse onto one entry', async () => {
    const db = new SpyDb();
    db.seedCheck('marketplace', { ok: true });

    await get('/api/history?target=marketplace&hours=7', db);
    const afterFirst = db.prepareCount;
    // `07` normalizes to 7, so this must NOT be a cache miss.
    await get('/api/history?target=marketplace&hours=07', db);
    expect(db.prepareCount).toBe(afterFirst);
  });

  it('re-queries D1 after the TTL expires', async () => {
    const db = new SpyDb();
    db.seedCheck('marketplace', { ok: true });

    await get('/api/history?target=marketplace&hours=24', db);
    const afterFirst = db.prepareCount;

    db.seedCheck('marketplace', { ok: false, responseMs: 777 });
    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS);
    const body = await get('/api/history?target=marketplace&hours=24', db).then((r) => r.json());

    expect(db.prepareCount).toBeGreaterThan(afterFirst);
    expect(body.checks).toHaveLength(2);
    expect(body.checks[1].response_ms).toBe(777);
  });
});

describe('public cache never stores errors', () => {
  it('a throwing /api/status query is retried on the next read', async () => {
    const broken = new SpyDb({ throwOnPrepare: true });
    for (const t of TARGETS) broken.seedCheck(t.name, { ok: true });

    const failed = await get('/api/status', broken);
    expect(failed.status).toBeGreaterThanOrEqual(500);

    // Same TTL window: if the failure had been cached, this would fail too.
    vi.setSystemTime(T0 + 1_000);
    const healthy = new SpyDb();
    for (const t of TARGETS) healthy.seedCheck(t.name, { ok: true });
    const ok = await get('/api/status', healthy);

    expect(ok.status).toBe(200);
    expect(healthy.prepareCount).toBeGreaterThan(0);
    expect((await ok.json()).overall).toBe('ok');
  });

  it('a throwing /api/history query is retried on the next read', async () => {
    const failed = await get('/api/history?target=marketplace&hours=24', new SpyDb({ throwOnPrepare: true }));
    expect(failed.status).toBeGreaterThanOrEqual(500);

    vi.setSystemTime(T0 + 1_000);
    const healthy = new SpyDb();
    healthy.seedCheck('marketplace', { ok: true });
    const ok = await get('/api/history?target=marketplace&hours=24', healthy);
    expect(ok.status).toBe(200);
    expect(healthy.prepareCount).toBeGreaterThan(0);
  });

  it('validation 400s never reach the cache', async () => {
    const db = new SpyDb();
    const missing = await get('/api/history', db);
    const unknown = await get('/api/history?target=nope', db);
    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(400);
    // Rejected before any D1 work.
    expect(db.prepareCount).toBe(0);

    // And repeating them keeps failing the same way (no poisoned entry).
    vi.setSystemTime(T0 + 1_000);
    expect((await get('/api/history', db)).status).toBe(400);
    expect((await get('/api/history?target=nope', db)).status).toBe(400);
    expect(db.prepareCount).toBe(0);
  });

  it('withPublicCache propagates the error and stores nothing', async () => {
    let calls = 0;
    const boom = async () => {
      calls += 1;
      throw new Error('nope');
    };

    await expect(withPublicCache('k', boom, T0)).rejects.toThrow('nope');
    await expect(withPublicCache('k', boom, T0 + 1_000)).rejects.toThrow('nope');
    // Both attempts reached the producer: the failure was not cached.
    expect(calls).toBe(2);
  });
});

describe('withPublicCache / clearPublicCache', () => {
  it('serves within the TTL and misses at the boundary', async () => {
    let calls = 0;
    const producer = async () => {
      calls += 1;
      return { n: calls };
    };

    expect(await withPublicCache('k', producer, T0)).toEqual({ n: 1 });
    expect(await withPublicCache('k', producer, T0 + 1)).toEqual({ n: 1 });
    expect(await withPublicCache('k', producer, T0 + PUBLIC_CACHE_TTL_MS - 1)).toEqual({ n: 1 });
    expect(calls).toBe(1);

    // Exactly at the TTL the entry is expired.
    expect(await withPublicCache('k', producer, T0 + PUBLIC_CACHE_TTL_MS)).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it('distinct keys do not share an entry', async () => {
    const calls = { a: 0, b: 0 };
    await withPublicCache('a', async () => ++calls.a, T0);
    await withPublicCache('b', async () => ++calls.b, T0);
    expect(calls).toEqual({ a: 1, b: 1 });
  });

  it('clearPublicCache forces the next read to query', async () => {
    let calls = 0;
    const producer = async () => ++calls;
    await withPublicCache('k', producer, T0);
    expect(await withPublicCache('k', producer, T0)).toBe(1);

    clearPublicCache();
    expect(await withPublicCache('k', producer, T0)).toBe(2);
    expect(calls).toBe(2);
  });
});

describe('GET /api/status — `cached` flag reports THIS response', () => {
  it('false on a cold read, true inside the TTL, false again once it expires', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    const cold = await get('/api/status', db).then((r) => r.json());
    expect(cold.cached).toBe(false);
    const afterCold = db.prepareCount;
    expect(afterCold).toBeGreaterThan(0);

    vi.setSystemTime(T0 + 5_000);
    const warm = await get('/api/status', db).then((r) => r.json());
    expect(warm.cached).toBe(true);
    expect(db.prepareCount).toBe(afterCold);

    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS);
    const expired = await get('/api/status', db).then((r) => r.json());
    expect(expired.cached).toBe(false);
    expect(db.prepareCount).toBeGreaterThan(afterCold);
  });

  it('the flag is NOT frozen into the cached payload (the self-invalidating trap)', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    const cold = await get('/api/status', db).then((r) => r.json());
    // The value stored under 'status' carries no `cached` key of its own...
    expect(Object.hasOwn(cold, 'cached')).toBe(true);
    const stored = await withPublicCacheInfo('status', () => {
      throw new Error('producer must not run for a live entry');
    }, T0 + 1_000);
    expect(stored.cached).toBe(true);
    // ...so the value the cache replays is the pure aggregate, and the flag is
    // recomputed per response. Had the producer returned `{cached:false}` and it
    // been stored, this second read would report `false` while replaying a cache
    // entry (and a `true` stored by a hit would survive past the TTL).
    expect(Object.hasOwn(stored.value, 'cached')).toBe(false);
    expect(Object.keys(stored.value).sort()).toEqual(['checked_at', 'overall', 'targets']);
  });

  it('concurrent viewers inside one window: one miss, the rest hits', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    await get('/api/status', db);
    const afterFirst = db.prepareCount;
    const bodies = await Promise.all(
      Array.from({ length: 5 }, () => get('/api/status', db).then((r) => r.json())),
    );
    expect(db.prepareCount).toBe(afterFirst);
    // Every one of them truthfully reports where its own bytes came from.
    for (const b of bodies) expect(b.cached).toBe(true);
    // And the flag does not leak into the per-target rows.
    for (const row of bodies[0].targets) expect(Object.hasOwn(row, 'cached')).toBe(false);
  });

  it('clearPublicCache makes the next read report cached:false again', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });

    expect((await get('/api/status', db).then((r) => r.json())).cached).toBe(false);
    expect((await get('/api/status', db).then((r) => r.json())).cached).toBe(true);

    clearPublicCache();
    expect((await get('/api/status', db).then((r) => r.json())).cached).toBe(false);
  });
});

describe('withPublicCacheInfo', () => {
  it('reports hit/miss per call and leaves withPublicCache value-identical', async () => {
    let calls = 0;
    const producer = async () => {
      calls += 1;
      return { n: calls };
    };

    expect(await withPublicCacheInfo('k', producer, T0)).toEqual({ value: { n: 1 }, cached: false });
    expect(await withPublicCacheInfo('k', producer, T0 + 1)).toEqual({ value: { n: 1 }, cached: true });
    expect(await withPublicCacheInfo('k', producer, T0 + PUBLIC_CACHE_TTL_MS - 1)).toEqual({
      value: { n: 1 },
      cached: true,
    });
    expect(await withPublicCacheInfo('k', producer, T0 + PUBLIC_CACHE_TTL_MS)).toEqual({
      value: { n: 2 },
      cached: false,
    });
    expect(calls).toBe(2);

    // Same key, different wrapper: withPublicCache unwraps to the bare value.
    expect(await withPublicCache('other', producer, T0)).toEqual({ n: 3 });
  });

  it('a throwing producer reports nothing and is not cached', async () => {
    let calls = 0;
    const boom = async () => {
      calls += 1;
      throw new Error('nope');
    };
    await expect(withPublicCacheInfo('k', boom, T0)).rejects.toThrow('nope');
    await expect(withPublicCacheInfo('k', boom, T0 + 1_000)).rejects.toThrow('nope');
    expect(calls).toBe(2);
  });
});

describe('dashboard refresh interval', () => {
  it('polls every 60s, not 30s, and pauses while the tab is hidden', async () => {
    const db = new SpyDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });
    const env = envFor(db);

    // The dashboard is PIN-gated, so mint a real session cookie to render it.
    const value = await signSession(env.DASHBOARD_PIN, T0);
    const res = await app.request('/', { headers: { cookie: `${SESSION_COOKIE}=${value}` } }, env);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('var REFRESH_MS = 60000;');
    expect(html).toContain('setInterval(refreshAll, REFRESH_MS)');
    expect(html).not.toContain('30000');
    // Visibility-aware: the interval is torn down on hide and re-armed on return.
    expect(html).toContain("document.addEventListener('visibilitychange'");
    expect(html).toContain('if (document.hidden) { stopTimer(); return; }');
    expect(html).toContain('if (document.hidden) stopTimer(); else startTimer();');
  });
});
