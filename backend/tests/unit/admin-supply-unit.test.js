/**
 * Admin Supply — cross-tenant inventory/warehouse overview (zero-coverage module).
 *
 * KNOWN PRODUCTION BUG (T29-BUG-001): index.js mounts this router with
 *   app.use('/api/admin/supply', superAdminGate) — WITHOUT a `/*` variant.
 * Hono's app.use(path) matches ONLY the exact path, so every sub-route
 * (/overview, /purchase-orders) is reachable WITHOUT authentication in
 * production. These tests mount the gate with BOTH the exact and `/*` forms
 * (mirroring tests/helpers/routerHarness.js) so they enforce the INTENDED
 * security contract (401/403). The production wiring in index.js must be
 * fixed (add the `app.use('/api/admin/supply/*', superAdminGate)`
 * registration) — see the T29 report.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import adminSupplyRouter from '../../src/api/admin-supply';
import { requireAuth } from '../../src/middleware/requireAuth.js';
import { generateToken } from '../../src/middleware/sharedAuth.js';

const JWT_SECRET = 'test-secret-key-for-admin';

const superAdminGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

const PREFIX = '/api/admin/supply';

let superAdminToken;
let adminToken;
let posToken;

beforeAll(async () => {
  superAdminToken = await generateToken(
    { sub: 'sa1', userId: 'sa1', email: 'super@test.com', role: 'super_admin', tenantId: null },
    JWT_SECRET, 'access'
  );
  adminToken = await generateToken(
    { sub: 'a1', userId: 'a1', email: 'admin@test.com', role: 'admin', tenantId: 't1' },
    JWT_SECRET, 'access'
  );
  posToken = await generateToken(
    { sub: 'p1', userId: 'p1', email: 'pos@test.com', role: 'pos_staff', tenantId: 't1', posType: 'pos' },
    JWT_SECRET, 'access'
  );
});

// ── SQL-routing mock DB (same as admin-financials-unit.test.js) ────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db, JWT_SECRET });
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

function mountWithGate(router) {
  const app = new Hono();
  const gateMw = async (c, next) => {
    const auth = await superAdminGate(c.req.raw, c.env);
    if (auth instanceof Response) return auth;
    return next();
  };
  app.use(PREFIX, gateMw);
  app.use(`${PREFIX}/*`, gateMw);
  app.route(PREFIX, router);
  return app;
}

// ── Auth (enforced at mount — see header note) ──────────────────────────────

describe('Admin Supply — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminSupplyRouter).request(req(`${PREFIX}/overview`), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminSupplyRouter).request(
      req(`${PREFIX}/overview`, { headers: { Authorization: 'Bearer not-a-jwt' } }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403) before any DB access', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminSupplyRouter).request(
      req(`${PREFIX}/purchase-orders`, { headers: authHeaders(adminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminSupplyRouter).request(
      req(`${PREFIX}/purchase-orders`, { headers: authHeaders(posToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await mountWithGate(adminSupplyRouter).request(
      req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /overview ───────────────────────────────────────────────────────────

describe('Admin Supply — GET /overview', () => {
  it('returns aggregate supply stats and the tenant breakdown', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM warehouses$/, [{ cnt: 20 }])
      .on(/FROM pos_products WHERE is_active = 1/, [{ cnt: 50 }])
      .on(/FROM purchase_orders WHERE status/, [{ cnt: 7 }])
      .on(/FROM stock_quant sq/, [{ cnt: 3 }])
      .on(/FROM tenants t/, [
        { tenant_id: 't1', tenant_name: 'Camp A', warehouse_count: 2, low_stock_count: 1 },
      ]);

    const res = await mountWithGate(adminSupplyRouter).request(req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalWarehouses).toBe(20);
    expect(body.totalProducts).toBe(50);
    expect(body.pendingPurchaseOrders).toBe(7);
    expect(body.lowStockItems).toBe(3);
    expect(body.tenantBreakdown).toHaveLength(1);
    expect(body.tenantBreakdown[0].tenantName).toBe('Camp A');
    expect(body.tenantBreakdown[0].warehouseCount).toBe(2);
  });

  it('returns 200 with zeroed stats when the DB fails (graceful degradation)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/FROM warehouses$/, () => { throw new Error('DB unreachable'); });

    const res = await mountWithGate(adminSupplyRouter).request(req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalWarehouses).toBe(0);
    expect(body.totalProducts).toBe(0);
    expect(body.pendingPurchaseOrders).toBe(0);
    expect(body.lowStockItems).toBe(0);
    expect(body.tenantBreakdown).toEqual([]);
  });
});

// ── GET /purchase-orders ────────────────────────────────────────────────────

describe('Admin Supply — GET /purchase-orders', () => {
  it('returns a paginated purchase-order list', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM purchase_orders po/, [{ cnt: 1 }])
      .on(/SELECT po\.\*, t\.name as tenant_name/, [
        { id: 'po1', tenant_id: 't1', tenant_name: 'Camp A', supplier: 'Sinai Traders', status: 'pending', total_amount: 1250, created_at: '2026-08-10T00:00:00Z' },
      ]);

    const res = await mountWithGate(adminSupplyRouter).request(req(`${PREFIX}/purchase-orders`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(false);
    expect(body.data[0].tenantName).toBe('Camp A');
    expect(body.data[0].supplier).toBe('Sinai Traders');
  });

  it('applies the tenantId filter to count binds', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM purchase_orders po/, (binds) => {
        capturedBinds.push(...binds);
        return { results: [{ cnt: 1 }], meta: { changes: 0 } };
      })
      .on(/SELECT po\.\*/, () => ({ results: [
        { id: 'po1', tenant_id: 't1', tenant_name: 'Camp A', supplier: 'Sinai Traders', status: 'pending', total_amount: 1250, created_at: '2026-08-10T00:00:00Z' },
      ], meta: { changes: 0 } }));

    const res = await mountWithGate(adminSupplyRouter).request(req(`${PREFIX}/purchase-orders?tenantId=t1`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(capturedBinds).toEqual(['t1']);
    expect(body.total).toBe(1);
  });
});

// ── Unknown route ───────────────────────────────────────────────────────────

describe('Admin Supply — unknown route', () => {
  it('returns 404 for a route the router does not define', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mountWithGate(adminSupplyRouter).request(
      req(`${PREFIX}/unknown`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    expect(res.status).toBe(404);
  });
});