/**
 * Migration 0108 — meals-scope guard (assert-only) replay tests.
 *
 * Recon ground truth: /tmp/opencode/p2-recon.md §5 (task tenant-arch-p2a-recon,
 * 2026-09-23). Verdict: 0108 is a GUARD migration, not a schema migration —
 * columns exist since 0100, backfill since 0105, NOT NULL since 0107. So 0108
 * must: (1) fail closed on any residual NULL project_id (plain-INSERT idiom —
 * a write that only succeeds on zero NULLs), and (2) top up the three
 * idx_*_project indexes with IF NOT EXISTS.
 *
 * Pattern copied from tests/phase1-project-id-enforce.test.js: better-sqlite3
 * :memory: db, minimal-shape stubs (only the columns 0108 touches), replay the
 * REAL migration file via db.exec(readFileSync(...)). Scope: report real
 * failures as failures — never fake green.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const readMigration = (file) => readFileSync(join(migrationsDir, file), 'utf8');

// Minimal stubs: only what 0108 touches (the NULL-guard COUNTs + the three
// indexes). FK clauses omitted (better-sqlite3 leaves FK enforcement off;
// NOT NULL is still enforced, which is what the guard relies on).
function buildMealsScopeDb({ withNulls = false } = {}) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      meal_category_id TEXT NOT NULL,
      project_id TEXT
    );
    CREATE TABLE meal_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT
    );
    CREATE TABLE meal_schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      camp_id TEXT,
      meal_id TEXT NOT NULL,
      project_id TEXT
    );
    INSERT INTO meals (id, tenant_id, meal_category_id, project_id)
      VALUES ('meal_1', 't1', 'c1', 'p1');
    INSERT INTO meal_categories (id, tenant_id, project_id)
      VALUES ('c1', 't1', 'p1');
    INSERT INTO meal_schedules (id, tenant_id, camp_id, meal_id, project_id)
      VALUES ('msch_1', 't1', 'p1', 'meal_1', 'p1');
  `);
  if (withNulls) {
    db.exec(`
      INSERT INTO meals (id, tenant_id, meal_category_id, project_id)
        VALUES ('meal_null', 't1', 'c1', NULL);
    `);
  }
  return db;
}

describe('migration 0108 meals-scope guard (P2-B)', () => {
  it('applies cleanly on zero-NULL tables and ensures the three indexes', () => {
    const db = buildMealsScopeDb();
    expect(() => db.exec(readMigration('0108_add_meals_project_id.sql'))).not.toThrow();
    for (const idx of ['idx_meals_project', 'idx_meal_categories_project', 'idx_meal_schedules_project']) {
      const row = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(idx);
      expect(row, `expected index ${idx} to exist`).toBeDefined();
      expect(row.sql).toContain('project_id');
    }
    // Guard leaves no residue behind.
    const guard = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_0108_project_guard'")
      .get();
    expect(guard).toBeUndefined();
  });

  it('fails closed when any table holds a NULL project_id', () => {
    const db = buildMealsScopeDb({ withNulls: true });
    expect(() => db.exec(readMigration('0108_add_meals_project_id.sql'))).toThrow();
    // The offending row is untouched (atomic abort, no partial writes).
    const nulls = db
      .prepare('SELECT COUNT(*) AS n FROM meals WHERE project_id IS NULL')
      .get();
    expect(nulls.n).toBe(1);
  });

  it('is a guard file: no ADD COLUMN, no UPDATE backfill, no rebuild, no lang tables', () => {
    const codeLines = readMigration('0108_add_meals_project_id.sql')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(codeLines).not.toMatch(/ADD\s+COLUMN/i);
    expect(codeLines).not.toMatch(/\bUPDATE\b/i);
    expect(codeLines).not.toMatch(/CREATE\s+TABLE\s+\w+_new/i);
    expect(codeLines).not.toMatch(/meal_lang|meal_categories_lang/i);
    expect(codeLines).not.toMatch(/DROP\s+COLUMN| camp_id /i);
  });
});
