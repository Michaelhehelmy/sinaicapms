/**
 * Admin CRM — cross-tenant CRM overview (zero-coverage module).
 *
 * KNOWN PRODUCTION BUG (T29-BUG-001): index.js mounts this router with
 *   app.use('/api/admin/crm', superAdminGate) — WITHOUT a `/*` variant.
 * Hono's app.use(path) matches ONLY the exact path, so every sub-route
 * (/overview, /contacts, /opportunities) is reachable WITHOUT authentication
 * in production. These tests mount the gate with BOTH the exact and `/*`
 * forms (mirroring tests/helpers/routerHarness.js) so they enforce the
 * INTENDED security contract (401/403). The production wiring in index.js
 * must be fixed (add the `app.use('/api/admin/crm/*', superAdminGate)`
 * registration) — see the T29 report.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import adminCrmRouter from '../../src/api/admin-crm';
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

const PREFIX = '/api/admin/crm';

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

describe('Admin CRM — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/overview`), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminCrmRouter).request(
      req(`${PREFIX}/overview`, { headers: { Authorization: 'Bearer not-a-jwt' } }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403) before any DB access', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminCrmRouter).request(
      req(`${PREFIX}/contacts`, { headers: authHeaders(adminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await mountWithGate(adminCrmRouter).request(
      req(`${PREFIX}/opportunities`, { headers: authHeaders(posToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await mountWithGate(adminCrmRouter).request(
      req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /overview ───────────────────────────────────────────────────────────

describe('Admin CRM — GET /overview', () => {
  it('returns aggregate CRM stats and the tenant breakdown', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM contacts$/, [{ cnt: 300 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM crm_leads$/, [{ cnt: 40 }])
      .on(/FROM opportunities WHERE stage/, [{ cnt: 5 }])
      .on(/FROM tickets WHERE status/, [{ cnt: 2 }])
      .on(/FROM tenants t/, [
        { tenant_id: 't1', tenant_name: 'Camp A', contact_count: 4, lead_count: 2, opportunity_count: 1 },
      ]);

    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalContacts).toBe(300);
    expect(body.totalLeads).toBe(40);
    expect(body.openOpportunities).toBe(5);
    expect(body.openTickets).toBe(2);
    expect(body.tenantBreakdown).toHaveLength(1);
    expect(body.tenantBreakdown[0].tenantName).toBe('Camp A');
    expect(body.tenantBreakdown[0].contactCount).toBe(4);
  });

  it('returns 500 when the DB fails', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/FROM contacts$/, () => { throw new Error('DB unreachable'); });

    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/overview`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to load CRM overview');
  });
});

// ── GET /contacts ───────────────────────────────────────────────────────────

describe('Admin CRM — GET /contacts', () => {
  it('returns a paginated contact list', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM contacts c/, [{ cnt: 1 }])
      .on(/SELECT c\.\*, t\.name as tenant_name/, [
        { id: 'c1', tenant_id: 't1', tenant_name: 'Camp A', name: 'Nadia', email: 'n@x.com', status: 'lead', created_at: '2026-08-01T00:00:00Z' },
      ]);

    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/contacts`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.hasMore).toBe(false);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].tenantId).toBe('t1');
    expect(body.data[0].tenantName).toBe('Camp A');
    expect(body.data[0].email).toBe('n@x.com');
  });

  it('applies the tenantId filter to count binds', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM contacts c/, (binds) => {
        capturedBinds.push(...binds);
        return { results: [{ cnt: 1 }], meta: { changes: 0 } };
      })
      .on(/SELECT c\.\*/, () => ({ results: [
        { id: 'c1', tenant_id: 't1', tenant_name: 'Camp A', name: 'Nadia', email: 'n@x.com', status: 'lead', created_at: '2026-08-01T00:00:00Z' },
      ], meta: { changes: 0 } }));

    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/contacts?tenantId=t1`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(capturedBinds).toEqual(['t1']);
    expect(body.total).toBe(1);
  });
});

// ── GET /opportunities ──────────────────────────────────────────────────────

describe('Admin CRM — GET /opportunities', () => {
  it('returns a paginated opportunity list', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM opportunities o/, [{ cnt: 3 }])
      .on(/SELECT o\.\*, t\.name as tenant_name/, [
        { id: 'o1', tenant_id: 't2', tenant_name: 'Camp B', title: 'Winter retreat', stage: 'open', created_at: '2026-09-01T00:00:00Z' },
        { id: 'o2', tenant_id: 't1', tenant_name: 'Camp A', title: 'Summer camp', stage: 'won', created_at: '2026-08-15T00:00:00Z' },
        { id: 'o3', tenant_id: 't2', tenant_name: 'Camp B', title: 'Corporate day', stage: 'negotiation', created_at: '2026-09-02T00:00:00Z' },
      ]);

    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/opportunities`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.data).toHaveLength(3);
    expect(body.hasMore).toBe(false);
    expect(body.data[0].tenantName).toBe('Camp B');
    expect(body.data[1].stage).toBe('won');
  });

  it('applies the tenantId filter to count binds', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as cnt FROM opportunities o/, (binds) => {
        capturedBinds.push(...binds);
        return { results: [{ cnt: 2 }], meta: { changes: 0 } };
      })
      .on(/SELECT o\.\*/, () => ({ results: [], meta: { changes: 0 } }));

    const res = await mountWithGate(adminCrmRouter).request(req(`${PREFIX}/opportunities?tenantId=t2`, { headers: authHeaders(superAdminToken) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(capturedBinds).toEqual(['t2']);
    expect(body.total).toBe(2);
  });
});

// ── Unknown route ───────────────────────────────────────────────────────────

describe('Admin CRM — unknown route', () => {
  it('returns 404 for a route the router does not define', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mountWithGate(adminCrmRouter).request(
      req(`${PREFIX}/unknown`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    expect(res.status).toBe(404);
  });
});