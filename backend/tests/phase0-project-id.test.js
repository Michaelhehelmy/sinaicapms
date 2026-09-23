/**
 * Phase-0 — schema-shape tests for project_id columns + default provisioning.
 *
 * Covers migrations:
 *   0100_add_project_id_nullable.sql          (14 core tables)
 *   0101_add_pos_stores_project_id.sql        (pos_stores)
 *   0102_add_order_items_project_id_nullable.sql (order_items)
 *   0103_add_carts_project_id.sql             (carts only — cart_items intentionally NOT extended)
 *   0104_provision_default_projects.sql       (default camp-type project per project-less tenant)
 *
 * Pattern copied from tests/triggers-0068.test.js: better-sqlite3 :memory: db,
 * replay the REAL migration files via db.exec(readFileSync(...)), then assert
 * with PRAGMA table_info(<t>) + sqlite_master index lookups + NULL-insert probes.
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

// Every (table, expected index) pair added by 0100–0103, grouped by file.
const CORE_0100 = [
  ['rooms_new', 'idx_rooms_new_project'],
  ['rate_plans_new', 'idx_rate_plans_new_project'],
  ['orders', 'idx_orders_project'],
  ['pos_products', 'idx_pos_products_project'],
  ['pos_transactions', 'idx_pos_transactions_project'],
  ['pos_transaction_items', 'idx_pos_transaction_items_project'],
  ['pos_users', 'idx_pos_users_project'],
  ['pos_tables', 'idx_pos_tables_project'],
  ['meals', 'idx_meals_project'],
  ['meal_categories', 'idx_meal_categories_project'],
  ['meal_schedules', 'idx_meal_schedules_project'],
  ['inventory_adjustments', 'idx_inventory_adjustments_project'],
  ['promotions', 'idx_promotions_project'],
  ['storefront_orders', 'idx_storefront_orders_project'],
];
const ALL_ADDS = [
  ...CORE_0100,
  ['pos_stores', 'idx_pos_stores_project'], // 0101
  ['order_items', 'idx_order_items_project'], // 0102
  ['carts', 'idx_carts_project'], // 0103
];

// Per-table minimal INSERT that satisfies the stub NOT NULLs while leaving
// project_id NULL — proves the new column is nullable (accepts NULL).
function probeInsert(db, table) {
  switch (table) {
    case 'pos_users':
      db.prepare(
        `INSERT INTO pos_users (id, organization_id, first_name, last_name, project_id)
         VALUES ('probe_pos_users', 1, 'Probe', 'User', NULL)`
      ).run();
      return db.prepare('SELECT project_id FROM pos_users WHERE id = ?').get('probe_pos_users');
    case 'pos_stores':
      db.prepare(
        `INSERT INTO pos_stores (organization_id, name, code, address, city, project_id)
         VALUES (1, 'Probe Store', 'PROBE1', 'Addr', 'City', NULL)`
      ).run();
      return db.prepare('SELECT project_id FROM pos_stores WHERE code = ?').get('PROBE1');
    case 'order_items':
      db.prepare(
        `INSERT INTO order_items (id, order_id, name, project_id)
         VALUES ('probe_order_items', 'ord_probe', 'Probe Item', NULL)`
      ).run();
      return db.prepare('SELECT project_id FROM order_items WHERE id = ?').get('probe_order_items');
    case 'carts':
      db.prepare(
        `INSERT INTO carts (id, tenant_id, project_id)
         VALUES ('probe_carts', 't_probe', NULL)`
      ).run();
      return db.prepare('SELECT project_id FROM carts WHERE id = ?').get('probe_carts');
    default:
      db.prepare(`INSERT INTO ${table} (id, project_id) VALUES (?, NULL)`).run(`probe_${table}`);
      return db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).get(`probe_${table}`);
  }
}

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
      UNIQUE(tenant_id, slug)
    );
    CREATE TABLE rooms_new (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE rate_plans_new (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE pos_products (id TEXT PRIMARY KEY, tenant_id TEXT, organization_id INTEGER);
    CREATE TABLE pos_transactions (id TEXT PRIMARY KEY, tenant_id TEXT, organization_id INTEGER);
    CREATE TABLE pos_transaction_items (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE pos_users (
      id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      first_name TEXT,
      last_name TEXT,
      tenant_id TEXT
    );
    CREATE TABLE pos_tables (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE meals (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE meal_categories (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE meal_schedules (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE inventory_adjustments (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE promotions (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE storefront_orders (id TEXT PRIMARY KEY, tenant_id TEXT);
    CREATE TABLE pos_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE carts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      session_id TEXT
    );
    CREATE TABLE cart_items (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      product_id TEXT NOT NULL
    );
    -- service_items already HAS project_id (0072:24) — verify-only, mirrors prod.
    CREATE TABLE service_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
  `);
  return db;
}

describe('Phase-0 project_id schema (0100–0104)', () => {
  let db;

  beforeAll(() => {
    db = buildStubDb();
    execMigration(db, '0100_add_project_id_nullable.sql');
    execMigration(db, '0101_add_pos_stores_project_id.sql');
    execMigration(db, '0102_add_order_items_project_id_nullable.sql');
    execMigration(db, '0103_add_carts_project_id.sql');
  });

  describe('0100 — 14 core tables gain nullable project_id TEXT + index', () => {
    for (const [table, index] of CORE_0100) {
      it(`adds nullable project_id TEXT + ${index} to ${table}`, () => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all();
        const names = cols.map((c) => c.name);
        // Exists…
        expect(names).toContain('project_id');
        // …with the exact type affinity from the migration…
        const col = cols.find((c) => c.name === 'project_id');
        expect(col.type).toBe('TEXT');
        // …nullable (no NOT NULL, no default)…
        expect(col.notnull).toBe(0);
        expect(col.dflt_value).toBeNull();
        // …backed by the migration's lookup index…
        const idx = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name = ?"
          )
          .get(table, index);
        expect(idx?.name).toBe(index);
        // …and accepting NULL on write.
        expect(probeInsert(db, table).project_id).toBeNull();
      });
    }

    it('migration SQL text adds all 14 columns with the exact ADD COLUMN shape', () => {
      const sql = codeLines(readMigration('0100_add_project_id_nullable.sql'));
      for (const [table] of CORE_0100) {
        expect(sql).toContain(
          `ALTER TABLE ${table} ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;`
        );
      }
      // cart_items is named in the EXCLUDED-list comment but must have no DDL.
      expect(sql).not.toContain('cart_items');
      expect(sql).not.toContain('NOT NULL');
      expect(sql).not.toContain('DEFAULT');
    });
  });

  describe('0101 — pos_stores.project_id', () => {
    it('adds nullable project_id TEXT + idx_pos_stores_project to pos_stores', () => {
      const cols = db.prepare('PRAGMA table_info(pos_stores)').all();
      expect(cols.map((c) => c.name)).toContain('project_id');
      const col = cols.find((c) => c.name === 'project_id');
      expect(col.type).toBe('TEXT');
      expect(col.notnull).toBe(0);
      expect(col.dflt_value).toBeNull();
      const idx = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pos_stores' AND name = 'idx_pos_stores_project'"
        )
        .get();
      expect(idx?.name).toBe('idx_pos_stores_project');
      expect(probeInsert(db, 'pos_stores').project_id).toBeNull();
    });

    it('migration SQL text has the exact ADD COLUMN shape', () => {
      expect(readMigration('0101_add_pos_stores_project_id.sql')).toContain(
        'ALTER TABLE pos_stores ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;'
      );
    });
  });

  describe('0102 — order_items.project_id', () => {
    it('adds nullable project_id TEXT + idx_order_items_project to order_items', () => {
      const cols = db.prepare('PRAGMA table_info(order_items)').all();
      expect(cols.map((c) => c.name)).toContain('project_id');
      const col = cols.find((c) => c.name === 'project_id');
      expect(col.type).toBe('TEXT');
      expect(col.notnull).toBe(0);
      expect(col.dflt_value).toBeNull();
      const idx = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'order_items' AND name = 'idx_order_items_project'"
        )
        .get();
      expect(idx?.name).toBe('idx_order_items_project');
      expect(probeInsert(db, 'order_items').project_id).toBeNull();
    });

    it('migration SQL text has the exact ADD COLUMN shape', () => {
      expect(readMigration('0102_add_order_items_project_id_nullable.sql')).toContain(
        'ALTER TABLE order_items ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;'
      );
    });
  });

  describe('0103 — carts.project_id (carts only)', () => {
    it('adds nullable project_id TEXT + idx_carts_project to carts', () => {
      const cols = db.prepare('PRAGMA table_info(carts)').all();
      expect(cols.map((c) => c.name)).toContain('project_id');
      const col = cols.find((c) => c.name === 'project_id');
      expect(col.type).toBe('TEXT');
      expect(col.notnull).toBe(0);
      expect(col.dflt_value).toBeNull();
      const idx = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'carts' AND name = 'idx_carts_project'"
        )
        .get();
      expect(idx?.name).toBe('idx_carts_project');
      expect(probeInsert(db, 'carts').project_id).toBeNull();
    });

    it('leaves cart_items unextended (line-level scope deferred)', () => {
      const names = db.prepare('PRAGMA table_info(cart_items)').all().map((c) => c.name);
      expect(names).not.toContain('project_id');
      // cart_items is named in the scope-decision comment but must have no DDL.
      expect(codeLines(readMigration('0103_add_carts_project_id.sql'))).not.toContain('cart_items');
    });
  });

  describe('scope guard — service_items untouched (already had project_id at 0072)', () => {
    it('still has its pre-existing project_id column', () => {
      const cols = db.prepare('PRAGMA table_info(service_items)').all();
      expect(cols.map((c) => c.name)).toContain('project_id');
      expect(cols.find((c) => c.name === 'project_id').type).toBe('TEXT');
    });
  });

  describe('0104 — default project provisioning', () => {
    beforeAll(() => {
      db.prepare(
        "INSERT INTO tenants (id, subdomain, name) VALUES ('t_lonely', 'lonely', 'Lonely Camp')"
      ).run();
      db.prepare(
        "INSERT INTO tenants (id, subdomain, name) VALUES ('t_homed', 'homed', 'Homed Camp')"
      ).run();
      db.prepare(
        "INSERT INTO projects (id, tenant_id, name, slug, project_type, status) VALUES ('p_main', 't_homed', 'Homed Main', 'main-camp', 'camp', 'active')"
      ).run();
      db.prepare(
        "INSERT INTO tenants (id, subdomain, name, deleted_at) VALUES ('t_gone', 'gone', 'Gone Camp', '2026-01-01')"
      ).run();
      execMigration(db, '0104_provision_default_projects.sql');
    });

    it('provisions exactly one default-camp project for the project-less tenant', () => {
      const rows = db
        .prepare("SELECT * FROM projects WHERE tenant_id = 't_lonely'")
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0].slug).toBe('default-camp');
      expect(rows[0].project_type).toBe('camp');
      expect(rows[0].status).toBe('active');
      expect(rows[0].name).toBe('Lonely Camp Default Camp');
      expect(rows[0].description).toBe('P0 default-provisioned project (migration 0104)');
      expect(rows[0].id).toBeTruthy();
    });

    it('leaves tenants that already have a project untouched', () => {
      const rows = db
        .prepare("SELECT * FROM projects WHERE tenant_id = 't_homed'")
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('p_main');
      expect(rows[0].slug).toBe('main-camp');
    });

    it('skips soft-deleted tenants', () => {
      const rows = db
        .prepare("SELECT * FROM projects WHERE tenant_id = 't_gone'")
        .all();
      expect(rows).toHaveLength(0);
    });

    it('is idempotent — re-running provisions nothing new', () => {
      execMigration(db, '0104_provision_default_projects.sql');
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM projects WHERE tenant_id = 't_lonely'").get().n
      ).toBe(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n).toBe(2);
    });

    it('migration SQL text guards with WHERE NOT EXISTS + deleted_at filter', () => {
      const sql = readMigration('0104_provision_default_projects.sql');
      expect(sql).toContain('WHERE NOT EXISTS');
      expect(sql).toContain('t.deleted_at IS NULL');
      expect(sql).toContain("'default-camp'");
      expect(sql).not.toContain('UPDATE');
    });
  });

  describe('full set — every 0100–0103 table reachable in one sweep', () => {
    it('all 17 tables expose project_id after the four migrations', () => {
      for (const [table] of ALL_ADDS) {
        const names = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
        expect(names).toContain('project_id');
      }
    });
  });
});
