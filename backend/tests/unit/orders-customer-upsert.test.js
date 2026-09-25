/**
 * U-002 follow-up — orders-path customer upsert convergence (2 tests).
 *
 * Runs the REAL `findOrCreateCustomer` from backend/src/api/orders.js (and,
 * for the cross-path test, the REAL one from backend/src/api/reservations.js)
 * against a REAL SQLite database (better-sqlite3 :memory:, idiom copied from
 * tests/unit/reservations-customer-upsert.test.js) with the REAL migration
 * file 0116 applied — no D1 mocks. A minimal D1-compatible shim
 * (prepare/bind/all/first/run) adapts the driver; every SQL string the code
 * emits is captured for shape assertions.
 *
 * Honesty note (same as the reservations twin): one in-process connection
 * serializes statements, so the "concurrent" test cannot interleave two
 * threads — the convergence guarantee under true concurrency comes from the
 * DB itself (single-statement upsert on a UNIQUE arbiter). That guard is
 * proved directly here: a negative control shows a raw double INSERT throws
 * SQLITE_CONSTRAINT_UNIQUE, and the SQL-shape assertions show the code path
 * is one INSERT ... ON CONFLICT ... RETURNING with no SELECT-then-INSERT
 * round-trips.
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { findOrCreateCustomer as findOrCreateOrderCustomer } from '../../src/api/orders.js';
import { findOrCreateCustomer as findOrCreateReservationCustomer } from '../../src/api/reservations.js';

// The reservations route module imports the Paymob service; mock it so this
// file never touches the network (same factory as
// tests/unit/reservations-customer-upsert.test.js). The orders module has no
// network imports.
vi.mock('../../src/services/paymob.js', () => ({
  createPaymobIntention: vi.fn(),
  verifyPaymobWebhookSignature: vi.fn(),
  extractPaymobTransaction: vi.fn(),
  buildHmacSignedString: vi.fn(),
}));

const migrationsDir = join(import.meta.dirname, '../../migrations');
const readMigration = (file) => readFileSync(join(migrationsDir, file), 'utf8');

// Pre-0116 customers shape, verbatim DDL from 0002_orders.sql plus the
// non-unique lookup indexes (tenants stub is minimal: better-sqlite3 leaves
// FK enforcement off unless PRAGMA'd on, matching the 0110-test idiom).
function buildDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY);
    INSERT INTO tenants (id) VALUES ('t1'), ('t2');
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
    CREATE INDEX idx_customers_tenant ON customers(tenant_id);
    CREATE INDEX idx_customers_tenant_email ON customers(tenant_id, email);
    CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);
  `);
  // Replay the REAL 0116 migration file (preparing the upsert below also
  // proves the ON CONFLICT arbiter matches this partial index — SQLite throws
  // at prepare time when no UNIQUE index matches the conflict target).
  sqlite.exec(readMigration('0116_customers_email_unique.sql'));
  return sqlite;
}

// Minimal D1-compatible shim over better-sqlite3. Records every SQL string.
function wrapD1(sqlite, sqlLog) {
  return {
    prepare(sql) {
      sqlLog.push(sql);
      const isRead = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
      const hasReturning = /\bRETURNING\b/i.test(sql);
      const stmt = sqlite.prepare(sql);
      const execBound = (params) => ({
        all: async () => {
          if (isRead || hasReturning) return { results: stmt.all(...params) };
          const info = stmt.run(...params);
          return { results: [], meta: { changes: Number(info.changes) } };
        },
        first: async () => {
          if (isRead || hasReturning) return stmt.get(...params) ?? null;
          const info = stmt.run(...params);
          return info.changes > 0 ? { id: null } : null;
        },
        run: async () => {
          const info = stmt.run(...params);
          return { meta: { changes: Number(info.changes) } };
        },
      });
      return { bind: (...params) => execBound(params) };
    },
    batch: async () => {
      throw new Error('batch is not used by findOrCreateCustomer');
    },
  };
}

describe('U-002 follow-up: orders-path customer upsert', () => {
  it('concurrent orders with the same email converge to one row (atomic upsert)', async () => {
    const sqlite = buildDb();
    // The migration file creates the partial UNIQUE arbiter the upsert relies on.
    const idx = sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_customers_tenant_email_unique'"
      )
      .get();
    expect(idx, 'partial UNIQUE index from 0116 must exist').toBeDefined();
    expect(idx.sql).toMatch(/UNIQUE/i);
    expect(idx.sql).toMatch(/WHERE email IS NOT NULL/i);

    // Negative control: without ON CONFLICT the guard rejects the double INSERT.
    sqlite
      .prepare(
        "INSERT INTO customers (id, tenant_id, first_name, email) VALUES ('c_dup1', 't1', 'Dup', 'order-race@example.com')"
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO customers (id, tenant_id, first_name, email) VALUES ('c_dup2', 't1', 'Dup', 'order-race@example.com')"
        )
        .run()
    ).toThrow();
    sqlite.prepare("DELETE FROM customers WHERE id LIKE 'c_dup%'").run();

    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const ids = await Promise.all(
      Array.from({ length: 10 }, () =>
        findOrCreateOrderCustomer(env, 't1', 'Concurrent Guest', 'order-race@example.com', '+201000000002')
      )
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();
    expect(
      sqlite
        .prepare('SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND email = ?')
        .get('t1', 'order-race@example.com').n
    ).toBe(1);

    // Atomicity proof: exactly one statement per call — an INSERT with
    // ON CONFLICT ... RETURNING — and no SELECT-then-INSERT round-trips.
    expect(sqlLog).toHaveLength(10);
    for (const sql of sqlLog) {
      expect(sql).toMatch(/INSERT INTO customers/i);
      expect(sql).toMatch(/ON CONFLICT/i);
      expect(sql).toMatch(/RETURNING/i);
    }
    expect(sqlLog.join('\n')).not.toMatch(/SELECT id FROM customers/i);
  });

  it('order + reservation with the same email share one customer row', async () => {
    const sqlite = buildDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const orderId = await findOrCreateOrderCustomer(
      env, 't1', 'Shared Guest', 'shared-paths@example.com', '+201000000003'
    );
    const reservationId = await findOrCreateReservationCustomer(
      env, 't1', 'Shared Guest', 'shared-paths@example.com', '+201000000003'
    );
    expect(orderId).toBeTruthy();
    expect(reservationId).toBe(orderId);
    const rows = sqlite
      .prepare('SELECT id, email FROM customers WHERE tenant_id = ? AND email = ?')
      .all('t1', 'shared-paths@example.com');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orderId);
  });
});
