/**
 * Phase 4b — pos_products scoped by project_id (Option Y, step 4b).
 *
 * Drives the REAL POS Hono router (`backend/src/routes/pos/index.js`) against
 * a REAL SQLite database (better-sqlite3 :memory:) through a minimal
 * D1-compatible shim (prepare/bind/all/first/run + batch with meta.changes).
 * `verifyToken` is stubbed per test (same idiom as pos-unit.test.js) so each
 * token shape exercises one resolution arm: store→project (no claim),
 * explicit 4c-style claim, or legacy NULL (tenant-default fallback since 4c).
 *
 * GATE TEST 1 (numeric): seed product X in the Camp project (stock 10), sell
 * 3 via the Camp store ⇒ Camp stock is EXACTLY 7 and the Restaurant row is
 * EXACTLY unchanged (5). Cross-project order ⇒ 400 product-not-found with
 * both stocks bit-identical.
 *
 * Scope honesty: inventory.js adjust/reorder endpoints are NOT touched here
 * (spec scope = routes/pos/index.js only; a later step owns inventory.js).
 * Inside this router, "adjust" = the race-compensation add-back and
 * "reorder" = the low-stock/min-level alert re-read — both carry the
 * predicate and both are proved below (oversell test + inbox assertion).
 * Mismatch semantics (claim vs store record) are 4c's to close — the claim
 * test below keeps claim and store AGREED so no precedence is pinned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import posRouter from '../src/routes/pos/index.js';
import { verifyToken } from '../src/middleware/sharedAuth.js';

const TENANT = 't1';
const CAMP = 'camp1';
const REST = 'rest1';

// ─── Real-shaped stub schema (only columns the POS order/products path touches)
function buildDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY, tax_rate REAL);
    CREATE TABLE pos_stores (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT, deleted_at TEXT);
    CREATE TABLE pos_users (
      id TEXT PRIMARY KEY, organization_id INTEGER NOT NULL,
      store_id INTEGER, project_id TEXT, is_active INTEGER DEFAULT 1, deleted_at TEXT
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
      created_at TEXT, updated_at TEXT
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
    INSERT INTO projects (id, tenant_id, created_at, deleted_at) VALUES
      ('camp1', 't1', '2026-01-01 00:00:00', NULL),
      ('rest1', 't1', '2026-02-01 00:00:00', NULL);
    INSERT INTO pos_stores (id, organization_id, project_id) VALUES (1, 1, 'camp1'), (2, 1, 'rest1');
    INSERT INTO pos_users (id, organization_id, store_id, project_id, is_active, deleted_at) VALUES
      ('cash_camp', 1, 1, NULL, 1, NULL),
      ('cash_rest', 1, 2, NULL, 1, NULL),
      ('cash_legacy', 1, NULL, NULL, 1, NULL),
      ('cash_claim', 1, NULL, NULL, 1, NULL);
    INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, stock_quantity, min_stock_level, is_active, deleted_at) VALUES
      ('prod_camp', 't1', 'camp1', 'CAMP-1', 'Camp Cola', 5, 10, 10, 1, NULL),
      ('prod_rest', 't1', 'rest1', 'REST-1', 'Rest Cola', 7, 5, 0, 1, NULL);
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

const stockOf = (sqlite, id) =>
  sqlite.prepare('SELECT stock_quantity FROM pos_products WHERE id = ?').get(id).stock_quantity;

const postOrder = (db, body) =>
  posRouter.fetch(
    new Request('http://localhost/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
    { DB: db, JWT_SECRET: 'secret' }
  );

const getProducts = (db) =>
  posRouter.fetch(new Request('http://localhost/products', { headers: { Authorization: 'Bearer t' } }), {
    DB: db,
    JWT_SECRET: 'secret',
  });

const campCashier = { userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1, storeId: 1, role: 'cashier' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 4b — pos_products project scoping (GATE 1 numeric)', () => {
  it('sell 3 of Camp X via the Camp store: Camp 10 → 7 exact, Restaurant 5 unchanged exact', async () => {
    const { sqlite, db, sqlLog, bindLog } = setup();
    verifyToken.mockResolvedValue({ ...campCashier });

    const res = await postOrder(db, { items: [{ productId: 'prod_camp', quantity: 3 }], paymentMethod: 'cash' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // 3 × 5 = 15 subtotal + 10% org tax = 16.5 total.
    expect(body.order.totalAmount).toBe(16.5);

    // GATE numbers: exact post-sale states on REAL rows.
    expect(stockOf(sqlite, 'prod_camp')).toBe(7);
    expect(stockOf(sqlite, 'prod_rest')).toBe(5);

    // The product read and the deduction both bound the Camp project.
    const readBind = bindLog.find((b) => b.sql.includes('FROM pos_products') && b.sql.includes('id IN'));
    expect(readBind, 'bulk product read must run').toBeDefined();
    expect(readBind.sql).toContain('project_id = ?');
    expect(readBind.params).toEqual(['prod_camp', TENANT, CAMP]);

    const deductBind = bindLog.find((b) => b.sql.includes('stock_quantity = stock_quantity - ?'));
    expect(deductBind, 'stock deduction must run').toBeDefined();
    expect(deductBind.sql).toContain('project_id = ?');
    expect(deductBind.params).toEqual([3, 'prod_camp', TENANT, CAMP, 3]);

    // Reorder arm: 7 <= min 10 (and > 0) ⇒ one low-stock inbox row for Camp Cola.
    const inbox = sqlite.prepare('SELECT title FROM inbox').all();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].title).toContain('Camp Cola');
    expect(sqlLog.some((s) => s.includes('min_stock_level') && s.includes('project_id = ?'))).toBe(true);

    // Idempotent replay through the SAME key exercises the dedup JOIN with
    // the project binds on real SQL: positional order (project, order, tenant)
    // must resolve the Camp name (wrong order ⇒ NULL name) and must NOT
    // deduct again (stock 7 → 4 on create, stays 4 on replay).
    const firstKeyed = await postOrder(db, {
      items: [{ productId: 'prod_camp', quantity: 3 }],
      paymentMethod: 'cash',
      idempotencyKey: 'gate1-replay',
    });
    expect(firstKeyed.status).toBe(200);
    expect(stockOf(sqlite, 'prod_camp')).toBe(4);
    const again = await postOrder(db, {
      items: [{ productId: 'prod_camp', quantity: 3 }],
      paymentMethod: 'cash',
      idempotencyKey: 'gate1-replay',
    });
    const againBody = await again.json();
    expect(again.status).toBe(200);
    expect(againBody.deduplicated).toBe(true);
    expect(againBody.order.items[0].productName).toBe('Camp Cola');
    expect(stockOf(sqlite, 'prod_camp')).toBe(4);
  });

  it('cross-project order via the Camp store ⇒ 400 product-not-found, both stocks bit-identical', async () => {
    const { sqlite, db } = setup();
    verifyToken.mockResolvedValue({ ...campCashier });

    const res = await postOrder(db, { items: [{ productId: 'prod_rest', quantity: 1 }], paymentMethod: 'cash' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Product prod_rest not found');

    expect(stockOf(sqlite, 'prod_camp')).toBe(10);
    expect(stockOf(sqlite, 'prod_rest')).toBe(5);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pos_transactions').get().n).toBe(0);
  });

  it('GET /products via the Camp store lists only the Camp product', async () => {
    const { db, sqlLog } = setup();
    verifyToken.mockResolvedValue({ ...campCashier });

    const res = await getProducts(db);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.map((p) => p.id)).toEqual(['prod_camp']);
    expect(sqlLog.some((s) => s.includes('FROM pos_products') && s.includes('project_id = ?'))).toBe(true);
  });

  it('explicit projectId claim resolves scope with no store (agrees with the store record)', async () => {
    const { db, bindLog } = setup();
    verifyToken.mockResolvedValue({
      userId: 'cash_claim',
      posType: 'pos',
      tenantId: TENANT,
      organizationId: 1,
      role: 'cashier',
      projectId: CAMP,
    });

    const res = await getProducts(db);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.map((p) => p.id)).toEqual(['prod_camp']);
    const readBind = bindLog.find((b) => b.sql.includes('FROM pos_products'));
    expect(readBind.params).toContain(CAMP);
  });

  it('oversell triggers the race guard: 400, stocks restored exact, compensation carries tenant+project', async () => {
    const { sqlite, db, bindLog } = setup();
    // Two deductions so the guard has a sibling to add back: the product SELF
    // stock (2 < 5, shorts at commit) and one recipe ingredient (passes its
    // pre-read, deducts, then gets compensated). No pre-read guards SELF
    // stock — the conditional UPDATE is the arbiter.
    sqlite.prepare("UPDATE pos_products SET stock_quantity = 2 WHERE id = 'prod_camp'").run();
    sqlite.prepare(
      "INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, stock_quantity, min_stock_level, is_active) VALUES ('ing1', 't1', 'camp1', 'ING-1', 'Camp Milk', 1, 50, 0, 1)"
    ).run();
    sqlite.prepare(
      "INSERT INTO pos_recipe_ingredients (id, tenant_id, product_id, ingredient_id, quantity) VALUES ('ri1', 't1', 'prod_camp', 'ing1', 1)"
    ).run();
    verifyToken.mockResolvedValue({ ...campCashier });

    const res = await postOrder(db, { items: [{ productId: 'prod_camp', quantity: 5 }], paymentMethod: 'cash' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Insufficient stock');

    // Product stock never went negative; the ingredient deduction was added
    // back exactly (50 − 5 + 5); the orphan order was removed.
    expect(stockOf(sqlite, 'prod_camp')).toBe(2);
    expect(stockOf(sqlite, 'ing1')).toBe(50);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pos_transactions').get().n).toBe(0);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pos_transaction_items').get().n).toBe(0);

    const addBack = bindLog.find((b) => b.sql.includes('stock_quantity = stock_quantity + ?'));
    expect(addBack, 'compensation add-back must run').toBeDefined();
    expect(addBack.sql).toContain('tenant_id = ?');
    expect(addBack.sql).toContain('project_id = ?');
    expect(addBack.params).toEqual([5, 'ing1', TENANT, CAMP]);
  });

  it('legacy NULL-store/NULL-project token validates with default-project scope (4c fallback closes tenant-wide)', async () => {
    const { db, bindLog } = setup();
    verifyToken.mockResolvedValue({
      userId: 'cash_legacy',
      posType: 'pos',
      tenantId: TENANT,
      organizationId: 1,
      role: 'cashier',
    });

    const res = await getProducts(db);
    const body = await res.json();
    expect(res.status).toBe(200);
    // No claim, no store, no home ⇒ tenant default project (oldest live =
    // camp1), NOT the tenant-wide list.
    expect(body.map((p) => p.id)).toEqual(['prod_camp']);
    const readBind = bindLog.find((b) => b.sql.includes('FROM pos_products'));
    expect(readBind.sql).toContain('project_id = ?');
    expect(readBind.params).toEqual([TENANT, CAMP]);
  });
});
