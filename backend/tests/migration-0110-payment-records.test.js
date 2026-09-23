/**
 * Migration 0110 — payment_records ledger (P35-B Admin Cash Desk v1) replay tests.
 *
 * Recon ground truth: /tmp/opencode/p35-recon.md §§1-2,6 (task
 * tenant-arch-p35a-recon, 2026-09-23). Verdict: 0110 is the next free slot
 * (head 0108 on disk; 0109 reserved-but-absent for the destructive camp-column
 * drops — must not be consumed by P35).
 *
 * Pattern copied from tests/migration-0108-guard.test.js: better-sqlite3
 * :memory: db, replay the REAL migration file via db.exec(readFileSync(...)).
 * Scope: report real failures as failures — never fake green.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const readMigration = (file) => readFileSync(join(migrationsDir, file), 'utf8');

// Minimal parent stub: payment_records FK-references orders(id). FK clauses
// are kept (better-sqlite3 leaves enforcement off unless PRAGMA'd on — the
// CHECK constraints under test are still enforced regardless).
function buildLedgerDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      amount_paid REAL DEFAULT 0
    );
    INSERT INTO orders (id, tenant_id, total_amount, amount_paid)
      VALUES ('ord_1', 't1', 200, 0);
  `);
  db.exec(readMigration('0110_create_payment_records.sql'));
  return db;
}

describe('migration 0110 payment_records ledger (P35-B)', () => {
  it('creates the table with the recon-prescribed columns', () => {
    const db = buildLedgerDb();
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('payment_records')")
      .all()
      .map((r) => r.name);
    for (const col of [
      'id',
      'tenant_id',
      'order_id',
      'amount',
      'method',
      'amount_cash',
      'amount_card',
      'received_by',
      'approved_by',
      'reference',
      'notes',
      'created_at',
    ]) {
      expect(cols, `expected column ${col}`).toContain(col);
    }
  });

  it('accepts cash, card, and split rows (split legs sum to amount)', () => {
    const db = buildLedgerDb();
    const insert = db.prepare(
      `INSERT INTO payment_records
         (id, tenant_id, order_id, amount, method, amount_cash, amount_card, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    expect(() =>
      insert.run('pay_1', 't1', 'ord_1', 200, 'cash', 200, 0, 'admin_1')
    ).not.toThrow();
    expect(() =>
      insert.run('pay_2', 't1', 'ord_1', 100, 'card', 0, 100, 'admin_1')
    ).not.toThrow();
    expect(() =>
      insert.run('pay_3', 't1', 'ord_1', 100, 'split', 60, 40, 'admin_1')
    ).not.toThrow();
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM payment_records').get().n
    ).toBe(3);
  });

  it('fail-closes on non-POS methods, non-positive amounts, and leg mismatch', () => {
    const db = buildLedgerDb();
    const insert = db.prepare(
      `INSERT INTO payment_records
         (id, tenant_id, order_id, amount, method, amount_cash, amount_card, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // Recon §2: bank_transfer/paymob belong to other domains — not admitted.
    expect(() =>
      insert.run('pay_bad1', 't1', 'ord_1', 50, 'bank_transfer', 50, 0, 'admin_1')
    ).toThrow();
    expect(() =>
      insert.run('pay_bad2', 't1', 'ord_1', 50, 'paymob', 0, 50, 'admin_1')
    ).toThrow();
    // amount > 0 guard.
    expect(() =>
      insert.run('pay_bad3', 't1', 'ord_1', 0, 'cash', 0, 0, 'admin_1')
    ).toThrow();
    expect(() =>
      insert.run('pay_bad4', 't1', 'ord_1', -10, 'cash', -10, 0, 'admin_1')
    ).toThrow();
    // Split legs must sum to amount ±0.01 (POS tolerance).
    expect(() =>
      insert.run('pay_bad5', 't1', 'ord_1', 100, 'split', 60, 30, 'admin_1')
    ).toThrow();
  });

  it('creates tenant + order indexes for the cash-desk lookups', () => {
    const db = buildLedgerDb();
    for (const idx of ['idx_payment_records_tenant', 'idx_payment_records_order']) {
      const row = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get(idx);
      expect(row, `expected index ${idx} to exist`).toBeDefined();
    }
  });

  it('is additive-only: alters no existing table, leaves no residue', () => {
    const codeLines = readMigration('0110_create_payment_records.sql')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(codeLines).not.toMatch(/ALTER\s+TABLE/i);
    expect(codeLines).not.toMatch(/DROP\s+TABLE/i);
    expect(codeLines).not.toMatch(/\bUPDATE\b/i);
    expect(codeLines).not.toMatch(/CREATE\s+TABLE\s+\w+_new/i);
    const db = buildLedgerDb();
    const residue = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('orders', 'payment_records')"
      )
      .all();
    expect(residue).toEqual([]);
  });

  it('documents rollback in the file header (hard rule 7)', () => {
    const sql = readMigration('0110_create_payment_records.sql');
    expect(sql).toMatch(/ROLLBACK/i);
  });
});
