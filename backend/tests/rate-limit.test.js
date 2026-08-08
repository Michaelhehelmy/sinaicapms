import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimitMiddleware } from '../src/middleware/rateLimit.js';

function makeHonoCtx(path = '/api/test', ip = '1.2.3.4', envOverrides = {}) {
  return {
    req: {
      path,
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
    expect(c3.json).toHaveBeenCalledWith({ error: 'Too many requests' }, 429);
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
    expect(c.json).toHaveBeenCalledWith({ error: 'Rate limit check failed' }, 429);
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
      expect(c3.json).toHaveBeenCalledWith({ error: 'Too many requests' }, 429);
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
      expect(c2.json).toHaveBeenCalledWith({ error: 'Too many requests' }, 429);
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
});
