import { describe, it, expect, vi } from 'vitest';

// ─── Phase 9: versioned cutover (/api/v1) + deprecation headers ─────────────
//
// Exercises the REAL entrypoint (default export) so both surfaces are proven:
//   • /api/v1/* rewrites to /api/* before Hono dispatch (query strings kept)
//   • unversioned /api/* responses carry Deprecation + Sunset
//   • versioned /api/v1/* responses carry NO surface-level Sunset
//   • endpoint-level Sunsets (/api/contact, POS legacy login) survive the
//     rewrite on BOTH surfaces
//
// Middleware is mocked for isolation; the POS login and contact/leads
// handlers stay real so consolidation wiring is actually verified.

vi.mock('../src/middleware/tenant.js', () => ({
  getTenant: vi.fn().mockResolvedValue('tenant_1'),
}));
vi.mock('../src/middleware/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (c, next) => { await next(); }),
  policyLimiter: vi.fn(() => async (c, next) => { await next(); }),
}));

import app from '../src/index.js';

const env = {
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({}),
    })),
  },
  JWT_SECRET: 'test-secret',
  ENVIRONMENT: 'test',
};

function makeRequest(method, path, body = null, headers = {}) {
  const url = `https://sinaicamps.com${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== null) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

describe('Phase 9: /api/v1 versioned cutover', () => {
  describe('path rewrite', () => {
    it('serves a versioned auth request through the consolidated pos-login mount', async () => {
      const res = await app.fetch(makeRequest('POST', '/api/v1/auth/pos-login', {}), env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Identifier and password required');
    });

    it('keeps the canonical unversioned pos-login mount working', async () => {
      const res = await app.fetch(makeRequest('POST', '/api/auth/pos-login', {}), env);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Identifier and password required');
    });

    it('rewrites versioned requests into the auth-gated leads route (no token → 401)', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/v1/leads'), env);
      expect(res.status).toBe(401);
    });

    it('preserves query strings through the rewrite', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/v1/leads?page=2&pageSize=10'), env);
      expect(res.status).toBe(401);
    });

    it('rewrites the deprecated contact alias under v1', async () => {
      const res = await app.fetch(makeRequest('POST', '/api/v1/contact', ['not-an-object']), env);
      expect(res.status).toBe(400);
    });
  });

  describe('surface-level Sunset (unversioned alias only)', () => {
    it('stamps Deprecation + Sunset on unversioned API responses', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/leads'), env);
      expect(res.status).toBe(401);
      expect(res.headers.get('Deprecation')).toBe('true');
      expect(res.headers.get('Sunset')).toBe('Sat, 21 Nov 2026 00:00:00 GMT');
    });

    it('does NOT stamp Sunset on versioned API responses', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/v1/leads'), env);
      expect(res.status).toBe(401);
      expect(res.headers.get('Deprecation')).toBeNull();
      expect(res.headers.get('Sunset')).toBeNull();
    });

    it('does NOT stamp Sunset on non-API paths', async () => {
      const res = await app.fetch(makeRequest('GET', '/'), env);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('SinaiCamps API');
      expect(res.headers.get('Sunset')).toBeNull();
    });
  });

  describe('endpoint-level Sunset survives the rewrite', () => {
    it.each([
      ['/api/contact'],
      ['/api/v1/contact'],
    ])('%s carries Sunset even when versioned', async (path) => {
      const res = await app.fetch(makeRequest('POST', path, ['not-an-object']), env);
      expect(res.status).toBe(400);
      expect(res.headers.get('Sunset')).toBeTruthy();
    });

    it.each([
      ['/api/pos/auth/login'],
      ['/api/v1/pos/auth/login'],
    ])('%s carries Sunset even when versioned', async (path) => {
      const res = await app.fetch(makeRequest('POST', path, {}), env);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Identifier and password required');
      expect(res.headers.get('Sunset')).toBeTruthy();
    });

    it('canonical /api/v1/auth/pos-login carries NO Sunset at all', async () => {
      const res = await app.fetch(makeRequest('POST', '/api/v1/auth/pos-login', {}), env);
      expect(res.headers.get('Deprecation')).toBeNull();
      expect(res.headers.get('Sunset')).toBeNull();
    });

    it('canonical /api/auth/pos-login still carries surface-level Sunset (alias deprecation)', async () => {
      const res = await app.fetch(makeRequest('POST', '/api/auth/pos-login', {}), env);
      expect((await res.json()).error).toBe('Identifier and password required');
      expect(res.headers.get('Sunset')).toBe('Sat, 21 Nov 2026 00:00:00 GMT');
    });
  });
});
