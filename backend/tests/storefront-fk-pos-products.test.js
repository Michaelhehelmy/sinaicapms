/**
 * FK fix — storefront_order_items.product_id REFERENCES products(id) →
 * pos_products(id) (migration 0123).
 *
 * REGRESSION: staging checkout with an API-created meal product 500s
 * `D1_ERROR: FOREIGN KEY constraint failed` (0 orders, cart intact) because
 * the meal id lives in pos_products but never in the `products` dead-shim
 * mirror (only rooms_new flows + tenant-import mirror; POST /api/products
 * and checkout never do). The 5c gate suite could never catch it: its stubs
 * declare `product_id TEXT` with NO REFERENCES, no `products` table, and
 * never enable FK enforcement.
 *
 * Writer matrix (HEAD 7f301ff, grep `INSERT INTO storefront_order_items`
 * backend/src — exactly ONE production site):
 *   backend/src/api/storefront.js:336 POST /checkout — binds item.product_id
 *   ← cart_items.product_id ← pos_products.id (cart-add validates against
 *   pos_products, :197-199; checkout joins pos_products, :309). ALL writers
 *   use pos_products ids. Readers/joins of this table in backend/src: NONE.
 * Insert-side fix (mirror checkout products into `products`) REJECTED per
 * the dead-shim rule (design §2 row 5: do not extend).
 *
 * Pattern: REAL migration file + REAL storefront router against REAL SQLite
 * (better-sqlite3 :memory:) with FK ENFORCEMENT ON (the 5c gap), Paymob
 * service mocked (reservations.test.js idiom). No KV writes, no D1 writes,
 * no deploy.sh.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import storefrontRouter from '../src/api/storefront.js';
import { createPaymobIntention } from '../src/services/paymob.js';
import { mountRouter } from './helpers/routerHarness.js';

vi.mock('../src/services/paymob.js', () => ({
  createPaymobIntention: vi.fn(async ({ orderRef }) => ({
    clientSecret: `secret_${orderRef}`,
    id: `int_${orderRef}`,
  })),
  verifyPaymobWebhookSignature: vi.fn(),
  extractPaymobTransaction: vi.fn(),
  buildHmacSignedString: vi.fn(),
}));

const migrationsDir = join(import.meta.dirname, '../migrations');
const execMigration = (db, file) =>
  db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
const readMigration = (file) =>
  readFileSync(join(migrationsDir, file), 'utf8');
const codeLines = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

const TENANT = 't_fkfix';
const PM_ENV = {
  PM_ENABLED: 'true',
  PM_SECRET_KEY: 'sk_test_fk',
  PM_BASE_URL: 'https://accept.paymob.com/api',
  PM_PUBLIC_KEY: 'pk_test_fk',
};

// ─── Live-lineage stub (0010 DDL + 0122 project_id, STALE FK → products) ────
// Mirrors staging at the R2 walkthrough: products mirror holds exactly one
// stale row {prod_tent}; the API-created meal lives in pos_products ONLY.
function buildStaleFkDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT,
      sku TEXT, name TEXT NOT NULL, selling_price REAL DEFAULT 0,
      type TEXT DEFAULT 'retail', is_active INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sku TEXT,
      base_price REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE carts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT,
      session_id TEXT, project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE cart_items (
      id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(cart_id, product_id)
    );
    CREATE TABLE storefront_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      customer_id TEXT, reference TEXT UNIQUE NOT NULL, session_id TEXT,
      total_amount REAL DEFAULT 0, currency TEXT DEFAULT 'EGP',
      status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'pending',
      notes TEXT, payment_intent_id TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE storefront_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_storefront_order_items_order ON storefront_order_items(order_id);
    CREATE INDEX idx_storefront_order_items_project ON storefront_order_items(project_id);
    INSERT INTO projects (id, tenant_id) VALUES ('proj_rest', '${TENANT}');
    INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, type, is_active, deleted_at) VALUES
      ('meal_api', '${TENANT}', 'proj_rest', 'MEAL-API', 'API Meal', 50, 'menu', 1, NULL),
      -- prod_tent lives in BOTH spaces (rooms_new flows mirror pos_products
      -- rows into products under the SAME id via ensureProductInProductsTable)
      -- the only row shape valid under both the stale and retargeted FK.
      ('prod_tent', '${TENANT}', 'proj_rest', 'TENT-1', 'Tent', 1500, 'room', 1, NULL);
    INSERT INTO products (id, tenant_id, sku, base_price) VALUES
      ('prod_tent', '${TENANT}', 'TENT-1', 1500);
    INSERT INTO carts (id, tenant_id, session_id, project_id) VALUES ('cart_fk', '${TENANT}', 's_fk', 'proj_rest');
    INSERT INTO cart_items (id, cart_id, product_id, quantity, unit_price, total_price, project_id) VALUES
      ('ci_meal', 'cart_fk', 'meal_api', 1, 50, 50, 'proj_rest');
  `);
  // THE 5c gap: enforce FKs like real D1 (better-sqlite3 defaults OFF).
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

// D1-compatible shim (5a/5b/5c idiom) — one shared sqlite handle so the
// PRAGMA foreign_keys=ON above governs every statement incl. batch().
function wrapD1(sqlite, sqlLog) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
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

const checkoutReq = (body) =>
  new Request('http://localhost/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Migration shape: 0123 retargets the FK, preserves data + indexes ───────
describe('0123 — storefront_order_items.product_id → pos_products(id)', () => {
  it('pre-migration stale FK rejects a pos_products id (staging 500 reproduced)', () => {
    const db = buildStaleFkDb();
    const fk = db
      .prepare(
        `SELECT "table" AS target FROM pragma_foreign_key_list('storefront_order_items') WHERE "from" = 'product_id'`
      )
      .get();
    expect(fk.target).toBe('products');
    db.prepare(
      `INSERT INTO storefront_orders (id, tenant_id, reference, session_id, total_amount)
       VALUES ('o_stale', '${TENANT}', 'ORD-STALE1', 's_fk', 50)`
    ).run();
    // The API-created meal is in pos_products but NOT in the mirror → the
    // stale FK rejects it, exactly the staging checkout 500.
    expect(() =>
      db.prepare(
        `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, project_id)
         VALUES ('li_stale', 'o_stale', 'meal_api', 'API Meal', 1, 50, 50, 'proj_rest')`
      ).run()
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('0123 retargets to pos_products, preserves rows + defaults + indexes, fk_check clean', () => {
    const db = buildStaleFkDb();
    db.prepare(
      `INSERT INTO storefront_orders (id, tenant_id, reference, session_id, total_amount)
       VALUES ('o_keep', '${TENANT}', 'ORD-KEEP01', 's_fk', 50)`
    ).run();
    db.prepare(
      `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, project_id)
       VALUES ('li_keep', 'o_keep', 'prod_tent', 'Tent', 1, 1500, 1500, NULL)`
    ).run();

    // D1 applies each migration inside a transaction (0111 idiom) — replay
    // that here so PRAGMA defer_foreign_keys governs the copy the way prod
    // sees it (better-sqlite3 exec is autocommit per statement otherwise).
    db.exec('BEGIN');
    execMigration(db, '0123_storefront_order_items_fk_pos_products.sql');
    db.exec('COMMIT');

    // FK target retargeted, action preserved.
    const fk = db
      .prepare(
        `SELECT "table" AS target, "on_delete" AS onDelete FROM pragma_foreign_key_list('storefront_order_items') WHERE "from" = 'product_id'`
      )
      .get();
    expect(fk.target).toBe('pos_products');
    expect(String(fk.onDelete).toUpperCase()).toBe('SET NULL');
    // Untouched edges survive the rebuild.
    const targets = db
      .prepare(
        `SELECT "from" AS col, "table" AS target FROM pragma_foreign_key_list('storefront_order_items')`
      )
      .all();
    expect(targets.find((r) => r.col === 'order_id').target).toBe('storefront_orders');
    expect(targets.find((r) => r.col === 'project_id').target).toBe('projects');
    // Data + defaults preserved (project_id NULL stays NULL; FK edge now
    // resolves via the pos_products-space copy of prod_tent).
    const kept = db
      .prepare('SELECT product_id, product_name, quantity, project_id FROM storefront_order_items WHERE id = ?')
      .get('li_keep');
    expect(kept).toMatchObject({ product_id: 'prod_tent', product_name: 'Tent', quantity: 1, project_id: null });
    // Both indexes recreated.
    for (const name of ['idx_storefront_order_items_order', 'idx_storefront_order_items_project']) {
      const idx = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'storefront_order_items' AND name = ?"
        )
        .get(name);
      expect(idx?.name).toBe(name);
    }
    // The previously-rejected pos_products id now inserts clean.
    db.prepare(
      `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, project_id)
       VALUES ('li_healed', 'o_keep', 'meal_api', 'API Meal', 1, 50, 50, 'proj_rest')`
    ).run();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('orphan mirror-only row ⇒ migration still applies; row grandfathered (fk_check reports it), future writes re-validate', () => {
    const db = buildStaleFkDb();
    db.prepare(`DELETE FROM pos_products WHERE id = 'prod_tent'`).run();
    db.prepare(
      `INSERT INTO storefront_orders (id, tenant_id, reference, session_id, total_amount)
       VALUES ('o_orph', '${TENANT}', 'ORD-ORPH01', 's_fk', 1500)`
    ).run();
    // Valid under the STALE schema (prod_tent IS in the mirror) but orphaned
    // under the retarget (prod_tent ∉ pos_products). Engine semantics
    // (verified on the live SQLite build): the 0111-idiom
    // `PRAGMA defer_foreign_keys = false` tail means COMMIT does NOT throw —
    // the row survives grandfathered and fk_check reports it. Reads are
    // unaffected; only future writes touching product_id re-validate.
    db.prepare(
      `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
       VALUES ('li_orph', 'o_orph', 'prod_tent', 'Tent', 1, 1500, 1500)`
    ).run();
    db.exec('BEGIN');
    execMigration(db, '0123_storefront_order_items_fk_pos_products.sql');
    db.exec('COMMIT');
    // Row survived with its reference intact (reads fine).
    const kept = db
      .prepare('SELECT product_id, product_name FROM storefront_order_items WHERE id = ?')
      .get('li_orph');
    expect(kept).toMatchObject({ product_id: 'prod_tent', product_name: 'Tent' });
    // fk_check reports exactly the grandfathered row and nothing else.
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe('storefront_order_items');
    // Future writes re-validate: touching its product_id with another
    // mirror-only id throws; mapping it onto a live pos_products id heals it.
    expect(() =>
      db.prepare(`UPDATE storefront_order_items SET product_id = 'prod_tent' WHERE id = 'li_orph'`).run()
    ).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare(`UPDATE storefront_order_items SET product_id = 'meal_api' WHERE id = 'li_orph'`).run();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('exact retarget text + touches storefront_order_items ONLY', () => {
    const sql = readMigration('0123_storefront_order_items_fk_pos_products.sql');
    expect(sql).toContain('product_id TEXT REFERENCES pos_products(id) ON DELETE SET NULL,');
    expect(codeLines(sql)).not.toContain('REFERENCES products(id)');
    // Single-table scope: no other table created/altered/dropped.
    expect(codeLines(sql)).not.toMatch(/ALTER TABLE (?!storefront_order_items_new RENAME)/);
    expect(codeLines(sql)).not.toContain('ALTER TABLE storefront_orders');
    expect(codeLines(sql)).not.toContain('ALTER TABLE pos_products');
    expect(codeLines(sql)).not.toContain('ALTER TABLE products');
    expect(codeLines(sql)).not.toContain('CREATE TABLE products');
  });
});

// ─── Behavior: meal-line checkout ⇒ 201 with FK enforcement ON; FK holds ────
describe('POST /checkout with FK enforcement ON (the 5c gap)', () => {
  it('API-created meal (pos_products-only id) ⇒ 201, FK holds, fk_check clean', async () => {
    const sqlite = buildStaleFkDb();
    execMigration(sqlite, '0123_storefront_order_items_fk_pos_products.sql');
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog), ...PM_ENV };
    const app = mountRouter(storefrontRouter, { tenantId: TENANT });

    const res = await app.request(checkoutReq({ sessionId: 's_fk' }), {}, env);
    const body = await res.json();
    // 201 is the handler's success code (5c gate); "⇒ 200" = 2xx success.
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.totalAmount).toBe(50);
    expect(createPaymobIntention).toHaveBeenCalledTimes(1);

    const lines = sqlite
      .prepare('SELECT product_id, project_id FROM storefront_order_items ORDER BY product_id')
      .all();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ product_id: 'meal_api', project_id: 'proj_rest' });
    // FK holds: retargeted edge + zero violations on the fresh checkout rows.
    const fk = sqlite
      .prepare(
        `SELECT "table" AS target FROM pragma_foreign_key_list('storefront_order_items') WHERE "from" = 'product_id'`
      )
      .get();
    expect(fk.target).toBe('pos_products');
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('mirror-only id insert ⇒ REJECTED (exact behavior: FOREIGN KEY constraint failed)', async () => {
    const sqlite = buildStaleFkDb();
    execMigration(sqlite, '0123_storefront_order_items_fk_pos_products.sql');
    sqlite.prepare(
      `INSERT INTO storefront_orders (id, tenant_id, reference, session_id, total_amount)
       VALUES ('o_mir', '${TENANT}', 'ORD-MIRROR', 's_fk', 1500)`
    ).run();
    // Make prod_tent TRULY mirror-only (drop its pos_products twin) — post-
    // retarget it is NOT a valid line reference. Exact behavior: hard reject,
    // no mapping (mapping is rejected per the dead-shim rule — the mirror
    // must not grow).
    sqlite.prepare(`DELETE FROM pos_products WHERE id = 'prod_tent'`).run();
    expect(() =>
      sqlite.prepare(
        `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price)
         VALUES ('li_mir', 'o_mir', 'prod_tent', 'Tent', 1, 1500, 1500)`
      ).run()
    ).toThrow(/FOREIGN KEY constraint failed/);
    // ON DELETE SET NULL still governs the live edge: deleting the meal
    // product nulls its lines instead of orphaning or cascading.
    sqlite.prepare(
      `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, project_id)
       VALUES ('li_null', 'o_mir', 'meal_api', 'API Meal', 1, 50, 50, 'proj_rest')`
    ).run();
    sqlite.prepare(`DELETE FROM pos_products WHERE id = 'meal_api'`).run();
    expect(
      sqlite.prepare('SELECT product_id FROM storefront_order_items WHERE id = ?').get('li_null').product_id
    ).toBeNull();
  });
});
