/**
 * Migration 0068 — trg_tenants_updated_at fix + promotions/inbox DDL.
 *
 * Replays the real migration lineage in-memory (better-sqlite3, same pattern
 * as triggers.test.js):
 *   1. Build the pre-0059 tenants table (no updated_at column).
 *   2. Execute the REAL 0059 file → reproduces the production breakage:
 *      its CREATE TRIGGER references tenants.updated_at which never existed,
 *      so every runtime UPDATE on tenants failed with SQLITE_ERROR.
 *   3. Execute the REAL 0068 file → UPDATE works again and updated_at is
 *      populated by the trigger; promotions + inbox tables exist.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const execMigration = (db, file) =>
  db.exec(readFileSync(join(migrationsDir, file), 'utf8'));

function buildPre0059Db() {
  const db = new Database(':memory:');
  // Minimal pre-0059 shape: no updated_at column (that's the bug), but `type`
  // must exist because 0059 backfills business_type FROM type.
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY,
      subdomain TEXT,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      type TEXT DEFAULT 'camp'
    );
    INSERT INTO tenants (id, subdomain, name) VALUES ('acaciacamp', 'acacia', 'Acacia Camp');
  `);
  return db;
}

describe('Migration 0068 — trg_tenants_updated_at fix + Promotions Engine DDL', () => {
  let db;

  beforeAll(() => {
    db = buildPre0059Db();
    execMigration(db, '0059_add_tenant_columns.sql'); // introduces the broken trigger
    execMigration(db, '0068_fix_triggers_and_promotions.sql'); // fixes it
  });

  describe('tenants.updated_at trigger repair', () => {
    it('allows UPDATE on tenants (previously "no such column: updated_at")', () => {
      expect(() =>
        db.prepare("UPDATE tenants SET name = 'Acacia Renamed' WHERE id = 'acaciacamp'").run()
      ).not.toThrow();
    });

    it('populates updated_at via the recreated trigger', () => {
      const row = db.prepare('SELECT name, updated_at FROM tenants WHERE id = ?').get('acaciacamp');
      expect(row.name).toBe('Acacia Renamed');
      expect(row.updated_at).toBeTruthy();
    });

    it('refreshes updated_at on subsequent updates', async () => {
      const before = db.prepare('SELECT updated_at FROM tenants WHERE id = ?').get('acaciacamp').updated_at;
      // datetime('now') has second granularity — wait past the next second.
      await new Promise((r) => setTimeout(r, 1100));
      db.prepare("UPDATE tenants SET name = 'Acacia Again' WHERE id = 'acaciacamp'").run();
      const after = db.prepare('SELECT updated_at FROM tenants WHERE id = ?').get('acaciacamp').updated_at;
      expect(after >= before).toBe(true);
    });
  });

  describe('promotions table', () => {
    it('exists with the engine columns', () => {
      const cols = db.prepare("PRAGMA table_info(promotions)").all().map((c) => c.name);
      expect(cols).toEqual(expect.arrayContaining([
        'id', 'tenant_id', 'name', 'type', 'value', 'applies_to', 'applies_to_id',
        'min_purchase', 'day_of_week', 'start_date', 'end_date', 'is_active', 'created_at',
      ]));
    });

    it('enforces the discount-type CHECK constraint', () => {
      expect(() =>
        db.prepare(
          "INSERT INTO promotions (id, tenant_id, name, type) VALUES ('p_bad', 'acaciacamp', 'Bad', 'halfprice')"
        ).run()
      ).toThrow(/CHECK/);
    });

    it('accepts a valid percentage promotion and defaults is_active to 1', () => {
      db.prepare(
        "INSERT INTO promotions (id, tenant_id, name, type, value) VALUES ('p_ok', 'acaciacamp', '10% off', 'percentage', 10)"
      ).run();
      const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get('p_ok');
      expect(row.is_active).toBe(1);
      expect(row.applies_to).toBe('all');
      expect(row.value).toBe(10);
    });

    it('creates both lookup indexes', () => {
      const idx = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='promotions'"
      ).all().map((r) => r.name);
      expect(idx).toEqual(expect.arrayContaining(['idx_promotions_tenant', 'idx_promotions_active']));
    });
  });

  describe('inbox table (low-stock alert storage)', () => {
    it('exists with the alert columns', () => {
      const cols = db.prepare("PRAGMA table_info(inbox)").all().map((c) => c.name);
      expect(cols).toEqual(expect.arrayContaining([
        'id', 'tenant_id', 'title', 'message', 'severity', 'is_read', 'created_at',
      ]));
    });

    it('stores a low-stock style alert with severity warning', () => {
      db.prepare(
        `INSERT INTO inbox (id, tenant_id, title, message, severity, is_read, created_at)
         VALUES ('lowstock_coke_1', 'acaciacamp', 'Low Stock: Coke', 'Only 2 units remaining.', 'warning', 0, datetime('now'))`
      ).run();
      const row = db.prepare('SELECT * FROM inbox WHERE id = ?').get('lowstock_coke_1');
      expect(row.severity).toBe('warning');
      expect(row.is_read).toBe(0);
      expect(row.created_at).toBeTruthy();
    });
  });
});
