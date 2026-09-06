/**
 * Admin Subscriptions — cross-tenant subscription CRUD
 * (zero-coverage module). Mounted in index.js exactly like audit:
 *   app.use('/api/admin/subscriptions', superAdminGate);
 *   app.route('/api/admin/subscriptions', adminSubscriptionsRoutes);
 * The router ALSO runs an internal superAdminGate inside every handler.
 *
 * Wire notes (verified against src/api/admin-subscriptions.js):
 *   - routes: GET '/', PUT '/:id', POST '/:id/cancel', POST '/:id/resume';
 *     everything else falls through to all('*') → 405 (GET /:id, POST /,
 *     DELETE /:id are NOT implemented — they 405).
 *   - PUT returns { success, tenantId } (no subscription object).
 *   - cancel → { success, tenantId, status: 'canceled' };
 *     resume → { success, tenantId, status: 'active' }.
 *   - list query: count = `SELECT COUNT(*) as total FROM tenant_subscriptions ts
 *     LEFT JOIN tenants t ...`; data = `SELECT ts.*, t.name as tenant_name,
 *     sp.name as plan_name, sp.slug as plan_slug ...`.
 *   - usage.percent = min(100, round(used/limit*100)); plan limits fall back
 *     to PLAN_LIMITS by plan_slug.
 *   - PUT {} → 400 { success:false, error:'No fields to update' }.
 *   - malformed JSON → 400 { success:false, error:'Failed to update subscription' }.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import adminSubscriptionsRoutes from '../../src/api/admin-subscriptions';
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

const PREFIX = '/api/admin/subscriptions';

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
const post = (path, init = {}) => req(path, { method: 'POST', ...init });
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

// Mount exactly like index.js (exact-path gate) — handler-level gates also present.
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

const SUB_ROW = {
  tenant_id: 't1',
  tenant_name: 'Acacia Camp',
  plan_id: 'plan_pro',
  plan_name: 'Pro',
  plan_slug: 'pro',
  price_monthly: 99,
  price_yearly: 990,
  status: 'active',
  trial_ends_at: null,
  current_period_end: null,
  bookings_used: 250,
  bookings_limit: 10000,
  total_paid: 990,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ── Auth ────────────────────────────────────────────────────────────────────

describe('Admin Subscriptions — auth', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminSubscriptionsRoutes).request(req(`${PREFIX}`), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });

  it('rejects a garbage token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}`, { headers: { Authorization: 'Bearer not-a-jwt' } }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a non-super_admin token (403)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}`, { headers: authHeaders(adminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a POS realm token (403 — realm mismatch)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}`, { headers: authHeaders(posToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized: Super Admin access required');
  });

  it('rejects a deactivated super_admin account (401)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 0 }]);
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Account deactivated');
  });
});

// ── GET /api/admin/subscriptions — list ─────────────────────────────────────

describe('Admin Subscriptions — GET / (list)', () => {
  it('returns a paginated subscription list with usage enrichment', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as total FROM tenant_subscriptions/, [{ total: 1 }])
      .on(/SELECT ts\.\*/, [SUB_ROW]);

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.hasMore).toBe(false);

    const sub = body.data[0];
    expect(sub.tenantId).toBe('t1');
    expect(sub.tenantName).toBe('Acacia Camp');
    expect(sub.planSlug).toBe('pro');
    expect(sub.planName).toBe('Pro');
    expect(sub.priceMonthly).toBe(99);
    expect(sub.status).toBe('active');
    expect(sub.usage.bookings).toBe(250);
    expect(sub.usage.limit).toBe(10000);
    expect(sub.usage.percent).toBe(3); // round(250/10000*100)
  });

  it('applies plan, status, and search filters with correct bindings', async () => {
    const countBinds = [];
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT COUNT\(\*\) as total FROM tenant_subscriptions/, (binds) => {
        countBinds.push(...binds);
        return { results: [{ total: 0 }], meta: {} };
      })
      .on(/SELECT ts\.\*/, [SUB_ROW]);

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}?plan=pro&status=active&search=Acacia`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );

    expect(res.status).toBe(200);
    // plan → (ts.plan_id = ? OR sp.slug = ?) [pro, pro];
    // status → ts.status = ? [active]; search → (t.name LIKE ? OR ts.tenant_id LIKE ?) [%Acacia%, %Acacia%]
    expect(countBinds).toEqual(['pro', 'pro', 'active', '%Acacia%', '%Acacia%']);
  });
});

// ── 405s — routes that do NOT exist on the router ───────────────────────────

describe('Admin Subscriptions — unimplemented methods (405)', () => {
  it('returns 405 for GET on a single subscription', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });

  it('returns 405 for POST on the collection', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mount(adminSubscriptionsRoutes).request(
      post(`${PREFIX}`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });

  it('returns 405 for DELETE on the collection', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}`, { method: 'DELETE', headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });

  it('returns 405 for DELETE on a single subscription', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);
    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, { method: 'DELETE', headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });
});

// ── PUT /api/admin/subscriptions/:id ────────────────────────────────────────

describe('Admin Subscriptions — PUT /:id (upsert)', () => {
  it('updates an existing subscription plan', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT id FROM tenant_subscriptions/, [{ id: 1 }])
      .on(/SELECT id, max_orders_monthly FROM subscription_plans/, [{ id: 'plan_pro', max_orders_monthly: 10000 }])
      .on(/UPDATE tenant_subscriptions SET/, { results: [], meta: { changes: 1 } });

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, {
        method: 'PUT',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ plan: 'pro' }),
      }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tenantId).toBe('t1');
  });

  it('creates a subscription when none exists (upsert insert path)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT id FROM tenant_subscriptions/, [])
      .on(/SELECT id, max_orders_monthly FROM subscription_plans/, [{ id: 'plan_starter', max_orders_monthly: 1000 }])
      .on(/INSERT INTO tenant_subscriptions/, { results: [], meta: { changes: 1 } });

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, {
        method: 'PUT',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ plan: 'starter' }),
      }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tenantId).toBe('t1');
  });

  it('returns 400 when no fields are provided', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT id FROM tenant_subscriptions/, [{ id: 1 }]);

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, {
        method: 'PUT',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({}),
      }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('No fields to update');
  });

  it('rejects an invalid plan slug (400 validation error)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, {
        method: 'PUT',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ plan: 'gold' }),
      }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('rejects malformed JSON (400)', async () => {
    const db = makeRoutingDb().on(/SELECT is_active FROM admins/, [{ is_active: 1 }]);

    const res = await mount(adminSubscriptionsRoutes).request(
      req(`${PREFIX}/t1`, {
        method: 'PUT',
        headers: authHeaders(superAdminToken),
        body: '<html>not json</html>',
      }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update subscription');
  });
});

// ── POST /:id/cancel and /:id/resume ────────────────────────────────────────

describe('Admin Subscriptions — cancel & resume', () => {
  it('cancels an existing subscription', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT id FROM tenant_subscriptions/, [{ id: 1 }])
      .on(/SET status = 'canceled'/, { results: [], meta: { changes: 1 } });

    const res = await mount(adminSubscriptionsRoutes).request(
      post(`${PREFIX}/t1/cancel`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tenantId).toBe('t1');
    expect(body.status).toBe('canceled');
  });

  it('creates a canceled subscription when none exists', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SELECT id FROM tenant_subscriptions/, [])
      .on(/SELECT id FROM subscription_plans/, [{ id: 'plan_free' }])
      .on(/INSERT INTO tenant_subscriptions/, { results: [], meta: { changes: 1 } });

    const res = await mount(adminSubscriptionsRoutes).request(
      post(`${PREFIX}/t1/cancel`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe('canceled');
  });

  it('resumes a canceled subscription', async () => {
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM admins/, [{ is_active: 1 }])
      .on(/SET status = 'active'/, { results: [], meta: { changes: 1 } });

    const res = await mount(adminSubscriptionsRoutes).request(
      post(`${PREFIX}/t1/resume`, { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tenantId).toBe('t1');
    expect(body.status).toBe('active');
  });

  it('rejects unauthenticated cancel (401)', async () => {
    const db = makeRoutingDb();
    const res = await mount(adminSubscriptionsRoutes).request(
      post(`${PREFIX}/t1/cancel`), {}, env(db)
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing or invalid Authorization header');
  });
});