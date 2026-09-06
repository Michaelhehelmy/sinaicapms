/**
 * Admin Reports — on-demand report generation, jobs, and schedules
 * (zero-coverage module). The module exposes ONE dispatch function,
 * `handleAdminReportsRoute`, which runs its own requireAuth gate.
 *
 * Wire notes (verified against src/api/admin-reports.js):
 *   - module-level `reportJobs` and `scheduledReports` Maps persist across
 *     tests within this file, so each test captures jobId/scheduleId from
 *     responses instead of assuming fixed IDs.
 *   - routes handled by path segments: reports (template list), generate,
 *     jobs/:id, schedule, scheduled, scheduled/:id (DELETE).
 *   - generate: CSV is returned inline as text/csv; other formats return
 *     JSON job metadata (poll via GET jobs/:id).
 *   - errors: 'Report job not found' 404, 'Unknown report template' 400,
 *     'schedule is required (daily|weekly|monthly)' 400,
 *     'Admin reports endpoint not found' 404.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { handleAdminReportsRoute } from '../../src/api/admin-reports';
import { generateToken } from '../../src/middleware/sharedAuth.js';

const JWT_SECRET = 'test-secret-key-for-admin';

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

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

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

const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
const post = (path, init = {}) => req(path, { method: 'POST', ...init });
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });
const env = (db) => ({ DB: db, JWT_SECRET });

// ── Auth ────────────────────────────────────────────────────────────────────

describe('Admin Reports — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminReportsRoute(req('/api/admin/reports'), env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports', { headers: { Authorization: 'Bearer not-a-jwt' } }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports', { headers: authHeaders(adminToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports', { headers: authHeaders(posToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── Template list ───────────────────────────────────────────────────────────

describe('Admin Reports — GET /reports', () => {
  it('returns the list of report templates', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.reports)).toBe(true);
    expect(body.reports.length).toBe(7);
    const ids = body.reports.map((r) => r.id);
    expect(ids).toContain('system_health');
    expect(ids).toContain('revenue_by_tenant');
    expect(ids).toContain('occupancy_report');
  });
});

// ── Generate + job polling ──────────────────────────────────────────────────

describe('Admin Reports — generate & jobs', () => {
  it('rejects generation without a reportId (400)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await handleAdminReportsRoute(
      post('/api/admin/reports/generate', { headers: authHeaders(superAdminToken), body: JSON.stringify({}) }),
      env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('reportId is required');
  });

  it('rejects an unknown report template (400)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await handleAdminReportsRoute(
      post('/api/admin/reports/generate', { headers: authHeaders(superAdminToken), body: JSON.stringify({ reportId: 'nope' }) }),
      env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unknown report template');
  });

  it('generates a CSV report and serves it from the job endpoint', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT t\.id, t\.name,\s+COALESCE\(SUM\(o\.total_amount\), 0\) AS revenue/, [
        { id: 't1', name: 'Acacia Camp', revenue: 12500, order_count: 3 },
        { id: 't2', name: 'Sinai Retreat', revenue: 9800, order_count: 2 },
      ]);

    const createRes = await handleAdminReportsRoute(
      post('/api/admin/reports/generate', {
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ reportId: 'revenue_by_tenant' }),
      }),
      env(db)
    );
    const created = await createRes.json();
    expect(createRes.status).toBe(200);
    expect(created.jobId).toBeTruthy();

    const csvRes = await handleAdminReportsRoute(
      req(`/api/admin/reports/jobs/${created.jobId}`, { headers: authHeaders(superAdminToken) }), env(db)
    );
    const text = await csvRes.text();

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('Content-Type')).toContain('text/csv');
    expect(text).toContain('Acacia Camp');
    expect(text).toContain('12500');
  });

  it('creates a background job and reports its status', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT t\.id, t\.name,\s+COALESCE\(SUM\(o\.total_amount\), 0\) AS revenue/, []);

    const createRes = await handleAdminReportsRoute(
      post('/api/admin/reports/generate', {
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ reportId: 'revenue_by_tenant', format: 'pdf' }),
      }),
      env(db)
    );
    const created = await createRes.json();

    expect(createRes.status).toBe(200);
    expect(created.jobId).toBeTruthy();
    expect(created.status).toBe('completed');

    const jobId = created.jobId;
    const pollRes = await handleAdminReportsRoute(
      req(`/api/admin/reports/jobs/${jobId}`, { headers: authHeaders(superAdminToken) }), env(db)
    );
    const polled = await pollRes.json();

    expect(pollRes.status).toBe(200);
    expect(polled.status).toBe('completed');
    expect(polled.reportId).toBe('revenue_by_tenant');
  });

  it('returns 404 for an unknown job id', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports/jobs/does-not-exist', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Report job not found');
  });
});

// ── Scheduling ──────────────────────────────────────────────────────────────

describe('Admin Reports — scheduling', () => {
  it('rejects a schedule without a frequency (400)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await handleAdminReportsRoute(
      post('/api/admin/reports/schedule', {
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ reportId: 'system_health' }),
      }),
      env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('schedule is required (daily|weekly|monthly)');
  });

  it('creates, lists, and deletes a scheduled report', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);

    const createRes = await handleAdminReportsRoute(
      post('/api/admin/reports/schedule', {
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ reportId: 'system_health', schedule: 'daily' }),
      }),
      env(db)
    );
    const created = await createRes.json();

    expect(createRes.status).toBe(200);
    expect(created.success).toBe(true);
    expect(created.id).toBeTruthy();

    const scheduleId = created.id;

    const listRes = await handleAdminReportsRoute(
      req('/api/admin/reports/scheduled', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const list = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(list.scheduled).toHaveLength(1);
    expect(list.scheduled[0].id).toBe(scheduleId);
    expect(list.scheduled[0].schedule).toBe('daily');

    const deleteRes = await handleAdminReportsRoute(
      req(`/api/admin/reports/scheduled/${scheduleId}`, { method: 'DELETE', headers: authHeaders(superAdminToken) }),
      env(db)
    );
    const del = await deleteRes.json();
    expect(deleteRes.status).toBe(200);
    expect(del.success).toBe(true);

    const deleteAgainRes = await handleAdminReportsRoute(
      req(`/api/admin/reports/scheduled/${scheduleId}`, { method: 'DELETE', headers: authHeaders(superAdminToken) }),
      env(db)
    );
    const delAgain = await deleteAgainRes.json();
    expect(deleteAgainRes.status).toBe(404);
    expect(delAgain.success).toBe(false);
    expect(delAgain.error).toBe('Scheduled report not found');
  });

  it('rejects unauthenticated scheduling (401)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminReportsRoute(
      post('/api/admin/reports/schedule', { body: JSON.stringify({ reportId: 'system_health', schedule: 'daily' }) }),
      env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });
});

// ── Unknown sub-path ────────────────────────────────────────────────────────

describe('Admin Reports — unknown endpoint', () => {
  it('returns 404 for an unknown reports sub-path', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await handleAdminReportsRoute(
      req('/api/admin/reports/whatever', { headers: authHeaders(superAdminToken) }), env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Admin reports endpoint not found');
  });
});