import { describe, it, expect, vi, beforeEach } from 'vitest';
// Signature-compatible shims: legacy handlers took (Request, env, tenantId).
// They now execute against the Hono sub-routers mounted by index.js. Apps are
// cached per (basePath, tenantId) because tests mix tenant and marketplace
// scopes; mountRouter's stub scope middleware is stateless so caching is safe.
import campsRoutes, { productsRoutes, roomsRoutes, ratePlansRoutes } from '../src/api/camps.js';
import { mountRouter } from './helpers/routerHarness.js';

const appCache = new Map();
function appFor(routes, basePath, tenant) {
  const key = basePath + ':' + String(tenant);
  if (!appCache.has(key)) {
    appCache.set(key, mountRouter(routes, { tenantId: tenant ?? null, basePath }));
  }
  return appCache.get(key);
}

async function dispatch(routes, basePath, req, env = {}, _tenant = null) {
  const url = new URL(req.url);
  // Normalize legacy prefixes (e.g. /api/rate-plans) onto the router base.
  const rest = '/' + url.pathname.split('/').slice(3).join('/');
  let body;
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) {
    try {
      body = JSON.stringify(await req.json());
    } catch {
      body = undefined;
    }
  }
  const target = rest === '/' ? basePath : basePath + rest;
  return appFor(routes, basePath, _tenant).request(target + url.search, {
    method: req.method,
    headers: req.headers,
    ...(body ? { body } : {}),
  }, env);
}

async function handleCampsRoute(req, env = {}, _tenant = null) {
  return dispatch(campsRoutes, '/api/camps', req, env, _tenant);
}
async function handleProductsRoute(req, env = {}, _tenant = null) {
  return dispatch(productsRoutes, '/api/products', req, env, _tenant);
}
async function handleRoomsRoute(req, env = {}, _tenant = null) {
  return dispatch(roomsRoutes, '/api/rooms', req, env, _tenant);
}
async function handleRatePlansRoute(req, env = {}, _tenant = null) {
  return dispatch(ratePlansRoutes, '/api/rateplans', req, env, _tenant);
}

function makeDbMock() {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  const db = { prepare: vi.fn().mockReturnValue(chain) };
  return { db, chain };
}

function makeRequest(method, url, body = null, headers = {}) {
  const opts = { method, headers: new Headers({ ...headers }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const T = 't1';

// ─── handleCampsRoute ────────────────────────────────────
describe('handleCampsRoute', () => {
  describe('GET /camps (list)', () => {
    it('returns all camps', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1' }] });
      const req = makeRequest('GET', 'https://x.com/api/camps');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([{ id: 'c1' }]);
    });

    it('returns paginated camps with limit/offset', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1' }] });
      const req = makeRequest('GET', 'https://x.com/api/camps?limit=5&offset=10');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([{ id: 'c1' }]);
      expect(db.prepare).toHaveBeenCalled();
    });
  });

  describe('GET /camps/:id', () => {
    it('returns camp by id', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1', name: 'Camp A' }] });
      const req = makeRequest('GET', 'https://x.com/api/camps/c1');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.id).toBe('c1');
    });

    it('returns 404 when not found', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('GET', 'https://x.com/api/camps/missing');
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /camps (create)', () => {
    it('creates camp successfully', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/camps', {
        name: 'New Camp', location: 'Sinai', capacity: 50,
        start_date: '2026-07-01', end_date: '2026-08-01', status: 'active'
      });
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();
    });

    it('returns 409 when the tenant already has a camp', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1' }] });
      const req = makeRequest('POST', 'https://x.com/api/camps', { name: 'Second Camp' });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already has a camp');
      // No insert is attempted when a camp already exists.
      expect(db.prepare.mock.calls.filter(c => c[0].includes('INSERT INTO camps'))).toHaveLength(0);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/camps', { name: '' });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns 400 when start_date >= end_date', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/camps', {
        name: 'Camp', start_date: '2026-08-01', end_date: '2026-07-01'
      });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Start date');
    });

    it('returns 400 when start_date == end_date', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/camps', {
        name: 'Camp', start_date: '2026-07-01', end_date: '2026-07-01'
      });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/camps', { name: 'Camp' });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /camps/:id (update)', () => {
    it('updates camp successfully', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/camps/c1', { name: 'Updated', capacity: 100 });
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/camps/c1', { status: 'invalid_status' });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns 400 when start_date >= end_date on update', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/camps/c1', {
        start_date: '2026-08-01', end_date: '2026-07-01'
      });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('PUT', 'https://x.com/api/camps/c1', { name: 'X' });
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /camps/:id', () => {
    it('soft-deletes camp (tombstones the row, no hard cascade)', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1' }] });
      const req = makeRequest('DELETE', 'https://x.com/api/camps/c1');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Soft delete contract: an UPDATE stamps deleted_at; no DELETE FROM projects.
      const sqls = db.prepare.mock.calls.map(c => c[0]);
      expect(sqls.some(s => s.includes("SET deleted_at = datetime('now')"))).toBe(true);
      expect(sqls.some(s => s.includes('DELETE FROM projects'))).toBe(false);
    });

    it('returns 404 when camp not found', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('DELETE', 'https://x.com/api/camps/missing');
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('DELETE', 'https://x.com/api/camps/c1');
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PATCH', 'https://x.com/api/camps');
      const res = await handleCampsRoute(req, { DB: db }, T);
      expect(res.status).toBe(405);
    });
  });

  describe('GET /camps (marketplace host — no tenant context)', () => {
    it('returns all active camps across tenants with tenant info', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [
        { id: 'c1', tenant_id: 'acaciacamp', name: 'Acacia', status: 'active', tenant_name: 'Acacia Camp', tenant_subdomain: 'acaciacamp' },
        { id: 'c2', tenant_id: 'mtn', name: 'Mountain', status: 'active', tenant_name: 'Mountain Ridge', tenant_subdomain: 'mtn' },
      ]});
      const req = makeRequest('GET', 'https://sinaicamps.com/api/camps');
      const res = await handleCampsRoute(req, { DB: db }, 'marketplace');
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].tenantName).toBe('Acacia Camp');
      expect(body[0].tenantSubdomain).toBe('acaciacamp');
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('LEFT JOIN tenants');
      expect(sql).toContain("c.status = 'active'");
      expect(sql).not.toContain('WHERE tenant_id');
      expect(chain.bind).toHaveBeenCalledWith();
    });

    it('treats empty-string tenantId as marketplace', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1', tenant_name: 'Acacia Camp' }] });
      const req = makeRequest('GET', 'https://sinaicamps.com/api/camps');
      const res = await handleCampsRoute(req, { DB: db }, '');
      const body = await res.json();
      expect(body).toHaveLength(1);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('LEFT JOIN tenants');
      expect(sql).not.toContain('WHERE tenant_id');
    });

    it('treats null tenantId as marketplace', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1', tenant_name: 'Acacia Camp' }] });
      const req = makeRequest('GET', 'https://sinaicamps.com/api/camps');
      const res = await handleCampsRoute(req, { DB: db }, null);
      const body = await res.json();
      expect(body).toHaveLength(1);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).not.toContain('WHERE tenant_id');
    });

    it('keeps the tenant-scoped query for a real tenant id', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1', tenant_id: 't1' }] });
      const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/camps');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([{ id: 'c1', tenantId: 't1' }]);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('WHERE tenant_id = ?');
      expect(sql).not.toContain('LEFT JOIN tenants');
      expect(chain.bind).toHaveBeenCalledWith('t1');
    });

    it('paginates marketplace listing with limit/offset and no tenant filter', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c2' }] });
      const req = makeRequest('GET', 'https://sinaicamps.com/api/camps?limit=5&offset=10');
      const res = await handleCampsRoute(req, { DB: db }, 'marketplace');
      const body = await res.json();
      expect(body).toEqual([{ id: 'c2' }]);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('LEFT JOIN tenants');
      expect(sql).toContain("c.status = 'active'");
      expect(sql).toContain('LIMIT ? OFFSET ?');
      expect(sql).not.toContain('WHERE tenant_id');
      expect(chain.bind).toHaveBeenCalledWith(5, 10);
    });

    it('keeps pagination tenant-scoped for a real tenant id', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1' }] });
      const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/camps?limit=5&offset=10');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([{ id: 'c1' }]);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('WHERE tenant_id = ?');
      expect(chain.bind).toHaveBeenCalledWith('t1', 5, 10);
    });
  });

  describe('GET /camps/:id (marketplace host — cross-tenant lookup)', () => {
    it('looks up a camp by id across tenants with tenant info', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [
        { id: 'c1', tenant_id: 'acaciacamp', name: 'Acacia', tenant_name: 'Acacia Camp', tenant_subdomain: 'acaciacamp' },
      ]});
      const req = makeRequest('GET', 'https://sinaicamps.com/api/camps/c1');
      const res = await handleCampsRoute(req, { DB: db }, 'marketplace');
      const body = await res.json();
      expect(body.id).toBe('c1');
      expect(body.tenantName).toBe('Acacia Camp');
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('LEFT JOIN tenants');
      expect(sql).not.toContain('WHERE tenant_id');
      expect(chain.bind).toHaveBeenCalledWith('c1');
    });

    it('keeps the tenant-scoped :id lookup for a real tenant id', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'c1', tenant_id: 't1' }] });
      const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/camps/c1');
      const res = await handleCampsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.id).toBe('c1');
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).toContain('WHERE tenant_id = ?');
      expect(chain.bind).toHaveBeenCalledWith('t1', 'c1');
    });

    it('returns 404 when the camp is not found on the marketplace host', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('GET', 'https://sinaicamps.com/api/camps/missing');
      const res = await handleCampsRoute(req, { DB: db }, 'marketplace');
      expect(res.status).toBe(404);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).not.toContain('WHERE tenant_id');
    });
  });
});

// ─── handleProductsRoute ────────────────────────────────
describe('handleProductsRoute', () => {
  describe('GET /products', () => {
    it('returns products with camp associations from pos_products.camp_id', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'p1', name: 'Product 1', camp_id: 'c1' }] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('GET', 'https://x.com/api/products');
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body[0].campIds).toEqual(['c1']);
      // No junction query — camp membership comes straight from pos_products.camp_id.
      expect(db.prepare).toHaveBeenCalledTimes(1);
    });

    it('returns products with empty campIds when no camp association', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'p1', name: 'Product 1', camp_id: null }] });
      const req = makeRequest('GET', 'https://x.com/api/products');
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body[0].campIds).toEqual([]);
    });

    it('returns empty array when no products', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('GET', 'https://x.com/api/products');
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('handles invalid images JSON string via firstImage fallback', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'p1', name: 'Product 1', images: 'not-json' }] });
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('GET', 'https://x.com/api/products');
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body[0].imageUrl).toBeNull();
    });
  });

  describe('POST /products (create)', () => {
    it('creates product with campIds', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/products', {
        name: 'Product', base_price: 100, capacity: 2, campIds: ['c1', 'c2']
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('creates product with camp_id after verifying camp ownership', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'c1' }] }); // camp ownership check
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/products', {
        name: 'Product', base_price: 100, camp_id: 'c1'
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
      const insertSql = db.prepare.mock.calls.find(c => c[0].includes('INTO pos_products'))[0];
      expect(insertSql).toContain('camp_id');
      // The ownership check is tenant-scoped.
      expect(db.prepare.mock.calls[0][0]).toContain('FROM projects WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL');
    });

    it('resolves the tenant single camp when camp_id omitted on create', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'the-camp' }] }); // tenant's single camp
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/products', {
        name: 'Product', base_price: 100
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
      const insertSql = db.prepare.mock.calls.find(c => c[0].includes('INTO pos_products'))[0];
      expect(insertSql).toContain('camp_id');
      const campResolve = db.prepare.mock.calls[0][0];
      expect(campResolve).toContain('FROM projects WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1');
    });

    it('returns 404 when camp_id does not belong to the tenant', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('POST', 'https://x.com/api/products', {
        name: 'Product', base_price: 100, camp_id: 'foreign-camp'
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Camp not found');
    });

    it('creates product without campIds', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/products', {
        name: 'Product', base_price: 100
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/products', { name: '' });
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/products', { name: 'Product' });
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /products/:id (update)', () => {
    it('updates product with campIds', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/products/p1', {
        name: 'Updated', campIds: ['c1']
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when camp_id does not belong to the tenant on update', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('PUT', 'https://x.com/api/products/p1', {
        name: 'Updated', camp_id: 'foreign-camp'
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Camp not found');
    });

    it('updates product with empty campIds', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/products/p1', {
        name: 'Updated', campIds: []
      });
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/products/p1', { base_price: -5 });
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('PUT', 'https://x.com/api/products/p1', { name: 'X' });
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /products/:id', () => {
    it('deletes product when not linked', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn(),
          run: vi.fn(),
        };
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/products/p1');
      const res = await handleProductsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('cascades price_overrides when deleting a product (Phase 3)', async () => {
      const { db } = makeDbMock();
      const sqls = [];
      db.prepare.mockImplementation((sql) => {
        sqls.push(sql);
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn(),
          run: vi.fn(),
        };
      });
      const req = makeRequest('DELETE', 'https://x.com/api/products/p1');
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(200);
      expect(sqls.some((s) => s.includes('DELETE FROM price_overrides WHERE product_id'))).toBe(true);
    });

    it('returns 400 when product linked to rooms', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'r1' }] }); // used rooms
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/products/p1');
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns 400 when product linked to rate plans', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [] });
        } else {
          ch.all.mockResolvedValue({ results: [{ id: 'rp1' }] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/products/p1');
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('DELETE', 'https://x.com/api/products/p1');
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PATCH', 'https://x.com/api/products');
      const res = await handleProductsRoute(req, { DB: db }, T);
      expect(res.status).toBe(405);
    });
  });
});

// ─── handleRoomsRoute ───────────────────────────────────
describe('handleRoomsRoute', () => {
  describe('GET /rooms', () => {
    it('returns all rooms', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'r1', name: 'Room' }] });
      const req = makeRequest('GET', 'https://x.com/api/rooms');
      const res = await handleRoomsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([{ id: 'r1', name: 'Room' }]);
    });

    it('filters by camp_id', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('GET', 'https://x.com/api/rooms?campId=c1');
      await handleRoomsRoute(req, { DB: db }, T);
      expect(db.prepare).toHaveBeenCalled();
    });

    it('filters by floor', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('GET', 'https://x.com/api/rooms?floor=1');
      await handleRoomsRoute(req, { DB: db }, T);
      expect(db.prepare).toHaveBeenCalled();
    });

    it('filters by both camp_id and floor', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [] });
      const req = makeRequest('GET', 'https://x.com/api/rooms?campId=c1&floor=2');
      await handleRoomsRoute(req, { DB: db }, T);
      expect(db.prepare).toHaveBeenCalled();
    });
  });

  describe('POST /rooms (create)', () => {
    it('creates room successfully', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [] }); // no dup
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/rooms', {
        camp_id: 'c1', product_id: 'p1', name: 'Room A', max_guests: 2
      });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when camp or product does not belong to the tenant', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [] }); // no dup
        } else {
          ch.run.mockResolvedValue({ success: true, meta: { changes: 0 } }); // ownership guard blocks
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/rooms', {
        camp_id: 'foreign-camp', product_id: 'p1', name: 'Room A', max_guests: 2
      });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });

    it('defaults max_guests from product capacity when not specified', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ capacity: 5 }] });
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/rooms', {
        camp_id: 'c1', product_id: 'p1', name: 'Room A'
      });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('defaults max_guests to 2 when product not found', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [] });
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/rooms', {
        camp_id: 'c1', product_id: 'p1', name: 'Room A'
      });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 for duplicate room name', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ capacity: 2 }] });
        } else {
          ch.all.mockResolvedValue({ results: [{ id: 'existing' }] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/rooms', {
        camp_id: 'c1', product_id: 'p1', name: 'Room A'
      });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/rooms', { name: '' });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/rooms', {
        camp_id: 'c1', product_id: 'p1', name: 'Room A'
      });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /rooms/:id (update)', () => {
    it('updates room successfully', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'r1' }] }); // room found
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('PUT', 'https://x.com/api/rooms/r1', { name: 'Updated Room', status: 'maintenance' });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when room not found', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn(),
          run: vi.fn(),
        };
        return ch;
      });
      const req = makeRequest('PUT', 'https://x.com/api/rooms/r1', { name: 'X' });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid schema on update', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/rooms/r1', { name: '' });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns 400 for duplicate name in same camp', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'r1' }] });
        } else {
          ch.all.mockResolvedValue({ results: [{ id: 'other' }] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('PUT', 'https://x.com/api/rooms/r1', { name: 'Dup Name', camp_id: 'c1' });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('PUT', 'https://x.com/api/rooms/r1', { name: 'X' });
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /rooms/:id', () => {
    it('deletes room when no orders', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'r1' }] });
        } else if (callIdx === 1) {
          ch.all.mockResolvedValue({ results: [] }); // no orders
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/rooms/r1');
      const res = await handleRoomsRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when room not found', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn(),
          run: vi.fn(),
        };
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/rooms/r1');
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
    });

    it('returns 400 when room has orders', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ id: 'r1' }] });
        } else {
          ch.all.mockResolvedValue({ results: [{ id: 'o1' }] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/rooms/r1');
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('DELETE', 'https://x.com/api/rooms/r1');
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PATCH', 'https://x.com/api/rooms');
      const res = await handleRoomsRoute(req, { DB: db }, T);
      expect(res.status).toBe(405);
    });
  });
});

// ─── handleRatePlansRoute ───────────────────────────────
describe('handleRatePlansRoute', () => {
  describe('GET /rate-plans', () => {
    it('returns all rate plans', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ id: 'rp1' }] });
      const req = makeRequest('GET', 'https://x.com/api/rate-plans');
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body).toEqual([{ id: 'rp1' }]);
    });
  });

  describe('POST /rate-plans (create)', () => {
    it('creates rate plan successfully', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/rate-plans', {
        product_id: 'p1', name: 'High Season', price_per_night: 200
      });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when product does not belong to the tenant', async () => {
      const { db, chain } = makeDbMock();
      chain.run.mockResolvedValue({ success: true, meta: { changes: 0 } }); // ownership guard blocks
      const req = makeRequest('POST', 'https://x.com/api/rate-plans', {
        product_id: 'foreign-product', name: 'Rate', price_per_night: 100
      });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/rate-plans', { name: '' });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/rate-plans', {
        product_id: 'p1', name: 'Rate', price_per_night: 100
      });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /rate-plans/:id (update)', () => {
    it('updates rate plan successfully', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/rate-plans/rp1', {
        name: 'Updated Rate', price_per_night: 150
      });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid schema on update', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/rate-plans/rp1', { price_per_night: -1 });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('PUT', 'https://x.com/api/rate-plans/rp1', { name: 'X' });
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /rate-plans/:id', () => {
    it('deletes rate plan when no existing orders', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] });
        } else {
          ch.all.mockResolvedValue({ results: [] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/rate-plans/rp1');
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('deletes rate plan when no product_id found', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn(),
          run: vi.fn(),
        };
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/rate-plans/rp1');
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 when rate plan has active orders', async () => {
      const { db } = makeDbMock();
      let callIdx = 0;
      db.prepare.mockImplementation(() => {
        const ch = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(),
          first: vi.fn(),
          run: vi.fn(),
        };
        if (callIdx === 0) {
          ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] });
        } else {
          ch.all.mockResolvedValue({ results: [{ id: 'o1' }] });
        }
        callIdx++;
        return ch;
      });
      const req = makeRequest('DELETE', 'https://x.com/api/rate-plans/rp1');
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('DELETE', 'https://x.com/api/rate-plans/rp1');
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(400);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PATCH', 'https://x.com/api/rate-plans');
      const res = await handleRatePlansRoute(req, { DB: db }, T);
      expect(res.status).toBe(405);
    });
  });
});
