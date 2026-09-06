/**
 * Admin Audit — cross-tenant audit log queries + CSV export
 * (zero-coverage module). This router gate is mounted with exact-path only
 * in index.js, but the module ALSO runs an internal gate inside each handler,
 * so sub-paths are still protected in production (no T29-BUG-001 exposure).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import adminAuditRouter from '../../src/api/admin-audit';
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

const PREFIX = '/api/admin/audit';

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

// Mount exactly like index.js (exact-path gate) — handler-level gate covers sub-routes.
function mount(router) {
  const app = new Hono();
  const gateMw = async (c, next) => {
    const auth = await superAdminGate(c.req.raw, c.env);
    if (auth instanceof Response) return auth;
    return next();
  };
  app.use(PREFIX, gateMw);
  app.route(PREFIX, router);
  return app;
}

// ── Auth ────────────────────────────────────────────────────────────────────

describe('Admin Audit — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminAuditRouter).request(req(`${PREFIX}`), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}`, { headers: { Authorization: 'Bearer not-a-jwt' } }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}`, { headers: authHeaders(adminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}`, { headers: authHeaders(posToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /api/admin/audit ────────────────────────────────────────────────────

describe('Admin Audit — GET /', () => {
  it('returns a paginated audit log with filters', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as total FROM audit_log/, [{ total: 1 }])
      .on(/SELECT al\.\*/, [
        { id: 'log1', tenant_id: 't1', tenant_name: 'Camp A', user_email: 'ops@camp.io', action: 'create', entity_type: 'tenant', created_at: '2026-09-01T00:00:00Z' },
      ]);

    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}?action=create&entityType=tenant&tenantId=t1`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('log1');
    expect(body.data[0].tenantId).toBe('t1');
    expect(body.data[0].tenantName).toBe('Camp A');
    expect(body.data[0].userEmail).toBe('ops@camp.io');
    expect(body.data[0].action).toBe('create');
    expect(body.data[0].entityType).toBe('tenant');
  });

  it('returns an empty page when there are no audit entries', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as total FROM audit_log/, [{ total: 0 }])
      .on(/SELECT al\.\*/, []);

    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Admin Audit — validation', () => {
  const cases = [
    ['action=banana', 'action'],
    ['entityType=banana', 'entityType'],
    ['action=create&entityType=banana', 'entityType'],
  ];

  for (const [query, field] of cases) {
    it(`rejects invalid query parameter ${field}`, async () => {
      const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
      const res = await mount(adminAuditRouter).request(
        req(`${PREFIX}?${query}`, { headers: authHeaders(superAdminToken) }), {}, env(db)
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid query parameters');
    });
  }
});

// ── GET /api/admin/audit/export ─────────────────────────────────────────────

describe('Admin Audit — GET /export', () => {
  it('streams a CSV export of matching audit entries', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT al\.\*/, [
        { id: 'log1', tenant_id: 't1', tenant_name: 'Camp A', user_email: 'ops@camp.io', action: 'create', entity_type: 'tenant', old_value: null, new_value: '{"name":"Camp A"}', created_at: '2026-09-01T00:00:00Z' },
        { id: 'log2', tenant_id: 't2', tenant_name: 'Camp, B', user_email: 'manager@camp.io', action: 'update', entity_type: 'project', old_value: '{"x":1}', new_value: null, created_at: '2026-09-02T00:00:00Z' },
      ]);

    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}/export`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(text).toContain('Action'); // CSV header is Title Case
    expect(text).toContain('Entity Type');
    expect(text).toContain('Camp A');
    expect(text).toContain('"Camp, B"'); // value with comma is quoted
  });

  it('rejects an invalid action filter (400)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}/export?action=banana`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    expect(res.status).toBe(400);
  });
});

// ── Unsupported methods ─────────────────────────────────────────────────────

describe('Admin Audit — method handling', () => {
  it('returns 405 for a POST on the collection', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mount(adminAuditRouter).request(
      req(`${PREFIX}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(superAdminToken) }, body: '{}' }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });
});