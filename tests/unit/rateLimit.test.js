/**
 * Unit tests for rateLimit.js — Rate limiting middleware.
 * Tests: KV-backed and in-memory fallback rate limiting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimitMiddleware } from '../../backend/src/middleware/rateLimit.js';

// ─── Mock Hono Context ───────────────────────────────────────
function createMockCtx({ ip = '1.2.3.4', path = '/api/auth/login', environment = 'production', kv = null } = {}) {
  const nextMock = vi.fn().mockResolvedValue(undefined);
  const jsonMock = vi.fn().mockReturnValue(new Response(null, { status: 429 }));
  return {
    req: {
      header: (name) => {
        if (name === 'cf-connecting-ip') return ip;
        return null;
      },
      path,
    },
    env: {
      ENVIRONMENT: environment,
      RATE_LIMIT_KV: kv,
    },
    json: jsonMock,
    next: nextMock,
    _nextMock: nextMock,
    _jsonMock: jsonMock,
  };
}

// ─── Test environment bypass ─────────────────────────────────
describe('rateLimitMiddleware', () => {
  let originalRateLimitMap;

  beforeEach(() => {
    originalRateLimitMap = globalThis._rateLimitMap;
    delete globalThis._rateLimitMap;
  });

  afterEach(() => {
    if (originalRateLimitMap) globalThis._rateLimitMap = originalRateLimitMap;
    else delete globalThis._rateLimitMap;
  });

  describe('test environment bypass', () => {
    it('skips rate limiting when ENVIRONMENT is "test"', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });
      const ctx = createMockCtx({ environment: 'test' });

      await middleware(ctx, ctx.next);

      expect(ctx._nextMock).toHaveBeenCalled();
      expect(ctx._jsonMock).not.toHaveBeenCalled();
    });
  });

  describe('in-memory fallback', () => {
    it('allows requests within the rate limit', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 5 });
      const ctx = createMockCtx({ ip: '1.1.1.1', path: '/api/test' });

      await middleware(ctx, ctx.next);

      expect(ctx._nextMock).toHaveBeenCalled();
      expect(ctx._jsonMock).not.toHaveBeenCalled();
    });

    it('blocks requests exceeding the rate limit', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 2 });
      const ctx1 = createMockCtx({ ip: '2.2.2.2', path: '/api/limit' });
      const ctx2 = createMockCtx({ ip: '2.2.2.2', path: '/api/limit' });
      const ctx3 = createMockCtx({ ip: '2.2.2.2', path: '/api/limit' });

      await middleware(ctx1, ctx1.next);
      await middleware(ctx2, ctx2.next);
      await middleware(ctx3, ctx3.next);

      // First two should pass
      expect(ctx1._nextMock).toHaveBeenCalled();
      expect(ctx2._nextMock).toHaveBeenCalled();
      // Third should be blocked
      expect(ctx3._jsonMock).toHaveBeenCalledWith({ error: 'Too many requests' }, 429);
    });

    it('uses different counters for different IPs', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });
      const ctxA = createMockCtx({ ip: '10.0.0.1', path: '/api/same' });
      const ctxB = createMockCtx({ ip: '10.0.0.2', path: '/api/same' });

      await middleware(ctxA, ctxA.next);
      await middleware(ctxB, ctxB.next);

      // Both should pass since different IPs
      expect(ctxA._nextMock).toHaveBeenCalled();
      expect(ctxB._nextMock).toHaveBeenCalled();
    });

    it('uses different counters for different paths', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });
      const ctxA = createMockCtx({ ip: '20.0.0.1', path: '/api/path_a' });
      const ctxB = createMockCtx({ ip: '20.0.0.1', path: '/api/path_b' });

      await middleware(ctxA, ctxA.next);
      await middleware(ctxB, ctxB.next);

      // Both should pass since different paths
      expect(ctxA._nextMock).toHaveBeenCalled();
      expect(ctxB._nextMock).toHaveBeenCalled();
    });

    it('falls back to "unknown" IP when cf-connecting-ip is missing', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 1 });
      const ctx = createMockCtx({ ip: null, path: '/api/noinfo' });

      await middleware(ctx, ctx.next);

      // Should still work with "unknown" IP
      expect(ctx._nextMock).toHaveBeenCalled();
    });
  });

  describe('KV-backed rate limiting', () => {
    it('uses KV for rate limiting when RATE_LIMIT_KV is available', async () => {
      const kvGetMock = vi.fn().mockResolvedValue(null); // first request
      const kvPutMock = vi.fn().mockResolvedValue(undefined);
      const kv = { get: kvGetMock, put: kvPutMock };

      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 5 });
      const ctx = createMockCtx({ ip: '30.0.0.1', path: '/api/kv', kv });

      await middleware(ctx, ctx.next);

      expect(kvGetMock).toHaveBeenCalled();
      expect(kvPutMock).toHaveBeenCalled();
      expect(ctx._nextMock).toHaveBeenCalled();
    });

    it('blocks when KV count exceeds max', async () => {
      const kvGetMock = vi.fn().mockResolvedValue('5'); // already at max
      const kvPutMock = vi.fn().mockResolvedValue(undefined);
      const kv = { get: kvGetMock, put: kvPutMock };

      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 5 });
      const ctx = createMockCtx({ ip: '30.0.0.2', path: '/api/kvblock', kv });

      await middleware(ctx, ctx.next);

      expect(ctx._jsonMock).toHaveBeenCalledWith({ error: 'Too many requests' }, 429);
      expect(ctx._nextMock).not.toHaveBeenCalled();
    });

    it('falls back to in-memory when KV throws an error (fail-closed)', async () => {
      const kvGetMock = vi.fn().mockRejectedValue(new Error('KV error'));
      const kv = { get: kvGetMock, put: vi.fn() };

      const middleware = rateLimitMiddleware({ windowMs: 60000, max: 100 });
      const ctx = createMockCtx({ ip: '40.0.0.1', path: '/api/kverr', kv });

      await middleware(ctx, ctx.next);

      // Fail-closed: returns 429 on KV error
      expect(ctx._jsonMock).toHaveBeenCalledWith({ error: 'Rate limit check failed' }, 429);
    });
  });

  describe('cleanup behavior', () => {
    it('cleans up stale entries when map exceeds 10000', async () => {
      const middleware = rateLimitMiddleware({ windowMs: 1000, max: 100 });

      // Fill up the map with stale entries
      globalThis._rateLimitMap = new Map();
      for (let i = 0; i < 10001; i++) {
        globalThis._rateLimitMap.set(`stale:${i}`, { count: 1, resetTime: 1 }); // expired
      }

      const ctx = createMockCtx({ ip: '50.0.0.1', path: '/api/cleanup' });
      await middleware(ctx, ctx.next);

      // Should have cleaned up stale entries and allowed the request
      expect(ctx._nextMock).toHaveBeenCalled();
    });
  });
});
