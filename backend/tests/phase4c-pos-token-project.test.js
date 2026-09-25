/**
 * Phase 4c — pos_token projectId claim + scope fallback (Option Y, step 4c).
 *
 * Drives the REAL POS Hono router (`backend/src/routes/pos/index.js`) and the
 * REAL resolveScope dualRealm branch against a REAL SQLite database
 * (better-sqlite3 :memory:) through a minimal D1-compatible shim.
 * `verifyToken`/`verifyPassword`/`generateToken` are stubbed per test (same
 * idiom as phase4b-products-project.test.js); requireAuth runs REAL against
 * the mocked verifyToken on the refresh path.
 *
 * GATE TEST 4: a pre-4c token (no projectId claim) validates on a POS-auth
 * route with default-project scope; a 4c token (projectId claim) works and
 * is enforced. NULL-store login/refresh ⇒ project-assignment error (the
 * silent first-store inherit is removed); claim-vs-record mismatch fails
 * writes closed while reads degrade to the record's project (§6.5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { Hono } from 'hono';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import posRouter from '../src/routes/pos/index.js';
import { resolveScope } from '../src/middleware/resolveScope.js';
import { verifyToken, verifyPassword, generateToken } from '../src/middleware/sharedAuth.js';

const TENANT = 't1';
const DEFAULT_PROJECT = 'p_default';
const CAMP = 'p_camp';
const REST = 'p_rest';

// ─── Real-shaped stub schema (4b order/products path + 4c project bindings)
function buildDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY, tax_rate REAL);
    CREATE TABLE tenant_org_mapping (tenant_id TEXT NOT NULL UNIQUE, organization_id INTEGER NOT NULL UNIQUE);
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT, deleted_at TEXT);
    CREATE TABLE pos_stores (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT);
    CREATE TABLE pos_users (
      id TEXT PRIMARY KEY, organization_id INTEGER NOT NULL,
      store_id INTEGER, project_id TEXT, is_active INTEGER DEFAULT 1, deleted_at TEXT,
      username TEXT, email TEXT, first_name TEXT, last_name TEXT,
      password_hash TEXT, role TEXT, last_login_at TEXT
    );
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT,
      sku TEXT, name TEXT NOT NULL, description TEXT,
      selling_price REAL DEFAULT 0, cost_price REAL DEFAULT 0,
      category_id INTEGER, type TEXT, image_url TEXT,
      is_active INTEGER DEFAULT 1, stock_quantity INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 10, deleted_at TEXT
    );
    CREATE TABLE pos_recipe_ingredients (
      id TEXT PRIMARY KEY, tenant_id TEXT, product_id TEXT, ingredient_id TEXT, quantity REAL
    );
    CREATE TABLE promotions (id TEXT PRIMARY KEY, tenant_id TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT, organization_id INTEGER, store_id INTEGER,
      order_number TEXT, cashier_id TEXT, status TEXT, subtotal REAL, tax_amount REAL,
      tax_rate REAL, total_amount REAL, paid_amount REAL, payment_method TEXT,
      payment_status TEXT, notes TEXT, amount_cash REAL, amount_card REAL,
      idempotency_key TEXT, table_id TEXT, kitchen_status TEXT, tip_amount REAL,
      created_at TEXT, updated_at TEXT, project_id TEXT
    );
    CREATE TABLE pos_transaction_items (
      id TEXT PRIMARY KEY, tenant_id TEXT, order_id TEXT, product_id TEXT,
      quantity INTEGER, unit_price REAL, subtotal REAL, tax_amount REAL,
      total_amount REAL, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE inbox (
      id TEXT PRIMARY KEY, tenant_id TEXT, title TEXT, message TEXT,
      severity TEXT, is_read INTEGER, created_at TEXT
    );
    INSERT INTO pos_organizations (id, tax_rate) VALUES (1, 0.1);
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('t1', 1);
    INSERT INTO projects (id, tenant_id, created_at, deleted_at) VALUES
      ('p_default', 't1', '2026-01-01 00:00:00', NULL),
      ('p_camp', 't1', '2026-02-01 00:00:00', NULL),
      ('p_rest', 't1', '2026-03-01 00:00:00', NULL);
    INSERT INTO pos_stores (id, organization_id, project_id) VALUES (1, 1, 'p_camp'), (2, 1, 'p_rest');
    INSERT INTO pos_users (id, organization_id, store_id, project_id, is_active, deleted_at, username, email, first_name, last_name, password_hash, role) VALUES
      ('cash_camp', 1, 1, NULL, 1, NULL, 'camp_cashier', 'camp@test.com', 'Camp', 'Cashier', 'hash', 'cashier'),
      ('cash_null', 1, NULL, NULL, 1, NULL, 'floater', 'floater@test.com', 'Float', 'Er', 'hash', 'cashier'),
      ('cash_home', 1, NULL, 'p_rest', 1, NULL, 'homie', 'homie@test.com', 'Home', 'ie', 'hash', 'cashier');
    INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, stock_quantity, min_stock_level, is_active, deleted_at) VALUES
      ('prod_camp', 't1', 'p_camp', 'CAMP-1', 'Camp Cola', 5, 10, 10, 1, NULL),
      ('prod_rest', 't1', 'p_rest', 'REST-1', 'Rest Cola', 7, 5, 0, 1, NULL),
      ('prod_default', 't1', 'p_default', 'DEF-1', 'Default Cola', 3, 9, 0, 1, NULL);
  `);
  return sqlite;
}

// ─── Minimal D1-compatible shim (records SQL + binds for predicate assertions)
function wrapD1(sqlite, sqlLog, bindLog) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          bindLog.push({ sql, params });
          const bound = {
            _sql: sql,
            _params: params,
            all: async () => {
              sqlLog.push(sql);
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return { results: s.all(...params) };
              const info = s.run(...params);
              return { results: [], meta: { changes: Number(info.changes) } };
            },
            first: async () => {
              sqlLog.push(sql);
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return s.get(...params) ?? null;
              const info = s.run(...params);
              return info.changes > 0 ? { id: null } : null;
            },
            run: async () => {
              sqlLog.push(sql);
              const info = sqlite.prepare(sql).run(...params);
              return { meta: { changes: Number(info.changes) } };
            },
          };
          return bound;
        },
      };
    },
    batch: async (stmts) => {
      const out = [];
      for (const st of stmts) {
        sqlLog.push(st._sql);
        const s = sqlite.prepare(st._sql);
        if (isRead(st._sql)) out.push({ results: s.all(...st._params) });
        else {
          const info = s.run(...st._params);
          out.push({ meta: { changes: Number(info.changes) } });
        }
      }
      return out;
    },
  };
}

function setup() {
  const sqlite = buildDb();
  const sqlLog = [];
  const bindLog = [];
  const db = wrapD1(sqlite, sqlLog, bindLog);
  return { sqlite, db, sqlLog, bindLog };
}

const authed = (db, method, path, body) =>
  posRouter.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { DB: db, JWT_SECRET: 'secret' }
  );

/** Probe app exposing the dualRealm-resolved scope (GET + POST). */
function buildScopeApp(db) {
  const app = new Hono();
  app.use('*', resolveScope({ dualRealm: true }));
  app.get('/probe', (c) => c.json({ scope: c.get('scope') }));
  app.post('/probe', (c) => c.json({ scope: c.get('scope') }));
  return {
    request: (method, token) =>
      app.request('http://localhost/probe', {
        method,
        headers: { Authorization: 'Bearer t' },
      }, { DB: db, JWT_SECRET: 'secret' }).then(async (res) => ({
        status: res.status,
        body: res.status === 200 ? await res.json() : await res.json(),
      })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 4c — pos_token projectId claim (GATE TEST 4)', () => {
  it('legacy token (no projectId) validates on a POS-auth route with default-project scope', async () => {
    const { db, bindLog } = setup();
    verifyToken.mockResolvedValue({
      userId: 'cash_null', posType: 'pos', tenantId: TENANT, organizationId: 1, role: 'cashier',
    });

    const res = await authed(db, 'GET', '/products');
    const body = await res.json();
    expect(res.status).toBe(200);
    // NULL store + NULL home ⇒ tenant default project (oldest live), NOT tenant-wide.
    expect(body.map((p) => p.id)).toEqual(['prod_default']);

    const readBind = bindLog.find((b) => b.sql.includes('FROM pos_products'));
    expect(readBind.sql).toContain('project_id = ?');
    expect(readBind.params).toEqual([TENANT, DEFAULT_PROJECT]);
  });

  it('legacy token with a home project resolves home over the tenant default', async () => {
    const { db } = setup();
    verifyToken.mockResolvedValue({
      userId: 'cash_home', posType: 'pos', tenantId: TENANT, organizationId: 1, role: 'cashier',
    });

    const res = await authed(db, 'GET', '/products');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.map((p) => p.id)).toEqual(['prod_rest']);
  });

  it('new token (projectId claim) works and is enforced on reads and writes', async () => {
    const { db } = setup();
    verifyToken.mockResolvedValue({
      userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1,
      storeId: 1, role: 'cashier', projectId: CAMP,
    });

    const list = await authed(db, 'GET', '/products');
    const listed = await list.json();
    expect(list.status).toBe(200);
    expect(listed.map((p) => p.id)).toEqual(['prod_camp']);

    // Same-project sale passes (claim agrees with the store record).
    const ok = await authed(db, 'POST', '/orders', {
      items: [{ productId: 'prod_camp', quantity: 1 }], paymentMethod: 'cash',
    });
    expect(ok.status).toBe(200);

    // Cross-project sale misses the predicate (isolation error, unchanged stocks).
    const bad = await authed(db, 'POST', '/orders', {
      items: [{ productId: 'prod_rest', quantity: 1 }], paymentMethod: 'cash',
    });
    const badBody = await bad.json();
    expect(bad.status).toBe(400);
    expect(badBody.error).toContain('Product prod_rest not found');
  });

  it('login mints access+refresh claims carrying the store-bound projectId', async () => {
    const { db } = setup();
    verifyPassword.mockResolvedValue(true);
    generateToken.mockResolvedValue('tok');

    const res = await posRouter.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'camp_cashier', password: 'pass' }),
      }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user.projectId).toBe(CAMP);

    const calls = generateToken.mock.calls;
    expect(calls).toHaveLength(2);
    // Access call carries (claims, secret, 'access', env); refresh carries (claims, secret, 'refresh').
    expect(calls[0][0].projectId).toBe(CAMP);
    expect(calls[0][2]).toBe('access');
    expect(calls[1][0].projectId).toBe(CAMP);
    expect(calls[1][2]).toBe('refresh');
  });

  it('NULL-store login ⇒ 403 project-assignment error, no tokens minted', async () => {
    const { db } = setup();
    verifyPassword.mockResolvedValue(true);
    generateToken.mockResolvedValue('tok');

    const res = await posRouter.fetch(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'floater', password: 'pass' }),
      }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/store assignment/i);
    expect(generateToken).not.toHaveBeenCalled();
  });

  it('refresh re-resolves both dimensions from the DB and distrusts the stale claim', async () => {
    const { sqlite, db } = setup();
    generateToken
      .mockResolvedValueOnce('access-1')
      .mockResolvedValueOnce('refresh-1')
      .mockResolvedValueOnce('access-2')
      .mockResolvedValueOnce('refresh-2');
    // Presented refresh token carries a STALE project (rest) for a cashier
    // whose store still binds camp.
    verifyToken.mockResolvedValue({
      sub: 'cash_camp', userId: 'cash_camp', posType: 'pos', userType: 'org',
      type: 'refresh', tenantId: 'stale-tenant', organizationId: 1, storeId: 1,
      role: 'cashier', projectId: REST,
    });

    const first = await posRouter.fetch(
      new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer stale-rt' },
      }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.user.projectId).toBe(CAMP);
    // Tenant re-resolved from the mapping (not the stale claim), project
    // re-resolved from the store (not the stale rest claim).
    expect(generateToken.mock.calls[0][0].tenantId).toBe(TENANT);
    expect(generateToken.mock.calls[0][0].projectId).toBe(CAMP);

    // Reassign the cashier to the Restaurant store: refresh re-issues
    // corrected claims (changed binding, §6.3).
    sqlite.prepare('UPDATE pos_users SET store_id = 2 WHERE id = ?').run('cash_camp');
    const second = await posRouter.fetch(
      new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer stale-rt' },
      }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.user.projectId).toBe(REST);
    expect(generateToken.mock.calls[2][0].projectId).toBe(REST);
  });

  it('NULL-store refresh ⇒ 403 project-assignment error (removed binding fails closed)', async () => {
    const { sqlite, db } = setup();
    verifyToken.mockResolvedValue({
      sub: 'cash_camp', userId: 'cash_camp', posType: 'pos', userType: 'org',
      type: 'refresh', tenantId: TENANT, organizationId: 1, storeId: 1, role: 'cashier',
    });
    sqlite.prepare('UPDATE pos_users SET store_id = NULL WHERE id = ?').run('cash_camp');

    const res = await posRouter.fetch(
      new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer rt' },
      }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/store assignment/i);
    expect(generateToken).not.toHaveBeenCalled();
  });

  it('claim-vs-record mismatch: writes fail closed, reads degrade to the record (§6.5)', async () => {
    const { sqlite, db } = setup();
    // Cashier reassigned to the Restaurant store, but the presented token
    // still caches the Camp claim.
    sqlite.prepare('UPDATE pos_users SET store_id = 2 WHERE id = ?').run('cash_camp');
    verifyToken.mockResolvedValue({
      userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1,
      storeId: 2, role: 'cashier', projectId: CAMP,
    });

    const write = await authed(db, 'POST', '/orders', {
      items: [{ productId: 'prod_rest', quantity: 1 }], paymentMethod: 'cash',
    });
    const writeBody = await write.json();
    expect(write.status).toBe(403);
    expect(writeBody.error).toMatch(/project scope mismatch/i);

    const read = await authed(db, 'GET', '/products');
    const readBody = await read.json();
    expect(read.status).toBe(200);
    // Reads degrade to the record's project (rest), never the stale claim (camp).
    expect(readBody.map((p) => p.id)).toEqual(['prod_rest']);
  });
});

describe('Phase 4c — resolveScope dualRealm POS project read + guard', () => {
  it('legacy token validates with default-project scope; new token surfaces its claim', async () => {
    const { db } = setup();
    const app = buildScopeApp(db);

    verifyToken.mockResolvedValue({
      userId: 'cash_null', posType: 'pos', tenantId: TENANT, organizationId: 1, role: 'cashier',
    });
    const legacy = await app.request('GET');
    expect(legacy.status).toBe(200);
    expect(legacy.body.scope.tenantId).toBe(TENANT);
    expect(legacy.body.scope.projectId).toBe(DEFAULT_PROJECT);

    verifyToken.mockResolvedValue({
      userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1,
      storeId: 1, role: 'cashier', projectId: CAMP,
    });
    const fresh = await app.request('GET');
    expect(fresh.status).toBe(200);
    expect(fresh.body.scope.projectId).toBe(CAMP);
  });

  it('dualRealm write with a mismatched claim ⇒ 403; read degrades to the record', async () => {
    const { sqlite, db } = setup();
    sqlite.prepare('UPDATE pos_users SET store_id = 2 WHERE id = ?').run('cash_camp');
    const app = buildScopeApp(db);
    verifyToken.mockResolvedValue({
      userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1,
      storeId: 2, role: 'cashier', projectId: CAMP,
    });

    const write = await app.request('POST');
    expect(write.status).toBe(403);

    const read = await app.request('GET');
    expect(read.status).toBe(200);
    expect(read.body.scope.projectId).toBe(REST);
  });
});
