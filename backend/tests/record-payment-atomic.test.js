/**
 * F-002 atomicity: POST /api/orders/:id/record-payment commits the ledger
 * INSERT + orders UPDATE in a single c.env.DB.batch
 * (backend/src/api/orders.js:1308). Idempotency SELECT (~1273-1280) and the
 * best-effort audit log (~1313-1332) are out of scope and untouched.
 *
 * Harness: mountRouter with injected scope (auth is the index.js mount gate,
 * same as the record-payment suite) + better-sqlite3 real in-memory DB behind
 * a D1-compatible wrapper. batch() runs inside one transaction and throws on
 * the SECOND statement to simulate a mid-write failure — the transaction
 * rolls the first statement back, mirroring D1's all-or-nothing batch
 * semantics (old code: two bare .run()s — the INSERT would have committed).
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import ordersRoutes from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';

function makeAtomicD1(db) {
  const batchCalls = [];
  return {
    batchCalls,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            _sql: sql,
            _args: args,
            async first() {
              return db.prepare(sql).get(...args) ?? null;
            },
            async all() {
              return { results: db.prepare(sql).all(...args) };
            },
            async run() {
              db.prepare(sql).run(...args);
              return { success: true };
            },
          };
        },
      };
    },
    async batch(stmts) {
      batchCalls.push(stmts);
      const txn = db.transaction(() => {
        stmts.forEach((s, i) => {
          if (i === 1) throw new Error('mock second-statement failure');
          db.prepare(s._sql).run(...(s._args || []));
        });
      });
      txn();
      return [{ success: true }];
    },
  };
}

describe('F-002 record-payment atomic batch', () => {
  it('second-statement failure leaves no ledger row and amount_paid unchanged', async () => {
    const raw = new Database(':memory:');
    raw.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        total_amount REAL DEFAULT 0,
        amount_paid REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        payment_method TEXT,
        updated_at TEXT
      );
      CREATE TABLE payment_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        amount_cash REAL DEFAULT 0,
        amount_card REAL DEFAULT 0,
        received_by TEXT,
        approved_by TEXT,
        reference TEXT,
        notes TEXT
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        old_values TEXT,
        new_values TEXT
      );
    `);
    raw
      .prepare(
        `INSERT INTO orders (id, tenant_id, total_amount, amount_paid, payment_status)
         VALUES ('ord_1', 't1', 200, 0, 'pending')`
      )
      .run();

    const DB = makeAtomicD1(raw);
    const app = mountRouter(ordersRoutes, {
      tenantId: 't1',
      user: { userId: 'admin_1', sub: 'admin_1', role: 'admin' },
      basePath: '/api/orders',
    });

    const res = await app.request(
      '/api/orders/ord_1/record-payment',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 80, method: 'cash' }),
      },
      { DB }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);

    // Atomic: the INSERT rolled back with the failed UPDATE.
    expect(raw.prepare('SELECT * FROM payment_records').all()).toEqual([]);
    const ord = raw.prepare('SELECT * FROM orders WHERE id = ?').get('ord_1');
    expect(Number(ord.amount_paid)).toBe(0);
    expect(ord.payment_status).toBe('pending');

    // Single batch of exactly the two verbatim statements.
    expect(DB.batchCalls.length).toBe(1);
    expect(DB.batchCalls[0].length).toBe(2);
    expect(DB.batchCalls[0][0]._sql).toContain('INSERT INTO payment_records');
    expect(DB.batchCalls[0][0]._args).toEqual([
      expect.any(String),
      't1',
      'ord_1',
      80,
      'cash',
      80,
      0,
      'admin_1',
      null,
      null,
      null,
    ]);
    expect(DB.batchCalls[0][1]._sql).toContain('UPDATE orders SET amount_paid');
    expect(DB.batchCalls[0][1]._args).toEqual([80, 'pending', 'cash', 't1', 'ord_1']);
  });
});
