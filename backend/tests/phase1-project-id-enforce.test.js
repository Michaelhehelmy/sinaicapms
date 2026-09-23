/**
 * Phase-1 — enforcement tests for project_id NOT NULL (0105–0107).
 *
 * Covers migrations:
 *   0105_backfill_order_items_project_id.sql  (15 data-only UPDATEs, WHERE project_id IS NULL)
 *   0106_enforce_not_null_order_items.sql     (order_items rebuild → NOT NULL)
 *   0107_enforce_not_null_other_tables.sql    (10 rebuilds → NOT NULL + 7 filtered idx_*_nn)
 *
 * Recon ground truth: /tmp/opencode/p1-recon.md §§1–§5 (task tenant-arch-p1a-recon,
 * 2026-09-23). Verdicts used literally:
 *   ENFORCE (11): order_items, rooms_new, rate_plans_new, meal_schedules,
 *     service_items, meals, meal_categories, pos_products, pos_tables,
 *     inventory_adjustments, pos_transaction_items
 *   STAY-NULLABLE + filtered index (7): orders, pos_transactions, pos_users,
 *     promotions, pos_stores, carts, storefront_orders
 *
 * Pattern copied from tests/phase0-project-id.test.js: better-sqlite3 :memory: db,
 * full-shape pre-0100 stubs (every column the 0106/0107 INSERT…SELECT lists read),
 * replay the REAL migration files via db.exec(readFileSync(...)), then assert with
 * PRAGMA table_info + sqlite_master lookups + owner-pattern INSERT probes:
 * valid project_id → ok; NULL project_id → NOT NULL constraint error; DELETE cleanup.
 *
 * ENV NOTE: better-sqlite3 enforces foreign keys by default (PRAGMA foreign_keys = 1),
 * same as D1. The 0106/0107 rebuilds therefore run inside an explicit transaction
 * (mirroring D1's per-file atomic apply) so PRAGMA defer_foreign_keys takes effect.
 * Scope: report real failures as failures — never fake green.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const execMigration = (db, file) =>
  db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
const readMigration = (file) =>
  readFileSync(join(migrationsDir, file), 'utf8');
// D1 applies each migration file atomically (single transaction) — the 0066
// rebuild idiom depends on it: PRAGMA defer_foreign_keys only takes effect
// inside a transaction, and DROP TABLE's implicit DELETE FROM would otherwise
// trip immediate RESTRICT checks (e.g. DROP pos_products while the rebuilt
// rooms_new still references its rows). Wrap 0106/0107 the way D1 runs them.
// Executable statements only — migration headers legitimately name deferred
// tables/constraints in prose, so text-shape guards must ignore `--` comments.
const codeLines = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

// ─── Fixture ids ─────────────────────────────────────────────────────────────
const T = 't_fix'; // tenant with two live projects (p_fix1 oldest → tie-break default)
const P1 = 'p_fix1'; // oldest live project of t_fix → every "tenant default" fall-through
const P2 = 'p_fix2'; // newer live project of t_fix
const GHOST = 't_ghost'; // tenant that does not exist (orphan/unmapped residuals)

// ─── Full-shape pre-0100 stubs ───────────────────────────────────────────────
// Every column the 0106/0107 INSERT…SELECT lists read (project_id itself arrives
// via the real 0100–0103 files, except service_items which has it since 0072).
// FK clauses omitted (better-sqlite3 leaves FK enforcement off; NOT NULL /
// UNIQUE / CHECK still enforced, which is what these tests assert).
function buildStubDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY,
      subdomain TEXT UNIQUE,
      name TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT,
      slug TEXT NOT NULL,
      project_type TEXT DEFAULT 'camp',
      status TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      UNIQUE(tenant_id, slug)
    );
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE tenant_org_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE service_definitions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(tenant_id, slug)
    );
    CREATE TABLE rooms_new (
      id TEXT PRIMARY KEY,
      camp_id TEXT,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'available',
      bed_type TEXT DEFAULT 'single',
      max_guests INTEGER DEFAULT 2,
      base_price REAL DEFAULT 0,
      floor TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      tenant_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      room_status TEXT DEFAULT 'available',
      cleaning_status TEXT DEFAULT 'clean' CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected'))
    );
    CREATE TABLE rate_plans_new (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      camp_id TEXT,
      name TEXT NOT NULL,
      season TEXT DEFAULT 'all',
      start_date TEXT,
      end_date TEXT,
      price_per_night REAL NOT NULL,
      min_stay INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
    CREATE TABLE meal_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      camp_id TEXT,
      date TEXT NOT NULL,
      meal_id TEXT NOT NULL,
      package_type TEXT NOT NULL DEFAULT 'all',
      max_servings INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE service_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      service_definition_id TEXT NOT NULL,
      project_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      base_price REAL DEFAULT 0,
      meta_data JSON DEFAULT ('{}'),
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      price_tier TEXT DEFAULT 'standard' CHECK(price_tier IN ('standard', 'premium', 'luxury')),
      price_premium REAL DEFAULT 0
    );
    CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      meal_category_id TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
    CREATE TABLE meal_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'acaciacamp',
      organization_id INTEGER NOT NULL DEFAULT 1,
      category_id INTEGER,
      brand_id INTEGER,
      supplier_id INTEGER,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      short_description TEXT,
      images JSON DEFAULT '[]',
      cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
      selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
      compare_price DECIMAL(10,2),
      profit_margin REAL GENERATED ALWAYS AS (
        CASE
          WHEN selling_price > 0 THEN ((selling_price - cost_price) / selling_price) * 100
          ELSE 0
        END
      ) STORED,
      weight REAL,
      dimensions JSON DEFAULT '{}',
      unit TEXT DEFAULT 'pcs',
      min_stock_level INTEGER DEFAULT 10,
      max_stock_level INTEGER DEFAULT 1000,
      reorder_point INTEGER DEFAULT 20,
      is_trackable BOOLEAN DEFAULT TRUE,
      is_serialized BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      is_featured BOOLEAN DEFAULT FALSE,
      tags JSON DEFAULT '[]',
      attributes JSON DEFAULT '{}',
      seo_title TEXT,
      seo_description TEXT,
      type TEXT CHECK(type IN ('room','menu','buffet','retail')) DEFAULT 'retail',
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      stock_quantity INTEGER DEFAULT 0,
      image_url TEXT,
      tax_rate DECIMAL(5,2) DEFAULT 0.0,
      camp_id TEXT,
      capacity INTEGER DEFAULT 1,
      variant_of TEXT,
      variant_attributes TEXT DEFAULT '{}',
      supplier_name TEXT
    );
    CREATE TABLE pos_tables (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 2,
      status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'reserved', 'cleaning')),
      section TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reservation_name TEXT,
      reservation_time TEXT,
      reservation_date TEXT,
      party_size INTEGER DEFAULT 0
    );
    CREATE TABLE inventory_adjustments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      adjustment INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'manual',
      reference TEXT,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pos_transaction_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
      order_id TEXT NOT NULL,
      transaction_id TEXT,
      product_id TEXT NOT NULL,
      variant_id INTEGER,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      tax_amount DECIMAL(10,2) DEFAULT 0.0,
      discount_amount DECIMAL(10,2) DEFAULT 0.0,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'room_night',
      reference_id TEXT,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      split_group INTEGER DEFAULT 1,
      course_number INTEGER DEFAULT 0,
      course_status TEXT DEFAULT 'pending' CHECK(course_status IN ('pending', 'served', 'completed'))
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      camp_id TEXT,
      room_id TEXT NOT NULL,
      customer_id TEXT,
      order_state_id TEXT NOT NULL,
      check_in_date TEXT NOT NULL,
      check_out_date TEXT NOT NULL,
      number_of_people INTEGER DEFAULT 1,
      total_amount REAL NOT NULL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      payment_method TEXT,
      payment_status TEXT DEFAULT 'pending',
      reference TEXT UNIQUE NOT NULL,
      invoice_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      table_id TEXT,
      kitchen_status TEXT DEFAULT 'pending' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'canceled'))
    );
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
      organization_id INTEGER NOT NULL DEFAULT 1,
      store_id INTEGER NOT NULL DEFAULT 1,
      order_number TEXT UNIQUE NOT NULL,
      transaction_number TEXT,
      customer_id INTEGER,
      cashier_id TEXT NOT NULL,
      order_type TEXT DEFAULT 'sale',
      status TEXT DEFAULT 'pending',
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      payment_method TEXT,
      payment_status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pos_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      store_id INTEGER,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tenant_id TEXT,
      deleted_at DATETIME,
      last_login DATETIME,
      status TEXT DEFAULT 'active',
      camp_id TEXT,
      name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED
    );
    CREATE TABLE promotions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('percentage','fixed','bogo')),
      value REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pos_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE carts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE storefront_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      session_id TEXT,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
  `);
  return db;
}

// Seed tenants + projects BEFORE 0104: t_fix already homed (untouched by the
// provisioner), t_lonely project-less (0104 must provision exactly one default).
function seedTenants(db) {
  db.prepare("INSERT INTO tenants (id, subdomain, name) VALUES (?, 'fix', 'Fix Camp')").run(T);
  db.prepare("INSERT INTO tenants (id, subdomain, name) VALUES ('t_lonely', 'lonely', 'Lonely Camp')").run();
  // P1 oldest-live wins the tie-break → P1 is every "tenant default" fall-through.
  db.prepare(
    "INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at) VALUES (?, ?, 'Fix One', 'one', 'camp', 'active', '2026-01-01')"
  ).run(P1, T);
  db.prepare(
    "INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at) VALUES (?, ?, 'Fix Two', 'two', 'camp', 'active', '2026-06-01')"
  ).run(P2, T);
  db.prepare('INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES (?, 200)').run(T);
  db.prepare("INSERT INTO service_definitions (id, tenant_id, slug, name) VALUES ('sd_fix', ?, 'svc', 'Svc')").run(T);
}

// 0105 fixtures: one NULL-project row per backfilled table exercising each source
// shape (direct / parent-copy / product-camp / first-line / tenant-default /
// partial-residual), plus a pre-tagged row proving 0105 never overwrites.
function seedBackfillFixtures(db) {
  // Products first (parents for rooms / lines / adjustments).
  db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, camp_id, project_id) VALUES ('prod_fix', ?, 'SKU-FIX', 'Fix Product', ?, NULL)").run(T, P1);
  db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, camp_id, project_id) VALUES ('prod_p2', ?, 'SKU-P2', 'P2 Product', ?, NULL)").run(T, P2);
  db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name, camp_id, project_id) VALUES ('prod_nocamp', ?, 'SKU-NC', 'NoCamp Product', NULL, NULL)").run(T);
  // Rooms: direct camp rename + pre-tagged (must survive) + null-camp room (orders room-fallback needs a camp-less room).
  db.prepare("INSERT INTO rooms_new (id, product_id, name, camp_id, project_id) VALUES ('r1', 'prod_fix', 'R1', ?, NULL)").run(P2);
  db.prepare("INSERT INTO rooms_new (id, product_id, name, camp_id, project_id) VALUES ('r_pre', 'prod_fix', 'RPre', ?, ?)").run(P1, P2);
  // Rate plans: camp rule.
  db.prepare("INSERT INTO rate_plans_new (id, tenant_id, product_id, camp_id, name, price_per_night, project_id) VALUES ('rp1', ?, 'prod_fix', ?, 'RP1', 100, NULL)").run(T, P1);
  // Orders: camp-direct + room-fallback + tenant-default.
  const ord = db.prepare(
    "INSERT INTO orders (id, tenant_id, camp_id, room_id, order_state_id, check_in_date, check_out_date, reference, project_id) VALUES (?, ?, ?, ?, 'st', '2026-01-01', '2026-01-02', ?, NULL)"
  );
  ord.run('o_camp', T, P2, 'r1', 'REF-CAMP');
  ord.run('o_room', T, null, 'r1', 'REF-ROOM');
  // 'r_ghost' matches no rooms_new row (FKs unenforced in :memory:) so the
  // room-fallback subquery yields NULL and the tenant default fires.
  ord.run('o_deft', T, null, 'r_ghost', 'REF-DEFT');
  // Order items: parent-copy (runs after orders in the same 0105 file).
  db.prepare("INSERT INTO order_items (id, order_id, name, project_id) VALUES ('oi1', 'o_camp', 'OI1', NULL)").run();
  // POS txn headers: first-line-product camp (two lines — MIN(rowid) wins) + lineless → tenant default.
  db.prepare("INSERT INTO pos_transactions (id, tenant_id, order_number, cashier_id, project_id) VALUES ('ptx1', ?, 'ON-1', 'c1', NULL)").run(T);
  db.prepare("INSERT INTO pos_transactions (id, tenant_id, order_number, cashier_id, project_id) VALUES ('ptx_nolines', ?, 'ON-2', 'c1', NULL)").run(T);
  // POS txn lines: product-camp direct + nocamp-product → parent-txn fall-through.
  const item = db.prepare(
    "INSERT INTO pos_transaction_items (id, tenant_id, order_id, product_id, quantity, project_id) VALUES (?, ?, ?, ?, 1, NULL)"
  );
  item.run('pii_first', T, 'ptx1', 'prod_p2');
  item.run('pii_second', T, 'ptx1', 'prod_fix');
  item.run('pii_parent', T, 'ptx1', 'prod_nocamp');
  item.run('pii_deft', T, 'ptx_nolines', 'prod_nocamp');
  // Inventory: product camp + nocamp → tenant default.
  db.prepare("INSERT INTO inventory_adjustments (id, tenant_id, product_id, adjustment, project_id) VALUES ('ia1', ?, 'prod_p2', 5, NULL)").run(T);
  db.prepare("INSERT INTO inventory_adjustments (id, tenant_id, product_id, adjustment, project_id) VALUES ('ia2', ?, 'prod_nocamp', 5, NULL)").run(T);
  // Meals + categories: tenant default.
  db.prepare("INSERT INTO meal_categories (id, tenant_id, project_id) VALUES ('mc_fix', ?, NULL)").run(T);
  db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, project_id) VALUES ('m_fix', ?, 'mc_fix', NULL)").run(T);
  // Meal schedules: camp-direct + null camp → tenant default.
  db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms1', ?, ?, '2026-10-01', 'm_fix', NULL)").run(T, P2);
  db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms2', ?, NULL, '2026-10-01', 'm_fix', NULL)").run(T);
  // Tables + service items: tenant default.
  db.prepare("INSERT INTO pos_tables (id, tenant_id, name, project_id) VALUES ('pt_fix', ?, 'PT', NULL)").run(T);
  db.prepare("INSERT INTO service_items (id, tenant_id, service_definition_id, name, project_id) VALUES ('si1', ?, 'sd_fix', 'SI1', NULL)").run(T);
  // Users: resolvable → default; ghost tenant → stays NULL (documented orphan).
  const usr = db.prepare(
    "INSERT INTO pos_users (organization_id, username, email, password_hash, first_name, last_name, tenant_id, project_id) VALUES (1, ?, ?, 'h', 'F', 'L', ?, ?)"
  );
  usr.run('u_fix', 'u_fix@x.test', T, null);
  usr.run('u_ghost', 'u_ghost@x.test', GHOST, null);
  // Stores: mapped org → default; unmapped org → stays NULL (convention-only binding).
  const sto = db.prepare(
    "INSERT INTO pos_stores (organization_id, name, code, address, city, project_id) VALUES (?, ?, ?, 'Addr', 'City', NULL)"
  );
  sto.run(200, 'Mapped Store', 'MAP1');
  sto.run(999, 'Unmapped Store', 'UNMAP1');
  // No-statement tables: rows stay NULL by verdict.
  db.prepare("INSERT INTO promotions (id, tenant_id, name, type, project_id) VALUES ('pr1', ?, 'PR1', 'fixed', NULL)").run(T);
  db.prepare("INSERT INTO carts (id, tenant_id, project_id) VALUES ('c1', ?, NULL)").run(T);
  db.prepare("INSERT INTO storefront_orders (id, tenant_id, reference, project_id) VALUES ('so1', ?, 'SREF1', NULL)").run(T);
}

const projOf = (db, table, idCol, id) =>
  db.prepare(`SELECT project_id FROM ${table} WHERE ${idCol} = ?`).get(id)?.project_id;

describe('Phase-1 project_id enforcement (0105–0107)', () => {
  let db;

  beforeAll(() => {
    db = buildStubDb();
    execMigration(db, '0100_add_project_id_nullable.sql');
    execMigration(db, '0101_add_pos_stores_project_id.sql');
    execMigration(db, '0102_add_order_items_project_id_nullable.sql');
    execMigration(db, '0103_add_carts_project_id.sql');
    seedTenants(db);
    execMigration(db, '0104_provision_default_projects.sql');
    seedBackfillFixtures(db);
    execMigration(db, '0105_backfill_order_items_project_id.sql');
  });

  describe('0104 pre-condition — homed tenant untouched, lonely provisioned', () => {
    it('leaves the fixture tenant with exactly its two seeded projects', () => {
      expect(db.prepare('SELECT COUNT(*) AS n FROM projects WHERE tenant_id = ?').get(T).n).toBe(2);
    });

    it('provisions one default-camp project for the lonely tenant', () => {
      const rows = db.prepare("SELECT * FROM projects WHERE tenant_id = 't_lonely'").all();
      expect(rows).toHaveLength(1);
      expect(rows[0].slug).toBe('default-camp');
    });
  });

  describe('0105 text shape — 15 UPDATEs, none on the no-statement tables', () => {
    it('holds exactly 15 UPDATE statements', () => {
      const updates = codeLines(readMigration('0105_backfill_order_items_project_id.sql')).match(/^UPDATE /gm);
      expect(updates).toHaveLength(15);
    });

    it.each(['promotions', 'carts', 'storefront_orders'])(
      'has no UPDATE on %s (stays NULL by verdict)',
      (table) => {
        expect(codeLines(readMigration('0105_backfill_order_items_project_id.sql'))).not.toContain(`UPDATE ${table} `);
      }
    );
  });

  describe('0105 backfill — direct rename sources', () => {
    it('rooms_new: project_id = camp_id', () => {
      expect(projOf(db, 'rooms_new', 'id', 'r1')).toBe(P2);
    });

    it('rooms_new: never overwrites an already-tagged row', () => {
      expect(projOf(db, 'rooms_new', 'id', 'r_pre')).toBe(P2);
    });

    it('rate_plans_new: project_id = camp_id', () => {
      expect(projOf(db, 'rate_plans_new', 'id', 'rp1')).toBe(P1);
    });

    it('pos_products: camp-direct wins; null camp falls to tenant default', () => {
      expect(projOf(db, 'pos_products', 'id', 'prod_fix')).toBe(P1);
      expect(projOf(db, 'pos_products', 'id', 'prod_nocamp')).toBe(P1);
    });
  });

  describe('0105 backfill — orders + order_items ordering', () => {
    it('orders: camp-direct', () => {
      expect(projOf(db, 'orders', 'id', 'o_camp')).toBe(P2);
    });

    it("orders: null camp falls back to the room's project", () => {
      expect(projOf(db, 'orders', 'id', 'o_room')).toBe(P2);
    });

    it('orders: null camp + unresolvable room falls back to tenant default', () => {
      expect(projOf(db, 'orders', 'id', 'o_deft')).toBe(P1);
    });

    it('order_items: parent-copy runs after orders in the same file', () => {
      expect(projOf(db, 'order_items', 'id', 'oi1')).toBe(P2);
    });
  });

  describe('0105 backfill — POS lines before headers', () => {
    it('pos_transactions: first line-item product camp wins (MIN(rowid))', () => {
      expect(projOf(db, 'pos_transactions', 'id', 'ptx1')).toBe(P2);
    });

    it('pos_transactions: lineless header falls back to tenant default', () => {
      expect(projOf(db, 'pos_transactions', 'id', 'ptx_nolines')).toBe(P1);
    });

    it('pos_transaction_items: product camp, else parent txn (backfilled above)', () => {
      expect(projOf(db, 'pos_transaction_items', 'id', 'pii_first')).toBe(P2);
      expect(projOf(db, 'pos_transaction_items', 'id', 'pii_second')).toBe(P1);
      expect(projOf(db, 'pos_transaction_items', 'id', 'pii_parent')).toBe(P2);
      expect(projOf(db, 'pos_transaction_items', 'id', 'pii_deft')).toBe(P1);
    });

    it('inventory_adjustments: product camp, else tenant default', () => {
      expect(projOf(db, 'inventory_adjustments', 'id', 'ia1')).toBe(P2);
      expect(projOf(db, 'inventory_adjustments', 'id', 'ia2')).toBe(P1);
    });
  });

  describe('0105 backfill — tenant-default + partial tables', () => {
    it('meals + meal_categories land on the tenant default', () => {
      expect(projOf(db, 'meals', 'id', 'm_fix')).toBe(P1);
      expect(projOf(db, 'meal_categories', 'id', 'mc_fix')).toBe(P1);
    });

    it('meal_schedules: camp-direct, else tenant default', () => {
      expect(projOf(db, 'meal_schedules', 'id', 'ms1')).toBe(P2);
      expect(projOf(db, 'meal_schedules', 'id', 'ms2')).toBe(P1);
    });

    it('pos_tables + service_items land on the tenant default', () => {
      expect(projOf(db, 'pos_tables', 'id', 'pt_fix')).toBe(P1);
      expect(projOf(db, 'service_items', 'id', 'si1')).toBe(P1);
    });

    it('pos_users partial: resolvable tagged, ghost-tenant orphan stays NULL', () => {
      expect(db.prepare("SELECT project_id FROM pos_users WHERE username = 'u_fix'").get().project_id).toBe(P1);
      expect(db.prepare("SELECT project_id FROM pos_users WHERE username = 'u_ghost'").get().project_id).toBeNull();
    });

    it('pos_stores partial: mapped org tagged, unmapped org stays NULL', () => {
      expect(db.prepare('SELECT project_id FROM pos_stores WHERE code = ?').get('MAP1').project_id).toBe(P1);
      expect(db.prepare('SELECT project_id FROM pos_stores WHERE code = ?').get('UNMAP1').project_id).toBeNull();
    });

    it.each(['promotions', 'carts', 'storefront_orders'])(
      '%s rows stay NULL (no 0105 statement)',
      (table) => {
        expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id IS NOT NULL`).get().n).toBe(0);
      }
    );
  });

  describe('0105 residual — every ENFORCE table closes to zero NULLs', () => {
    it.each([
      'order_items', 'rooms_new', 'rate_plans_new', 'meal_schedules', 'service_items',
      'meals', 'meal_categories', 'pos_products', 'pos_tables',
      'inventory_adjustments', 'pos_transaction_items',
    ])('%s has no NULL project_id left', (table) => {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id IS NULL`).get().n).toBe(0);
    });
  });

  describe('0106/0107 enforcement + owner pattern', () => {
    beforeAll(() => {
      // Atomic replay (see helper note): mirrors D1 per-file transactions.
      db.exec(`BEGIN; ${readMigration('0106_enforce_not_null_order_items.sql')} COMMIT;`);
      db.exec(`BEGIN; ${readMigration('0107_enforce_not_null_other_tables.sql')} COMMIT;`);
      // Parents for owner probes (orders/pos_transactions stay nullable by verdict).
      db.prepare(
        "INSERT INTO orders (id, tenant_id, camp_id, room_id, order_state_id, check_in_date, check_out_date, reference, project_id) VALUES ('o_own', ?, ?, 'r1', 'st', '2026-01-01', '2026-01-02', 'REF-OWN', ?)"
      ).run(T, P1, P1);
      db.prepare(
        "INSERT INTO pos_transactions (id, tenant_id, order_number, cashier_id, project_id) VALUES ('ptx_own', ?, 'ON-OWN', 'c1', ?)"
      ).run(T, P1);
    });

    // No-collateral-loss: every row copied by the 0106/0107 rebuilds must survive.
    // DROP TABLE under FK enforcement performs an implicit DELETE FROM whose
    // ON DELETE CASCADE actions fire IMMEDIATELY (never deferred) and resolve by
    // table NAME — so dropping a CASCADE parent AFTER its child was rebuilt in
    // the same file wipes the child's freshly copied rows. These asserts pin that.
    describe('no collateral loss — copied rows survive the rebuilds', () => {
      const survivors = [
        ['order_items', 'id', ['oi1']],
        ['rooms_new', 'id', ['r1', 'r_pre']],
        ['rate_plans_new', 'id', ['rp1']],
        ['meal_schedules', 'id', ['ms1', 'ms2']],
        ['service_items', 'id', ['si1']],
        ['meals', 'id', ['m_fix']],
        ['meal_categories', 'id', ['mc_fix']],
        ['pos_products', 'id', ['prod_fix', 'prod_nocamp', 'prod_p2']],
        ['pos_tables', 'id', ['pt_fix']],
        ['inventory_adjustments', 'id', ['ia1', 'ia2']],
        ['pos_transaction_items', 'id', ['pii_first', 'pii_second', 'pii_parent', 'pii_deft']],
        ['orders', 'id', ['o_camp', 'o_room', 'o_deft']],
        ['pos_transactions', 'id', ['ptx1', 'ptx_nolines']],
        ['pos_users', 'username', ['u_fix', 'u_ghost']],
        ['promotions', 'id', ['pr1']],
        ['pos_stores', 'code', ['MAP1', 'UNMAP1']],
        ['carts', 'id', ['c1']],
        ['storefront_orders', 'id', ['so1']],
      ];
      it.each(survivors)('%s keeps %s', (table, idCol, ids) => {
        for (const id of ids) {
          expect(
            db.prepare(`SELECT ${idCol} FROM ${table} WHERE ${idCol} = ?`).get(id)?.[idCol],
            `${table}.${id} lost by the 0106/0107 rebuilds`
          ).toBe(id);
        }
      });
    });

    it('migration text flips the column to NOT NULL', () => {      expect(codeLines(readMigration('0106_enforce_not_null_order_items.sql'))).toContain(
        'project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL'
      );
      const nnCount = codeLines(readMigration('0107_enforce_not_null_other_tables.sql')).match(
        /project_id TEXT NOT NULL REFERENCES projects\(id\) ON DELETE SET NULL/g
      );
      expect(nnCount).toHaveLength(10);
    });

    it.each([
      'order_items', 'rooms_new', 'rate_plans_new', 'meal_schedules', 'service_items',
      'meals', 'meal_categories', 'pos_products', 'pos_tables',
      'inventory_adjustments', 'pos_transaction_items',
    ])('%s: PRAGMA shows project_id NOT NULL', (table) => {
      const col = db.prepare(`PRAGMA table_info(${table})`).all().find((c) => c.name === 'project_id');
      expect(col).toBeTruthy();
      expect(col.notnull).toBe(1);
    });

    it('foreign_key_check is clean after all rebuilds', () => {
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });

    it('rebuild triggers are recreated (trigger-drop-first idiom)', () => {
      for (const trg of ['trg_rooms_new_updated_at', 'update_products_timestamp']) {
        expect(
          db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(trg)?.name
        ).toBe(trg);
      }
    });

    it('pos_products keeps its live index set (incl. idx_pos_products_project)', () => {
      // Sibling flag: live prod carries 12 idx_pos_products_* — assert the live
      // list from sqlite_master, not a hard-coded count.
      const live = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_pos_products_%' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(live).toEqual(
        expect.arrayContaining([
          'idx_pos_products_camp', 'idx_pos_products_type', 'idx_pos_products_tenant_type',
          'idx_pos_products_deleted', 'idx_pos_products_active_tenant', 'idx_pos_products_tenant',
          'idx_pos_products_org', 'idx_pos_products_category', 'idx_pos_products_active',
          'idx_pos_products_stock', 'idx_pos_products_barcode', 'idx_pos_products_project',
        ])
      );
    });

    // Owner pattern per enforced table: valid INSERT → ok; NULL INSERT →
    // NOT NULL constraint error naming project_id; DELETE cleanup (idempotent).
    describe('owner pattern — valid ok / NULL rejected / cleanup', () => {
      // Per-table minimal valid INSERT (all other NOT NULLs/UNIQUEs satisfied so
      // the NULL probe fails ONLY on project_id). `vid`/`nid` keep reruns green.
      const validInsert = (db, table, vid) => {
        switch (table) {
          case 'order_items':
            db.prepare('INSERT INTO order_items (id, order_id, name, project_id) VALUES (?, ?, ?, ?)').run(vid, 'o_own', 'Own', P1);
            break;
          case 'rooms_new':
            db.prepare('INSERT INTO rooms_new (id, product_id, name, camp_id, project_id) VALUES (?, ?, ?, ?, ?)').run(vid, 'prod_fix', 'Own', P1, P1);
            break;
          case 'rate_plans_new':
            db.prepare('INSERT INTO rate_plans_new (id, tenant_id, product_id, name, price_per_night, project_id) VALUES (?, ?, ?, ?, ?, ?)').run(vid, T, 'prod_fix', 'Own', 10, P1);
            break;
          case 'meal_schedules':
            db.prepare('INSERT INTO meal_schedules (id, tenant_id, date, meal_id, project_id) VALUES (?, ?, ?, ?, ?)').run(vid, T, '2026-11-01', 'm_fix', P1);
            break;
          case 'service_items':
            db.prepare('INSERT INTO service_items (id, tenant_id, service_definition_id, name, project_id) VALUES (?, ?, ?, ?, ?)').run(vid, T, 'sd_fix', 'Own', P1);
            break;
          case 'meals':
            db.prepare('INSERT INTO meals (id, tenant_id, meal_category_id, project_id) VALUES (?, ?, ?, ?)').run(vid, T, 'mc_fix', P1);
            break;
          case 'meal_categories':
            db.prepare('INSERT INTO meal_categories (id, tenant_id, project_id) VALUES (?, ?, ?)').run(vid, T, P1);
            break;
          case 'pos_products':
            db.prepare('INSERT INTO pos_products (id, tenant_id, sku, name, project_id) VALUES (?, ?, ?, ?, ?)').run(vid, T, `SKU-${vid}`, 'Own', P1);
            break;
          case 'pos_tables':
            db.prepare('INSERT INTO pos_tables (id, tenant_id, name, project_id) VALUES (?, ?, ?, ?)').run(vid, T, 'Own', P1);
            break;
          case 'inventory_adjustments':
            db.prepare('INSERT INTO inventory_adjustments (id, tenant_id, product_id, adjustment, project_id) VALUES (?, ?, ?, ?, ?)').run(vid, T, 'prod_fix', 1, P1);
            break;
          case 'pos_transaction_items':
            db.prepare('INSERT INTO pos_transaction_items (id, tenant_id, order_id, product_id, quantity, project_id) VALUES (?, ?, ?, ?, ?, ?)').run(vid, T, 'ptx_own', 'prod_fix', 1, P1);
            break;
          default:
            throw new Error(`no owner fixture for ${table}`);
        }
      };
      const nullInsert = (db, table, nid) => {
        switch (table) {
          case 'order_items':
            db.prepare('INSERT INTO order_items (id, order_id, name, project_id) VALUES (?, ?, ?, NULL)').run(nid, 'o_own', 'Null');
            break;
          case 'rooms_new':
            db.prepare('INSERT INTO rooms_new (id, product_id, name, project_id) VALUES (?, ?, ?, NULL)').run(nid, 'prod_fix', 'Null');
            break;
          case 'rate_plans_new':
            db.prepare('INSERT INTO rate_plans_new (id, tenant_id, product_id, name, price_per_night, project_id) VALUES (?, ?, ?, ?, ?, NULL)').run(nid, T, 'prod_fix', 'Null', 10);
            break;
          case 'meal_schedules':
            db.prepare('INSERT INTO meal_schedules (id, tenant_id, date, meal_id, project_id) VALUES (?, ?, ?, ?, NULL)').run(nid, T, '2026-11-01', 'm_fix');
            break;
          case 'service_items':
            db.prepare('INSERT INTO service_items (id, tenant_id, service_definition_id, name, project_id) VALUES (?, ?, ?, ?, NULL)').run(nid, T, 'sd_fix', 'Null');
            break;
          case 'meals':
            db.prepare('INSERT INTO meals (id, tenant_id, meal_category_id, project_id) VALUES (?, ?, ?, NULL)').run(nid, T, 'mc_fix');
            break;
          case 'meal_categories':
            db.prepare('INSERT INTO meal_categories (id, tenant_id, project_id) VALUES (?, ?, NULL)').run(nid, T);
            break;
          case 'pos_products':
            db.prepare('INSERT INTO pos_products (id, tenant_id, sku, name, project_id) VALUES (?, ?, ?, ?, NULL)').run(nid, T, `SKU-${nid}`, 'Null');
            break;
          case 'pos_tables':
            db.prepare('INSERT INTO pos_tables (id, tenant_id, name, project_id) VALUES (?, ?, ?, NULL)').run(nid, T, 'Null');
            break;
          case 'inventory_adjustments':
            db.prepare('INSERT INTO inventory_adjustments (id, tenant_id, product_id, adjustment, project_id) VALUES (?, ?, ?, ?, NULL)').run(nid, T, 'prod_fix', 1);
            break;
          case 'pos_transaction_items':
            db.prepare('INSERT INTO pos_transaction_items (id, tenant_id, order_id, product_id, quantity, project_id) VALUES (?, ?, ?, ?, ?, NULL)').run(nid, T, 'ptx_own', 'prod_fix', 1);
            break;
          default:
            throw new Error(`no owner fixture for ${table}`);
        }
      };

      it.each([
        'order_items', 'rooms_new', 'rate_plans_new', 'meal_schedules', 'service_items',
        'meals', 'meal_categories', 'pos_products', 'pos_tables',
        'inventory_adjustments', 'pos_transaction_items',
      ])('%s: valid → ok, NULL → constraint error, DELETE cleans up', (table) => {
        const vid = `own_${table}`;
        const nid = `null_${table}`;
        db.prepare(`DELETE FROM ${table} WHERE id IN (?, ?)`).run(vid, nid);
        // (1) valid project_id succeeds…
        validInsert(db, table, vid);
        expect(projOf(db, table, 'id', vid)).toBe(P1);
        // (2) …NULL project_id fails with the constraint error (not just any throw)…
        expect(() => nullInsert(db, table, nid)).toThrow(/NOT NULL constraint failed: .*\.project_id/);
        expect(projOf(db, table, 'id', nid)).toBeUndefined();
        // (3) …and DELETE removes the probe (idempotent re-runs).
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(vid);
        expect(projOf(db, table, 'id', vid)).toBeUndefined();
      });

      it('owner-probe parents clean up after themselves', () => {
        db.prepare("DELETE FROM order_items WHERE id LIKE 'own\\_%' ESCAPE '\\'").run();
        db.prepare("DELETE FROM pos_transaction_items WHERE id LIKE 'own\\_%' ESCAPE '\\'").run();
        db.prepare("DELETE FROM orders WHERE id = 'o_own'").run();
        db.prepare("DELETE FROM pos_transactions WHERE id = 'ptx_own'").run();
        expect(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE id = 'o_own'").get().n).toBe(0);
        expect(db.prepare("SELECT COUNT(*) AS n FROM pos_transactions WHERE id = 'ptx_own'").get().n).toBe(0);
      });
    });

    describe('nullable set — NULL accepted + filtered index exists', () => {
      const NN = {
        orders: 'idx_orders_project_nn',
        pos_transactions: 'idx_pos_transactions_project_nn',
        pos_users: 'idx_pos_users_project_nn',
        promotions: 'idx_promotions_project_nn',
        pos_stores: 'idx_pos_stores_project_nn',
        carts: 'idx_carts_project_nn',
        storefront_orders: 'idx_storefront_orders_project_nn',
      };

      it.each(Object.keys(NN))('%s: filtered index WHERE project_id IS NOT NULL exists', (table) => {
        const row = db
          .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = ?")
          .get(NN[table]);
        expect(row?.name).toBe(NN[table]);
        expect(row.sql).toContain('WHERE project_id IS NOT NULL');
      });

      it.each(Object.keys(NN))('%s: PRAGMA still shows project_id nullable', (table) => {
        const col = db.prepare(`PRAGMA table_info(${table})`).all().find((c) => c.name === 'project_id');
        expect(col).toBeTruthy();
        expect(col.notnull).toBe(0);
      });

      it('orders accepts NULL project_id', () => {
        db.prepare("DELETE FROM orders WHERE id = 'n_orders'").run();
        db.prepare(
          "INSERT INTO orders (id, tenant_id, room_id, order_state_id, check_in_date, check_out_date, reference, project_id) VALUES ('n_orders', ?, 'r1', 'st', '2026-01-01', '2026-01-02', 'REF-N1', NULL)"
        ).run(T);
        expect(projOf(db, 'orders', 'id', 'n_orders')).toBeNull();
        db.prepare("DELETE FROM orders WHERE id = 'n_orders'").run();
      });

      it('pos_transactions accepts NULL project_id (cashier_id, not staff_id)', () => {
        db.prepare("DELETE FROM pos_transactions WHERE id = 'n_ptx'").run();
        db.prepare(
          "INSERT INTO pos_transactions (id, tenant_id, order_number, cashier_id, project_id) VALUES ('n_ptx', ?, 'ON-N1', 'c1', NULL)"
        ).run(T);
        expect(projOf(db, 'pos_transactions', 'id', 'n_ptx')).toBeNull();
        db.prepare("DELETE FROM pos_transactions WHERE id = 'n_ptx'").run();
      });

      it('pos_users accepts NULL project_id (first_name/last_name only — name is GENERATED)', () => {
        db.prepare("DELETE FROM pos_users WHERE username = 'n_user'").run();
        db.prepare(
          "INSERT INTO pos_users (organization_id, username, email, password_hash, first_name, last_name, tenant_id, project_id) VALUES (1, 'n_user', 'n_user@x.test', 'h', 'Null', 'User', ?, NULL)"
        ).run(T);
        const row = db.prepare('SELECT project_id, name FROM pos_users WHERE username = ?').get('n_user');
        expect(row.project_id).toBeNull();
        expect(row.name).toBe('Null User');
        db.prepare("DELETE FROM pos_users WHERE username = 'n_user'").run();
      });

      it('promotions accepts NULL project_id (tenant-wide promo)', () => {
        db.prepare("DELETE FROM promotions WHERE id = 'n_pr'").run();
        db.prepare("INSERT INTO promotions (id, tenant_id, name, type, project_id) VALUES ('n_pr', ?, 'NP', 'fixed', NULL)").run(T);
        expect(projOf(db, 'promotions', 'id', 'n_pr')).toBeNull();
        db.prepare("DELETE FROM promotions WHERE id = 'n_pr'").run();
      });

      it('pos_stores accepts NULL project_id (unmapped org)', () => {
        db.prepare('DELETE FROM pos_stores WHERE code = ?').run('NSTORE1');
        db.prepare(
          "INSERT INTO pos_stores (organization_id, name, code, address, city, project_id) VALUES (999, 'Null Store', 'NSTORE1', 'Addr', 'City', NULL)"
        ).run();
        expect(db.prepare('SELECT project_id FROM pos_stores WHERE code = ?').get('NSTORE1').project_id).toBeNull();
        db.prepare('DELETE FROM pos_stores WHERE code = ?').run('NSTORE1');
      });

      it('carts accepts NULL project_id (ephemeral session cart)', () => {
        db.prepare("DELETE FROM carts WHERE id = 'n_cart'").run();
        db.prepare("INSERT INTO carts (id, tenant_id, project_id) VALUES ('n_cart', ?, NULL)").run(T);
        expect(projOf(db, 'carts', 'id', 'n_cart')).toBeNull();
        db.prepare("DELETE FROM carts WHERE id = 'n_cart'").run();
      });

      it('storefront_orders accepts NULL project_id (read-only legacy)', () => {
        db.prepare("DELETE FROM storefront_orders WHERE id = 'n_so'").run();
        db.prepare("INSERT INTO storefront_orders (id, tenant_id, reference, project_id) VALUES ('n_so', ?, 'SREF-N1', NULL)").run(T);
        expect(projOf(db, 'storefront_orders', 'id', 'n_so')).toBeNull();
        db.prepare("DELETE FROM storefront_orders WHERE id = 'n_so'").run();
      });
    });
  });
});
