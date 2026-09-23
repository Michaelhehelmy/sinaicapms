import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

// Full-app mount-order test for the Phase 3 rename: the canonical
// /api/projects mount is registered AFTER the specific /api/projects/*
// sub-mounts (links, items, meta, tags, meal-plans), and its scope+limiter
// are path-guarded so sibling routers keep their own scope.
//
// Failure modes this catches:
// - canonical route registered too early → /links or /items resolve to
//   campsRoutes `/:id` (404 / wrong row) instead of their own routers;
// - unguarded /api/projects/* scope middleware → the public GET branch
//   overwrites the admin-only links/items scope (user:null) and the
//   admin-only listings go public (200 without auth instead of 401).
//
// Header note: this file imports the Phase 9 entrypoint wrapper, which
// stamps the surface-level Sunset (2026-11-21) on every UNVERSIONED /api/*
// response. The alias's endpoint-level sunset (2026-10-23) is therefore
// asserted via the versioned /api/v1/* surface, where the wrapper stays
// clean — the same two-axes model as /api/contact and POS login.
vi.mock('../src/middleware/tenant.js', () => ({
  getTenant: vi.fn().mockResolvedValue('t1'),
}));
vi.mock('../src/middleware/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (c, next) => { await next(); }),
  policyLimiter: vi.fn(() => async (c, next) => { await next(); }),
  tenantAwareLimiter: vi.fn(() => async (c, next) => { await next(); }),
}));

import app from '../src/index.js';
import { CAMPS_ALIAS_SUNSET, campsAliasSunset } from '../src/api/camps-alias.js';

const PROJECT_ROWS = [{ id: 'c1', tenant_id: 't1', name: 'Mount Camp' }];

const env = {
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: PROJECT_ROWS }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true }),
    })),
  },
  JWT_SECRET: 'test-secret',
  ENVIRONMENT: 'test',
};

function get(path) {
  return app.fetch(new Request(`https://sinaicamps.com${path}`, { method: 'GET' }), env);
}

describe('/api/projects mount order (canonical last, siblings keep scope)', () => {
  it('serves the catalog at GET /api/projects', async () => {
    const res = await get('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 'c1', tenantId: 't1', name: 'Mount Camp' }]);
  });

  it('serves the sunset alias at GET /api/camps', async () => {
    const res = await get('/api/camps');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 'c1', tenantId: 't1', name: 'Mount Camp' }]);
  });

  it('keeps GET /api/projects/links admin-scoped (401 without auth)', async () => {
    const res = await get('/api/projects/links');
    expect(res.status).toBe(401);
  });

  it('keeps GET /api/projects/items admin-scoped (401 without auth)', async () => {
    const res = await get('/api/projects/items');
    expect(res.status).toBe(401);
  });

  it('carries no endpoint sunset on the canonical prefix (GET /api/v1/projects)', async () => {
    const res = await get('/api/v1/projects');
    expect(res.status).toBe(200);
    expect(res.headers.get('Deprecation')).toBeNull();
    expect(res.headers.get('Sunset')).toBeNull();
  });

  it('stamps the alias sunset on the versioned alias surface (GET /api/v1/camps)', async () => {
    const res = await get('/api/v1/camps');
    expect(res.status).toBe(200);
    expect(res.headers.get('Deprecation')).toBe('true');
    expect(res.headers.get('Sunset')).toBe(CAMPS_ALIAS_SUNSET);
  });
});

describe('campsAliasSunset middleware', () => {
  it('stamps Deprecation + alias Sunset idempotently (bare path runs it twice)', async () => {
    const sub = new Hono();
    sub.use('/api/camps', campsAliasSunset);
    sub.use('/api/camps/*', campsAliasSunset);
    sub.get('/api/camps', (c) => c.json({ ok: true }));
    const res = await sub.request('/api/camps');
    expect(res.status).toBe(200);
    expect(res.headers.get('Deprecation')).toBe('true');
    expect(res.headers.get('Sunset')).toBe(CAMPS_ALIAS_SUNSET);
  });
});
