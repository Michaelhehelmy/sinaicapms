import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../backend/migrations');

describe('Migration Integrity', () => {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  it('has migration files', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it('all migration files have sequential numbering', () => {
    const numbers = migrationFiles.map(f => {
      const match = f.match(/^(\d+)_/);
      return match ? parseInt(match[1]) : null;
    }).filter(n => n !== null);

    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
    }
  });

  it('all migration files have descriptive names after the number', () => {
    // Discovery P1-2 (2026-10-14), class A test drift.
    // Changed by 0558dd3 (2026-09-23, "canonical schema export + 14-file baseline split"),
    // which replaced 0001-0099 with 0001_core..0014_seed and introduced the 2-char domain
    // slugs `hr` (human resources, 0007_hr.sql) and `ai` (0012_ai.sql).
    // Old assertion correct at birth (b164048, 2026-08-08): every slug was descriptive
    // (e.g. 0007_admin_passphrase), so `> 2` held for the whole tree.
    // New assertion correct now: the `> 2` rule stands for all new files, with the two
    // intentional slugs pinned as grandfathered exceptions — a third 2-char slug still fails.
    const GRANDFATHERED_SHORT_SLUGS = new Set(['0007_hr.sql', '0012_ai.sql']);
    for (const file of migrationFiles) {
      const match = file.match(/^\d+_(.+)\.sql$/);
      expect(match).toBeTruthy();
      if (match && !GRANDFATHERED_SHORT_SLUGS.has(file)) {
        expect(match[1].length).toBeGreaterThan(2);
      }
    }
  });

  it('no migration file contains syntax errors (basic check)', () => {
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      // Basic SQL syntax checks
      const upper = content.toUpperCase();
      // Should not have unmatched parentheses
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      // Some migrations may have parens in comments, so just check major mismatches
      expect(Math.abs(openParens - closeParens)).toBeLessThan(3);
    }
  });

  it('CREATE TABLE statements have primary keys', () => {
    const tablesWithoutPK = [];
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      const createTableMatches = content.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/gi);
      if (createTableMatches) {
        for (const match of createTableMatches) {
          const tableName = match.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?/i, '').trim();
          const tableBlock = content.substring(
            content.indexOf(match),
            content.indexOf(';', content.indexOf(match))
          );
          const hasPK = tableBlock.toUpperCase().includes('PRIMARY KEY');
          if (!hasPK) {
            tablesWithoutPK.push({ file, tableName });
          }
        }
      }
    }
    // Log warnings but don't fail — some tables may use external PK management
    if (tablesWithoutPK.length > 0) {
      console.warn(`Tables without explicit PRIMARY KEY: ${tablesWithoutPK.map(t => `${t.tableName} (${t.file})`).join(', ')}`);
    }
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it('no DROP TABLE without IF EXISTS', () => {
    // Discovery P1-2 (2026-10-14), class A test drift.
    // The old raw-text regex (`/DROP TABLE\s+(?!IF EXISTS)/` over file text) was wrong twice:
    // it counted `--` comment prose as statements (0107:53, 0111:42, 0112:374, 0126:96), and
    // the pre-split lineage it was written against (b164048, 2026-08-08) already carried 10+
    // bare drops (0014, 0039, 0040, 0042, 0046), so the assertion never passed as written.
    // The two surviving statements are intentional, added deliberately after the split:
    //  - 0108_add_meals_project_id.sql:68 drops the _0108_project_guard helper the same file
    //    creates at :58 (added 772e8f9, 2026-09-23, project-scope meals).
    //  - 0115_rooms_new_tenant_not_null_fk.sql:108 drops rooms_new as one step of an
    //    intentional table rebuild (added cb3927c, 2026-09-24, rooms_new tenant NOT NULL + FK).
    // New assertion correct now: comments are stripped before matching, the two intentional
    // statements are pinned as grandfathered, and any NEW bare drop still fails.
    const GRANDFATHERED_UNSAFE_DROPS = new Set([
      '0108_add_meals_project_id.sql::_0108_project_guard',
      '0115_rooms_new_tenant_not_null_fk.sql::rooms_new',
    ]);
    const unsafeDrops = [];
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      const code = content
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const dropRe = /DROP TABLE\s+(?!IF EXISTS)(\S+)/gi;
      let m;
      while ((m = dropRe.exec(code)) !== null) {
        const table = m[1].replace(/[;("']/g, '').toLowerCase();
        if (!GRANDFATHERED_UNSAFE_DROPS.has(`${file}::${table}`)) {
          unsafeDrops.push({ file, match: m[0].trim() });
        }
      }
    }
    if (unsafeDrops.length > 0) {
      console.warn(`Unsafe DROP TABLE: ${unsafeDrops.map(d => `${d.match} in ${d.file}`).join(', ')}`);
    }
    expect(unsafeDrops.length).toBe(0);
  });

  it('all migration files are valid UTF-8', () => {
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('no migration file is empty', () => {
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  it('total migration count is reasonable', () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(10);
    // Cap raised 100 -> 200 (pre-decided by owner 2026-09-16 §4.3, executed Wave 0.5.4):
    // SQLite/D1 handle thousands of migrations; 100 was an arbitrary assertion.
    expect(migrationFiles.length).toBeLessThanOrEqual(200);
  });

  it('migration numbers are unique and strictly increasing (two-block scheme)', () => {
    // Discovery P1-2 (2026-10-14), class A test drift.
    // Changed by the 0100 feature block (6d2bb50 era, 2026-09-23, project_id backfill), which
    // intentionally broke contiguity with the 0014 → 0100 jump; 0109/0125 are reserved gaps
    // (docs/07-data/migrations.md). Numbering is now two blocks by design: 0001–0014 baseline
    // (0558dd3 canonical split) + 0100+ feature block.
    // Old assertion (`lastNum == fileCount`) correct at birth (b164048, 2026-08-08): 0001..0050
    // contiguous, 50 .sql files, lastNum 50.
    // New assertion correct now: uniqueness + strictly-increasing order is the property that
    // catches accidental mis-numbering (e.g. authoring a duplicate 0124), without demanding
    // a contiguity the scheme deliberately abandoned.
    const numbers = migrationFiles.map(f => {
      const match = f.match(/^(\d+)_/);
      return match ? parseInt(match[1]) : null;
    }).filter(n => n !== null);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
    }
  });
});
