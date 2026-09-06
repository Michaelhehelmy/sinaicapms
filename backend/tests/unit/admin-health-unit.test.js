/**
 * Admin Health — GET /api/admin/health status + metrics
 * (zero-coverage module). The module exposes ONE dispatch function,
 * `handleAdminHealthRoute`, which runs its own requireAuth gate.
 *
 * Wire notes (verified against src/api/admin-health.js):
 *   - response keys: workers { status, uptime, requests, errors },
 *     d1/kv/r2 { status, latencyMs, ..., errors }, and `overall`.
 *   - kv/r2 report "skipped" when the binding is absent (NOT "not_configured").
 *   - overall = "down" if ANY dependency is down (d1 down → overall down).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { handleAdminHealthRoute } from '../../src/api/admin-health';
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

// ── SQL-routing mock DB (probe queries use .first()) ────────────────────────

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
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

// KV/R2 bindings are optional (module probes them only when present).
function makeEnv(db, { kv = true, r2 = true } = {}) {
  const env = { DB: db, JWT_SECRET };
  if (kv) env.KV_CACHE = { get: vi.fn(async () => 'ok'), put: vi.fn(async () => {}) };
  if (r2) env.MEDIA_BUCKET = { get: vi.fn(async () => null) };
  return env;
}

// ── Auth ────────────────────────────────────────────────────────────────────

describe('Admin Health — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminHealthRoute(req('/api/admin/health'), makeEnv(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: { Authorization: 'Bearer not-a-jwt' } }), makeEnv(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(adminToken) }), makeEnv(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(posToken) }), makeEnv(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(superAdminToken) }), makeEnv(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /api/admin/health — status ──────────────────────────────────────────

describe('Admin Health — GET /health', () => {
  it('reports all dependencies as ok when probes succeed', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT 1/, [{ id: 1 }]);

    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(superAdminToken) }), makeEnv(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.overall).toBe('ok');
    expect(body.workers.status).toBe('ok');
    expect(body.d1.status).toBe('ok');
    expect(body.d1.latencyMs).toBeLessThan(200);
    expect(body.kv.status).toBe('ok');
    expect(body.r2.status).toBe('ok');
  });

  it('reports d1 as down and overall as down when the probe throws', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT 1/, () => { throw new Error('DB down'); });

    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(superAdminToken) }), makeEnv(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.d1.status).toBe('down');
    expect(body.d1.errors).toBe(1);
    expect(body.overall).toBe('down');
  });

  it('marks kv as skipped when the KV_CACHE binding is missing', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT 1/, [{ id: 1 }]);

    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(superAdminToken) }), makeEnv(db, { kv: false })
    );
    const body = await res.json();

    expect(body.kv.status).toBe('skipped');
    expect(body.r2.status).toBe('ok');
    expect(body.overall).toBe('ok');
  });

  it('marks kv as down when the KV probe throws and overall as down', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT 1/, [{ id: 1 }]);

    const env = {
      DB: db,
      JWT_SECRET,
      KV_CACHE: { get: vi.fn(async () => { throw new Error('KV down'); }) },
      MEDIA_BUCKET: { get: vi.fn(async () => null) },
    };
    const res = await handleAdminHealthRoute(
      req('/api/admin/health', { headers: authHeaders(superAdminToken) }), env
    );
    const body = await res.json();

    expect(body.kv.status).toBe('down');
    expect(body.overall).toBe('down');
  });
});

// ── GET /api/admin/health/metrics ───────────────────────────────────────────

describe('Admin Health — GET /health/metrics', () => {
  it('returns a 24-point synthetic timeseries', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);

    const res = await handleAdminHealthRoute(
      req('/api/admin/health/metrics', { headers: authHeaders(superAdminToken) }), makeEnv(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.metrics)).toBe(true);
    expect(body.metrics.length).toBe(24);
    for (const point of body.metrics) {
      expect(typeof point.timestamp).toBe('string');
      expect(typeof point.workers.requests).toBe('number');
      expect(typeof point.d1.queries).toBe('number');
      expect(typeof point.kv.operations).toBe('number');
    }
  });
});

// ── Unknown sub-path ────────────────────────────────────────────────────────

describe('Admin Health — unknown endpoint', () => {
  it('returns 404 for an unknown health sub-path', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);

    const res = await handleAdminHealthRoute(
      req('/api/admin/health/whatever', { headers: authHeaders(superAdminToken) }), makeEnv(db)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Admin health endpoint not found');
  });
});