/**
 * Feedback API — human-testing debug reports.
 *
 * POST /api/feedback is public (scope-derived tenantId, never client data);
 * GET list/detail + PATCH status are super-admin only (internal feedbackGate
 * enforces the super_admin role inside each handler, mirroring the
 * admin-settings pattern).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import feedbackRoutes, { createFeedback } from '../src/api/feedback.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { generateToken } from '../src/middleware/sharedAuth.js';

const JWT_SECRET = 'test-secret-key-for-feedback';

// ── SQL-routing mock DB (same pattern as admin-supply-unit.test.js) ────────

function makeRoutingDb() {
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

let superAdminToken;
let adminToken;

beforeAll(async () => {
  superAdminToken = await generateToken(
    { sub: 'sa1', userId: 'sa1', id: 'sa1', email: 'super@test.com', role: 'super_admin', tenantId: null, name: 'Super Tester' },
    JWT_SECRET, 'access'
  );
  adminToken = await generateToken(
    { sub: 'a1', userId: 'a1', id: 'a1', email: 'admin@test.com', role: 'admin', tenantId: 't1', name: 'Tenant Admin' },
    JWT_SECRET, 'access'
  );
});

function activeAdminDb() {
  return makeRoutingDb().on(/SELECT is_active FROM admins/, () => ({ results: [{ is_active: 1 }] }));
}

// ── Public POST /api/feedback ──────────────────────────────────────────────

function mountPublic() {
  const app = new Hono();
  const PUBLIC_PREFIX = '/api/feedback';
  const scopeMw = async (c, next) => { c.set('scope', { tenantId: null, user: null }); await next(); };
  app.use(PUBLIC_PREFIX, scopeMw);
  app.post(PUBLIC_PREFIX, (c) => createFeedback(c));
  return app;
}

const validBody = {
  category: 'bug',
  message: 'The save button does nothing on the bookings page',
  personalView: 'It made me lose my changes — feels broken.',
  pageUrl: 'https://acaciacamp.com/admin/bookings',
  authorType: 'admin',
  authorName: 'Test Admin',
  authorEmail: 'admin.test@acaciacamp.com',
  role: 'admin',
  userAgent: 'vitest',
};

describe('POST /api/feedback (public)', () => {
  it('creates a feedback row and returns 201 with the id', async () => {
    const db = makeRoutingDb().on(/INSERT INTO feedback/, () => ({ meta: { changes: 1 } }));
    const res = await mountPublic().request(req('/api/feedback', { method: 'POST', body: JSON.stringify(validBody) }), {}, env(db));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.id).toMatch(/^fb_/);

    const insert = db.statements.find((s) => /INSERT INTO feedback/.test(s.sql));
    expect(insert).toBeDefined();
    const binds = insert.boundBinds;
    expect(binds[1]).toBeNull(); // tenant_id comes only from scope (none here)
    expect(binds[2]).toBe('admin'); // author_type
    expect(binds[7]).toBe('bug'); // category
    expect(binds[9]).toBe(validBody.personalView);
  });

  it('uses the scoped tenantId for tenant-host reports (never the body)', async () => {
    const db = makeRoutingDb().on(/INSERT INTO feedback/, () => ({ meta: { changes: 1 } }));
    const app = new Hono();
    const scopeMw = async (c, next) => { c.set('scope', { tenantId: 'tenant_abc', user: null }); await next(); };
    app.use('/api/feedback', scopeMw);
    app.post('/api/feedback', (c) => createFeedback(c));

    const body = { ...validBody, tenantId: 'attacker-controlled' };
    const res = await app.request(req('/api/feedback', { method: 'POST', body: JSON.stringify(body) }), {}, env(db));
    expect(res.status).toBe(201);

    const insert = db.statements.find((s) => /INSERT INTO feedback/.test(s.sql));
    expect(insert.boundBinds[1]).toBe('tenant_abc');
  });

  it('rejects a missing category or empty message (400)', async () => {
    const db = makeRoutingDb();
    const res = await mountPublic().request(
      req('/api/feedback', { method: 'POST', body: JSON.stringify({ message: '', pageUrl: '/x' }) }), {}, env(db)
    );
    expect(res.status).toBe(400);
  });

  it('rejects an oversized screenshot payload (400)', async () => {
    const db = makeRoutingDb();
    const body = { ...validBody, screenshot: 'data:image/jpeg;base64,' + 'A'.repeat(650_000) };
    const res = await mountPublic().request(
      req('/api/feedback', { method: 'POST', body: JSON.stringify(body) }), {}, env(db)
    );
    expect(res.status).toBe(400);
  });

  it('rejects an invalid category (400)', async () => {
    const db = makeRoutingDb();
    const res = await mountPublic().request(
      req('/api/feedback', { method: 'POST', body: JSON.stringify({ ...validBody, category: 'feature' }) }), {}, env(db)
    );
    expect(res.status).toBe(400);
  });
});

// ── Super-admin router: GET list/detail + PATCH status ─────────────────────

function mountWithGate(router) {
  const app = new Hono();
  const PREFIX = '/api/admin/feedback';
  const gateMw = async (c, next) => {
    const gate = requireAuth({
      realm: 'admin', roles: ['super_admin'], requireTenant: false,
      invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
      realmMismatch: { message: 'Unauthorized: Super Admin access required' },
      insufficientRole: { message: 'Unauthorized: Super Admin access required' },
    });
    const auth = await gate(c.req.raw, c.env);
    if (auth instanceof Response) return auth;
    return next();
  };
  app.use(PREFIX, gateMw);
  app.use(`${PREFIX}/*`, gateMw);
  app.route(PREFIX, router);
  return app;
}

const twoRows = [
  { id: 'fb_1', category: 'bug', message: 'Broken save', status: 'open', created_at: '2026-09-09 10:00:00' },
  { id: 'fb_2', category: 'flow', message: 'Confusing checkout', status: 'open', created_at: '2026-09-09 09:00:00' },
];

describe('Admin feedback router (super admin only)', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const db = activeAdminDb().on(/FROM feedback/, () => ({ results: [], meta: { changes: 0 } }));
    const res = await mountWithGate(feedbackRoutes).request(req('/api/admin/feedback'), {}, env(db));
    expect(res.status).toBe(401);
  });

  it('rejects a non-super_admin token (403)', async () => {
    const db = activeAdminDb().on(/FROM feedback/, () => ({ results: [], meta: { changes: 0 } }));
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback', { headers: authHeaders(adminToken) }), {}, env(db)
    );
    expect(res.status).toBe(403);
  });

  it('lists feedback with pagination and total (screenshot payload omitted)', async () => {
    let callIdx = 0;
    const db = activeAdminDb();
    db.on(/FROM feedback/, (binds) => {
      callIdx++;
      if (callIdx === 1) return { results: twoRows };
      return { results: [{ total: 2 }] };
    });
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback', { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.data[0]).not.toHaveProperty('screenshot');
  });

  it('filters list by status and authorType query params', async () => {
    let callIdx = 0;
    const db = activeAdminDb();
    db.on(/FROM feedback/, () => {
      callIdx++;
      if (callIdx === 1) return { results: [twoRows[0]] };
      return { results: [{ total: 1 }] };
    });
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback?status=open&authorType=admin', { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    expect(res.status).toBe(200);
  });

  it('returns a single report with the screenshot in detail', async () => {
    const db = activeAdminDb().on(/SELECT \* FROM feedback/, (binds) => ({
      results: [{ id: binds[0], screenshot: 'data:image/jpeg;base64,AA==' }],
    }));
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback/fb_1', { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.screenshot).toContain('data:image/jpeg');
  });

  it('returns 404 for an unknown report id', async () => {
    const db = activeAdminDb().on(/SELECT \* FROM feedback/, () => ({ results: [] }));
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback/fb_nope', { headers: authHeaders(superAdminToken) }), {}, env(db)
    );
    expect(res.status).toBe(404);
  });

  it('marks a report resolved with resolver identity + timestamp', async () => {
    const db = activeAdminDb().on(/UPDATE feedback/, () => ({ meta: { changes: 1 } }));
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback/fb_1', {
        method: 'PATCH',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ status: 'resolved' }),
      }), {}, env(db)
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('resolved');
    const update = db.statements.find((s) => /UPDATE feedback/.test(s.sql));
    expect(update.boundBinds[0]).toBe('resolved');
    expect(update.boundBinds[3]).toBe('sa1');
  });

  it('rejects an invalid status value (400)', async () => {
    const db = activeAdminDb();
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback/fb_1', {
        method: 'PATCH',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ status: 'deleted' }),
      }), {}, env(db)
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when PATCH matches no row', async () => {
    const db = activeAdminDb().on(/UPDATE feedback/, () => ({ meta: { changes: 0 } }));
    const res = await mountWithGate(feedbackRoutes).request(
      req('/api/admin/feedback/fb_missing', {
        method: 'PATCH',
        headers: authHeaders(superAdminToken),
        body: JSON.stringify({ status: 'open' }),
      }), {}, env(db)
    );
    expect(res.status).toBe(404);
  });
});