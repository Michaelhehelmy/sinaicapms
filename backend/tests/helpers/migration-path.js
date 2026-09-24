import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve a migration file across the squash baseline + legacy archive.
 *
 * Squash (9cf9749) moved 0001–0099 into backend/migrations/legacy/ and the
 * baseline now holds only the squashed core (0001_core–0014_seed) plus 0100+.
 * Tests reading pre-squash files must resolve direct → legacy → throw.
 *
 * @param {string} migrationsDir absolute path to backend/migrations
 * @param {string} file migration filename (e.g. '0048_price_overrides.sql')
 * @returns {string} absolute path to the existing migration file
 * @throws {Error} when the file exists in neither location
 */
export function resolveMigration(migrationsDir, file) {
  const direct = join(migrationsDir, file);
  if (existsSync(direct)) return direct;
  const legacy = join(migrationsDir, 'legacy', file);
  if (existsSync(legacy)) return legacy;
  throw new Error(`Migration not found: ${file} (checked ${direct} and ${legacy})`);
}
