import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import reportsRoutes from '../src/api/reports.js';
import { mountRouter } from './helpers/routerHarness.js';

// F-003 regression: pos_transaction_items.transaction_id is always NULL —
// the sole writer (backend/src/routes/pos/index.js:686-693) inserts
// (id, tenant_id, order_id, product_id, quantity, unit_price, subtotal,
//  tax_amount, total_amount, created_at, updated_at) with NO transaction_id.
// Both readers must join pos_transactions via order_id, not transaction_id.

// Thin D1-compatible wrapper over better-sqlite3 so the router runs against a
// real in-memory DB (real INNER JOIN / NULL semantics / tenant isolation).
function makeD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...args) {
          return {
            async all() {
              return { results: stmt.all(...args) };
            },
            async first() {
              return stmt.get(...args) ?? null;
            },
            async run() {
              stmt.run(...args);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

// Minimal schema covering exactly the columns the two readers touch
// (reports.js top-products + revenue-breakdown incl. the orders fallback).
function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'retail'
    );
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      payment_method TEXT,
      total_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pos_transaction_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      transaction_id TEXT,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      order_state_id TEXT DEFAULT 'confirmed'
    );
  `);
  return db;
}

describe('F-003 reports join via order_id (real POS insert path)', () => {
  let env;
  let app;

  beforeAll(() => {
    const raw = createTestDb();
    env = { DB: makeD1(raw) };
    app = mountRouter(reportsRoutes, { tenantId: 't_f003', basePath: '/api/reports' });

    // ── Real POS insert path shape ─────────────────────────────
    // Header (mirrors routes/pos/index.js pos_transactions INSERT: the
    // transaction id IS the order id the line items point at).
    raw.prepare(
      `INSERT INTO pos_transactions (id, tenant_id, status, payment_method, total_amount, created_at)
       VALUES ('txn_f003', 't_f003', 'completed', 'cash', 200, datetime('now'))`
    ).run();
    // Product the sale references.
    raw.prepare(
      `INSERT INTO pos_products (id, tenant_id, organization_id, name, type)
       VALUES ('prod_f003', 't_f003', 1, 'F003 Koshary', 'menu')`
    ).run();
    // Line item via the EXACT column list of routes/pos/index.js:686-693 —
    // transaction_id is absent, so it stays NULL in the row.
    raw.prepare(
      `INSERT INTO pos_transaction_items
         (id, tenant_id, order_id, product_id, quantity, unit_price, subtotal, tax_amount, total_amount, created_at, updated_at)
       VALUES ('item_f003', 't_f003', 'txn_f003', 'prod_f003', 2, 100, 200, 0, 200, datetime('now'), datetime('now'))`
    ).run();
  });

  it('top-products + revenue-breakdown surface the POS sale joined via order_id', async () => {
    const topRes = await app.request(
      'http://localhost/api/reports/top-products?days=30&limit=10',
      { method: 'GET' },
      env
    );
    expect(topRes.status).toBe(200);
    const top = await topRes.json();
    const row = top.topProducts.find((p) => p.id === 'prod_f003');
    expect(row).toBeDefined();
    expect(row.name).toBe('F003 Koshary');
    expect(Number(row.totalQty)).toBe(2);
    expect(Number(row.totalQty)).toBeGreaterThan(0);

    const revRes = await app.request(
      'http://localhost/api/reports/revenue-breakdown?days=30',
      { method: 'GET' },
      env
    );
    expect(revRes.status).toBe(200);
    const rev = await revRes.json();
    const byType = rev.byProductType.find((r) => r.type === 'menu');
    expect(byType).toBeDefined();
    expect(Number(byType.revenue)).toBe(200);
    expect(Number(byType.revenue)).toBeGreaterThan(0);
    expect(Number(byType.orderCount)).toBe(1);
  });
});
