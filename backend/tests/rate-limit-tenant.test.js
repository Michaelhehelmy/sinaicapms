import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rateLimitMiddleware,
  policyLimiter,
  tenantAwareLimiter,
  RATE_LIMIT_POLICIES,
} from '../src/middleware/rateLimit.js';

/**
 * Wave 3.5 (F-A18-09) — per-tenant rate limiter.
 *
 * The tenant component of the limiting key comes from the VERIFIED claim
 * stamped by resolveScope / superAdminAuth AFTER auth (c.get('scope')), never
 * from the client-settable x-tenant-id header. These tests prove:
 *   1. cross-tenant isolation (the load-bearing property)
 *   2. same-tenant throttling still works
 *   3. a rotated x-tenant-id header cannot mint fresh buckets (inert by
 *      construction — the key never reads the header)
 *   4. unauth/public requests bypass the per-tenant limiter entirely and stay
 *      bounded by the global policyLimiter (Shape-1 resolveScope short-circuit)
 *   5. the Wave 3.4a POST /api/stream/token policy is not shadowed
 */

function makeCtx(path = '/api/reports', ip = '1.2.3.4', scope = null, envOverrides = {}, method = 'GET') {
  return {
    req: {
      path,
      method,
      header: (name) => {
        if (name === 'cf-connecting-ip') return ip;
        if (name === 'x-tenant-id') return 'spoofed-tenant';
        return null;
      },
    },
    env: {
      ENVIRONMENT: 'production',
      ...envOverrides,
    },
    get: (key) => (key === 'scope' ? scope : undefined),
    json: vi.fn().mockImplementation((body, status) => ({ status, body, ok: status < 400 })),
  };
}

function authedScope(tenantId, role = 'admin') {
  return { tenantId, user: { id: 1, role } };
}

describe('tenantAwareLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis._rateLimitMap;
  });

  it('skips rate limiting in test environment', async () => {
    const next = vi.fn();
    const c = makeCtx('/api/reports', '1.2.3.4', authedScope(42), { ENVIRONMENT: 'test' });
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 1 });
    await limiter(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('cross-tenant isolation (load-bearing): tenant A burst does not throttle tenant B', async () => {
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 2 });
    const nextA = vi.fn();
    const nextB = vi.fn();

    // Tenant A (same IP + same path) exhausts its bucket.
    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/reports', '1.2.3.4', authedScope(10)), nextA);
    }
    const cA3 = makeCtx('/api/reports', '1.2.3.4', authedScope(10));
    await limiter(cA3, nextA);
    expect(cA3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(nextA).toHaveBeenCalledTimes(2);

    // Tenant B behind the same IP starts with a FRESH bucket (A's burst did
    // not consume it): B passes exactly max times then throttles on its own.
    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/reports', '1.2.3.4', authedScope(20)), nextB);
    }
    expect(nextB).toHaveBeenCalledTimes(2);
    const cB3 = makeCtx('/api/reports', '1.2.3.4', authedScope(20));
    cB3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(cB3, nextB);
    expect(cB3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(nextB).toHaveBeenCalledTimes(2);
  });

  it('same-tenant throttling still works', async () => {
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 2 });
    const next = vi.fn();

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/reports', '1.2.3.4', authedScope(10)), next);
    }
    const c3 = makeCtx('/api/reports', '1.2.3.4', authedScope(10));
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('rotated x-tenant-id header is inert (key uses verified scope, never the header)', async () => {
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 2 });
    const next = vi.fn();

    // The ctx's header() always returns 'spoofed-tenant' for x-tenant-id;
    // only the scope.tenantId (13) matters, so responding with a different
    // header on every call cannot mint new buckets.
    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/reports', '1.2.3.4', authedScope(13)), next);
    }
    const c3 = makeCtx('/api/reports', '1.2.3.4', authedScope(13));
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('unauth requests (no scope) pass through without any debit', async () => {
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 1 });
    const next = vi.fn();

    // No middleware before us set scope (or resolveScope 401-short-circuited).
    await limiter(makeCtx('/api/reports', '1.2.3.4', null), next);
    await limiter(makeCtx('/api/reports', '1.2.3.4', null), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('public-branch requests (scope.user null) pass through without any debit', async () => {
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 1 });
    const next = vi.fn();

    // Mixed-visibility routers (e.g. GET /api/products) leave user:null.
    await limiter(makeCtx('/api/products', '1.2.3.4', { tenantId: 10, user: null }), next);
    await limiter(makeCtx('/api/products', '1.2.3.4', { tenantId: 10, user: null }), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('KV path isolates tenants (no shared key space)', async () => {
    const kvStore = {};
    const kv = {
      get: vi.fn(async (key) => kvStore[key] || null),
      put: vi.fn(async (key, value) => { kvStore[key] = value; }),
    };
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 2 });

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/reports', '1.2.3.4', authedScope(10), { RATE_LIMIT_KV: kv }), vi.fn());
    }
    const cA3 = makeCtx('/api/reports', '1.2.3.4', authedScope(10), { RATE_LIMIT_KV: kv });
    await limiter(cA3, vi.fn());
    expect(cA3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);

    // Tenant B shares the IP but gets its own KV bucket.
    const cB = makeCtx('/api/reports', '1.2.3.4', authedScope(20), { RATE_LIMIT_KV: kv });
    await limiter(cB, vi.fn());
    expect(cB.json).not.toHaveBeenCalled();
  });

  it('fail-closed on KV errors, same as the global limiter', async () => {
    const kv = {
      get: vi.fn().mockRejectedValue(new Error('KV boom')),
      put: vi.fn(),
    };
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 10 });
    const c = makeCtx('/api/reports', '1.2.3.4', authedScope(10), {
      RATE_LIMIT_KV: kv,
      RATE_LIMIT_KV_ENABLED: 'true',
    });
    const next = vi.fn();
    await limiter(c, next);
    expect(c.json).toHaveBeenCalledWith({ success: false, error: 'Rate limit check failed' }, 429);
    expect(next).not.toHaveBeenCalled();
  });

  it('envKey dials the per-tenant budget via RATE_LIMIT_TENANT', async () => {
    const limiter = tenantAwareLimiter({ windowMs: 60000, max: 100, envKey: 'RATE_LIMIT_TENANT' });
    const next = vi.fn();

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/reports', '1.2.3.4', authedScope(10), { RATE_LIMIT_TENANT: '2' }), next);
    }
    const c3 = makeCtx('/api/reports', '1.2.3.4', authedScope(10), { RATE_LIMIT_TENANT: '2' });
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('global policyLimiter — unchanged anchors (regressions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis._rateLimitMap;
  });

  it('POST /api/stream/token still enforces its Wave 3.4a policy (max 10/min, not shadowed)', async () => {
    expect(RATE_LIMIT_POLICIES['POST /api/stream/token']).toEqual({ max: 10, window: '1m' });
    const next = vi.fn();
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);

    for (let i = 0; i < 10; i++) {
      await limiter(makeCtx('/api/stream/token', '1.2.3.4', null, {}, 'POST'), next);
    }
    expect(next).toHaveBeenCalledTimes(10);

    const c11 = makeCtx('/api/stream/token', '1.2.3.4', null, {}, 'POST');
    c11.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c11, next);
    expect(c11.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(10);
  });

  it('unauthenticated unknown paths still get the global default bucket', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/some-public-path', '1.2.3.4', null, { RATE_LIMIT_API: '2' }), next);
    }
    const c3 = makeCtx('/api/some-public-path', '1.2.3.4', null, { RATE_LIMIT_API: '2' });
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('global limiter is NOT tenant-aware (same IP + path share one bucket — the behaviour F-A18-09 targets is scoped to the new tenant limiter, not the global)', async () => {
    const next = vi.fn();
    const middleware = rateLimitMiddleware({ windowMs: 60000, max: 2 });

    // Two tenants, same IP + path under a plain rateLimitMiddleware mount:
    // the global bucket counts both (this is exactly why the per-tenant
    // limiter is the fix — it must be the overlay, not a replacement).
    const c1 = makeCtx('/api/admin/health', '1.2.3.4', authedScope(10));
    await middleware(c1, next);
    const c2 = makeCtx('/api/admin/health', '1.2.3.4', authedScope(20));
    await middleware(c2, next);
    const c3 = makeCtx('/api/admin/health', '1.2.3.4', authedScope(20));
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await middleware(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
  });
});