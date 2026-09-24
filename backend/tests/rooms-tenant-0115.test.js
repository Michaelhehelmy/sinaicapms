/**
 * rooms_new.tenant_id NOT NULL + FK + backfill (migration 0115, audit U-011).
 *
 * Covers backend/migrations/0115_rooms_new_tenant_not_null_fk.sql:
 *   backfill tenant_id from projects via camp_id → rebuild with
 *   `tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
 *
 * Pattern copied from backend/tests/tenant-arch-0111-0113.test.js:
 * better-sqlite3 :memory: db, full-shape pre-0115 stubs (every column the
 * 0115 INSERT…SELECT list reads), replay the REAL migration file via
 * db.exec() inside an explicit transaction (mirroring D1's per-file atomic
 * apply so PRAGMA defer_foreign_keys takes effect), then assert with PRAGMA
 * table_info / foreign_key_list + sqlite_master lookups + behavioral probes.
 * Scope: report real failures as failures — never fake green. No D1 apply,
 * no migration edits, no commits.
 *
 * Local ground truth at write time (read-only census of the dev D1 file):
 * rooms_new 161 rows, 0 NULL tenant_id, 0 truly-orphan rows
 * (camp_id NULL + tenant_id NULL) — orphans are REPORTED, never deleted, and
 * the fail-closed copy aborts loudly if any ever appear elsewhere.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const readMigration = (file) =>
  readFileSync(join(migrationsDir, file), 'utf8');

const ROOM_INDEXES = [
  'idx_rooms_new_camp',
  'idx_rooms_new_product',
  'idx_rooms_new_status',
  'idx_rooms_new_tenant_id',
  'idx_rooms_new_room_status',
  'idx_rooms_floor',
  'idx_rooms_capacity',
  'idx_rooms_new_project',
  'idx_rooms_camp',
  'idx_rooms_status',
];

// ─── Pre-0115 stub ───────────────────────────────────────────────────────────
// rooms_new mirrors the live pre-fix DDL: tenant_id TEXT nullable, no FK.
// tenants/projects/pos_products/orders stubs carry the FK edges that matter:
// orders.room_id → rooms_new RESTRICT (the only live referrer — proves the
// deferred DROP does not wipe it) and rooms_new.product_id → pos_products.
function buildStubDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT
    );
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL
    );
    CREATE TABLE rooms_new (
      id TEXT PRIMARY KEY,
      camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE RESTRICT,
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
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms_new(id) ON DELETE RESTRICT,
      total_amount REAL NOT NULL DEFAULT 0
    );
    INSERT INTO tenants (id, name) VALUES ('t1', 'T1'), ('t2', 'T2');
    INSERT INTO projects (id, tenant_id, name) VALUES ('p1', 't1', 'P1'), ('p2', 't2', 'P2');
    INSERT INTO pos_products (id, tenant_id, name) VALUES ('prod1', 't1', 'Room'), ('prod2', 't2', 'Room');
    INSERT INTO rooms_new (id, camp_id, product_id, name, tenant_id, project_id) VALUES
      ('r_null1', 'p1', 'prod1', 'BackfillMe1', NULL, 'p1'),
      ('r_null2', 'p2', 'prod2', 'BackfillMe2', NULL, 'p2'),
      ('r_set', 'p1', 'prod1', 'AlreadySet', 't1', 'p1');
    INSERT INTO orders (id, tenant_id, room_id, total_amount) VALUES ('o1', 't1', 'r_null1', 100);
  `);
  return db;
}

describe('rooms_new tenant_id NOT NULL + FK + backfill (0115, U-011)', () => {
  let db;

  beforeAll(() => {
    // Replay the REAL 0115 file (D1 per-file atomic apply idiom).
    db = buildStubDb();
    db.exec(`BEGIN; ${readMigration('0115_rooms_new_tenant_not_null_fk.sql')} COMMIT;`);
  });

  it('NULL tenant_id INSERT fails after the rebuild', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO rooms_new (id, camp_id, product_id, name, tenant_id, project_id) VALUES ('r_bad', 'p1', 'prod1', 'Bad', NULL, 'p1')"
        )
        .run()
    ).toThrow(/NOT NULL constraint failed: rooms_new\.tenant_id/);
  });

  it('backfill leaves zero NULLs, FK + trigger + indexes land, RESTRICT child survives', () => {
    // All rooms non-NULL; NULLs resolved from the owning project.
    expect(
      db.prepare('SELECT COUNT(*) c FROM rooms_new WHERE tenant_id IS NULL').get().c
    ).toBe(0);
    const t = (id) =>
      db.prepare('SELECT tenant_id t FROM rooms_new WHERE id = ?').get(id).t;
    expect(t('r_null1')).toBe('t1');
    expect(t('r_null2')).toBe('t2');
    expect(t('r_set')).toBe('t1');

    // NOT NULL + FK→tenants CASCADE in the rebuilt DDL.
    const col = db
      .prepare('PRAGMA table_info(rooms_new)')
      .all()
      .find((c) => c.name === 'tenant_id');
    expect(col.notnull).toBe(1);
    const fk = db
      .prepare('PRAGMA foreign_key_list(rooms_new)')
      .all()
      .find((f) => f.from === 'tenant_id');
    expect(fk).toMatchObject({ table: 'tenants', to: 'id', on_delete: 'CASCADE' });

    // Trigger + all 10 pre-existing index names recreated after the swap.
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_rooms_new_updated_at'"
        )
        .get()?.name
    ).toBe('trg_rooms_new_updated_at');
    for (const name of ROOM_INDEXES) {
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?"
          )
          .get(name)?.name,
        `index ${name} missing after rebuild`
      ).toBe(name);
    }

    // RESTRICT referrer survived the deferred DROP; FK graph is clean.
    expect(db.prepare("SELECT room_id r FROM orders WHERE id = 'o1'").get().r).toBe(
      'r_null1'
    );
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
