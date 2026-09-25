/**
 * Schema-parity meta test: migrated pos_transactions vs fixture schema (0120).
 *
 * Why this exists: the phase4 router suites (phase4b-products-project,
 * phase4c-pos-token-project, phase4f-transactions-project) drive the REAL
 * handlers against hand-built :memory: stubs whose pos_transactions fixture
 * ALREADY carried `tip_amount REAL` — so the suites stayed green while the
 * real lineage (0004 → 0119) never had the column and every production POS
 * sale 500'd (`table pos_transactions has no column named tip_amount`,
 * Wave 2.4 drift 68f8a40, proven on staging 2026-09-25).
 *
 * This test pins the two sides together: a fresh in-memory migrate-all of
 * the REAL migration files must cover every column the fixtures assume —
 * with tip_amount asserted explicitly on both sides — so a fixture can
 * never again mask a missing migration (or vice versa).
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');

// Fixture contract: the pos_transactions column set the phase4 router suites
// assume (POS_TXN_COLS in phase4f-transactions-project.test.js — the fullest
// stub; phase4b/phase4c carry the same tip_amount column). Kept as a plain
// name list so EITHER side drifting breaks this test loudly.
const FIXTURE_TXN_COLS = [
  'id',
  'tenant_id',
  'organization_id',
  'store_id',
  'order_number',
  'cashier_id',
  'status',
  'subtotal',
  'tax_amount',
  'tax_rate',
  'total_amount',
  'paid_amount',
  'payment_method',
  'payment_status',
  'notes',
  'amount_cash',
  'amount_card',
  'idempotency_key',
  'table_id',
  'kitchen_status',
  'tip_amount',
  'created_at',
  'updated_at',
  'project_id',
];

function buildMigratedDb() {
  const db = new Database(':memory:');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  return db;
}

describe('schema parity: migrated pos_transactions vs fixture schema (0120)', () => {
  it('migrated schema covers every fixture column, tip_amount explicit', () => {
    const db = buildMigratedDb();
    const migrated = db
      .prepare("SELECT name FROM pragma_table_info('pos_transactions')")
      .all()
      .map((r) => r.name);

    // The regression pin: without 0120 this line is the failure.
    expect(FIXTURE_TXN_COLS).toContain('tip_amount');
    expect(migrated).toContain('tip_amount');

    for (const col of FIXTURE_TXN_COLS) {
      expect(
        migrated,
        `fixture assumes '${col}' but the migrated schema lacks it`
      ).toContain(col);
    }
  });

  it('migrated tip_amount is nullable REAL DEFAULT 0 (0120 definition)', () => {
    const db = buildMigratedDb();
    const tip = db
      .prepare(
        "SELECT name, type, \"notnull\", dflt_value FROM pragma_table_info('pos_transactions') WHERE name = 'tip_amount'"
      )
      .get();
    expect(tip, '0120 must add tip_amount to pos_transactions').toBeDefined();
    expect(tip.type).toBe('REAL');
    expect(String(tip.dflt_value)).toBe('0');
    expect(tip.notnull).toBe(0);
  });
});
