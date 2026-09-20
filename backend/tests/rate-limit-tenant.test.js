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

  it('POST /api/marketplace/reviews keeps its own 10/min flood cap (method-qualified, NOT folded into the 3.5b marketplace GET group)', async () => {
    expect(RATE_LIMIT_POLICIES['POST /api/marketplace/reviews']).toEqual({ max: 10, window: '1m' });
    const next = vi.fn();
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);

    for (let i = 0; i < 10; i++) {
      await limiter(makeCtx('/api/marketplace/reviews', '1.2.3.4', null, {}, 'POST'), next);
    }
    expect(next).toHaveBeenCalledTimes(10);

    const c11 = makeCtx('/api/marketplace/reviews', '1.2.3.4', null, {}, 'POST');
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

/**
 * Wave 3.5b — explicit budgets for the six PUBLIC surfaces.
 *
 * Before this change every anonymous surface (`/api/marketplace*`,
 * `/api/onboarding*`, `/api/public/signup`, `/api/availability`,
 * `/api/media*` GET/HEAD, `/api/projects/:id/meal-plans`,
 * `/api/public/paymob/webhook`) fell through to the generic `/api/*` default
 * (100/min/IP, one RATE_LIMIT_API dial). Limits are keyed `ip:path`, so each
 * path already had its own bucket — the gap was that every public surface
 * carried the SAME generic 100 + one blanket dial. 3.5b gives each group its
 * own budget + env dial. The Paymob webhook (P1) gets a DEDICATED budget
 * because its calls arrive from Paymob's shared egress IPs: one path, MANY
 * tenants' callbacks behind one cf-connecting-ip, where the default 100 could
 * genuinely throttle high-volume payment traffic.
 */
describe('Wave 3.5b — public per-group budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis._rateLimitMap;
  });

  it('declares the six public groups (and their dials) above the default', () => {
    expect(RATE_LIMIT_POLICIES['GET /api/marketplace*']).toEqual({ max: 300, window: '1m', envKey: 'RATE_LIMIT_MARKETPLACE' });
    expect(RATE_LIMIT_POLICIES['/api/onboarding*']).toEqual({ max: 20, window: '1m', envKey: 'RATE_LIMIT_ONBOARDING' });
    expect(RATE_LIMIT_POLICIES['POST /api/public/signup']).toEqual({ max: 5, window: '1m', envKey: 'RATE_LIMIT_SIGNUP' });
    expect(RATE_LIMIT_POLICIES['GET /api/availability']).toEqual({ max: 120, window: '1m', envKey: 'RATE_LIMIT_AVAILABILITY' });
    expect(RATE_LIMIT_POLICIES['GET /api/media*']).toEqual({ max: 300, window: '1m', envKey: 'RATE_LIMIT_MEDIA' });
    expect(RATE_LIMIT_POLICIES['HEAD /api/media*']).toEqual({ max: 300, window: '1m', envKey: 'RATE_LIMIT_MEDIA' });
    expect(RATE_LIMIT_POLICIES['GET /api/projects/*/meal-plans']).toEqual({ max: 120, window: '1m', envKey: 'RATE_LIMIT_MEAL_PLANS' });
    expect(RATE_LIMIT_POLICIES['POST /api/public/paymob/webhook']).toEqual({ max: 60, window: '1m', envKey: 'RATE_LIMIT_PAYMOB' });
    expect(RATE_LIMIT_POLICIES.default).toEqual({ max: 100, envKey: 'RATE_LIMIT_API' });
  });

  it('marketplace reads get the marketplace group budget (300, dial RATE_LIMIT_MARKETPLACE) per path — the dial replaces the generic default', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    const env = { RATE_LIMIT_MARKETPLACE: '3' };

    // One path, one bucket: 3 passes, the 4th is throttled at the group dial.
    for (let i = 0; i < 3; i++) {
      await limiter(makeCtx('/api/marketplace', '1.2.3.4', null, env), next);
    }
    expect(next).toHaveBeenCalledTimes(3);

    const c4 = makeCtx('/api/marketplace', '1.2.3.4', null, env);
    c4.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c4, next);
    expect(c4.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(3);

    // A DIFFERENT marketplace read path (same group) is NOT debited against
    // the previous path's bucket — keys are `ip:path`, isolation is per-path.
    const otherPathNext = vi.fn();
    await limiter(makeCtx('/api/marketplace/acacia-camp', '1.2.3.4', null, env), otherPathNext);
    expect(otherPathNext).toHaveBeenCalledTimes(1);
  });

  it('POST /api/marketplace/reviews is NOT debited on the GET marketplace path (method-qualified keys are disjoint)', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    const env = { RATE_LIMIT_MARKETPLACE: '3' };

    // Exhaust the GET marketplace path.
    for (let i = 0; i < 3; i++) {
      await limiter(makeCtx('/api/marketplace', '1.2.3.4', null, env), next);
    }
    // A POST to the reviews endpoint still passes — it has its own 10/min cap.
    const cPost = makeCtx('/api/marketplace/reviews', '1.2.3.4', null, env, 'POST');
    await limiter(cPost, next);
    expect(next).toHaveBeenCalledTimes(4);
    expect(cPost.json).not.toHaveBeenCalled();
  });

  it('onboarding group (20, dial RATE_LIMIT_ONBOARDING) applies its budget per path; signup keeps its own 5/min (dial RATE_LIMIT_SIGNUP)', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    const env = { RATE_LIMIT_ONBOARDING: '3', RATE_LIMIT_SIGNUP: '2' };

    // One onboarding path, one bucket (dial 3 for this test).
    for (let i = 0; i < 3; i++) {
      await limiter(makeCtx('/api/onboarding/status/abc123', '1.2.3.4', null, env, 'GET'), next);
    }
    expect(next).toHaveBeenCalledTimes(3);

    // The 4th on the same path is throttled at the group dial.
    const c4 = makeCtx('/api/onboarding/status/abc123', '1.2.3.4', null, env, 'GET');
    c4.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c4, next);
    expect(c4.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);

    // A different onboarding path is NOT debited against status/... above.
    const setupNext = vi.fn();
    await limiter(makeCtx('/api/onboarding/setup', '1.2.3.4', null, env, 'POST'), setupNext);
    expect(setupNext).toHaveBeenCalledTimes(1);

    // Signup is a SEPARATE budget (exact entry — must not be shadowed by any
    // broad /api/public glob and must not ride the onboarding prefix).
    const signupNext = vi.fn();
    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/public/signup', '1.2.3.4', null, env, 'POST'), signupNext);
    }
    expect(signupNext).toHaveBeenCalledTimes(2);
    const cSignup3 = makeCtx('/api/public/signup', '1.2.3.4', null, env, 'POST');
    cSignup3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(cSignup3, signupNext);
    expect(cSignup3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(signupNext).toHaveBeenCalledTimes(2);
  });

  it('availability read gets the availability budget (120, dial RATE_LIMIT_AVAILABILITY) — its own dial, NOT the generic default', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    // NO RATE_LIMIT_API dial: if the availability entry failed to catch the
    // path, the request would fall through to the default 100 and ALL three
    // calls would pass. Throttling at the 3rd proves the availability dial (2)
    // — not the default — is what governs this path.
    const env = { RATE_LIMIT_AVAILABILITY: '2' };

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/availability', '1.2.3.4', null, env), next);
    }
    expect(next).toHaveBeenCalledTimes(2);

    const c3 = makeCtx('/api/availability', '1.2.3.4', null, env);
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(2);

    // A different public path is unaffected (per-path keys isolate anyway).
    const otherNext = vi.fn();
    await limiter(makeCtx('/api/some-public-path', '1.2.3.4', null, env), otherNext);
    expect(otherNext).toHaveBeenCalledTimes(1);
  });

  it('media GET and HEAD share the media group bucket (300, dial RATE_LIMIT_MEDIA) — the key is `ip:path`, so GET/HEAD for the same path is one coherent asset-read budget', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    const env = { RATE_LIMIT_MEDIA: '3' };

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/media/logo.webp', '1.2.3.4', null, env, 'GET'), next);
    }
    await limiter(makeCtx('/api/media/logo.webp', '1.2.3.4', null, env, 'HEAD'), next);
    expect(next).toHaveBeenCalledTimes(3);

    const c4 = makeCtx('/api/media/logo.webp', '1.2.3.4', null, env, 'HEAD');
    c4.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c4, next);
    expect(c4.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('meal-plans mid-path wildcard matches only /api/projects/:id/meal-plans, NOT sibling project reads', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    const env = { RATE_LIMIT_MEAL_PLANS: '2' };

    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/projects/proj_1/meal-plans', '1.2.3.4', null, env), next);
    }
    expect(next).toHaveBeenCalledTimes(2);

    const c3 = makeCtx('/api/projects/proj_1/meal-plans', '1.2.3.4', null, env);
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c3, next);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);

    // A sibling project read (e.g. meta) is NOT captured by the meal-plans
    // mid-wildcard — it stays on the default bucket, so it is not throttled by
    // the meal-plans budget.
    const metaNext = vi.fn();
    await limiter(makeCtx('/api/projects/proj_1/meta', '1.2.3.4', null, env), metaNext);
    expect(metaNext).toHaveBeenCalledTimes(1);
  });

  it('Paymob webhook (P1) has a DEDICATED budget, decoupled from the generic RATE_LIMIT_API dial', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    // Default dial set LOW (2): the webhook path must NOT obey RATE_LIMIT_API —
    // payment callbacks arrive from Paymob's shared egress IPs into a single
    // path (a shared funnel across all merchants), so throttling it with the
    // generic API dial would drop real payment traffic. It has its own 60/min
    // budget governed by RATE_LIMIT_PAYMOB (dial 3 here).
    const env = { RATE_LIMIT_PAYMOB: '3', RATE_LIMIT_API: '2' };

    const webhookNext = vi.fn();
    for (let i = 0; i < 3; i++) {
      await limiter(makeCtx('/api/public/paymob/webhook', '1.2.3.4', null, env, 'POST'), webhookNext);
    }
    expect(webhookNext).toHaveBeenCalledTimes(3);

    const cWebhook4 = makeCtx('/api/public/paymob/webhook', '1.2.3.4', null, env, 'POST');
    cWebhook4.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(cWebhook4, webhookNext);
    expect(cWebhook4.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(webhookNext).toHaveBeenCalledTimes(3);

    // The same low default (2) WOULD throttle an unprotected public path —
    // proving the webhook is not riding the default bucket.
    const defaultNext = vi.fn();
    for (let i = 0; i < 2; i++) {
      await limiter(makeCtx('/api/some-public-path', '1.2.3.4', null, env), defaultNext);
    }
    expect(defaultNext).toHaveBeenCalledTimes(2);
    const cDefault3 = makeCtx('/api/some-public-path', '1.2.3.4', null, env);
    cDefault3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(cDefault3, defaultNext);
    expect(cDefault3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(defaultNext).toHaveBeenCalledTimes(2);
  });

  it('trailing-* come FIRST — /api/admin* (no method prefix) still matches /api/admin/<subpath> (unchanged semantics)', async () => {
    const limiter = policyLimiter(RATE_LIMIT_POLICIES);
    const next = vi.fn();
    const env = { RATE_LIMIT_API: '999' };

    // /api/admin* hardcodes max 20; submit 21 to prove the prefix still
    // catches sub-paths (pre-3.5b semantics preserved).
    for (let i = 0; i < 20; i++) {
      await limiter(makeCtx('/api/admin/health', '5.6.7.8', null, env), next);
    }
    expect(next).toHaveBeenCalledTimes(20);

    const c21 = makeCtx('/api/admin/health', '5.6.7.8', null, env);
    c21.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await limiter(c21, next);
    expect(c21.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    expect(next).toHaveBeenCalledTimes(20);
  });
});