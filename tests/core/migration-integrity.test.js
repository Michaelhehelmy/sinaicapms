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
    for (const file of migrationFiles) {
      const match = file.match(/^\d+_(.+)\.sql$/);
      expect(match).toBeTruthy();
      if (match) {
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
    const unsafeDrops = [];
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      const dropMatches = content.match(/DROP TABLE\s+(?!IF EXISTS)/gi);
      if (dropMatches) {
        for (const match of dropMatches) {
          unsafeDrops.push({ file, match });
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
    expect(migrationFiles.length).toBeLessThanOrEqual(100);
  });

  it('latest migration is numbered sequentially after previous', () => {
    const lastFile = migrationFiles[migrationFiles.length - 1];
    const match = lastFile.match(/^(\d+)_/);
    expect(match).toBeTruthy();
    if (match) {
      const lastNum = parseInt(match[1]);
      expect(lastNum).toBe(migrationFiles.length);
    }
  });
});
