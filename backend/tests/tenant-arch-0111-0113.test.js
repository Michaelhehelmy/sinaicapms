/**
 * Tenant-arch P0+P1a+P1b schema tests (migrations 0111–0113).
 *
 * Covers migrations:
 *   0111_fix_project_id_set_null_contradiction.sql (11 P0 rebuilds:
 *     project_id NOT NULL + ON DELETE SET NULL → nullable + SET NULL kept)
 *   0112_drop_pos_tenant_id_defaults.sql           (4 P1a rebuilds:
 *     tenant_id NOT NULL DEFAULT '<…>' → NOT NULL, no DEFAULT;
 *     + DDL-identical structural rebuild of order_discounts)
 *   0113_add_orders_customer_index.sql             (P1b: fresh
 *     idx_orders_customer_id ON orders(customer_id); lookalike
 *     idx_orders_customer ON pos_transactions untouched)
 *
 * Recon ground truth: /tmp/opencode/s-recon.md §§1–§7 (task
 * tenant-arch-s-a-recon, 2026-09-24). Verdicts used literally:
 *   P0  (11): order_items, pos_products, meal_categories, meals, pos_tables,
 *     rooms_new, rate_plans_new, meal_schedules, service_items,
 *     inventory_adjustments, pos_transaction_items
 *   P1a (4): pos_customers + pos_products (DEFAULT 'acaciacamp'),
 *     pos_transactions + pos_transaction_items (DEFAULT 'tenant_1')
 *   P1b: no index on orders(customer_id) under ANY name on either DB;
 *     idx_orders_customer sits on pos_transactions (staging present, local
 *     absent) and must be left untouched → fresh name idx_orders_customer_id.
 *
 * Pattern copied from backend/tests/phase1-project-id-enforce.test.js:
 * better-sqlite3 :memory: db, full-shape pre-0111 stubs (every column the
 * 0111/0112 INSERT…SELECT lists read), replay the REAL migration files via
 * db.exec(readFileSync(...)) inside an explicit transaction (mirroring D1's
 * per-file atomic apply so PRAGMA defer_foreign_keys takes effect), then
 * assert with PRAGMA table_info / foreign_key_list + sqlite_master lookups +
 * behavioral probes. Scope: report real failures as failures — never fake
 * green. No D1 apply, no migration edits, no commits.
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
// Executable statements only — migration headers legitimately name deferred
// tables/constraints in prose, so text-shape guards must ignore `--` comments.
const codeLines = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

// ─── Table sets ──────────────────────────────────────────────────────────────
const P0_TABLES = [
  'order_items',
  'pos_products',
  'meal_categories',
  'meals',
  'pos_tables',
  'rooms_new',
  'rate_plans_new',
  'meal_schedules',
  'service_items',
  'inventory_adjustments',
  'pos_transaction_items',
];
const P1A_TABLES = [
  'pos_customers',
  'pos_products',
  'pos_transactions',
  'pos_transaction_items',
];
const P1A_DEFAULTS = {
  pos_customers: "'acaciacamp'",
  pos_products: "'acaciacamp'",
  pos_transactions: "'tenant_1'",
  pos_transaction_items: "'tenant_1'",
};

// ─── Full-shape pre-0111 stubs ───────────────────────────────────────────────
// Column sets mirror the 0111 staging CREATEs (copies name columns
// explicitly, so every copied column must exist) with the PRE-fix
// constraints: project_id TEXT NOT NULL … SET NULL (the contradiction) and
// the divergent tenant_id DEFAULTs (recon §2). FK clauses are omitted except
// the project_id contradiction lines (needed for DDL fidelity of the
// repo-wide scan); no test rows exist pre-replay, so there is nothing for
// immediate CASCADE actions to wipe and every guard save/restore is a no-op
// on empty tables. Guards tables (meal_lang, meal_categories_lang,
// service_bookings) are left for 0111 to stub via IF NOT EXISTS.
function buildStubDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
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
      UNIQUE(tenant_id, slug)
    );
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE pos_stores (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL
    );
    CREATE TABLE service_definitions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(tenant_id, slug)
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      table_id TEXT,
      customer_id TEXT
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
      course_status TEXT DEFAULT 'pending' CHECK(course_status IN ('pending', 'served', 'completed')),
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
      supplier_name TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE meal_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      meal_category_id TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
      party_size INTEGER DEFAULT 0,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE rooms_new (
      id TEXT PRIMARY KEY,
      camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
      cleaning_status TEXT DEFAULT 'clean' CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected')),
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE rate_plans_new (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      season TEXT DEFAULT 'all',
      start_date TEXT,
      end_date TEXT,
      price_per_night REAL NOT NULL,
      min_stay INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE meal_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      meal_id TEXT NOT NULL,
      package_type TEXT NOT NULL DEFAULT 'all',
      max_servings INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE service_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      service_definition_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL,
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
    CREATE TABLE inventory_adjustments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      adjustment INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'manual',
      reference TEXT,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
      discount_amount DECIMAL(10,2) DEFAULT 0,
      discount_type TEXT,
      discount_reason TEXT,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      tax_rate REAL DEFAULT 0.1,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      change_amount DECIMAL(10,2) DEFAULT 0,
      payment_method TEXT,
      points_earned INTEGER DEFAULT 0,
      points_redeemed INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      order_status TEXT DEFAULT 'completed',
      notes TEXT,
      receipt_url TEXT,
      void_reason TEXT,
      voided_by TEXT,
      voided_at DATETIME,
      refunded_amount DECIMAL(12,2) DEFAULT 0,
      refunded_at DATETIME,
      refunded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      amount_cash REAL DEFAULT 0.0,
      amount_card REAL DEFAULT 0.0,
      idempotency_key TEXT,
      table_id TEXT,
      kitchen_status TEXT DEFAULT 'confirmed' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'canceled')),
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE pos_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT 'acaciacamp',
      customer_number TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      date_of_birth DATE,
      gender TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'VN',
      customer_group TEXT DEFAULT 'regular',
      loyalty_points INTEGER DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      average_order_value DECIMAL(10,2) DEFAULT 0,
      last_order_date DATE,
      acquisition_source TEXT,
      preferences JSON DEFAULT '{}',
      notes TEXT,
      is_vip BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED
    );
    CREATE TABLE order_discounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      transaction_item_id TEXT,
      promotion_id TEXT NOT NULL,
      promotion_name TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed','bogo')),
      discount_value REAL NOT NULL,
      discount_amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

// ─── Repo-wide contradiction scan ────────────────────────────────────────────
// Returns one entry per (table, column) where a column is BOTH NOT NULL and
// the target of an ON DELETE SET NULL FK — the exact P0 contradiction. Check
// (a) catches the single-line inline form in raw DDL; check (b) is
// authoritative and form-agnostic: every FK whose on_delete is SET NULL must
// point at a nullable column (covers split-line FOREIGN KEY clauses too).
function findSetNullNotNullViolations(db) {
  const violations = [];
  const tables = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .all();
  for (const { name, sql } of tables) {
    if (!sql) continue;
    const inlineHits = sql.match(/NOT NULL[^,;]*ON DELETE SET NULL/gi) || [];
    const cols = db.prepare(`PRAGMA table_info(${name})`).all();
    const fks = db.prepare(`PRAGMA foreign_key_list(${name})`).all();
    for (const fk of fks) {
      if (String(fk.on_delete || '').toUpperCase() === 'SET NULL') {
        const col = cols.find((c) => c.name === fk.from);
        if (col && col.notnull === 1) {
          violations.push({
            table: name,
            column: fk.from,
            via: 'foreign_key_list',
          });
        }
      }
    }
    // Inline-form hits must always be a subset of the authoritative hits;
    // flag any table where the text pattern fires but the FK walk missed it
    // (would mean a new DDL form escaped the authoritative check).
    if (inlineHits.length > 0) {
      const covered = violations.some((v) => v.table === name);
      if (!covered) {
        violations.push({ table: name, column: '(inline-text-only)', via: 'ddl-text' });
      }
    }
  }
  return { violations, scannedTables: tables.map((t) => t.name) };
}

const projOf = (db, table, idCol, id) =>
  db.prepare(`SELECT project_id FROM ${table} WHERE ${idCol} = ?`).get(id)?.project_id;

describe('tenant-arch 0111–0113 (P0 orphans + P1a defaults + P1b index)', () => {
  let dbPre;
  let db;

  beforeAll(() => {
    // dbPre stays on the pre-fix stubs (proves the checks fire pre-fix);
    // db replays the REAL 0111–0113 files (D1 per-file atomic apply idiom).
    dbPre = buildStubDb();
    db = buildStubDb();
    db.exec(`BEGIN; ${readMigration('0111_fix_project_id_set_null_contradiction.sql')} COMMIT;`);
    db.exec(`BEGIN; ${readMigration('0112_drop_pos_tenant_id_defaults.sql')} COMMIT;`);
    execMigration(db, '0113_add_orders_customer_index.sql');
  });

  describe('pre-fix sanity — stubs reproduce the reported contradictions', () => {
    it('repo-wide scan finds exactly the 11 P0 tables pre-fix', () => {
      const { violations } = findSetNullNotNullViolations(dbPre);
      expect(violations.map((v) => v.table).sort()).toEqual([...P0_TABLES].sort());
      expect(violations).toHaveLength(11);
      for (const v of violations) {
        expect(v.column).toBe('project_id');
      }
    });

    it('P1a stubs carry the divergent tenant_id DEFAULTs', () => {
      for (const table of P1A_TABLES) {
        const col = dbPre
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .find((c) => c.name === 'tenant_id');
        expect(col.notnull).toBe(1);
        expect(col.dflt_value).toBe(P1A_DEFAULTS[table]);
      }
    });

    it('idx_orders_customer_id exists nowhere pre-fix', () => {
      const row = dbPre
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_orders_customer_id'")
        .get();
      expect(row).toBeUndefined();
    });
  });

  describe('replay — 0111–0113 apply cleanly', () => {
    it('foreign_key_check is clean after all rebuilds', () => {
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });

    it('0111 text flips exactly 11 project_id columns to nullable SET NULL', () => {
      const sql = codeLines(readMigration('0111_fix_project_id_set_null_contradiction.sql'));
      const nullable = sql.match(/project_id TEXT REFERENCES projects\(id\) ON DELETE SET NULL/g) || [];
      expect(nullable).toHaveLength(11);
      expect(sql).not.toMatch(/project_id TEXT NOT NULL REFERENCES/);
    });

    it('0112 text drops the DEFAULT on exactly 4 tenant_id columns (NOT NULL kept)', () => {
      const sql = codeLines(readMigration('0112_drop_pos_tenant_id_defaults.sql'));
      expect(sql).not.toMatch(/tenant_id TEXT NOT NULL DEFAULT/);
      // 4 rebuilt staging tables + the rate_plans_new guard stub (line 94),
      // which is DEFAULT-free by construction.
      const kept = sql.match(/tenant_id TEXT NOT NULL,/g) || [];
      expect(kept).toHaveLength(5);
    });

    it('rebuild triggers are recreated (trigger-drop-first idiom)', () => {
      for (const trg of ['trg_rooms_new_updated_at', 'update_products_timestamp']) {
        expect(
          db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(trg)?.name
        ).toBe(trg);
      }
    });
  });

  describe('P0 — DELETE FROM projects orphans children per table', () => {
    const T = 't_orph';
    const P = 'p_orph';

    beforeAll(() => {
      // Parents the rebuilt FKs require (INSERT OR IGNORE keeps reruns green).
      db.prepare('INSERT OR IGNORE INTO tenants (id, subdomain, name) VALUES (?, ?, ?)').run(T, 'orph', 'Orphan Camp');
      db.prepare(
        "INSERT OR IGNORE INTO projects (id, tenant_id, name, slug, status) VALUES (?, ?, ?, ?, 'active')"
      ).run(P, T, 'Orphan Project', 'orph');
      db.prepare('INSERT OR IGNORE INTO pos_organizations (id, name) VALUES (1, ?)').run('Org1');
      db.prepare(
        'INSERT OR IGNORE INTO pos_stores (id, organization_id, name, code, address, city) VALUES (1, 1, ?, ?, ?, ?)'
      ).run('Store1', 'S1', 'Addr', 'City');
      db.prepare('INSERT OR IGNORE INTO service_definitions (id, tenant_id, slug, name) VALUES (?, ?, ?, ?)').run(
        'sd_orph',
        T,
        'svc',
        'Svc'
      );
      db.prepare('INSERT OR IGNORE INTO orders (id, tenant_id) VALUES (?, ?)').run('o_orph', T);
      db.prepare("INSERT OR IGNORE INTO pos_products (id, tenant_id, sku, name, project_id) VALUES (?, ?, ?, ?, NULL)").run(
        'prod_orph',
        T,
        'SKU-ORPHP',
        'Orphan Parent Product'
      );
      db.prepare('INSERT OR IGNORE INTO meal_categories (id, tenant_id, project_id) VALUES (?, ?, NULL)').run(
        'mc_orph',
        T
      );
      db.prepare('INSERT OR IGNORE INTO meals (id, tenant_id, meal_category_id, project_id) VALUES (?, ?, ?, NULL)').run(
        'm_orph',
        T,
        'mc_orph'
      );
      db.prepare(
        "INSERT OR IGNORE INTO pos_transactions (id, tenant_id, order_number, cashier_id, project_id) VALUES (?, ?, ?, ?, NULL)"
      ).run('ptx_orph', T, 'ON-ORPH', 'c1');
      // One child row per P0 table, all pointing at the doomed project.
      db.prepare('INSERT OR IGNORE INTO order_items (id, order_id, name, project_id) VALUES (?, ?, ?, ?)').run(
        'oi_orph',
        'o_orph',
        'Orphan Item',
        P
      );
      db.prepare('INSERT OR IGNORE INTO pos_products (id, tenant_id, sku, name, project_id) VALUES (?, ?, ?, ?, ?)').run(
        'prod_orph_child',
        T,
        'SKU-ORPHC',
        'Orphan Child Product',
        P
      );
      db.prepare('INSERT OR IGNORE INTO meal_categories (id, tenant_id, project_id) VALUES (?, ?, ?)').run(
        'mc_orph_child',
        T,
        P
      );
      db.prepare('INSERT OR IGNORE INTO meals (id, tenant_id, meal_category_id, project_id) VALUES (?, ?, ?, ?)').run(
        'm_orph_child',
        T,
        'mc_orph',
        P
      );
      db.prepare('INSERT OR IGNORE INTO pos_tables (id, tenant_id, name, project_id) VALUES (?, ?, ?, ?)').run(
        'pt_orph',
        T,
        'Orphan Table',
        P
      );
      db.prepare('INSERT OR IGNORE INTO rooms_new (id, product_id, name, project_id) VALUES (?, ?, ?, ?)').run(
        'r_orph',
        'prod_orph',
        'Orphan Room',
        P
      );
      db.prepare(
        'INSERT OR IGNORE INTO rate_plans_new (id, tenant_id, product_id, name, price_per_night, project_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('rp_orph', T, 'prod_orph', 'Orphan RP', 100, P);
      db.prepare(
        'INSERT OR IGNORE INTO meal_schedules (id, tenant_id, date, meal_id, project_id) VALUES (?, ?, ?, ?, ?)'
      ).run('ms_orph', T, '2026-10-01', 'm_orph', P);
      db.prepare(
        'INSERT OR IGNORE INTO service_items (id, tenant_id, service_definition_id, name, project_id) VALUES (?, ?, ?, ?, ?)'
      ).run('si_orph', T, 'sd_orph', 'Orphan SI', P);
      db.prepare(
        'INSERT OR IGNORE INTO inventory_adjustments (id, tenant_id, product_id, adjustment, project_id) VALUES (?, ?, ?, ?, ?)'
      ).run('ia_orph', T, 'prod_orph', 5, P);
      db.prepare(
        'INSERT OR IGNORE INTO pos_transaction_items (id, tenant_id, order_id, product_id, quantity, project_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('pti_orph', T, 'ptx_orph', 'prod_orph', 1, P);
      // The delete that failed pre-fix (NOT NULL + SET NULL contradiction).
      const res = db.prepare('DELETE FROM projects WHERE id = ?').run(P);
      expect(res.changes).toBe(1);
    });

    it('removes the parent project', () => {
      expect(db.prepare('SELECT id FROM projects WHERE id = ?').get(P)).toBeUndefined();
    });

    it.each([
      ['order_items', 'id', 'oi_orph'],
      ['pos_products', 'id', 'prod_orph_child'],
      ['meal_categories', 'id', 'mc_orph_child'],
      ['meals', 'id', 'm_orph_child'],
      ['pos_tables', 'id', 'pt_orph'],
      ['rooms_new', 'id', 'r_orph'],
      ['rate_plans_new', 'id', 'rp_orph'],
      ['meal_schedules', 'id', 'ms_orph'],
      ['service_items', 'id', 'si_orph'],
      ['inventory_adjustments', 'id', 'ia_orph'],
      ['pos_transaction_items', 'id', 'pti_orph'],
    ])('%s: child %s survives with project_id NULL', (table, idCol, id) => {
      const row = db.prepare(`SELECT ${idCol}, project_id FROM ${table} WHERE ${idCol} = ?`).get(id);
      expect(row?.[idCol]).toBe(id);
      expect(row.project_id).toBeNull();
    });
  });

  describe('repo-wide — no NOT NULL column with ON DELETE SET NULL', () => {
    it('authoritative scan (foreign_key_list + PRAGMA) finds zero violations', () => {
      const { violations, scannedTables } = findSetNullNotNullViolations(db);
      expect(violations).toEqual([]);
      // The check itself must span the whole schema, not just the 11.
      expect(scannedTables.length).toBeGreaterThan(P0_TABLES.length);
      for (const t of P0_TABLES) {
        expect(scannedTables).toContain(t);
      }
    });

    it.each(P0_TABLES)('%s: PRAGMA shows project_id nullable', (table) => {
      const col = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .find((c) => c.name === 'project_id');
      expect(col).toBeTruthy();
      expect(col.type).toBe('TEXT');
      expect(col.notnull).toBe(0);
    });

    it.each(P0_TABLES)('%s: DDL keeps the SET NULL clause verbatim, minus NOT NULL', (table) => {
      const { sql } = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      expect(sql).toContain('project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
      expect(sql).not.toContain('project_id TEXT NOT NULL');
    });
  });

  describe('P1a — tenant_id NOT NULL with no DEFAULT', () => {
    beforeAll(() => {
      // Self-sufficient parents (INSERT OR IGNORE keeps reruns green).
      db.prepare('INSERT OR IGNORE INTO tenants (id, subdomain, name) VALUES (?, ?, ?)').run(
        't_p1a',
        'p1a',
        'P1a Camp'
      );
      db.prepare('INSERT OR IGNORE INTO pos_organizations (id, name) VALUES (1, ?)').run('Org1');
      db.prepare(
        'INSERT OR IGNORE INTO pos_stores (id, organization_id, name, code, address, city) VALUES (1, 1, ?, ?, ?, ?)'
      ).run('Store1', 'S1', 'Addr', 'City');
      db.prepare("INSERT OR IGNORE INTO pos_products (id, tenant_id, sku, name) VALUES (?, ?, ?, ?)").run(
        'prod_p1a',
        't_p1a',
        'SKU-P1A',
        'P1a Product'
      );
      db.prepare(
        "INSERT OR IGNORE INTO pos_transactions (id, tenant_id, order_number, cashier_id) VALUES (?, ?, ?, ?)"
      ).run('ptx_p1a', 't_p1a', 'ON-P1A', 'c1');
    });

    it.each(P1A_TABLES)('%s: PRAGMA shows tenant_id NOT NULL with no DEFAULT', (table) => {
      const col = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .find((c) => c.name === 'tenant_id');
      expect(col).toBeTruthy();
      expect(col.type).toBe('TEXT');
      expect(col.notnull).toBe(1);
      expect(col.dflt_value).toBeNull();
    });

    it.each(P1A_TABLES)('%s: DDL line is bare NOT NULL (no DEFAULT clause)', (table) => {
      const { sql } = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      expect(sql).toMatch(/tenant_id TEXT NOT NULL,/);
      expect(sql).not.toMatch(/tenant_id TEXT NOT NULL DEFAULT/);
    });

    it('pos_customers: INSERT without tenant_id fails NOT NULL', () => {
      db.prepare("DELETE FROM pos_customers WHERE first_name = 'NoTenant' AND last_name = 'Probe'").run();
      expect(() =>
        db
          .prepare('INSERT INTO pos_customers (organization_id, first_name, last_name) VALUES (1, ?, ?)')
          .run('NoTenant', 'Probe')
      ).toThrow(/NOT NULL constraint failed: .*\.tenant_id/);
      expect(
        db.prepare("SELECT id FROM pos_customers WHERE first_name = 'NoTenant' AND last_name = 'Probe'").get()
      ).toBeUndefined();
    });

    it('pos_products: INSERT without tenant_id fails NOT NULL', () => {
      db.prepare('DELETE FROM pos_products WHERE id = ?').run('prod_no_tenant');
      expect(() =>
        db.prepare('INSERT INTO pos_products (id, sku, name) VALUES (?, ?, ?)').run('prod_no_tenant', 'SKU-NOTENANT', 'X')
      ).toThrow(/NOT NULL constraint failed: .*\.tenant_id/);
      expect(projOf(db, 'pos_products', 'id', 'prod_no_tenant')).toBeUndefined();
    });

    it('pos_transactions: INSERT without tenant_id fails NOT NULL', () => {
      db.prepare('DELETE FROM pos_transactions WHERE id = ?').run('ptx_no_tenant');
      expect(() =>
        db
          .prepare('INSERT INTO pos_transactions (id, order_number, cashier_id) VALUES (?, ?, ?)')
          .run('ptx_no_tenant', 'ON-NOTENANT', 'c1')
      ).toThrow(/NOT NULL constraint failed: .*\.tenant_id/);
      expect(db.prepare('SELECT id FROM pos_transactions WHERE id = ?').get('ptx_no_tenant')).toBeUndefined();
    });

    it('pos_transaction_items: INSERT without tenant_id fails NOT NULL', () => {
      db.prepare('DELETE FROM pos_transaction_items WHERE id = ?').run('pti_no_tenant');
      expect(() =>
        db
          .prepare(
            'INSERT INTO pos_transaction_items (id, order_id, product_id, quantity) VALUES (?, ?, ?, ?)'
          )
          .run('pti_no_tenant', 'ptx_p1a', 'prod_p1a', 1)
      ).toThrow(/NOT NULL constraint failed: .*\.tenant_id/);
      expect(db.prepare('SELECT id FROM pos_transaction_items WHERE id = ?').get('pti_no_tenant')).toBeUndefined();
    });

    it('positive controls: explicit tenant_id succeeds on all 4 tables (then cleanup)', () => {
      db.prepare(
        "INSERT INTO pos_customers (organization_id, tenant_id, first_name, last_name) VALUES (1, 't_p1a', 'Yes', 'Tenant')"
      ).run();
      const cust = db.prepare("SELECT tenant_id FROM pos_customers WHERE first_name = 'Yes'").get();
      expect(cust.tenant_id).toBe('t_p1a');
      db.prepare("INSERT INTO pos_products (id, tenant_id, sku, name) VALUES (?, 't_p1a', ?, ?)").run(
        'prod_yes_tenant',
        'SKU-YESTENANT',
        'Y'
      );
      expect(
        db.prepare('SELECT tenant_id FROM pos_products WHERE id = ?').get('prod_yes_tenant').tenant_id
      ).toBe('t_p1a');
      db.prepare("INSERT INTO pos_transactions (id, tenant_id, order_number, cashier_id) VALUES (?, 't_p1a', ?, ?)").run(
        'ptx_yes_tenant',
        'ON-YESTENANT',
        'c1'
      );
      expect(db.prepare('SELECT tenant_id FROM pos_transactions WHERE id = ?').get('ptx_yes_tenant').tenant_id).toBe(
        't_p1a'
      );
      db.prepare(
        "INSERT INTO pos_transaction_items (id, tenant_id, order_id, product_id, quantity) VALUES (?, 't_p1a', ?, ?, ?)"
      ).run('pti_yes_tenant', 'ptx_p1a', 'prod_p1a', 1);
      expect(
        db.prepare('SELECT tenant_id FROM pos_transaction_items WHERE id = ?').get('pti_yes_tenant').tenant_id
      ).toBe('t_p1a');
      // Cleanup (idempotent reruns).
      db.prepare("DELETE FROM pos_customers WHERE first_name = 'Yes'").run();
      db.prepare('DELETE FROM pos_products WHERE id = ?').run('prod_yes_tenant');
      db.prepare('DELETE FROM pos_transactions WHERE id = ?').run('ptx_yes_tenant');
      db.prepare('DELETE FROM pos_transaction_items WHERE id = ?').run('pti_yes_tenant');
      expect(db.prepare("SELECT COUNT(*) AS n FROM pos_customers WHERE first_name = 'Yes'").get().n).toBe(0);
    });
  });

  describe('P1b/index — idx_orders_customer_id + lookalike', () => {
    it('idx_orders_customer_id exists on orders(customer_id)', () => {
      const row = db
        .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_orders_customer_id'")
        .get();
      expect(row?.name).toBe('idx_orders_customer_id');
      expect(row.tbl_name).toBe('orders');
      expect(row.sql).toContain('ON orders(customer_id)');
    });

    it('customer-scoped order lookups use idx_orders_customer_id', () => {
      const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = ?').all('c1');
      expect(JSON.stringify(plan)).toContain('idx_orders_customer_id');
    });

    it('lookalike idx_orders_customer on pos_transactions is untouched', () => {
      const row = db
        .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_orders_customer'")
        .get();
      expect(row?.name).toBe('idx_orders_customer');
      expect(row.tbl_name).toBe('pos_transactions');
      expect(row.sql).toContain('ON pos_transactions(customer_id)');
    });

    it('0113 text is a single additive statement with the fresh name only', () => {
      const sql = codeLines(readMigration('0113_add_orders_customer_index.sql'));
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);');
      // The lookalike name must not appear as a statement of its own.
      expect(sql).not.toMatch(/idx_orders_customer\s+ON/);
    });
  });
});
