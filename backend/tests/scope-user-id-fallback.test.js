/**
 * scope.user id fallback chain — audit + received_by (+ resolved_by/updated_by).
 *
 * Root cause (GATE-2 walkthrough, staging): scope.user IS the decoded JWT
 * payload (requireAuth/resolveScope set `user = decoded`), and real JWTs
 * carry `userId`/`sub` — never `id`. Every `*.user?.id || 'system'` read
 * therefore always fell back to 'system' (payment_records.received_by,
 * audit_log.user_id, feedback.resolved_by, platform_settings.updated_by).
 *
 * Fix under test (verbatim at each site):
 *   getScope(c).user?.id || 'system'
 *     → getScope(c).user?.userId || getScope(c).user?.sub || 'system'
 *   (same shape for `scope.` / `auth.` accessors).
 *
 * Harness note: mountRouter injects scope directly (auth gate out of scope,
 * the record-payment/pos-tables/audit idiom). Injected users are shaped
 * EXACTLY like decoded JWT payloads ({ sub, userId, role, ... } — what
 * requireAuth puts into scope.user), so these prove real-JWT behavior.
 * feedback + admin-settings own their gates internally, so those sections
 * sign REAL tokens via generateToken and drive the production gates.
 *
 * Per fixed location: JWT with userId → persisted id == userId;
 * JWT with sub only → sub; no/bare user → 'system' (fallback preserved).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import ordersRoutes from '../src/api/orders.js';
import posTablesRoutes from '../src/api/pos-tables.js';
import auditRoutes from '../src/api/audit.js';
import feedbackRoutes from '../src/api/feedback.js';
import { adminSettingsRoutes } from '../src/api/admin-settings.js';
import { generateToken } from '../src/middleware/sharedAuth.js';
import { mountRouter } from './helpers/routerHarness.js';

// ─── Shared fixtures ─────────────────────────────────────────────

// Real-JWT payload shapes: production tokens carry BOTH sub and userId
// (backend/src/routes/pos/index.js mints sub+userId; admin logins likewise).
const JWT_USER = { sub: 'jwt_sub_1', userId: 'jwt_user_1', role: 'admin', tenantId: 't1' };
const SUB_ONLY_USER = { sub: 'jwt_sub_only', role: 'admin', tenantId: 't1' };
const BARE_ADMIN = { role: 'admin' }; // authenticated shape with no id claims → 'system'

// Sequential-prepare mock (record-payment.test.js idiom): records every SQL
// string + bind chain so tests assert WHAT was written.
function seqDb(steps = []) {
  const seen = [];
  const db = {
    prepare: vi.fn((sql) => {
      const ch = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      seen.push({ sql, ch });
      const step = steps[seen.length - 1];
      if (step) step(ch);
      return ch;
    }),
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
  };
  return { db, seen };
}
const sqls = (seen) => seen.map((s) => s.sql);
const binds = (seen, i) => seen[i].ch.bind.mock.calls[0];
// logAudit binds: (id, tenantId, userId, action, entityType, entityId, old, new).
const auditUserIdOf = (seen) => binds(seen, sqls(seen).findIndex((s) => s.includes('INSERT INTO audit_log')))[2];

// Dispatch-on-SQL-substring mock (pos-tables.test.js idiom).
function makeDb(handlers = {}) {
  const db = {
    calls: [],
    batch: vi.fn().mockResolvedValue([]),
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bind: vi.fn((...args) => {
          chain.bindArgs = args;
          return chain;
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      for (const [sub, setup] of Object.entries(handlers)) {
        if (sql.includes(sub)) setup(chain, sql);
      }
      db.calls.push(chain);
      return chain;
    }),
  };
  return db;
}
const findBy = (db, sub) => db.calls.find((c) => c.sql.includes(sub));

// ─── orders.js:604 — kitchen-status audit userId ─────────────────

describe('orders kitchen-status audit (orders.js:604)', () => {
  const mount = (user) =>
    mountRouter(ordersRoutes, { tenantId: 't1', user, basePath: '/api/orders' });

  const kitchenDb = () =>
    seqDb([
      (ch) => ch.first.mockResolvedValue({ id: 'ord_1', kitchen_status: 'pending' }),
    ]);

  const patch = (app, env) =>
    app.request('/api/orders/ord_1/kitchen-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    }, env);

  it('JWT with userId → audit user_id == userId', async () => {
    const { db, seen } = kitchenDb();
    const res = await patch(mount(JWT_USER), { DB: db });
    expect(res.status).toBe(200);
    expect(auditUserIdOf(seen)).toBe('jwt_user_1');
  });

  it('JWT with sub only → audit user_id == sub', async () => {
    const { db, seen } = kitchenDb();
    const res = await patch(mount(SUB_ONLY_USER), { DB: db });
    expect(res.status).toBe(200);
    expect(auditUserIdOf(seen)).toBe('jwt_sub_only');
  });

  it('no user in scope → audit user_id == system (fallback preserved)', async () => {
    const { db, seen } = kitchenDb();
    const res = await patch(mount(null), { DB: db });
    expect(res.status).toBe(200);
    expect(auditUserIdOf(seen)).toBe('system');
  });
});

// ─── orders.js:1282 — record-payment received_by (+ audit) ───────

describe('orders record-payment received_by (orders.js:1282)', () => {
  const mount = (user) =>
    mountRouter(ordersRoutes, { tenantId: 't1', user, basePath: '/api/orders' });

  const paymentDb = () =>
    seqDb([
      (ch) => ch.first.mockResolvedValue({
        id: 'ord_1', total_amount: 200, amount_paid: 0, payment_status: 'pending',
      }),
    ]);

  const post = (app, env) =>
    app.request('/api/orders/ord_1/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 200, method: 'cash' }),
    }, env);

  // INSERT INTO payment_records binds:
  // (id, tenant_id, order_id, amount, method, cash, card, received_by, ...).
  const receivedByBind = (seen) =>
    binds(seen, sqls(seen).findIndex((s) => s.includes('INSERT INTO payment_records')))[7];

  it('JWT with userId → received_by == userId (row + response + audit)', async () => {
    const { db, seen } = paymentDb();
    const res = await post(mount(JWT_USER), { DB: db });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment.receivedBy).toBe('jwt_user_1');
    expect(receivedByBind(seen)).toBe('jwt_user_1');
    expect(auditUserIdOf(seen)).toBe('jwt_user_1');
    const auditArgs = binds(seen, sqls(seen).findIndex((s) => s.includes('INSERT INTO audit_log')));
    expect(JSON.parse(auditArgs[7]).received_by).toBe('jwt_user_1');
  });

  it('JWT with sub only → received_by == sub', async () => {
    const { db, seen } = paymentDb();
    const res = await post(mount(SUB_ONLY_USER), { DB: db });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment.receivedBy).toBe('jwt_sub_only');
    expect(receivedByBind(seen)).toBe('jwt_sub_only');
    expect(auditUserIdOf(seen)).toBe('jwt_sub_only');
  });

  it('no user in scope → received_by == system (fallback preserved)', async () => {
    const { db, seen } = paymentDb();
    const res = await post(mount(null), { DB: db });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment.receivedBy).toBe('system');
    expect(receivedByBind(seen)).toBe('system');
    expect(auditUserIdOf(seen)).toBe('system');
  });
});

// ─── pos-tables.js:154,201,240,271 — table-mutation audit userId ─

describe('pos-tables mutation audit (pos-tables.js:154,201,240,271)', () => {
  const mount = (user) =>
    mountRouter(posTablesRoutes, { tenantId: 'tenant_1', user, basePath: '/api/pos-tables' });

  // assertAdminMutation 401s without a user, so the no-user case cannot reach
  // the audit write; a bare admin (no id claims) exercises the 'system' leg.
  const users = [
    ['JWT with userId', { ...JWT_USER, tenantId: 'tenant_1' }, 'jwt_user_1'],
    ['JWT with sub only', { ...SUB_ONLY_USER, tenantId: 'tenant_1' }, 'jwt_sub_only'],
    ['bare admin (no id claims)', BARE_ADMIN, 'system'],
  ];

  describe.each(users)('%s → audit user_id == %s', (_label, user, expected) => {
    it('POST / create (pos-tables.js:154)', async () => {
      const db = makeDb();
      const res = await mount(user).request('/api/pos-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'T1' }),
      }, { DB: db });
      expect(res.status).toBe(201);
      expect(findBy(db, 'INSERT INTO audit_log').bindArgs[2]).toBe(expected);
    });

    it('PUT /:id update (pos-tables.js:201)', async () => {
      const db = makeDb();
      const res = await mount(user).request('/api/pos-tables/tbl_1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'occupied' }),
      }, { DB: db });
      expect(res.status).toBe(200);
      expect(findBy(db, 'INSERT INTO audit_log').bindArgs[2]).toBe(expected);
    });

    it('PATCH /:id/status (pos-tables.js:240)', async () => {
      const db = makeDb();
      const res = await mount(user).request('/api/pos-tables/tbl_1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'occupied' }),
      }, { DB: db });
      expect(res.status).toBe(200);
      expect(findBy(db, 'INSERT INTO audit_log').bindArgs[2]).toBe(expected);
    });

    it('DELETE /:id (pos-tables.js:271)', async () => {
      const db = makeDb();
      const res = await mount(user).request('/api/pos-tables/tbl_1', {
        method: 'DELETE',
      }, { DB: db });
      expect(res.status).toBe(200);
      expect(findBy(db, 'INSERT INTO audit_log').bindArgs[2]).toBe(expected);
    });
  });
});

// ─── audit.js:179 — POST escape-hatch default user_id ────────────

describe('audit POST default user_id (audit.js:179)', () => {
  // Recording mock: audit POST only runs logAudit's INSERT (row id 'audit_*').
  function recDb() {
    const seen = [];
    return {
      seen,
      prepare: vi.fn((sql) => {
        const chain = {
          bind: vi.fn((...args) => {
            seen.push({ sql, binds: args });
            return chain;
          }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
        return chain;
      }),
    };
  }

  const SUPER = { sub: 'jwt_sub_1', userId: 'jwt_user_1', role: 'super_admin' };
  const SUPER_SUB_ONLY = { sub: 'jwt_sub_only', role: 'super_admin' };
  const SUPER_BARE = { role: 'super_admin' };

  const post = (db, user, body) => {
    const app = mountRouter(auditRoutes, { basePath: '/api/audit', user, tenantId: 'tee1' });
    return app.request('http://localhost/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, { DB: db });
  };
  const validBody = { action: 'create', entity_type: 'tenant', entity_id: 'e1' };
  const userIdOf = (db) =>
    db.seen.find((s) => s.sql.includes('INSERT INTO audit_log')).binds[2];

  it('JWT with userId → user_id == userId', async () => {
    const db = recDb();
    const res = await post(db, SUPER, validBody);
    expect(res.status).toBe(200);
    expect(userIdOf(db)).toBe('jwt_user_1');
  });

  it('JWT with sub only → user_id == sub', async () => {
    const db = recDb();
    const res = await post(db, SUPER_SUB_ONLY, validBody);
    expect(res.status).toBe(200);
    expect(userIdOf(db)).toBe('jwt_sub_only');
  });

  it('bare super_admin (no id claims) → user_id == system (fallback preserved)', async () => {
    const db = recDb();
    const res = await post(db, SUPER_BARE, validBody);
    expect(res.status).toBe(200);
    expect(userIdOf(db)).toBe('system');
  });

  it('explicit user_id body param still wins (precedence preserved)', async () => {
    const db = recDb();
    const res = await post(db, SUPER, { ...validBody, user_id: 'explicit_u' });
    expect(res.status).toBe(200);
    expect(userIdOf(db)).toBe('explicit_u');
  });
});

// ─── feedback.js:183 — PATCH resolved_by (REAL signed tokens) ───

describe('feedback PATCH resolved_by (feedback.js:183)', () => {
  const SECRET = 'test-secret-scope-user-id-fallback';

  let tokenBoth;
  let tokenSubOnly;
  beforeAll(async () => {
    tokenBoth = await generateToken(
      { sub: 'fb_sub', userId: 'fb_user', email: 's@x.com', role: 'super_admin', tenantId: null },
      SECRET, 'access',
    );
    tokenSubOnly = await generateToken(
      { sub: 'fb_solo', email: 's@x.com', role: 'super_admin', tenantId: null },
      SECRET, 'access',
    );
  });

  // Routing mock (feedback.test.js idiom): is_active probe + UPDATE capture.
  function fbDb() {
    const db = {
      prepare: vi.fn((sql) => {
        const stmt = {
          sql,
          bind: vi.fn((...b) => { stmt.boundBinds = b; return stmt; }),
          boundBinds: [],
          all: vi.fn(async () => ({ results: [], meta: { changes: 0 } })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        };
        db.statements.push(stmt);
        return stmt;
      }),
      batch: vi.fn(async () => []),
      statements: [],
    };
    return db;
  }

  function fbDbWithActive() {
    const db = fbDb();
    const origPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const stmt = origPrepare(sql);
      if (/SELECT is_active FROM admins/.test(sql)) {
        stmt.all = vi.fn(async () => ({ results: [{ is_active: 1 }] }));
        stmt.first = vi.fn(async () => ({ is_active: 1 }));
      }
      return stmt;
    });
    return db;
  }

  const mountAdmin = () => {
    const app = new Hono();
    app.route('/api/admin/feedback', feedbackRoutes);
    return app;
  };

  const patch = (app, db, token) =>
    app.request('http://localhost/api/admin/feedback/fb_1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ status: 'resolved' }),
    }, { DB: db, JWT_SECRET: SECRET });

  // UPDATE feedback binds: (status, status, status, resolved_by, id).
  const resolvedByOf = (db) =>
    db.statements.find((s) => /UPDATE feedback/.test(s.sql)).boundBinds[3];

  it('JWT with userId → resolved_by == userId', async () => {
    const db = fbDbWithActive();
    const res = await patch(mountAdmin(), db, tokenBoth);
    expect(res.status).toBe(200);
    expect(resolvedByOf(db)).toBe('fb_user');
  });

  it('JWT with sub only → resolved_by == sub', async () => {
    const db = fbDbWithActive();
    const res = await patch(mountAdmin(), db, tokenSubOnly);
    expect(res.status).toBe(200);
    expect(resolvedByOf(db)).toBe('fb_solo');
  });

  it('no token → 401 (gate rejects before the fallback)', async () => {
    const db = fbDbWithActive();
    const res = await patch(mountAdmin(), db, null);
    expect(res.status).toBe(401);
  });
});

// ─── admin-settings.js:198,265 — PUT updated_by (REAL signed tokens) ──

describe('admin-settings PUT updated_by (admin-settings.js:198,265)', () => {
  const SECRET = 'test-secret-scope-user-id-fallback';

  let tokenBoth;
  let tokenSubOnly;
  let tokenBare;
  beforeAll(async () => {
    tokenBoth = await generateToken(
      { sub: 'sa_sub', userId: 'sa_user', email: 's@x.com', role: 'super_admin', tenantId: null },
      SECRET, 'access',
    );
    tokenSubOnly = await generateToken(
      { sub: 'sa_solo', email: 's@x.com', role: 'super_admin', tenantId: null },
      SECRET, 'access',
    );
    tokenBare = await generateToken(
      { email: 's@x.com', role: 'super_admin', tenantId: null },
      SECRET, 'access',
    );
  });

  const SETTINGS_ROW = {
    id: 1,
    feature_flags: JSON.stringify({ financials: false }),
    email_templates: JSON.stringify({}),
    defaults: JSON.stringify({}),
    branding: JSON.stringify({}),
    payment: JSON.stringify({}),
  };

  // Routing mock: gate probe + settings reads + UPDATE capture.
  // NOTE: isActiveAdmin() consumes `.all()` (not `.first()`), so the probe
  // row must be served on both.
  function settingsDb() {
    const seen = [];
    const activeResults = { results: [{ is_active: 1 }] };
    const db = {
      seen,
      prepare: vi.fn((sql) => {
        const stmt = {
          sql,
          bind: vi.fn((...b) => {
            seen.push({ sql, binds: b });
            return stmt;
          }),
          all: vi.fn(async () => {
            if (/SELECT is_active FROM admins/.test(sql)) return activeResults;
            return { results: [] };
          }),
          first: vi.fn(async () => {
            if (/SELECT is_active FROM admins/.test(sql)) return { is_active: 1 };
            if (/SELECT id FROM platform_settings/.test(sql)) return { id: 1 };
            if (/SELECT feature_flags FROM platform_settings/.test(sql)) {
              return { feature_flags: SETTINGS_ROW.feature_flags };
            }
            if (/SELECT/.test(sql) && /platform_settings/.test(sql)) return { ...SETTINGS_ROW };
            return null;
          }),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        };
        return stmt;
      }),
    };
    return db;
  }

  // Mounted at '/' like admin-settings-payment.test.js (proven shape).
  const mountSettings = () => {
    const app = new Hono();
    app.route('/', adminSettingsRoutes);
    return app;
  };

  const put = (app, db, path, token, body) =>
    app.request(path, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }, { DB: db, JWT_SECRET: SECRET });

  // PUT / binds: (flags, email, defaults, branding, payment, updated_by).
  // PUT /feature-flags/:id binds: (flagsJson, updated_by).
  const updateBindsOf = (db) => db.seen.find((s) => /UPDATE platform_settings/.test(s.sql)).binds;

  describe.each([
    ['JWT with userId', 'userId-shaped token', 'sa_user'],
    ['JWT with sub only', 'sub-only token', 'sa_solo'],
    ['bare token (no id claims)', 'id-less token', 'system'],
  ])('%s → updated_by == %s', (_label, _t, expected) => {
    const tokenFor = (label) =>
      label === 'JWT with userId' ? tokenBoth : label === 'JWT with sub only' ? tokenSubOnly : tokenBare;

    it('PUT / full settings (admin-settings.js:198)', async () => {
      const db = settingsDb();
      const res = await put(mountSettings(), db, '/', tokenFor(_label), {
        branding: { platformName: 'Scope Test' },
      });
      expect(res.status).toBe(200);
      expect(updateBindsOf(db)[5]).toBe(expected);
    });

    it('PUT /feature-flags/:id (admin-settings.js:265)', async () => {
      const db = settingsDb();
      const res = await put(mountSettings(), db, '/feature-flags/financials', tokenFor(_label), {
        enabled: true,
      });
      expect(res.status).toBe(200);
      expect(updateBindsOf(db)[1]).toBe(expected);
    });
  });
});
