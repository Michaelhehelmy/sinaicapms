/**
 * D3 — tenant-scoped uniqueness for the tenant-import manifest path.
 *
 * Migration: 0126_tenant_scoped_unique_sku_email.sql (rebuilds pos_products +
 * pos_users in the 0111 idiom: defer_foreign_keys → staging CREATEs →
 * fail-closed copy → drop → rename → guard restore → recreate every index +
 * trigger → fk_check tail).
 *
 * The blocker this closes: POST /api/tenants/import could not load the SAME
 * catalog into two tenants. `pos_products.sku`, `pos_users.email` and
 * `pos_users.username` were GLOBAL inline UNIQUEs, so the second import of an
 * overlapping manifest died on `UNIQUE constraint failed: pos_products.sku`
 * (surfacing as 409/500) instead of loading.
 *
 * Three layers of proof, all against REAL SQL:
 *   1. SHAPE — the migration applies on a full in-process replay of every
 *      migration in the repo (the 0124 head) with `foreign_keys = ON`, and
 *      lands exactly the DDL it promises (arbiters present, global UNIQUEs
 *      gone, every prior index + both triggers + both GENERATED columns
 *      preserved, pos_users column order byte-identical).
 *   2. DATA — on a hand-built pre-0126 lineage carrying one row in EVERY
 *      inbound-FK edge kind (RESTRICT / NO ACTION / CASCADE / SET NULL), the
 *      rebuild preserves all of them (proving the guards), keeps AUTOINCREMENT
 *      above the legacy id, and admits cross-tenant duplicates while still
 *      rejecting same-tenant ones.
 *   3. BEHAVIOR — the real Hono import route over a D1-compatible shim on a
 *      0126-migrated replay: two tenants import the SAME manifest and both get
 *      200; a cross-tenant explicit meal id gets a clear 400; a same-tenant
 *      duplicate SKU still gets the legacy 409.
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouter } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');
const MIGRATION = '0126_tenant_scoped_unique_sku_email.sql';
const readMigration = (file) => readFileSync(join(migrationsDir, file), 'utf8');

/**
 * Replay every migration in the repo except 0126 — the 0124 head the D3
 * mission applies onto. `foreign_keys = OFF` for the replay itself (the
 * squash baseline's 0001_core…0014_seed + 0100+ chain needs it; this mirrors
 * the repo's own scratch-replay tooling), then FKs are switched back ON
 * before 0126 runs so the rebuild is validated under real enforcement.
 */
function replayTo0124() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f !== MIGRATION)
    .sort();
  expect(files.length).toBeGreaterThan(20);
  for (const f of files) db.exec(readMigration(f));
  return db;
}

/**
 * Run a migration file the way D1 does — one implicit transaction around the
 * whole file. This matters: `PRAGMA defer_foreign_keys = true` only survives
 * inside a transaction (better-sqlite3's `exec` in autocommit resets it after
 * each statement), and D1 wraps every migration file in a transaction, so the
 * 0111-idiom deferral works in production but not under a naive replay.
 */
function execMigration(db, file = MIGRATION) {
  db.transaction(() => db.exec(readMigration(file)))();
}

const indexNames = (db, table) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")
    .all(table)
    .map((r) => r.name);
// table_xinfo also reports GENERATED columns (hidden = 3 for STORED) —
// table_info hides them, which would silently "prove" a wrong column order.
const allColumns = (db, table) => db.prepare(`PRAGMA table_xinfo(${table})`).all().map((c) => c.name);
const indexColumns = (db, name) =>
  db.prepare(`SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`).all().map((r) => r.name);

/**
 * Column order of both rebuilt tables on the 0124 head (GENERATED columns
 * included — `name` sits between `updated_at` and `tenant_id` in pos_users,
 * `profit_margin` between `compare_price` and `weight` in pos_products). The
 * rebuild must reproduce both orders exactly.
 */
const USERS_COLUMNS_BEFORE = [
  'id', 'organization_id', 'store_id', 'username', 'email', 'password_hash',
  'first_name', 'last_name', 'phone', 'avatar_url', 'role', 'permissions',
  'employee_id', 'department', 'hire_date', 'salary', 'commission_rate',
  'is_active', 'is_verified', 'last_login_at', 'password_reset_token',
  'password_reset_expires', 'two_factor_secret', 'two_factor_enabled',
  'login_attempts', 'locked_until', 'pos_settings', 'created_at', 'updated_at',
  'name', 'tenant_id', 'deleted_at', 'last_login', 'status', 'camp_id',
  'project_id',
];
const PRODUCTS_COLUMNS_BEFORE = [
  'id', 'tenant_id', 'organization_id', 'category_id', 'brand_id', 'supplier_id',
  'sku', 'barcode', 'name', 'description', 'short_description', 'images',
  'cost_price', 'selling_price', 'compare_price', 'profit_margin', 'weight',
  'dimensions', 'unit', 'min_stock_level', 'max_stock_level', 'reorder_point',
  'is_trackable', 'is_serialized', 'is_active', 'is_featured', 'tags',
  'attributes', 'seo_title', 'seo_description', 'type', 'deleted_at',
  'created_at', 'updated_at', 'stock_quantity', 'image_url', 'tax_rate',
  'camp_id', 'capacity', 'variant_of', 'variant_attributes', 'supplier_name',
  'project_id',
];

// ─── D1-compatible shim (phase-4f idiom) ─────────────────────────────────────
function wrapD1(sqlite) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          // The bound statement carries its own sql/params so `batch()` can
          // replay it — the production D1 `batch()` API does the same.
          const st = {
            _sql: sql,
            _params: params,
            all: async () => {
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return { results: s.all(...params) };
              return { results: [], meta: { changes: Number(s.run(...params).changes) } };
            },
            first: async () => sqlite.prepare(sql).get(...params) ?? null,
            run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
          };
          return st;
        },
      };
    },
    batch: async (stmts) =>
      stmts.map((st) => {
        const s = sqlite.prepare(st._sql);
        if (isRead(st._sql)) return { results: s.all(...st._params) };
        return { meta: { changes: Number(s.run(...st._params).changes) } };
      }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SHAPE — applies on the 0124 head and lands the promised DDL
// ═══════════════════════════════════════════════════════════════════════════
describe('0126 — tenant-scoped uniqueness (shape on the 0124 head)', () => {
  it('applies cleanly on a full migration replay with foreign_keys = ON', () => {
    const db = replayTo0124();
    db.pragma('foreign_keys = ON');
    expect(() => execMigration(db)).not.toThrow();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('replaces the global inline UNIQUEs with tenant-scoped UNIQUE arbiters', () => {
    const db = replayTo0124();
    db.pragma('foreign_keys = ON');
    const before = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get('pos_products').sql;
    expect(before).toMatch(/sku TEXT UNIQUE NOT NULL/);
    execMigration(db);

    expect(indexColumns(db, 'idx_pos_products_tenant_sku_unique')).toEqual(['tenant_id', 'sku']);
    expect(indexColumns(db, 'idx_pos_users_tenant_email_unique')).toEqual(['tenant_id', 'email']);
    expect(indexColumns(db, 'idx_pos_users_tenant_username_unique')).toEqual(['tenant_id', 'username']);
    for (const name of [
      'idx_pos_products_tenant_sku_unique',
      'idx_pos_users_tenant_email_unique',
      'idx_pos_users_tenant_username_unique',
    ]) {
      expect(db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name).sql).toMatch(/^CREATE UNIQUE INDEX/);
    }
  });

  it('drops the global UNIQUE on sku/email/username and keeps barcode UNIQUE', () => {
    const db = replayTo0124();
    db.pragma('foreign_keys = ON');
    execMigration(db);

    expect(allColumns(db, 'pos_products')).toContain('sku');
    // pos_products keeps exactly two implicit indexes: TEXT PRIMARY KEY +
    // barcode UNIQUE (barcode is manufacturer-assigned → stays global).
    expect(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND tbl_name='pos_products' AND name LIKE 'sqlite_autoindex%'").get().c).toBe(2);
    expect(() => db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, barcode) VALUES ('x','t','S','n','B1')").run()).not.toThrow();
    expect(() => db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, barcode) VALUES ('y','t','S2','n','B1')").run()).toThrow(/UNIQUE/);

    // pos_users keeps ZERO implicit indexes: PK is the INTEGER rowid alias and
    // both inline UNIQUEs are gone.
    expect(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND tbl_name='pos_users' AND name LIKE 'sqlite_autoindex%'").get().c).toBe(0);
  });

  it('recreates every pre-existing index on both rebuilt tables', () => {
    const db = replayTo0124();
    const productsBefore = indexNames(db, 'pos_products');
    const usersBefore = indexNames(db, 'pos_users');
    db.pragma('foreign_keys = ON');
    execMigration(db);

    const productsAfter = indexNames(db, 'pos_products').filter((n) => !n.endsWith('_unique'));
    const usersAfter = indexNames(db, 'pos_users').filter((n) => !n.endsWith('_unique'));
    expect(productsAfter.sort()).toEqual(productsBefore.sort());
    expect(usersAfter.sort()).toEqual(usersBefore.sort());
    expect(productsBefore.length).toBeGreaterThanOrEqual(17);
    expect(usersBefore.length).toBeGreaterThanOrEqual(15);
  });

  it('recreates both updated_at triggers and keeps the GENERATED columns', () => {
    const db = replayTo0124();
    // Pin the 0124-head column order BEFORE the rebuild (this is the baseline
    // the constants document, so a future migration that reshapes a column
    // order cannot silently pass).
    expect(allColumns(db, 'pos_users')).toEqual(USERS_COLUMNS_BEFORE);
    expect(allColumns(db, 'pos_products')).toEqual(PRODUCTS_COLUMNS_BEFORE);
    db.pragma('foreign_keys = ON');
    execMigration(db);

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('pos_products','pos_users') ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(triggers).toEqual(['update_products_timestamp', 'update_users_timestamp']);

    // pos_users.name is position-critical (right after updated_at) and
    // GENERATED — it must still compute, and the column order must be
    // untouched so any positional reader keeps working.
    expect(allColumns(db, 'pos_users')).toEqual(USERS_COLUMNS_BEFORE);
    expect(USERS_COLUMNS_BEFORE[29]).toBe('name');
    expect(allColumns(db, 'pos_products')).toEqual(PRODUCTS_COLUMNS_BEFORE);
    db.prepare("INSERT INTO pos_organizations (name, slug) VALUES ('Org', 'org-x')").run();
    db.prepare(
      "INSERT INTO pos_users (organization_id, username, email, password_hash, first_name, last_name, tenant_id) VALUES (1,'u','u@t.test','h','Ada','Lovelace','tenant_x')"
    ).run();
    expect(db.prepare('SELECT name FROM pos_users WHERE username = ?').get('u').name).toBe('Ada Lovelace');

    // pos_products.profit_margin recomputes from the copy (GENERATED, excluded).
    // REAL literals: the GENERATED expression does integer division when both
    // operands are stored as INTEGER, so 40/100 would floor to 0.
    db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, cost_price, selling_price) VALUES ('pg','tenant_x','PG-1','P',40.5,100.0)").run();
    expect(db.prepare('SELECT profit_margin FROM pos_products WHERE id = ?').get('pg').profit_margin).toBeCloseTo(59.5, 5);
  });

  it('leaves the duplicate census clean (the migration is fail-closed, not a merge)', () => {
    const db = replayTo0124();
    db.pragma('foreign_keys = ON');
    execMigration(db);

    const dupGroups = (sql) => db.prepare(sql).all();
    expect(dupGroups('SELECT tenant_id, sku FROM pos_products GROUP BY tenant_id, sku HAVING COUNT(*) > 1')).toEqual([]);
    expect(dupGroups('SELECT tenant_id, email FROM pos_users WHERE tenant_id IS NOT NULL GROUP BY tenant_id, email HAVING COUNT(*) > 1')).toEqual([]);
    expect(dupGroups('SELECT tenant_id, username FROM pos_users WHERE tenant_id IS NOT NULL GROUP BY tenant_id, username HAVING COUNT(*) > 1')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. DATA — every inbound-FK edge kind survives the rebuild
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Pre-0126 lineage with the live DDL of both rebuilt tables plus one row in
 * every inbound-FK edge kind, so the guards are exercised for real:
 *   rooms_new               → pos_products RESTRICT   (deferred)
 *   pos_transaction_items   → pos_products NO ACTION  (deferred)
 *   pos_recipe_ingredients  → pos_products NO ACTION  (deferred)
 *   rate_plans_new          → pos_products CASCADE    (immediate → GUARDED)
 *   storefront_order_items  → pos_products SET NULL   (immediate → GUARDED)
 *   pos_stores.manager_id   → pos_users     NO ACTION (deferred)
 */
function buildPre0126DataDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, subdomain TEXT, name TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT, slug TEXT, deleted_at TEXT);
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL);
    CREATE TABLE pos_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL,
      name TEXT, code TEXT, address TEXT NOT NULL, city TEXT NOT NULL,
      manager_id INTEGER,
      FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
      FOREIGN KEY (manager_id) REFERENCES pos_users(id)
    );
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id INTEGER NOT NULL DEFAULT 1,
      category_id INTEGER, brand_id INTEGER, supplier_id INTEGER, sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE, name TEXT NOT NULL, description TEXT, short_description TEXT,
      images JSON DEFAULT '[]', cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
      selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.0, compare_price DECIMAL(10,2),
      profit_margin REAL GENERATED ALWAYS AS (
        CASE WHEN selling_price > 0 THEN ((selling_price - cost_price) / selling_price) * 100 ELSE 0 END
      ) STORED,
      weight REAL, dimensions JSON DEFAULT '{}', unit TEXT DEFAULT 'pcs',
      min_stock_level INTEGER DEFAULT 10, max_stock_level INTEGER DEFAULT 1000,
      reorder_point INTEGER DEFAULT 20, is_trackable BOOLEAN DEFAULT TRUE,
      is_serialized BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE, is_featured BOOLEAN DEFAULT FALSE,
      tags JSON DEFAULT '[]', attributes JSON DEFAULT '{}', seo_title TEXT, seo_description TEXT,
      type TEXT CHECK(type IN ('room','menu','buffet','retail')) DEFAULT 'retail', deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      stock_quantity INTEGER DEFAULT 0, image_url TEXT, tax_rate DECIMAL(5,2) DEFAULT 0.0, camp_id TEXT,
      capacity INTEGER DEFAULT 1, variant_of TEXT, variant_attributes TEXT DEFAULT '{}',
      supplier_name TEXT, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE pos_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, store_id INTEGER,
      username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT, avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'cashier', permissions JSON DEFAULT '[]', employee_id TEXT, department TEXT,
      hire_date DATE, salary DECIMAL(10,2), commission_rate REAL DEFAULT 0.0, is_active BOOLEAN DEFAULT TRUE,
      is_verified BOOLEAN DEFAULT FALSE, last_login_at DATETIME, password_reset_token TEXT,
      password_reset_expires DATETIME, two_factor_secret TEXT, two_factor_enabled BOOLEAN DEFAULT FALSE,
      login_attempts INTEGER DEFAULT 0, locked_until DATETIME, pos_settings JSON DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED, tenant_id TEXT,
      deleted_at DATETIME, last_login DATETIME, status TEXT DEFAULT 'active', camp_id TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
      FOREIGN KEY (store_id) REFERENCES pos_stores(id)
    );
    CREATE TABLE rooms_new (
      id TEXT PRIMARY KEY, camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE RESTRICT, name TEXT NOT NULL,
      status TEXT DEFAULT 'available', bed_type TEXT DEFAULT 'single', max_guests INTEGER DEFAULT 2,
      base_price REAL DEFAULT 0, floor TEXT, notes TEXT, is_active INTEGER DEFAULT 1, tenant_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME,
      room_status TEXT DEFAULT 'available',
      cleaning_status TEXT DEFAULT 'clean' CHECK(cleaning_status IN ('dirty','in_progress','clean','inspected')),
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE rate_plans_new (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
      camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL, name TEXT NOT NULL,
      season TEXT DEFAULT 'all', start_date TEXT, end_date TEXT, price_per_night REAL NOT NULL,
      min_stay INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE storefront_orders (id TEXT PRIMARY KEY, tenant_id TEXT, total REAL DEFAULT 0);
    CREATE TABLE storefront_order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES pos_products(id) ON DELETE SET NULL, product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT, order_number TEXT UNIQUE, cashier_id TEXT
    );
    CREATE TABLE pos_transaction_items (
      id TEXT PRIMARY KEY, tenant_id TEXT, order_id TEXT, product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL, unit_price REAL NOT NULL DEFAULT 0.0,
      FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
      FOREIGN KEY (product_id) REFERENCES pos_products(id)
    );
    CREATE TABLE pos_recipe_ingredients (
      id TEXT PRIMARY KEY, tenant_id TEXT, product_id TEXT NOT NULL, ingredient_id TEXT NOT NULL,
      quantity REAL NOT NULL, unit TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES pos_products(id),
      FOREIGN KEY (ingredient_id) REFERENCES pos_products(id)
    );

    INSERT INTO tenants (id, subdomain, name) VALUES ('t_a', 'a.example', 'Camp A'), ('t_b', 'b.example', 'Camp B');
    INSERT INTO projects (id, tenant_id, name, slug) VALUES ('proj_a', 't_a', 'Camp A', 'a'), ('proj_b', 't_b', 'Camp B', 'b');
    INSERT INTO pos_organizations (id, name, slug) VALUES (1, 'Org A', 'org_a'), (2, 'Org B', 'org_b');
    INSERT INTO pos_stores (id, organization_id, name, code, address, city) VALUES (1, 1, 'Store A', 'ST_A', 'N/A', 'N/A'), (2, 2, 'Store B', 'ST_B', 'N/A', 'N/A');
    INSERT INTO pos_products (id, tenant_id, sku, name, selling_price, cost_price, organization_id, project_id) VALUES
      ('p_a', 't_a', 'SKU-A1', 'A Room', 100, 40, 1, 'proj_a'),
      ('p_b', 't_b', 'SKU-B1', 'B Room', 120, 50, 2, 'proj_b');
    INSERT INTO pos_users (id, organization_id, store_id, username, email, password_hash, first_name, last_name, tenant_id, project_id)
      VALUES (7, 1, 1, 'cashier_a', 'shared@camp.test', 'h', 'Ada', 'A', 't_a', 'proj_a');
    UPDATE pos_stores SET manager_id = 7 WHERE id = 1;
    INSERT INTO rooms_new (id, camp_id, product_id, name, tenant_id, project_id) VALUES ('r_a', 'proj_a', 'p_a', 'A Room 1', 't_a', 'proj_a');
    INSERT INTO rate_plans_new (id, tenant_id, product_id, camp_id, name, price_per_night, project_id) VALUES ('rp_a', 't_a', 'p_a', 'proj_a', 'A plan', 100, 'proj_a');
    INSERT INTO storefront_orders (id, tenant_id) VALUES ('so_a', 't_a');
    INSERT INTO storefront_order_items (id, order_id, product_id, product_name, project_id) VALUES ('soi_a', 'so_a', 'p_a', 'A Room', 'proj_a');
    INSERT INTO pos_transactions (id, tenant_id, order_number, cashier_id) VALUES ('tx_a', 't_a', 'ORD-1', '7');
    INSERT INTO pos_transaction_items (id, tenant_id, order_id, product_id, quantity, unit_price) VALUES ('pti_a', 't_a', 'tx_a', 'p_a', 1, 100);
    INSERT INTO pos_recipe_ingredients (id, tenant_id, product_id, ingredient_id, quantity) VALUES ('pri_a', 't_a', 'p_a', 'p_b', 2);
  `);
  return db;
}

describe('0126 — rebuild preserves data across every inbound-FK edge kind', () => {
  it('keeps RESTRICT / NO ACTION / CASCADE / SET NULL dependents intact', () => {
    const db = buildPre0126DataDb();
    execMigration(db);

    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT id, product_id FROM rooms_new').all()).toEqual([{ id: 'r_a', product_id: 'p_a' }]);
    expect(db.prepare('SELECT id, product_id FROM pos_transaction_items').all()).toEqual([{ id: 'pti_a', product_id: 'p_a' }]);
    expect(db.prepare('SELECT id, product_id FROM pos_recipe_ingredients').all()).toEqual([{ id: 'pri_a', product_id: 'p_a' }]);
    // CASCADE wiped these on the old-parent DROP → the guard restored them.
    expect(db.prepare('SELECT id, product_id, price_per_night FROM rate_plans_new').all()).toEqual([
      { id: 'rp_a', product_id: 'p_a', price_per_night: 100 },
    ]);
    // SET NULL blanked this product_id on DROP → the guard restored it.
    expect(db.prepare('SELECT id, product_id FROM storefront_order_items').all()).toEqual([
      { id: 'soi_a', product_id: 'p_a' },
    ]);
    expect(db.prepare('SELECT id, manager_id FROM pos_stores WHERE id = 1').get()).toEqual({ id: 1, manager_id: 7 });
    expect(db.prepare('SELECT COUNT(*) c FROM rate_plans_new').get().c).toBe(1);
  });

  it('drops the guard tables it created', () => {
    const db = buildPre0126DataDb();
    execMigration(db);
    const leftovers = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '\\_guard%' ESCAPE '\\'")
      .all();
    expect(leftovers).toEqual([]);
  });

  it('admits cross-tenant sku/email/username duplicates but still rejects same-tenant ones', () => {
    const db = buildPre0126DataDb();
    execMigration(db);

    // Same SKU, same email, same username — different tenants: now legal.
    db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, organization_id) VALUES ('p_a2', 't_b', 'SKU-A1', 'B copy of A', 2)").run();
    db.prepare(
      "INSERT INTO pos_users (organization_id, store_id, username, email, password_hash, first_name, last_name, tenant_id) VALUES (2, 2, 'cashier_a', 'shared@camp.test', 'h', 'Bob', 'B', 't_b')"
    ).run();
    expect(db.prepare("SELECT COUNT(*) c FROM pos_products WHERE sku = 'SKU-A1'").get().c).toBe(2);
    expect(db.prepare("SELECT COUNT(*) c FROM pos_users WHERE email = 'shared@camp.test'").get().c).toBe(2);

    // Same tenant: still rejected (per-tenant uniqueness is the contract).
    expect(() =>
      db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, organization_id) VALUES ('p_a3', 't_a', 'SKU-A1', 'dup', 1)").run()
    ).toThrow(/UNIQUE/);
    expect(() =>
      db.prepare("INSERT INTO pos_users (organization_id, username, email, password_hash, first_name, last_name, tenant_id) VALUES (1, 'cashier_a', 'other@camp.test', 'h', 'A', 'B', 't_a')").run()
    ).toThrow(/UNIQUE/);
    expect(() =>
      db.prepare("INSERT INTO pos_users (organization_id, username, email, password_hash, first_name, last_name, tenant_id) VALUES (1, 'other', 'shared@camp.test', 'h', 'A', 'B', 't_a')").run()
    ).toThrow(/UNIQUE/);
  });

  it('keeps AUTOINCREMENT above the legacy id high-water mark', () => {
    const db = buildPre0126DataDb();
    execMigration(db);
    db.prepare(
      "INSERT INTO pos_users (organization_id, username, email, password_hash, first_name, last_name, tenant_id) VALUES (2, 'cashier_b', 'b@camp.test', 'h', 'Bea', 'B', 't_b')"
    ).run();
    const { id } = db.prepare('SELECT id FROM pos_users WHERE username = ?').get('cashier_b');
    expect(id).toBeGreaterThan(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. BEHAVIOR — overlapping manifests import cleanly through the real route
// ═══════════════════════════════════════════════════════════════════════════
const importEnv = (sqlite) => ({
  DB: wrapD1(sqlite),
  MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
});

/** One manifest shape two tenants share verbatim — same SKUs, staff, menu. */
const overlappingManifest = () => ({
  tenant: { name: 'Shared Camp', primaryColor: '#0f766e' },
  project: { name: 'Shared Camp', type: 'camp', location: 'North' },
  products: [
    { name: 'Sea View Room', sku: 'ROOM-SEA-1', basePrice: 220, capacity: 4, type: 'room' },
    { name: 'Breakfast Buffet', sku: 'BUFFET-AM', basePrice: 35, type: 'buffet' },
  ],
  rooms: [{ name: 'Sea View 1', productName: 'Sea View Room', bedType: 'double', maxGuests: 4 }],
  ratePlans: [{ name: 'Season A', productName: 'Sea View Room', pricePerNight: 220, season: 'summer' }],
  menu: {
    categories: [{ name: 'Breakfast', position: 1 }],
    meals: [{ name: 'Eggs Benedict', categoryName: 'Breakfast', price: 28, description: 'Poached eggs' }],
  },
  posUsers: [
    { email: 'manager@camp.test', username: 'manager', password: 'camp-secret-1', firstName: 'Mona', lastName: 'Mansour', role: 'manager' },
    { email: 'cashier@camp.test', username: 'cashier', password: 'camp-secret-2', firstName: 'Karl', lastName: 'Khalil', role: 'cashier' },
  ],
});

const postImport = (sqlite, tenantId, body) => {
  const app = mountRouter(tenantImportRoutes, {
    tenantId,
    user: { role: 'admin', tenantId },
    basePath: '/tenants/import',
  });
  return app.request(
    'http://localhost/tenants/import',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    importEnv(sqlite)
  );
};

/** Every table a manifest import writes — the "nothing landed" assertion set. */
const IMPORT_TABLES = [
  'projects', 'pos_products', 'rooms_new', 'rate_plans_new',
  'meal_categories', 'meal_categories_lang', 'meals', 'meal_lang', 'pos_users',
];
const expectNoRows = (db) => {
  for (const table of IMPORT_TABLES) {
    expect({ table, rows: db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c }).toEqual({ table, rows: 0 });
  }
};

/** The one live project the DEFECT-3 `project` block left behind for a tenant. */
const tenantProjectId = (db, tenantId) =>
  db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL').get(tenantId).id;

function seedImportTenant(db, tenantId, subdomain) {
  db.prepare("INSERT INTO tenants (id, subdomain, name, type, status, onboarding_status) VALUES (?, ?, ?, 'camp', 'active', 'completed')")
    .run(tenantId, subdomain, subdomain);
}

function buildImportDb() {
  const db = replayTo0124();
  db.pragma('foreign_keys = ON');
  execMigration(db);
  seedImportTenant(db, 't_overlap_a', 'overlap-a');
  seedImportTenant(db, 't_overlap_b', 'overlap-b');
  return db;
}

describe('0126 — overlapping manifests import without a uniqueness failure', () => {
  it('loads the SAME manifest into two tenants (200 both, every count > 0)', async () => {
    const db = buildImportDb();
    const resA = await postImport(db, 't_overlap_a', overlappingManifest());
    const resB = await postImport(db, 't_overlap_b', overlappingManifest());
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const a = await resA.json();
    const b = await resB.json();
    // jsonResponse() camelCases response bodies (toCamel), so the snake_case
    // count keys come back camelCased on the wire.
    for (const section of ['products', 'rooms', 'ratePlans', 'mealCategories', 'meals', 'posUsers']) {
      expect(a.counts[section]).toBe(b.counts[section]);
      expect(a.counts[section]).toBeGreaterThan(0);
    }

    // Both tenants really own their own rows.
    for (const tenantId of ['t_overlap_a', 't_overlap_b']) {
      expect(db.prepare('SELECT COUNT(*) c FROM pos_products WHERE tenant_id = ?').get(tenantId).c).toBe(2);
      expect(db.prepare('SELECT COUNT(*) c FROM pos_users WHERE tenant_id = ?').get(tenantId).c).toBe(2);
      expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE tenant_id = ?').get(tenantId).c).toBe(1);
      expect(db.prepare('SELECT COUNT(*) c FROM rooms_new WHERE tenant_id = ?').get(tenantId).c).toBe(1);
      expect(db.prepare('SELECT COUNT(*) c FROM rate_plans_new WHERE tenant_id = ?').get(tenantId).c).toBe(1);
    }
    expect(db.prepare("SELECT COUNT(*) c FROM pos_products WHERE sku = 'ROOM-SEA-1'").get().c).toBe(2);
    expect(db.prepare("SELECT COUNT(*) c FROM pos_users WHERE email = 'manager@camp.test'").get().c).toBe(2);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('generates distinct random meal ids per tenant (never a shared literal)', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());
    await postImport(db, 't_overlap_b', overlappingManifest());
    const ids = db.prepare('SELECT id FROM meals ORDER BY id').all().map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^meal_[0-9a-f]{12}$/);
    // meal_lang rows follow their meal (no orphan join keys).
    expect(db.prepare('SELECT COUNT(*) c FROM meal_lang').get().c).toBe(2);
  });

  it('rejects a manifest meal id owned by ANOTHER tenant with a clear 400', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());
    const stolen = db.prepare('SELECT id FROM meals WHERE tenant_id = ?').get('t_overlap_a').id;

    const manifest = overlappingManifest();
    manifest.menu.meals[0].id = stolen;
    const res = await postImport(db, 't_overlap_b', manifest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already belongs to another tenant/);
    expect(body.error).toContain(stolen);
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE tenant_id = ?').get('t_overlap_b').c).toBe(0);
  });

  it('still returns the legacy 409 when the SAME tenant re-imports a duplicate SKU', async () => {
    const db = buildImportDb();
    const first = await postImport(db, 't_overlap_a', overlappingManifest());
    expect(first.status).toBe(200);
    const res = await postImport(db, 't_overlap_a', overlappingManifest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exist/i);
  });

  it('rejects an UNRESOLVABLE products[].campId with a 400 before writing a single row', async () => {
    const db = buildImportDb();
    const manifest = overlappingManifest();
    // A project id nobody in this tenant owns. Pre-fix this import had TWO
    // outcomes and neither named the field: without a ratePlans block it
    // answered 200 and left the dangling id in `pos_products.camp_id` (that
    // column has no FK at the head — only `project_id` is guarded), and with
    // one it died later on the `rate_plans_new.camp_id` FK as an opaque 500
    // "Failed to import tenant data" after the project, branding, products
    // and rooms were already committed. This manifest carries a ratePlans
    // block, so it is the late-500 variant being pinned.
    manifest.products[0].campId = 'proj_other_tenants_camp';

    const res = await postImport(db, 't_overlap_a', manifest);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Product "Sea View Room" references unknown camp "proj_other_tenants_camp". ' +
        'campId must name a project this tenant already owns; omit it to attach the row to the tenant default project.'
    );

    // Nothing was written, and the manifest's own projects[]/rooms[]/
    // ratePlans[]/posUsers[] blocks prove the 400 came from the campId probe
    // rather than from a downstream section failing first.
    expectNoRows(db);
  });

  it('rejects an unresolvable campId even when it is the ONLY defect and there is no project block', async () => {
    const db = buildImportDb();
    // No `project` block at all: the pre-flight must not depend on the DEFECT-3
    // project write having happened, and must not be reachable only via the
    // ratePlans FK. Pre-fix this exact manifest imported 200 with the dangling
    // id persisted.
    const res = await postImport(db, 't_overlap_a', {
      products: [{ name: 'Sea View Room', sku: 'ROOM-SEA-1', basePrice: 220, capacity: 4, type: 'room', campId: 'proj_other_tenants_camp' }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/references unknown camp "proj_other_tenants_camp"/);
    expectNoRows(db);
  });

  it('resolves a campId that names a project the tenant ALREADY owns', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());
    const own = tenantProjectId(db, 't_overlap_a');

    // Second manifest points its product at the project the first import
    // created — the union case. Without it, a manifest could never address its
    // own tenant's project by id, which is the whole point of the field.
    // menu/posUsers are dropped because the first import already owns their
    // SKUs/emails for this tenant (0126's same-tenant arbiters 409 on those);
    // rooms and ratePlans stay, because rate_plans_new.camp_id inherits
    // `p.camp_id` — that inheritance is the FK edge the late 500 detonated on.
    const manifest = overlappingManifest();
    manifest.menu = {};
    manifest.posUsers = [];
    manifest.products[0].sku = 'ROOM-SEA-2';
    manifest.products[1].sku = 'BUFFET-PM';
    manifest.products[0].campId = own;

    const res = await postImport(db, 't_overlap_a', manifest);
    expect(res.status).toBe(200);
    expect(db.prepare("SELECT camp_id FROM pos_products WHERE sku = 'ROOM-SEA-2'").get().camp_id).toBe(own);
    // The inherited FK edge landed intact on the resolved project.
    expect(db.prepare("SELECT camp_id FROM rate_plans_new WHERE name = 'Season A'").get().camp_id).toBe(own);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('treats ANOTHER tenant’s live project id as unresolvable', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_b', overlappingManifest());
    const foreign = tenantProjectId(db, 't_overlap_b');

    // The probe is tenant-scoped (`WHERE tenant_id = ?`), so a real, live,
    // non-deleted project row that merely belongs to a sibling tenant must not
    // satisfy it — the exact leak the silent-200 variant allowed.
    const res = await postImport(db, 't_overlap_a', {
      products: [{ name: 'Sea View Room', sku: 'ROOM-SEA-1', basePrice: 220, capacity: 4, type: 'room', campId: foreign }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(`references unknown camp "${foreign}"`);
    expect(db.prepare('SELECT COUNT(*) c FROM pos_products WHERE tenant_id = ?').get('t_overlap_a').c).toBe(0);
  });

  it('treats a SOFT-DELETED project as unresolvable', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());
    const own = tenantProjectId(db, 't_overlap_a');
    db.prepare("UPDATE projects SET deleted_at = datetime('now') WHERE id = ?").run(own);

    // `deleted_at IS NULL` is what makes the probe agree with the rooms guard
    // (`FROM projects c3 … c3.deleted_at IS NULL`) and with the set
    // `defaultCampId` is drawn from: a soft-deleted project is not attached.
    const res = await postImport(db, 't_overlap_a', {
      products: [{ name: 'Sea View Room', sku: 'ROOM-SEA-9', basePrice: 220, capacity: 4, type: 'room', campId: own }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(`references unknown camp "${own}"`);
    expect(db.prepare("SELECT COUNT(*) c FROM pos_products WHERE sku = 'ROOM-SEA-9'").get().c).toBe(0);
  });

  it('leaves a manifest that omits campId completely unchanged (success path)', async () => {
    const db = buildImportDb();
    const res = await postImport(db, 't_overlap_a', overlappingManifest());
    expect(res.status).toBe(200);
    const counts = (await res.json()).counts;
    for (const section of ['products', 'rooms', 'ratePlans', 'mealCategories', 'meals', 'posUsers']) {
      expect(counts[section]).toBeGreaterThan(0);
    }

    // Omitting campId must still fall back to the tenant default project, and
    // the room/rate-plan guards must keep passing (they read the same project).
    const own = tenantProjectId(db, 't_overlap_a');
    expect(db.prepare('SELECT COUNT(*) c FROM pos_products WHERE camp_id = ?').get(own).c).toBe(2);
    expect(db.prepare('SELECT COUNT(*) c FROM rooms_new WHERE camp_id = ?').get(own).c).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('chunks the probe so a manifest with MORE than 50 distinct campIds still 400s cleanly', async () => {
    const db = buildImportDb();
    // 120 distinct ids forces three chunks (50/50/20). The bound-parameter
    // ceiling this guards is D1's "100 per query" (`too many SQL variables`),
    // which local better-sqlite3 does NOT enforce (SQLite's own ceiling is
    // 32766) — so this test proves the chunk loop really runs over the whole
    // id set and still answers the documented 400, not that D1 would have
    // thrown without it.
    const products = Array.from({ length: 120 }, (_, i) => ({
      name: `Bulk Room ${i}`,
      sku: `BULK-${i}`,
      basePrice: 100 + i,
      capacity: 2,
      type: 'room',
      campId: `proj_bulk_${i}`,
    }));
    const res = await postImport(db, 't_overlap_a', { products });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Product "Bulk Room 0" references unknown camp "proj_bulk_0". ' +
        'campId must name a project this tenant already owns; omit it to attach the row to the tenant default project.'
    );
    expectNoRows(db);
  });

  it('rejects an UNRESOLVABLE meal categoryName with a 400 before writing a single row', async () => {
    const db = buildImportDb();
    const manifest = overlappingManifest();
    // "Lunch" is declared by neither this manifest nor the (empty) tenant.
    manifest.menu.categories = [{ name: 'Breakfast', position: 1 }];
    manifest.menu.meals[0].categoryName = 'Lunch';

    const res = await postImport(db, 't_overlap_a', manifest);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      'Meal "Eggs Benedict" references unknown category "Lunch". ' +
        'Declare the category in menu.categories[] or remove categoryName.'
    );

    // Nothing was written: `meals.meal_category_id` is NOT NULL REFERENCES
    // meal_categories(id) at the 0111 head, so before this pre-flight an
    // unresolvable name bound NULL and surfaced as an opaque 500 AFTER the
    // product/room/rate-plan/category rows had already landed. Every table
    // this manifest touches must still be empty.
    expectNoRows(db);
  });

  it('resolves a categoryName against a PRE-EXISTING tenant category, not just declared ones', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());

    // Second manifest declares no categories at all and points at the category
    // the first import created — the name must still resolve, or a
    // categoryName-only manifest could never address its own tenant's menu.
    const manifest = overlappingManifest();
    manifest.products = [];
    manifest.rooms = [];
    manifest.ratePlans = [];
    manifest.posUsers = [];
    manifest.menu = {
      meals: [{ name: 'Later Breakfast', categoryName: 'Breakfast', price: 31 }],
    };

    const res = await postImport(db, 't_overlap_a', manifest);
    expect(res.status).toBe(200);
    expect((await res.json()).counts.meals).toBe(1);
    const meal = db.prepare("SELECT m.meal_category_id FROM meals m JOIN meal_lang l ON l.meal_id = m.id AND l.lang = 'en' WHERE l.name = 'Later Breakfast'").get();
    const cat = db.prepare("SELECT meal_category_id AS id FROM meal_categories_lang WHERE name = 'Breakfast' AND lang = 'en'").get();
    expect(meal.meal_category_id).toBe(cat.id);
  });

  it('leaves a meal carrying an explicit mealCategoryId out of the name pre-flight', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());
    const breakfast = db.prepare("SELECT meal_category_id AS id FROM meal_categories_lang WHERE name = 'Breakfast' AND lang = 'en'").get().id;

    // No categoryName at all, so there is no name to resolve: the explicit id
    // is bound verbatim and must sail through the pre-flight untouched (its
    // own existence check is a separate blocker — the parity audit's D4).
    const manifest = overlappingManifest();
    manifest.products = [];
    manifest.rooms = [];
    manifest.ratePlans = [];
    manifest.posUsers = [];
    manifest.menu = {
      meals: [{ name: 'Direct Id Meal', mealCategoryId: breakfast, price: 12 }],
    };

    const res = await postImport(db, 't_overlap_a', manifest);
    expect(res.status).toBe(200);
    const meal = db.prepare("SELECT m.meal_category_id FROM meals m JOIN meal_lang l ON l.meal_id = m.id AND l.lang = 'en' WHERE l.name = 'Direct Id Meal'").get();
    expect(meal.meal_category_id).toBe(breakfast);
  });

  it('rejects a same-tenant duplicate meal id with 409 before writing anything', async () => {
    const db = buildImportDb();
    await postImport(db, 't_overlap_a', overlappingManifest());
    const own = db.prepare('SELECT id FROM meals WHERE tenant_id = ?').get('t_overlap_a').id;

    // Fresh SKUs so the meal-id probe — not the SKU arbiter — is what fires.
    const manifest = overlappingManifest();
    manifest.products[0].sku = 'ROOM-SEA-2';
    manifest.products[1].sku = 'BUFFET-PM';
    manifest.menu.meals[0].id = own;
    const res = await postImport(db, 't_overlap_a', manifest);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists in this tenant/);
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE tenant_id = ?').get('t_overlap_a').c).toBe(1);
  });
});
