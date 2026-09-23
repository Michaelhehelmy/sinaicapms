import { describe, it, expect, vi, afterEach } from 'vitest';
import campsRoutes from '../src/api/camps.js';
import { mountRouter } from './helpers/routerHarness.js';

// Phase 3 rename — alias parity: the SAME campsRoutes instance serves both
// the canonical /api/projects prefix and the /api/camps sunset alias. These
// tests drive both mounts with identically-behaving DB mocks and assert
// identical status + byte-identical bodies per method. The router serves
// GET/POST/PUT/DELETE only (recon: NO PATCH — `campsRoutes.all('*')` → 405),
// so PATCH parity asserts the identical 405 on both prefixes.

const T = 't1';

const projectsApp = mountRouter(campsRoutes, { tenantId: T, basePath: '/api/projects' });
const campsApp = mountRouter(campsRoutes, { tenantId: T, basePath: '/api/camps' });

// Fresh mock DB per request, same resolved rows on both sides.
function dbWith(results) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true }),
    })),
  };
}

function req(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return { path, opts };
}

async function getBodies(resP, resC) {
  return [await resP.json(), await resC.json()];
}

// Hono matches the router's `/` handler on the BARE mount path — a trailing
// slash falls through to the 405 catch-all. Mirror the camps-unit dispatch:
// collection root requests the base path with no trailing slash.
const at = (base, path) => base + (path === '/' ? '' : path);

// POST mints `camp_<random>` ids — pin the RNG so byte-identity is exact.
const UUID_STUB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID_STUB);
afterEach(() => {
  // Keep the stub pinned for every test in this file (parity demands it).
  crypto.randomUUID.mockReturnValue(UUID_STUB);
});

describe('/api/projects ↔ /api/camps parity (same router, two prefixes)', () => {
  it('GET / list returns 200 + byte-identical bodies', async () => {
    const rows = [{ id: 'c1', tenant_id: T, name: 'Parity Camp' }];
    const { path, opts } = req('GET', '/');
    const resP = await projectsApp.request(at('/api/projects', path), opts, { DB: dbWith(rows) });
    const resC = await campsApp.request(at('/api/camps', path), opts, { DB: dbWith(rows) });
    expect(resP.status).toBe(200);
    expect(resC.status).toBe(200);
    const [bP, bC] = await getBodies(resP, resC);
    expect(JSON.stringify(bP)).toBe(JSON.stringify(bC));
    expect(bP).toEqual([{ id: 'c1', tenantId: T, name: 'Parity Camp' }]);
  });

  it('POST / returns 200 + byte-identical bodies', async () => {
    const body = {
      name: 'Parity New', location: 'Sinai',
      start_date: '2026-07-01', end_date: '2026-08-01', status: 'active',
    };
    const { path, opts } = req('POST', '/', body);
    const resP = await projectsApp.request(at('/api/projects', path), opts, { DB: dbWith([]) });
    const resC = await campsApp.request(at('/api/camps', path), opts, { DB: dbWith([]) });
    expect(resP.status).toBe(200);
    expect(resC.status).toBe(200);
    const [bP, bC] = await getBodies(resP, resC);
    expect(JSON.stringify(bP)).toBe(JSON.stringify(bC));
    expect(bP.success).toBe(true);
  });

  it('PUT /:id returns 200 + byte-identical bodies', async () => {
    const body = { name: 'Parity Renamed', capacity: 42 };
    const { path, opts } = req('PUT', '/c1', body);
    const resP = await projectsApp.request(at('/api/projects', path), opts, { DB: dbWith([]) });
    const resC = await campsApp.request(at('/api/camps', path), opts, { DB: dbWith([]) });
    expect(resP.status).toBe(200);
    expect(resC.status).toBe(200);
    const [bP, bC] = await getBodies(resP, resC);
    expect(JSON.stringify(bP)).toBe(JSON.stringify(bC));
    expect(bP).toEqual({ success: true });
  });

  it('DELETE /:id returns 200 + byte-identical bodies', async () => {
    const rows = [{ id: 'c1' }]; // ownership pre-check finds the row
    const { path, opts } = req('DELETE', '/c1');
    const resP = await projectsApp.request(at('/api/projects', path), opts, { DB: dbWith(rows) });
    const resC = await campsApp.request(at('/api/camps', path), opts, { DB: dbWith(rows) });
    expect(resP.status).toBe(200);
    expect(resC.status).toBe(200);
    const [bP, bC] = await getBodies(resP, resC);
    expect(JSON.stringify(bP)).toBe(JSON.stringify(bC));
    expect(bP).toEqual({ success: true });
  });

  it('PATCH / returns identical 405 on both prefixes (router serves no PATCH)', async () => {
    const { path, opts } = req('PATCH', '/');
    const resP = await projectsApp.request(at('/api/projects', path), opts, { DB: dbWith([]) });
    const resC = await campsApp.request(at('/api/camps', path), opts, { DB: dbWith([]) });
    expect(resP.status).toBe(405);
    expect(resC.status).toBe(405);
    const [bP, bC] = await getBodies(resP, resC);
    expect(JSON.stringify(bP)).toBe(JSON.stringify(bC));
  });
});
