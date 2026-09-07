import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimitMiddleware, policyLimiter, RATE_LIMIT_POLICIES } from '../src/middleware/rateLimit.js';

function makeHonoCtx(path = '/api/test', ip = '1.2.3.4', envOverrides = {}, method) {
  return {
    req: {
      path,
      method,
      header: (name) => {
        if (name === 'cf-connecting-ip') return ip;
        return null;
      },
    },
    env: {
      ENVIRONMENT: 'test',
      ...envOverrides,
    },
    json: vi.fn().mockImplementation((body, status) => ({ status, body, ok: status < 400 })),
  };
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis._rateLimitMap;
  });

  it('skips rate limiting in test environment', async () => {
    const next = vi.fn();
    const c = makeHonoCtx();
    const middleware = rateLimitMiddleware({ windowMs: 60000, max: 5 });
    await middleware(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 429 when KV rate limit exceeded', async () => {
    const kvStore = {};
    const kv = {
      get: vi.fn(async (key) => kvStore[key] || null),
      put: vi.fn(async (key, value) => { kvStore[key] = value; }),
    };
    const next = vi.fn();
    const c = makeHonoCtx('/api/test', '1.2.3.4', {
      ENVIRONMENT: 'production',
      RATE_LIMIT_KV: kv,
    });

    const middleware = rateLimitMiddleware({ windowMs: 60000, max: 2 });

    // Request 1
    await middleware(c, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Request 2
    await middleware(c, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Request 3 — should be rate-limited
    const limitFn = vi.fn();
    const c3 = makeHonoCtx('/api/test', '1.2.3.4', {
      ENVIRONMENT: 'production',
      RATE_LIMIT_KV: kv,
    });
    c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    await middleware(c3, limitFn);
    expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
  });

  it('returns 429 on KV error (fail-closed)', async () => {
    const kv = {
      get: vi.fn().mockRejectedValue(new Error('KV error')),
      put: vi.fn(),
    };
    const next = vi.fn();
    const c = makeHonoCtx('/api/test', '1.2.3.4', {
      ENVIRONMENT: 'production',
      RATE_LIMIT_KV: kv,
    });
    c.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
    const middleware = rateLimitMiddleware({ windowMs: 60000, max: 100 });
    await middleware(c, next);
    expect(c.json).toHaveBeenCalledWith({ success: false, error: 'Rate limit check failed' }, 429);
    expect(next).not.toHaveBeenCalled();
  });

  it('forces in-memory fallback when RATE_LIMIT_KV_ENABLED=false even with KV binding', async () => {
    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
    };
    const next = vi.fn();
    const c = makeHonoCtx('/api/test', '1.2.3.4', {
      ENVIRONMENT: 'production',
      RATE_LIMIT_KV: kv,
      RATE_LIMIT_KV_ENABLED: 'false',
    });
    const middleware = rateLimitMiddleware({ windowMs: 60000, max: 3 });

    await middleware(c, next);
    await middleware(c, next);
    expect(next).toHaveBeenCalledTimes(2);
    // KV must NOT be touched when disabled
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  describe('in-memory fallback', () => {
    it('allows requests within limit', async () => {
      const next = vi.fn();
      const c = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 3 });

      await middleware(c, next);
      await middleware(c, next);
      await middleware(c, next);
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('returns 429 when in-memory limit exceeded', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 2 });

      const c1 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      await middleware(c1, next);

      const c2 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      await middleware(c2, next);

      const c3 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(c3, next);
      expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    });

    it('resets after window expires', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 100, max: 1 });

      const c1 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      await middleware(c1, next);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const c2 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      await middleware(c2, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('tracks different IPs separately', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });

      const c1 = makeHonoCtx('/api/test', '1.1.1.1', { ENVIRONMENT: 'production' });
      await middleware(c1, next);

      const c2 = makeHonoCtx('/api/test', '2.2.2.2', { ENVIRONMENT: 'production' });
      await middleware(c2, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('tracks different paths separately', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });

      const c1 = makeHonoCtx('/api/a', '1.2.3.4', { ENVIRONMENT: 'production' });
      await middleware(c1, next);

      const c2 = makeHonoCtx('/api/b', '1.2.3.4', { ENVIRONMENT: 'production' });
      await middleware(c2, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('uses cf-connecting-ip when available', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });

      const c1 = makeHonoCtx('/api/test', '5.5.5.5', { ENVIRONMENT: 'production' });
      await middleware(c1, next);

      // Different IP should not be affected
      const c2 = makeHonoCtx('/api/test', '6.6.6.6', { ENVIRONMENT: 'production' });
      await middleware(c2, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('uses "unknown" when cf-connecting-ip is missing', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });

      const c1 = makeHonoCtx('/api/test', null, { ENVIRONMENT: 'production' });
      c1.req.header = () => null;
      await middleware(c1, next);

      const c2 = makeHonoCtx('/api/test', null, { ENVIRONMENT: 'production' });
      c2.req.header = () => null;
      c2.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(c2, next);
      expect(c2.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    });

    it('cleans up stale entries when map is large', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 1, max: 1 });

      // Fill up the map with stale entries
      globalThis._rateLimitMap = new Map();
      for (let i = 0; i < 10001; i++) {
        globalThis._rateLimitMap.set(`stale:${i}`, { count: 1, resetTime: Date.now() - 10000 });
      }

      const c = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      // Wait for entries to become stale
      await new Promise(resolve => setTimeout(resolve, 5));
      await middleware(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 429 when in-memory map throws (fail-closed)', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 100 });

      // Poison the map so reads throw, forcing the in-memory catch path
      globalThis._rateLimitMap = {
        get: () => { throw new Error('map boom'); },
        set: () => {},
        delete: () => {},
        forEach: () => {},
        size: 1,
      };

      const c = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production' });
      const res = await middleware(c, next);
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Rate limit check failed');
      expect(next).not.toHaveBeenCalled();

      delete globalThis._rateLimitMap;
    });
  });

  describe('env override wiring (RATE_LIMIT_LOGIN / RATE_LIMIT_API)', () => {
    it('envKey raises the effective limit from the env var', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 2, envKey: 'RATE_LIMIT_API' });

      for (let i = 0; i < 5; i++) {
        const c = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '5' });
        await middleware(c, next);
      }
      const c6 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '5' });
      c6.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(c6, next);
      expect(c6.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
      expect(next).toHaveBeenCalledTimes(5);
    });

    it('envKey tightens the effective limit from the env var', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 500, envKey: 'RATE_LIMIT_API' });

      const c1 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '2' });
      await middleware(c1, next);
      const c2 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '2' });
      await middleware(c2, next);
      const c3 = makeHonoCtx('/api/test', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '2' });
      c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(c3, next);
      expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
    });

    it('falls back to hardcoded max for absent and invalid env values', async () => {
      const next = vi.fn();
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 3, envKey: 'RATE_LIMIT_API' });

      // Absent env var
      for (let i = 0; i < 3; i++) {
        const c = makeHonoCtx('/api/a', '1.2.3.4', { ENVIRONMENT: 'production' });
        await middleware(c, next);
      }
      const c4 = makeHonoCtx('/api/a', '1.2.3.4', { ENVIRONMENT: 'production' });
      c4.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(c4, next);
      expect(c4.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
      expect(next).toHaveBeenCalledTimes(3);

      // Non-numeric env value
      next.mockClear();
      for (let i = 0; i < 3; i++) {
        const c = makeHonoCtx('/api/b', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: 'abc' });
        await middleware(c, next);
      }
      const cb = makeHonoCtx('/api/b', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: 'abc' });
      cb.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(cb, next);
      expect(cb.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
      expect(next).toHaveBeenCalledTimes(3);

      // Zero/negative env value
      next.mockClear();
      for (let i = 0; i < 3; i++) {
        const c = makeHonoCtx('/api/c', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '0' });
        await middleware(c, next);
      }
      const cc = makeHonoCtx('/api/c', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '0' });
      cc.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await middleware(cc, next);
      expect(cc.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
      expect(next).toHaveBeenCalledTimes(3);
    });
  });

  describe('policyLimiter env dials', () => {
    it('RATE_LIMIT_LOGIN dials the /api/auth/* bucket', async () => {
      const next = vi.fn();
      const limiter = policyLimiter(RATE_LIMIT_POLICIES);

      for (let i = 0; i < 2; i++) {
        const c = makeHonoCtx('/api/auth/login', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_LOGIN: '2' });
        await limiter(c, next);
      }
      const c3 = makeHonoCtx('/api/auth/login', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_LOGIN: '2' });
      c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await limiter(c3, next);
      expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('does not dial the strict pos-login sub-bucket', async () => {
      const next = vi.fn();
      const limiter = policyLimiter(RATE_LIMIT_POLICIES);

      // 3 calls to POST /api/auth/pos-login with RATE_LIMIT_LOGIN='2' — the strict
      // sub-bucket (hardcoded max 15) must IGNORE the dial and keep passing.
      for (let i = 0; i < 3; i++) {
        const c = makeHonoCtx('/api/auth/pos-login', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_LOGIN: '2' }, 'POST');
        await limiter(c, next);
      }
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('RATE_LIMIT_API dials the default bucket for unmatched paths', async () => {
      const next = vi.fn();
      const limiter = policyLimiter(RATE_LIMIT_POLICIES);

      for (let i = 0; i < 2; i++) {
        const c = makeHonoCtx('/api/unmatched', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '2' });
        await limiter(c, next);
      }
      const c3 = makeHonoCtx('/api/unmatched', '1.2.3.4', { ENVIRONMENT: 'production', RATE_LIMIT_API: '2' });
      c3.json = vi.fn().mockImplementation((body, status) => ({ status, body }));
      await limiter(c3, next);
      expect(c3.json).toHaveBeenCalledWith({ success: false, error: 'Too many requests' }, 429);
      expect(next).toHaveBeenCalledTimes(2);
    });
  });
});
