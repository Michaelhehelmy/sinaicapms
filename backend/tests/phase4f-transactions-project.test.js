/**
 * Phase 4f — pos_transactions.project_id stamped on every insert.
 *
 * Drives the REAL routers (`routes/pos/index.js`, `api/orders.js`,
 * `api/reservations.js`, `api/reports.js`) against REAL SQLite
 * (better-sqlite3 :memory:) through a minimal D1-compatible shim (same idiom
 * as phase4b/4c/4e; `first()` goes through `.get()` so INSERT...RETURNING
 * customer upserts resolve). `verifyToken` is stubbed per test.
 *
 * Production INSERT sites (grep `INSERT INTO pos_transactions backend/src` —
 * exactly 3, all stamped, project_id appended LAST so legacy positional binds
 * org @2 / store @3 are untouched):
 *   1. routes/pos/index.js sale — stamps the request scope projectId
 *      (claim → store→project → home → default; NULL = legacy tenant-wide).
 *   2. api/orders.js meal-plan mirror — stamps the line product's project
 *      (each mirror header covers exactly one product ⇒ single-project).
 *   3. api/reservations.js meal-plan mirror — same contract as (2).
 * Non-sites verified by grep: Paymob webhook/services read only; record-payment
 * writes payment_records (untouched per spec); no void/refund writer exists
 * (BACKLOG_VOID_REFUND.md notwithstanding — grep for a void route is empty).
 *
 * No migration: pos_transactions.project_id exists since 0100 and stays
 * NULLABLE by design (D3 one-payment header — NULL = multi-project payment,
 * design §3 rows 6-7 / §3.5). Rollback = revert single commit (GATE 6).
 *
 * GATE 3: legacy count query — every legacy txn carries project_id or a
 *   documented NULL reason (exact numbers asserted).
 * GATE 5: cross-tenant leak check — A cashier sees zero B rows (exact counts).
 * F-003: top-products + revenue-breakdown aggregate project-tagged rows
 *   (order_id join intact — reports.js logic untouched).
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
import ordersRoutes from '../src/api/orders.js';
import reservationsRoutes from '../src/api/reservations.js';
import reportsRoutes from '../src/api/reports.js';
import { verifyToken } from '../src/middleware/sharedAuth.js';
import { mountRouter } from './helpers/routerHarness.js';

const future = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
};

// ─── D1-compatible shim (4b idiom; first() resolves RETURNING via .get()) ───
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
              // .get() serves SELECT rows AND INSERT...RETURNING rows
              // (plain writes without RETURNING yield undefined → null).
              return sqlite.prepare(sql).get(...params) ?? null;
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

// ─── POS schema (real-shaped; pos_transactions carries project_id) ───
const POS_TXN_COLS = `
  id TEXT PRIMARY KEY, tenant_id TEXT, organization_id INTEGER, store_id INTEGER,
  order_number TEXT, cashier_id TEXT, status TEXT, subtotal REAL, tax_amount REAL,
  tax_rate REAL, total_amount REAL, paid_amount REAL, payment_method TEXT,
  payment_status TEXT, notes TEXT, amount_cash REAL, amount_card REAL,
  idempotency_key TEXT, table_id TEXT, kitchen_status TEXT, tip_amount REAL,
  created_at TEXT, updated_at TEXT, project_id TEXT
`;

function buildPosDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY, tax_rate REAL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT, deleted_at TEXT, min_stay INTEGER, max_stay INTEGER);
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
    CREATE TABLE pos_transactions (${POS_TXN_COLS});
    CREATE TABLE pos_transaction_items (
      id TEXT PRIMARY KEY, tenant_id TEXT, order_id TEXT, product_id TEXT,
      quantity INTEGER, unit_price REAL, subtotal REAL, tax_amount REAL,
      total_amount REAL, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE pos_shifts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cashier_id TEXT NOT NULL,
      store_id INTEGER, status TEXT NOT NULL DEFAULT 'open',
      opening_time TEXT NOT NULL DEFAULT (datetime('now')), closing_time TEXT,
      opening_cash REAL NOT NULL DEFAULT 0.0,
      expected_closing_cash REAL NOT NULL DEFAULT 0.0,
      actual_closing_cash REAL, notes TEXT
    );
    CREATE TABLE inbox (
      id TEXT PRIMARY KEY, tenant_id TEXT, title TEXT, message TEXT,
      severity TEXT, is_read INTEGER, created_at TEXT
    );
    -- Tenant A: two projects, one store each, one cashier each, one product each.
    INSERT INTO pos_organizations (id, tax_rate) VALUES (1, 0.1), (2, 0.1), (9, 0.1);
    INSERT INTO projects (id, tenant_id, created_at, deleted_at) VALUES
      ('pA1', 'tA', '2026-01-01 00:00:00', NULL),
      ('pA2', 'tA', '2026-02-01 00:00:00', NULL),
      ('pB', 'tB', '2026-01-01 00:00:00', NULL);
    INSERT INTO pos_stores (id, organization_id, project_id) VALUES
      (11, 1, 'pA1'), (12, 1, 'pA2'), (21, 2, 'pB'), (91, 9, NULL);
    INSERT INTO pos_users (id, organization_id, store_id, project_id, is_active, deleted_at) VALUES
      ('cashA1', 1, 11, NULL, 1, NULL),
      ('cashA2', 1, 12, NULL, 1, NULL),
      ('cashB1', 2, 21, NULL, 1, NULL),
      ('cashLeg', 9, NULL, NULL, 1, NULL);
    INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, stock_quantity, min_stock_level, is_active, deleted_at) VALUES
      ('prodA1', 'tA', 'pA1', 'A1', 'A Cola', 5, 10, 0, 1, NULL),
      ('prodA2', 'tA', 'pA2', 'A2', 'A Tea', 7, 5, 0, 1, NULL),
      ('prodB1', 'tB', 'pB', 'B1', 'B Cola', 7, 5, 0, 1, NULL),
      ('prodLeg', 'tL', NULL, 'LEG', 'Legacy Soda', 3, 10, 0, 1, NULL);
  `);
  return sqlite;
}

// ─── Booking schema (orders + reservations mirrors) ───
function buildBookingDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE customers (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE UNIQUE INDEX idx_customers_tenant_email ON customers(tenant_id, email)
      WHERE email IS NOT NULL AND email != '';
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT, deleted_at TEXT, min_stay INTEGER, max_stay INTEGER);
    CREATE TABLE rooms_new (id TEXT PRIMARY KEY, camp_id TEXT, product_id TEXT, max_guests INTEGER);
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id INTEGER,
      project_id TEXT, name TEXT NOT NULL, selling_price REAL DEFAULT 0, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE rate_plans_new (
      id TEXT PRIMARY KEY, tenant_id TEXT, product_id TEXT,
      price_per_night REAL, start_date TEXT, end_date TEXT, season TEXT
    );
    CREATE TABLE price_overrides (product_id TEXT, date TEXT, price REAL);
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, camp_id TEXT, room_id TEXT,
      customer_id TEXT, order_state_id TEXT, check_in_date TEXT, check_out_date TEXT,
      number_of_people INTEGER, total_amount REAL, amount_paid REAL,
      payment_method TEXT, payment_status TEXT, payment_intent_id TEXT,
      reference TEXT, notes TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, type TEXT, reference_id TEXT,
      name TEXT, quantity INTEGER, unit_price REAL, total_price REAL,
      created_at TEXT, project_id TEXT
    );
    CREATE TABLE tenant_org_mapping (tenant_id TEXT NOT NULL UNIQUE, organization_id INTEGER NOT NULL UNIQUE);
    CREATE TABLE pos_stores (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT);
    CREATE TABLE pos_transactions (${POS_TXN_COLS});
    INSERT INTO projects (id, tenant_id, created_at, deleted_at) VALUES
      ('pA1', 'tA', '2026-01-01 00:00:00', NULL),
      ('pA2', 'tA', '2026-02-01 00:00:00', NULL);
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('tA', 1);
    INSERT INTO pos_stores (id, organization_id, project_id) VALUES (11, 1, 'pA1');
    INSERT INTO rooms_new (id, camp_id, product_id, max_guests) VALUES
      ('roomA1', 'pA1', 'roomprod', 4);
    INSERT INTO pos_products (id, tenant_id, organization_id, project_id, name, selling_price, is_active) VALUES
      ('roomprod', 'tA', 1, 'pA1', 'Room Night', 200, 1),
      ('mpA1', 'tA', 1, 'pA1', 'Camp Breakfast', 50, 1),
      ('mpA2', 'tA', 1, 'pA2', 'Rest Dinner', 30, 1);
  `);
  return sqlite;
}

// ─── Reports schema (F-003 idiom + project_id on the header) ───
function buildReportsDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id INTEGER NOT NULL,
      project_id TEXT, name TEXT NOT NULL, type TEXT DEFAULT 'retail'
    );
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT,
      status TEXT DEFAULT 'completed', payment_method TEXT,
      total_amount REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pos_transaction_items (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL,
      transaction_id TEXT, product_id TEXT NOT NULL, quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, total_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, order_state_id TEXT DEFAULT 'confirmed'
    );
  `);
  return sqlite;
}

function setup(sqlite) {
  const sqlLog = [];
  const bindLog = [];
  return { sqlite, db: wrapD1(sqlite, sqlLog, bindLog), sqlLog, bindLog };
}

const posPost = (db, path, body, token = 't') =>
  posRouter.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
    { DB: db, JWT_SECRET: 'secret' }
  );

const posGet = (db, path) =>
  posRouter.fetch(new Request(`http://localhost${path}`, { headers: { Authorization: 'Bearer t' } }), {
    DB: db,
    JWT_SECRET: 'secret',
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 4f — sale header stamps the request scope project', () => {
  it('scoped Camp sale ⇒ header project_id = pA1 exact (SQL carries project_id, legacy binds @2/@3 untouched)', async () => {
    const { sqlite, db, bindLog } = setup(buildPosDb());
    // Claim AGREES with the store record (11 → pA1): no 403, scope = pA1.
    verifyToken.mockResolvedValue({
      userId: 'cashA1', posType: 'pos', tenantId: 'tA', organizationId: 1,
      storeId: 11, projectId: 'pA1', role: 'cashier',
    });

    const res = await posPost(db, '/orders', { items: [{ productId: 'prodA1', quantity: 2 }], paymentMethod: 'cash' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.order.totalAmount).toBe(11); // 2 × 5 + 10% tax

    const row = sqlite.prepare('SELECT project_id, store_id, organization_id FROM pos_transactions').get();
    expect(row.project_id).toBe('pA1');
    expect(row.store_id).toBe(11);
    expect(row.organization_id).toBe(1);

    const txnBind = bindLog.find((b) => b.sql.includes('INSERT INTO pos_transactions'));
    expect(txnBind, 'sale INSERT must run').toBeDefined();
    expect(txnBind.sql).toContain('project_id');
    // project_id appended LAST — legacy positional binds pinned:
    expect(txnBind.params[2]).toBe(1);
    expect(txnBind.params[3]).toBe(11);
    expect(txnBind.params[txnBind.params.length - 1]).toBe('pA1');
  });

  it('legacy NULL-scope sale (no store, no home, no tenant default) ⇒ header NULL with documented reason', async () => {
    const { sqlite, db } = setup(buildPosDb());
    // Pre-4c token shape: no storeId, no projectId; tenant tL owns NO project
    // row ⇒ store→project NULL, home NULL, tenant-default NULL ⇒ scope NULL.
    verifyToken.mockResolvedValue({
      userId: 'cashLeg', posType: 'pos', tenantId: 'tL', organizationId: 9, role: 'cashier',
    });

    const res = await posPost(db, '/orders', { items: [{ productId: 'prodLeg', quantity: 1 }], paymentMethod: 'cash' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const row = sqlite.prepare("SELECT project_id FROM pos_transactions WHERE tenant_id = 'tL'").get();
    // NULL reason (D3 §3.5): legacy tenant-wide token, no resolvable project —
    // the sale may span projects, so a single-project tag would be a lie.
    expect(row.project_id).toBeNull();
  });
});

describe('Phase 4f — meal-plan mirrors stamp the line product project', () => {
  const inDates = () => ({ checkInDate: future(30), checkOutDate: future(32) });

  it('orders.js mirror: one header per product, each tagged with its own project (pA1 + pA2 exact)', async () => {
    const { sqlite, db, bindLog } = setup(buildBookingDb());
    const app = mountRouter(ordersRoutes, { tenantId: 'tA', basePath: '/api/orders' });

    const res = await app.request(
      'http://localhost/api/orders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campId: 'pA1', roomId: 'roomA1', guestName: 'Gate Guest',
          guestEmail: 'gate@test.com', numberOfPeople: 1, ...inDates(),
          mealPlans: [
            { productId: 'mpA1', quantity: 1 },
            { productId: 'mpA2', quantity: 2 },
          ],
        }),
      },
      { DB: db }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const mirrors = sqlite
      .prepare('SELECT order_number, project_id, paid_amount, payment_status, notes FROM pos_transactions ORDER BY rowid')
      .all();
    expect(mirrors).toHaveLength(2);
    // Both headers share the booking MP- reference; per-line tags differ.
    expect(mirrors[0].order_number).toMatch(/^MP-/);
    expect(mirrors[1].order_number).toBe(mirrors[0].order_number);
    expect(mirrors[0].project_id).toBe('pA1');
    expect(mirrors[0].paid_amount).toBe(50);
    expect(mirrors[1].project_id).toBe('pA2');
    expect(mirrors[1].paid_amount).toBe(60);
    // 4f bind fix: paid_amount carries the line total (fully-paid mirror),
    // notes carries the label — pre-fix the note landed in paid_amount.
    for (const m of mirrors) {
      expect(m.payment_status).toBe('completed');
      expect(String(m.notes)).toMatch(/^Meal plan for booking ORD-/);
    }

    const mirrorBind = bindLog.find((b) => b.sql.includes('INSERT INTO pos_transactions'));
    expect(mirrorBind, 'mirror INSERT must run').toBeDefined();
    expect(mirrorBind.sql).toContain('project_id');
  });

  it('reservations.js mirror: header tagged with the meal product project (pA1 exact)', async () => {
    const { sqlite, db, bindLog } = setup(buildBookingDb());
    const app = mountRouter(reservationsRoutes, { tenantId: 'tA', basePath: '/api/public/reservations' });

    const res = await app.request(
      'http://localhost/api/public/reservations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: 'roomA1', ...inDates(), numberOfPeople: 1,
          guestName: 'Res Guest', guestEmail: 'res@test.com',
          items: [{ productId: 'mpA1', quantity: 1 }],
        }),
      },
      { DB: db }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const mirrors = sqlite.prepare('SELECT project_id, paid_amount, notes FROM pos_transactions').all();
    expect(mirrors).toHaveLength(1);
    expect(mirrors[0].project_id).toBe('pA1');
    expect(mirrors[0].paid_amount).toBe(50);
    expect(String(mirrors[0].notes)).toMatch(/^Meal plan for booking ORD-/);

    const mirrorBind = bindLog.find((b) => b.sql.includes('INSERT INTO pos_transactions'));
    expect(mirrorBind, 'mirror INSERT must run').toBeDefined();
    expect(mirrorBind.sql).toContain('project_id');
    expect(mirrorBind.params[mirrorBind.params.length - 1]).toBe('pA1');
  });
});

describe('Phase 4f — F-003 reports aggregate project-tagged rows (join intact)', () => {
  it('top-products + revenue-breakdown surface tagged AND legacy rows with exact numbers', async () => {
    const sqlite = buildReportsDb();
    const { db } = setup(sqlite);
    const app = mountRouter(reportsRoutes, { tenantId: 't_rpt', basePath: '/api/reports' });

    sqlite.prepare(
      `INSERT INTO pos_products (id, tenant_id, organization_id, project_id, name, type)
       VALUES ('prod_tag', 't_rpt', 1, 'pA1', 'Tagged Koshary', 'menu'),
              ('prod_leg', 't_rpt', 1, NULL, 'Legacy Tea', 'retail')`
    ).run();
    // Tagged header (post-4f stamp) + legacy NULL header (pre-4f row).
    sqlite.prepare(
      `INSERT INTO pos_transactions (id, tenant_id, project_id, status, payment_method, total_amount, created_at)
       VALUES ('txn_tag', 't_rpt', 'pA1', 'completed', 'cash', 200, datetime('now')),
              ('txn_leg', 't_rpt', NULL, 'completed', 'cash', 50, datetime('now'))`
    ).run();
    sqlite.prepare(
      `INSERT INTO pos_transaction_items
         (id, tenant_id, order_id, product_id, quantity, unit_price, subtotal, tax_amount, total_amount, created_at, updated_at)
       VALUES ('item_tag', 't_rpt', 'txn_tag', 'prod_tag', 2, 100, 200, 0, 200, datetime('now'), datetime('now')),
              ('item_leg', 't_rpt', 'txn_leg', 'prod_leg', 1, 50, 50, 0, 50, datetime('now'), datetime('now'))`
    ).run();

    const topRes = await app.request(
      'http://localhost/api/reports/top-products?days=30&limit=10',
      { method: 'GET' },
      { DB: db }
    );
    expect(topRes.status).toBe(200);
    const top = await topRes.json();
    const menu = top.topProducts.find((p) => p.id === 'prod_tag');
    expect(menu).toBeDefined();
    expect(Number(menu.totalQty)).toBe(2);
    expect(Number(menu.totalRevenue)).toBe(200);
    expect(Number(menu.orderCount)).toBe(1);
    const retail = top.topProducts.find((p) => p.id === 'prod_leg');
    expect(retail).toBeDefined();
    expect(Number(retail.totalRevenue)).toBe(50);

    const revRes = await app.request(
      'http://localhost/api/reports/revenue-breakdown?days=30',
      { method: 'GET' },
      { DB: db }
    );
    expect(revRes.status).toBe(200);
    const rev = await revRes.json();
    const byType = Object.fromEntries(rev.byProductType.map((r) => [r.type, Number(r.revenue)]));
    expect(byType).toEqual({ menu: 200, retail: 50 });
    const cash = rev.byPaymentMethod.find((r) => r.method === 'cash');
    expect(Number(cash.revenue)).toBe(250);
    expect(Number(cash.count)).toBe(2);
  });
});

describe('Phase 4f — GATE 3 legacy count query (exact numbers + NULL reasons)', () => {
  it('every legacy txn carries project_id or a documented NULL reason', async () => {
    const { sqlite, db } = setup(buildPosDb());
    // One pre-4f backfill residual, written directly (no stamp existed).
    sqlite.prepare(
      `INSERT INTO pos_transactions (id, tenant_id, organization_id, store_id, order_number, cashier_id,
        status, total_amount, created_at, project_id)
       VALUES ('txn_legacy_null', 'tA', 1, 11, 'ORD-LEGACY', 'cashA1', 'completed', 100, datetime('now'), NULL)`
    ).run();

    // One post-4f scoped sale (tagged) + one legacy NULL-scope sale (NULL).
    verifyToken.mockResolvedValue({
      userId: 'cashA1', posType: 'pos', tenantId: 'tA', organizationId: 1,
      storeId: 11, projectId: 'pA1', role: 'cashier',
    });
    const tagged = await posPost(db, '/orders', { items: [{ productId: 'prodA1', quantity: 1 }], paymentMethod: 'cash' });
    expect(tagged.status).toBe(200);
    const taggedId = (await tagged.json()).order.id;

    verifyToken.mockResolvedValue({
      userId: 'cashLeg', posType: 'pos', tenantId: 'tL', organizationId: 9, role: 'cashier',
    });
    const legacy = await posPost(db, '/orders', { items: [{ productId: 'prodLeg', quantity: 1 }], paymentMethod: 'cash' });
    expect(legacy.status).toBe(200);
    const legacyId = (await legacy.json()).order.id;

    // GATE 3 count query — exact numbers.
    const counts = sqlite
      .prepare('SELECT project_id, COUNT(*) AS n FROM pos_transactions GROUP BY project_id ORDER BY project_id')
      .all();
    expect(counts).toEqual([
      { project_id: null, n: 2 },
      { project_id: 'pA1', n: 1 },
    ]);

    // Every NULL row maps to a documented reason — no unexplained NULLs.
    const nullIds = sqlite
      .prepare('SELECT id FROM pos_transactions WHERE project_id IS NULL ORDER BY id')
      .all()
      .map((r) => r.id);
    const NULL_REASONS = {
      txn_legacy_null: 'pre-4f backfill residual (tenant-wide token era; 0105 first-line derivation found no lines)',
      [legacyId]: 'legacy NULL-scope sale (pre-4c token: no store binding, no home tag, no tenant default)',
    };
    expect(nullIds.sort()).toEqual(['txn_legacy_null', legacyId].sort());
    for (const id of nullIds) expect(NULL_REASONS[id], `NULL reason missing for ${id}`).toBeDefined();

    // The tagged row is exactly the scoped sale.
    const taggedRow = sqlite.prepare('SELECT id FROM pos_transactions WHERE project_id = ?').get('pA1');
    expect(taggedRow.id).toBe(taggedId);
  });
});

describe('Phase 4f — GATE 5 cross-tenant leak check (exact counts)', () => {
  const tokenA = {
    userId: 'cashA1', posType: 'pos', tenantId: 'tA', organizationId: 1,
    storeId: 11, projectId: 'pA1', role: 'cashier',
  };
  const tokenB = {
    userId: 'cashB1', posType: 'pos', tenantId: 'tB', organizationId: 2,
    storeId: 21, projectId: 'pB', role: 'cashier',
  };

  it('A cashier sees zero B rows: products 1/0, orders total 1, B order 404, active shift is A-only', async () => {
    const { sqlite, db } = setup(buildPosDb());
    // B's completed sale, seeded directly (tagged pB — the stamp B's own terminal writes).
    sqlite.prepare(
      `INSERT INTO pos_transactions (id, tenant_id, organization_id, store_id, order_number, cashier_id,
        status, total_amount, created_at, project_id)
       VALUES ('txn_B1', 'tB', 2, 21, 'ORD-B1', 'cashB1', 'completed', 70, datetime('now'), 'pB')`
    ).run();
    // B's open shift on B's store (decoy for the same-store predicate).
    sqlite.prepare(
      `INSERT INTO pos_shifts (id, tenant_id, cashier_id, store_id, status, opening_cash)
       VALUES ('sh_B1', 'tB', 'cashB1', 21, 'open', 0)`
    ).run();

    // A sells through its own terminal (stamped pA1).
    verifyToken.mockResolvedValue({ ...tokenA });
    const sale = await posPost(db, '/orders', { items: [{ productId: 'prodA1', quantity: 1 }], paymentMethod: 'cash' });
    expect(sale.status).toBe(200);

    // Products: A sees exactly its own two... no — exactly prodA1+prodA2? The
    // project predicate scopes the list to pA1 ⇒ exactly 1 row, zero B rows.
    const prodRes = await posGet(db, '/products');
    expect(prodRes.status).toBe(200);
    const products = await prodRes.json();
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe('prodA1');
    expect(products.some((p) => p.id === 'prodB1')).toBe(false);

    // Orders list: tenant-scoped ⇒ total exactly 1 (A's sale; B's hidden).
    const listRes = await posGet(db, '/orders');
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.total).toBe(1);
    expect(list.data).toHaveLength(1);
    expect(list.data[0].id).not.toBe('txn_B1');

    // B's order by id through A's token ⇒ 404, not a leak.
    const leakRes = await posGet(db, '/orders/txn_B1');
    expect(leakRes.status).toBe(404);

    // Shifts: A opens on store 11; B's open shift on store 21 must not surface.
    const openRes = await posPost(db, '/shifts/open', { openingCash: 50 });
    expect(openRes.status).toBe(200);
    const activeRes = await posGet(db, '/shifts/active');
    expect(activeRes.status).toBe(200);
    const active = await activeRes.json();
    expect(active.active).toBe(true);
    expect(active.shift.id).not.toBe('sh_B1');
    const shiftCount = sqlite.prepare("SELECT COUNT(*) AS n FROM pos_shifts WHERE status = 'open'").get().n;
    expect(shiftCount).toBe(2); // both open globally, but A sees only its own

    // B sells through its own terminal ⇒ stamped pB; A's list total stays 1.
    verifyToken.mockResolvedValue({ ...tokenB });
    const saleB = await posPost(db, '/orders', { items: [{ productId: 'prodB1', quantity: 1 }], paymentMethod: 'cash' });
    expect(saleB.status).toBe(200);
    const bRow = sqlite.prepare("SELECT project_id FROM pos_transactions WHERE tenant_id = 'tB' AND id != 'txn_B1'").get();
    expect(bRow.project_id).toBe('pB');

    verifyToken.mockResolvedValue({ ...tokenA });
    const listAgain = await (await posGet(db, '/orders')).json();
    expect(listAgain.total).toBe(1);
  });
});
