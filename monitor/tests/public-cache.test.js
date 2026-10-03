import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  app,
  withPublicCache,
  withPublicCacheInfo,
  clearPublicCache,
  PUBLIC_CACHE_TTL_MS,
  PUBLIC_CACHE_MAX_ENTRIES,
} from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth.js';
import { TARGETS } from '../src/targets.js';
import { makeR2, seedRun, seedRing, ringEntry } from './helpers/fake-r2.js';

// Read-through cache coverage for the two PUBLIC dashboard endpoints
// (/api/status, /api/history). The contract under test:
//
//   - a second read inside the 20s TTL touches the bucket ZERO times
//   - once the TTL expires the endpoint reads again (never stale-past-TTL)
//   - /api/history entries are keyed by `target|hours`
//   - a failing read is NEVER cached — the next read retries
//
// RE-POINTED AT R2 (2026-10-03, phase 3). The D1 version of this file counted
// `prepare()` calls on a SQL stub; the unit of work the cache removes is now a
// bucket GET plus the LIST that finds the newest run key, so that is what is
// counted here. Nothing about the cache changed — only what it is in front of —
// which is why the assertions are the same assertions.

const T0 = Date.parse('2026-09-30T12:00:00Z');
const T = (ms) => new Date(T0 + ms);

// Total storage operations issued against the bucket — the work the 20s window
// collapses. `list` counts: finding the newest run key is a listing, and a
// cache that skipped it would be skipping the read we care about.
function work(bucket) {
  return bucket.calls.get.length + bucket.calls.list.length;
}

// The only storage binding is the bucket (phase 6 removed the last one this file
// needed), and `DB` is a throwing getter so a handler that reached for a database
// would fail here rather than pass against a stub.
const envFor = (bucket, extra = {}) => ({
  get DB() {
    throw new Error('the monitor worker has no DB binding (phase 6)');
  },
  MONITOR_BUCKET: bucket,
  DASHBOARD_PIN: '123456',
  ...extra,
});
const get = (path, bucket) => app.request(path, {}, envFor(bucket));

// The cache lives on globalThis (per-isolate in production) behind a private
// store function, so this reads it the same way the worker does rather than
// asserting on an exported number that could drift from the real cap.
const publicCacheSize = () => globalThis.__monitorPublicCache?.size ?? 0;

// A bucket holding one healthy run for every target, plus a 100%-uptime rollup.
function seeded({ ok = () => true } = {}) {
  const bucket = makeR2();
  seedRun(
    bucket,
    T(0),
    TARGETS.map((t) => ({ name: t.name, ok: ok(t) })),
  );
  return bucket;
}

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
  it('second read inside the TTL performs zero bucket operations', async () => {
    const bucket = seeded();

    const first = await get('/api/status', bucket);
    expect(first.status).toBe(200);
    const afterFirst = work(bucket);
    expect(afterFirst).toBeGreaterThan(0);

    // 10s in: still inside the TTL.
    vi.setSystemTime(T0 + 10_000);
    const second = await get('/api/status', bucket);

    expect(second.status).toBe(200);
    expect(work(bucket)).toBe(afterFirst);
    // Served from cache: the DATA is byte-identical, not a re-read. The
    // per-response `cached` flag is the one key that must differ (false on the
    // miss, true on the hit) -- it is not part of the cached value.
    const { cached: coldFlag, ...coldPayload } = await first.json();
    const { cached: warmFlag, ...warmPayload } = await second.json();
    expect(coldFlag).toBe(false);
    expect(warmFlag).toBe(true);
    expect(warmPayload).toEqual(coldPayload);
  });

  it('re-reads the bucket once the TTL expires (never serves past TTL)', async () => {
    const bucket = seeded();

    const first = await get('/api/status', bucket);
    const afterFirst = work(bucket);
    const firstBody = await first.json();

    // A newer run lands (its own minute, so it is a genuinely newer key).
    seedRun(
      bucket,
      T(60_000),
      TARGETS.map((t) => ({ name: t.name, ok: false, responseMs: 999 })),
    );
    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS - 1);
    const justBefore = await get('/api/status', bucket);
    expect(work(bucket)).toBe(afterFirst);
    expect((await justBefore.json()).overall).toBe(firstBody.overall);

    // At exactly TTL the entry is expired and the bucket is read again.
    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS);
    const atTtl = await get('/api/status', bucket);
    expect(work(bucket)).toBeGreaterThan(afterFirst);

    const freshBody = await atTtl.json();
    expect(freshBody.overall).not.toBe(firstBody.overall);
    expect(freshBody.targets[0].last_response_ms).toBe(999);
  });

  it('serves a stale-free aggregate to every viewer in the window', async () => {
    const bucket = seeded();

    await get('/api/status', bucket);
    const afterFirst = work(bucket);
    // Ten concurrent dashboards inside one TTL window share the single read.
    const bodies = await Promise.all(
      Array.from({ length: 10 }, () => get('/api/status', bucket).then((r) => r.json())),
    );
    expect(work(bucket)).toBe(afterFirst);
    expect(new Set(bodies.map((b) => b.overall))).toEqual(new Set(['ok']));
  });

  it('one uncached read costs three objects, not one per target', async () => {
    // The fan-out this cache (and the rollup) exist to remove: a LIST to find the
    // newest run key, that run, and the two state documents. Growing with
    // TARGETS.length instead would be the D1 shape coming back.
    const bucket = seeded();
    await get('/api/status', bucket);
    expect(bucket.calls.list).toHaveLength(1);
    expect(bucket.calls.get).toHaveLength(3);
    expect(bucket.calls.get.some((k) => k.startsWith('checks/'))).toBe(true);
    expect(bucket.calls.get.filter((k) => k.startsWith('state/')).sort()).toEqual([
      'state/alert_state.json',
      'state/summary.json',
    ]);
  });
});

describe('GET /api/history — 20s TTL cache keyed by target|hours', () => {
  const ring = (bucket, target, minutes = []) =>
    seedRing(bucket, target, minutes.map((m) => ringEntry(T0, m)));

  it('second read of the same key performs zero bucket operations', async () => {
    const bucket = makeR2();
    ring(bucket, 'marketplace', [30, 10]);

    const first = await get('/api/history?target=marketplace&hours=24', bucket);
    expect(first.status).toBe(200);
    const afterFirst = work(bucket);
    expect(afterFirst).toBe(1); // one object, not one per run in the window

    vi.setSystemTime(T0 + 5_000);
    const second = await get('/api/history?target=marketplace&hours=24', bucket);

    expect(work(bucket)).toBe(afterFirst);
    expect(await second.json()).toEqual(await first.json());
  });

  it('a different hours window is a different cache entry', async () => {
    const bucket = makeR2();
    ring(bucket, 'marketplace', [30, 10]);

    await get('/api/history?target=marketplace&hours=24', bucket);
    const afterFirst = work(bucket);

    // Different key → must read.
    const seven = await get('/api/history?target=marketplace&hours=7', bucket);
    expect(work(bucket)).toBeGreaterThan(afterFirst);
    expect((await seven.json()).hours).toBe(7);
    const afterSeven = work(bucket);

    // Same key again → cached.
    await get('/api/history?target=marketplace&hours=7', bucket);
    expect(work(bucket)).toBe(afterSeven);
  });

  it('a different target is a different cache entry', async () => {
    const bucket = makeR2();
    const [a, b] = TARGETS;
    ring(bucket, a.name, [30]);
    ring(bucket, b.name, [30, 10]);

    const firstBody = await get(`/api/history?target=${a.name}&hours=24`, bucket).then((r) => r.json());
    const afterFirst = work(bucket);

    const otherBody = await get(`/api/history?target=${b.name}&hours=24`, bucket).then((r) => r.json());
    expect(work(bucket)).toBeGreaterThan(afterFirst);
    expect(otherBody.target).toBe(b.name);
    expect(otherBody).not.toEqual(firstBody);

    // Both keys now cached.
    const settled = work(bucket);
    await get(`/api/history?target=${a.name}&hours=24`, bucket);
    await get(`/api/history?target=${b.name}&hours=24`, bucket);
    expect(work(bucket)).toBe(settled);
  });

  it('normalized hours collapse onto one entry', async () => {
    const bucket = makeR2();
    ring(bucket, 'marketplace', [30]);

    await get('/api/history?target=marketplace&hours=7', bucket);
    const afterFirst = work(bucket);
    // `07` normalizes to 7, so this must NOT be a cache miss.
    await get('/api/history?target=marketplace&hours=07', bucket);
    expect(work(bucket)).toBe(afterFirst);
  });

  it('re-reads the bucket after the TTL expires', async () => {
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', [ringEntry(T0, 30)]);

    await get('/api/history?target=marketplace&hours=24', bucket);
    const afterFirst = work(bucket);

    // A newer sample lands in the ring.
    const doc = bucket.read('state/history/marketplace.json');
    doc.entries.push(ringEntry(T0, 0, { response_ms: 777, status_code: 500, ok: 0 }));
    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS);
    const body = await get('/api/history?target=marketplace&hours=24', bucket).then((r) => r.json());

    expect(work(bucket)).toBeGreaterThan(afterFirst);
    expect(body.checks).toHaveLength(2);
    expect(body.checks[1].response_ms).toBe(777);
  });
});

describe('public cache never stores errors', () => {
  it('a throwing /api/status read is retried on the next read', async () => {
    const broken = makeR2({ failOn: { get: 'checks/' } });
    seedRun(broken, T(0), [{ name: 'marketplace', ok: true }]);

    const failed = await get('/api/status', broken);
    expect(failed.status).toBeGreaterThanOrEqual(500);

    // Same TTL window: if the failure had been cached, this would fail too.
    vi.setSystemTime(T0 + 1_000);
    const healthy = seeded();
    const ok = await get('/api/status', healthy);

    expect(ok.status).toBe(200);
    expect(work(healthy)).toBeGreaterThan(0);
    expect((await ok.json()).overall).toBe('ok');
  });

  it('a throwing /api/history read is retried on the next read', async () => {
    const broken = makeR2({ failOn: { get: 'state/history/' } });
    seedRing(broken, 'marketplace', [ringEntry(T0, 5)]);
    const failed = await get('/api/history?target=marketplace&hours=24', broken);
    expect(failed.status).toBeGreaterThanOrEqual(500);

    vi.setSystemTime(T0 + 1_000);
    const healthy = makeR2();
    seedRing(healthy, 'marketplace', [ringEntry(T0, 5)]);
    const ok = await get('/api/history?target=marketplace&hours=24', healthy);
    expect(ok.status).toBe(200);
    expect(work(healthy)).toBeGreaterThan(0);
  });

  it('validation 400s never reach the cache', async () => {
    const bucket = seeded();
    const missing = await get('/api/history', bucket);
    const unknown = await get('/api/history?target=nope', bucket);
    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(400);
    // Rejected before any bucket work.
    expect(work(bucket)).toBe(0);

    // And repeating them keeps failing the same way (no poisoned entry).
    vi.setSystemTime(T0 + 1_000);
    expect((await get('/api/history', bucket)).status).toBe(400);
    expect((await get('/api/history?target=nope', bucket)).status).toBe(400);
    expect(work(bucket)).toBe(0);
  });

  it('validation runs BEFORE the cache lookup: a 400 neither writes nor evicts', async () => {
    const bucket = makeR2();
    seedRing(bucket, 'marketplace', [ringEntry(T0, 5)]);

    // Warm ONE valid entry, then attack it with rejected requests.
    await get('/api/history?target=marketplace&hours=24', bucket);
    const warm = work(bucket);
    expect(warm).toBeGreaterThan(0);

    for (const bad of ['/api/history', '/api/history?target=nope', '/api/history?target=nope&hours=24']) {
      expect((await get(bad, bucket)).status).toBe(400);
    }
    // A rejected request must not have consulted the bucket ...
    expect(work(bucket)).toBe(warm);
    // ... nor evicted/overwritten the entry it collided with: the valid key is
    // still a hit. (A validation 400 stored under any key would surface here.)
    vi.setSystemTime(T0 + 1_000);
    expect((await get('/api/history?target=marketplace&hours=24', bucket)).status).toBe(200);
    expect(work(bucket)).toBe(warm);

    // The valid_targets hint is the payload of the 400 -- it must not leak into
    // a cached 200 either.
    const body = await get('/api/history?target=marketplace&hours=24', bucket).then((r) => r.json());
    expect(Object.keys(body).sort()).toEqual(['checks', 'hours', 'target']);
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

  it('is BOUNDED: the entry count cannot grow without limit under distinct keys', async () => {
    // A dashboard asks for `status` plus one entry per (target, window) pair, so
    // the key space is small in practice — but nothing stops a caller from asking
    // for arbitrary windows, and an unbounded per-isolate Map is a memory leak
    // with a 20-second fuse. The store evicts stale entries first and, if that is
    // not enough (everything is fresh), drops the OLDEST until it is back under
    // the cap. Correct answers are never affected: an evicted key is simply
    // re-read.
    const producer = async () => 'v';
    for (let i = 0; i < 300; i += 1) {
      await withPublicCache(`k${i}`, producer, T0);
    }
    // The newest key is still cached (it was written last and is fresh)...
    expect(await withPublicCache('k299', producer, T0)).toBe('v');
    // ...and the store did not simply keep growing.
    expect(PUBLIC_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(publicCacheSize()).toBeLessThanOrEqual(PUBLIC_CACHE_MAX_ENTRIES);
    expect(publicCacheSize()).toBeGreaterThan(0);
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
    const bucket = seeded();

    const cold = await get('/api/status', bucket).then((r) => r.json());
    expect(cold.cached).toBe(false);
    const afterCold = work(bucket);
    expect(afterCold).toBeGreaterThan(0);

    vi.setSystemTime(T0 + 5_000);
    const warm = await get('/api/status', bucket).then((r) => r.json());
    expect(warm.cached).toBe(true);
    expect(work(bucket)).toBe(afterCold);

    vi.setSystemTime(T0 + PUBLIC_CACHE_TTL_MS);
    const expired = await get('/api/status', bucket).then((r) => r.json());
    expect(expired.cached).toBe(false);
    expect(work(bucket)).toBeGreaterThan(afterCold);
  });

  it('the flag is NOT frozen into the cached payload (the self-invalidating trap)', async () => {
    const bucket = seeded();

    const cold = await get('/api/status', bucket).then((r) => r.json());
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
    const bucket = seeded();

    await get('/api/status', bucket);
    const afterFirst = work(bucket);
    const bodies = await Promise.all(
      Array.from({ length: 5 }, () => get('/api/status', bucket).then((r) => r.json())),
    );
    expect(work(bucket)).toBe(afterFirst);
    // Every one of them truthfully reports where its own bytes came from.
    for (const b of bodies) expect(b.cached).toBe(true);
    // And the flag does not leak into the per-target rows.
    for (const row of bodies[0].targets) expect(Object.hasOwn(row, 'cached')).toBe(false);
  });

  it('clearPublicCache makes the next read report cached:false again', async () => {
    const bucket = seeded();

    expect((await get('/api/status', bucket).then((r) => r.json())).cached).toBe(false);
    expect((await get('/api/status', bucket).then((r) => r.json())).cached).toBe(true);

    clearPublicCache();
    expect((await get('/api/status', bucket).then((r) => r.json())).cached).toBe(false);
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
    const bucket = seeded();
    const env = envFor(bucket);

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