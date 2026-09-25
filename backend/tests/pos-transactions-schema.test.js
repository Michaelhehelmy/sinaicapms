/**
 * pos_transactions INSERT-shape regression test (tip_amount drift fix, 2026-09-24).
 *
 * Drift ground truth: Wave 2.4 (commit 68f8a40, 2026-09-18) added `tip_amount`
 * to the POS sale INSERT in backend/src/routes/pos/index.js but no migration
 * ever added the column to pos_transactions — every POS sale failed at the D1
 * layer with `table pos_transactions has no column named tip_amount`
 * (staging 500 ×2, 2026-09-25; column absent on staging AND prod PRAGMA).
 * Migration 0120 adds the column; these 2 tests pin the shape so the INSERT
 * and the schema can never drift apart again.
 *
 * Pattern: better-sqlite3 :memory: db, replay the REAL migration files in
 * ledger order (full migrate-all — proven to apply cleanly in-memory),
 * then assert against PRAGMA. The INSERT column lists are parsed out of the
 * REAL source files (not duplicated by hand), so a future INSERT edit
 * re-runs against the new list automatically. No D1 apply, no source edits.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const srcDir = join(import.meta.dirname, '../src');

// Fresh in-memory DB with the REAL migration lineage applied in ledger order.
function buildMigratedDb() {
  const db = new Database(':memory:');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  return db;
}

function pragmaCols(db) {
  return db
    .prepare("SELECT name FROM pragma_table_info('pos_transactions')")
    .all()
    .map((r) => r.name);
}

// Parse every `INSERT INTO pos_transactions (<cols>)` column list out of a
// real source file. Returns one array of column names per INSERT site.
function insertColLists(sourceFile) {
  const src = readFileSync(join(srcDir, sourceFile), 'utf8');
  const re = /INSERT INTO pos_transactions\s*\(([^)]+)\)/g;
  const sites = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    sites.push(
      m[1]
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    );
  }
  return sites;
}

describe('pos_transactions INSERT shape vs migrated schema (0120)', () => {
  it('every INSERT-site column exists in the migrated schema (tip_amount explicit)', () => {
    const db = buildMigratedDb();
    const cols = pragmaCols(db);
    // The drift itself: without 0120 this is 40 cols with no tip_amount.
    expect(cols).toContain('tip_amount');

    const sites = {
      'routes/pos/index.js': insertColLists('routes/pos/index.js'),
      'api/orders.js': insertColLists('api/orders.js'),
      'api/reservations.js': insertColLists('api/reservations.js'),
    };
    // Exactly the 3 known INSERT sites (phase4f header contract) — a 4th
    // site must extend this test instead of shipping unpinned.
    expect(sites['routes/pos/index.js'].length).toBe(1);
    expect(sites['api/orders.js'].length).toBe(1);
    expect(sites['api/reservations.js'].length).toBe(1);

    for (const [file, lists] of Object.entries(sites)) {
      for (const list of lists) {
        for (const col of list) {
          expect(
            cols,
            `${file} INSERTs unknown column '${col}' (schema drift)`
          ).toContain(col);
        }
      }
    }
    // The sale site (the one that drifted) must carry tip_amount.
    expect(sites['routes/pos/index.js'][0]).toContain('tip_amount');
  });

  it('persists a sale tip through the migrated schema and reads it back', () => {
    const db = buildMigratedDb();
    // The lineage enables FK enforcement on this connection; the probe
    // asserts column shape + tip persistence, not the referential graph
    // (parent org/store rows are out of scope), so enforcement is off here.
    db.pragma('foreign_keys = OFF');
    const saleCols = insertColLists('routes/pos/index.js')[0];
    expect(saleCols).toContain('tip_amount');

    // Literal values mirror the sale INSERT shape: 'completed' status /
    // payment_status literals and datetime('now') for created/updated are
    // inlined exactly as the handler binds them.
    const placeholders = saleCols.map((c) =>
      c === 'created_at' || c === 'updated_at'
        ? "datetime('now')"
        : c === 'status' || c === 'payment_status'
          ? "'completed'"
          : c === 'kitchen_status'
            ? "'pending'"
            : '?'
    );
    const binds = [];
    const bindFor = (c) => {
      switch (c) {
        case 'id':
          return 'txn_tip_1';
        case 'tenant_id':
          return 't1';
        case 'organization_id':
          return 1;
        case 'store_id':
          return 1;
        case 'order_number':
          return 'TIP-001';
        case 'cashier_id':
          return '7';
        case 'project_id':
          return null;
        case 'tip_amount':
          return 2.5;
        case 'notes':
        case 'idempotency_key':
        case 'table_id':
          return null;
        default:
          return 0;
      }
    };
    for (const c of saleCols) {
      if (
        c === 'created_at' ||
        c === 'updated_at' ||
        c === 'status' ||
        c === 'payment_status' ||
        c === 'kitchen_status'
      )
        continue;
      binds.push(bindFor(c));
    }
    db.prepare(
      `INSERT INTO pos_transactions (${saleCols.join(', ')}) VALUES (${placeholders.join(', ')})`
    ).run(...binds);

    const row = db
      .prepare('SELECT tip_amount FROM pos_transactions WHERE id = ?')
      .get('txn_tip_1');
    expect(row.tip_amount).toBe(2.5);

    // Omitted tip defaults to 0 (the 0120 DEFAULT), never NULL-surprises.
    const saleColsNoTip = saleCols.filter((c) => c !== 'tip_amount');
    const placeholdersNoTip = saleColsNoTip.map((c) =>
      c === 'created_at' || c === 'updated_at'
        ? "datetime('now')"
        : c === 'status' || c === 'payment_status'
          ? "'completed'"
          : c === 'kitchen_status'
            ? "'pending'"
            : '?'
    );
    const bindsNoTip = [];
    for (const c of saleColsNoTip) {
      if (
        c === 'created_at' ||
        c === 'updated_at' ||
        c === 'status' ||
        c === 'payment_status' ||
        c === 'kitchen_status'
      )
        continue;
      bindsNoTip.push(
        c === 'id'
          ? 'txn_tip_2'
          : c === 'order_number'
            ? 'TIP-002'
            : bindFor(c)
      );
    }
    db.prepare(
      `INSERT INTO pos_transactions (${saleColsNoTip.join(', ')}) VALUES (${placeholdersNoTip.join(', ')})`
    ).run(...bindsNoTip);
    const row2 = db
      .prepare('SELECT tip_amount FROM pos_transactions WHERE id = ?')
      .get('txn_tip_2');
    expect(row2.tip_amount).toBe(0);
  });
});
