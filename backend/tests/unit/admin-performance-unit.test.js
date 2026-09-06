/**
 * Admin Performance — cross-tenant performance snapshot + CSV export
 * (zero-coverage module). The module exposes ONE dispatch function,
 * `handleAdminPerformanceRoute`, which runs its own requireAuth gate.
 *
 * NOTE: admin-performance executes its queries via DB.batch([...]), so the
 * fake DB's batch dispatcher routes each statement through the same SQL
 * handler registry used by the other query methods.
 *
 * Wire notes (verified against src/api/admin-performance.js):
 *   - snapshot response: { tenants: [{ id, name, metrics: { revenue,
 *     bookings, occupancy, employeeCount, inventoryValue, leads, growthRate },
 *     trends: { revenue, bookings } }], rankings: { revenue, occupancy, growth } }
 *   - export response: raw text/csv Response (not JSON).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { handleAdminPerformanceRoute } from '../../src/api/admin-performance';
import { generateToken } from '../../src/middleware/sharedAuth.js';

const JWT_SECRET = 'test-secret-key-for-admin';

let superAdminToken;
let adminToken;

beforeAll(async () => {
  superAdminToken = await generateToken(
    { sub: 'sa1', userId: 'sa1', email: 'super@test.com', role: 'super_admin', tenantId: null },
    JWT_SECRET, 'access'
  );
  adminToken = await generateToken(
    { sub: 'a1', userId: 'a1', email: 'admin@test.com', role: 'admin', tenantId: 't1' },
    JWT_SECRET, 'access'
  );
});

// ── SQL-routing mock DB with a real batch dispatcher ────────────────────────

function makePerformanceDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        sql,
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async (stmts) => {
      return Promise.all(
        stmts.map((s) => {
          const results = runHandler(s.sql, s.boundBinds);
          if (results === undefined) {
            throw new Error(`No handler registered for: ${s.sql}`);
          }
          return { results: results?.results ?? [], meta: results?.meta ?? { changes: 0 } };
        })
      );
    }),
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

const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
const env = (db) => ({ DB: db, JWT_SECRET });

// ── Auth ────────────────────────────────────────────────────────────────────

describe('Admin Performance — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makePerformanceDb();
    const res = await handleAdminPerformanceRoute(req('/api/admin/performance'), env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makePerformanceDb();
    const res = await handleAdminPerformanceRoute(
      req('/api/admin/performance', { headers: { Authorization: 'Bearer not-a-jwt' } }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403)', async () => {
    const db = makePerformanceDb();
    const res = await handleAdminPerformanceRoute(
      req('/api/admin/performance', { headers: authHeaders(adminToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makePerformanceDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await handleAdminPerformanceRoute(
      req('/api/admin/performance', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /api/admin/performance ──────────────────────────────────────────────

describe('Admin Performance — GET /performance', () => {
  it('returns a per-tenant performance snapshot with rankings', async () => {
    const db = makePerformanceDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT t\.id, t\.name, t\.status\s+FROM tenants t/, [
        { id: 't1', name: 'Camp A', status: 'active' },
        { id: 't2', name: 'Camp B', status: 'active' },
      ])
      .on(/COALESCE\(SUM\(o\.total_amount\), 0\) AS revenue/, [
        { id: 't1', revenue: 1200, bookings: 10 },
        { id: 't2', revenue: 800, bookings: 4 },
      ])
      .on(/SELECT p\.tenant_id,\s+COUNT\(r\.id\) AS total_rooms/, [
        { tenant_id: 't1', total_rooms: 10, occupied_rooms: 7 },
        { tenant_id: 't2', total_rooms: 5, occupied_rooms: 2 },
      ])
      .on(/FROM pos_users/, [
        { tenant_id: 't1', count: 7 },
        { tenant_id: 't2', count: 3 },
      ])
      .on(/FROM leads/, [
        { tenant_id: 't1', count: 15 },
        { tenant_id: 't2', count: 6 },
      ])
      .on(/FROM pos_products/, [
        { tenant_id: 't1', value: 5000 },
        { tenant_id: 't2', value: 2000 },
      ]);

    const res = await handleAdminPerformanceRoute(
      req('/api/admin/performance', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tenants).toHaveLength(2);

    const t1 = body.tenants.find((t) => t.id === 't1');
    expect(t1.name).toBe('Camp A');
    expect(t1.metrics.revenue).toBe(1200);
    expect(t1.metrics.bookings).toBe(10);
    expect(t1.metrics.occupancy).toBe(70); // round(7/10*100)
    expect(t1.metrics.employeeCount).toBe(7);
    expect(t1.metrics.leads).toBe(15);
    expect(t1.metrics.inventoryValue).toBe(5000);
    expect(t1.metrics.growthRate).toBe(0);
    expect(t1.trends.revenue).toBe('flat');

    const t2 = body.tenants.find((t) => t.id === 't2');
    expect(t2.metrics.revenue).toBe(800);
    expect(t2.metrics.occupancy).toBe(40); // round(2/5*100)

    expect(body.rankings.revenue[0].tenantId).toBe('t1');
    expect(body.rankings.revenue[0].revenue).toBe(1200);
    expect(body.rankings.occupancy[0].tenantId).toBe('t1');
    expect(body.rankings.growth).toHaveLength(2);
  });

  it('returns an empty tenants list when no tenants exist', async () => {
    const db = makePerformanceDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT t\.id, t\.name, t\.status\s+FROM tenants t/, [])
      .on(/COALESCE\(SUM\(o\.total_amount\), 0\) AS revenue/, [])
      .on(/SELECT p\.tenant_id,\s+COUNT\(r\.id\) AS total_rooms/, [])
      .on(/FROM pos_users/, [])
      .on(/FROM leads/, [])
      .on(/FROM pos_products/, []);

    const res = await handleAdminPerformanceRoute(
      req('/api/admin/performance', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tenants).toEqual([]);
    expect(body.rankings.revenue).toEqual([]);
  });
});

// ── GET /api/admin/performance/export ───────────────────────────────────────

describe('Admin Performance — GET /performance/export', () => {
  it('exports a CSV with one row per tenant', async () => {
    const db = makePerformanceDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT t\.id, t\.name\s+FROM tenants t WHERE/, [
        { id: 't1', name: 'Camp A' },
        { id: 't2', name: 'Camp B' },
      ])
      .on(/COALESCE\(SUM\(total_amount\), 0\) AS revenue/, [
        { tenant_id: 't1', revenue: 1200, bookings: 10 },
        { tenant_id: 't2', revenue: 800, bookings: 4 },
      ])
      .on(/SELECT p\.tenant_id,\s+COUNT\(r\.id\) AS total_rooms/, [
        { tenant_id: 't1', total_rooms: 10, occupied_rooms: 7 },
        { tenant_id: 't2', total_rooms: 5, occupied_rooms: 2 },
      ]);

    const res = await handleAdminPerformanceRoute(
      req('/api/admin/performance/export', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(text).toContain('Tenant ID,Tenant Name,Revenue,Bookings,Total Rooms,Occupied Rooms,Occupancy %');
    expect(text).toContain('Camp A');
    expect(text).toContain('Camp B');
    expect(text).toContain(',1200,10,10,7,70');
  });

  it('rejects unauthenticated export (401)', async () => {
    const db = makePerformanceDb();
    const res = await handleAdminPerformanceRoute(req('/api/admin/performance/export'), env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });
});