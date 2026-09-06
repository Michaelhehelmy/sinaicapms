/**
 * Admin HR — cross-tenant HR overview (zero-coverage module).
 *
 * KNOWN PRODUCTION BUG (T29-BUG-001): index.js mounts this router with
 *   app.use('/api/admin/hr', superAdminGate) — WITHOUT a `/*` variant.
 * Hono's app.use(path) matches ONLY the exact path, so every sub-route
 * (/overview, /employees) is reachable WITHOUT authentication in production.
 * These tests mount the gate with BOTH the exact and `/*` forms (mirroring
 * tests/helpers/routerHarness.js) so they enforce the INTENDED security
 * contract (401/403). The production wiring in index.js must be fixed
 * (add the `app.use('/api/admin/hr/*', superAdminGate)` registration) —
 * see the T29 report.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import adminHrRouter from '../../src/api/admin-hr';
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

const PREFIX = '/api/admin/hr';

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

describe('Admin HR — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminHrRouter).request(req(`${PREFIX}/overview`), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminHrRouter).request(
      req(`${PREFIX}/overview`, { headers: { Authorization: 'Bearer not-a-jwt' } }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403) before any DB access', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminHrRouter).request(
      req(`${PREFIX}/employees`, { headers: authHeaders(adminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminHrRouter).request(
      req(`${PREFIX}/employees`, { headers: authHeaders(posToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await mountWithGate(adminHrRouter).request(
      req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /overview ───────────────────────────────────────────────────────────

describe('Admin HR — GET /overview', () => {
  it('returns aggregate HR stats and the tenant breakdown', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM employees$/, [{ cnt: 60 }])
      .on(/FROM employees WHERE status = 'active'/, [{ cnt: 45 }])
      .on(/FROM leave_requests WHERE status = 'pending'/, [{ cnt: 6 }])
      .on(/FROM payroll_runs$/, [{ cnt: 12 }])
      .on(/FROM tenants t/, [
        { tenant_id: 't1', tenant_name: 'Camp A', employee_count: 10, active_count: 8 },
        { tenant_id: 't2', tenant_name: 'Camp B', employee_count: 4, active_count: 2 },
      ]);

    const res = await mountWithGate(adminHrRouter).request(req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalEmployees).toBe(60);
    expect(body.activeEmployees).toBe(45);
    expect(body.pendingLeaveRequests).toBe(6);
    expect(body.totalPayrollRuns).toBe(12);
    expect(body.tenantBreakdown).toHaveLength(2);
    expect(body.tenantBreakdown[0].tenantName).toBe('Camp A');
    expect(body.tenantBreakdown[0].employeeCount).toBe(10);
  });

  it('returns 500 when the DB fails', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/FROM employees$/, () => { throw new Error('DB unreachable'); });

    const res = await mountWithGate(adminHrRouter).request(req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to load HR overview');
  });
});

// ── GET /employees ──────────────────────────────────────────────────────────

describe('Admin HR — GET /employees', () => {
  it('returns a paginated employee list', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM employees e/, [{ cnt: 2 }])
      .on(/SELECT e\.\*, t\.name as tenant_name/, [
        { id: 'e1', tenant_id: 't1', tenant_name: 'Camp A', first_name: 'Nadia', last_name: 'S', email: 'n@s.com', status: 'active', created_at: '2026-07-01T00:00:00Z' },
        { id: 'e2', tenant_id: 't2', tenant_name: 'Camp B', first_name: 'Omar', last_name: 'K', email: 'o@k.com', status: 'active', created_at: '2026-07-02T00:00:00Z' },
      ]);

    const res = await mountWithGate(adminHrRouter).request(req(`${PREFIX}/employees`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.data[0].tenantName).toBe('Camp A');
    expect(body.data[0].firstName).toBe('Nadia');
    expect(body.data[1].tenantId).toBe('t2');
  });

  it('applies tenantId and status filters to count binds', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM employees e/, (binds) => {
        capturedBinds.push(...binds);
        return { results: [{ cnt: 1 }], meta: { changes: 0 } };
      })
      .on(/SELECT e\.\*/, () => ({ results: [
        { id: 'e1', tenant_id: 't1', tenant_name: 'Camp A', first_name: 'Nadia', last_name: 'S', email: 'n@s.com', status: 'active', created_at: '2026-07-01T00:00:00Z' },
      ], meta: { changes: 0 } }));

    const res = await mountWithGate(adminHrRouter).request(
      req(`${PREFIX}/employees?tenantId=t1&status=active`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(capturedBinds).toEqual(['t1', 'active']);
    expect(body.total).toBe(1);
    expect(body.data[0].tenantId).toBe('t1');
  });

  it('returns an empty page when no employees exist', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM employees e/, [{ cnt: 0 }])
      .on(/SELECT e\.\*/, []);

    const res = await mountWithGate(adminHrRouter).request(req(`${PREFIX}/employees`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ── Unknown route ───────────────────────────────────────────────────────────

describe('Admin HR — unknown route', () => {
  it('returns 404 for a route the router does not define', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mountWithGate(adminHrRouter).request(
      req(`${PREFIX}/unknown`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    expect(res.status).toBe(404);
  });
});