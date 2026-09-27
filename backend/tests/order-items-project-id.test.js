/**
 * Phase 5 step 5b — order_items.project_id on every INSERT.
 *
 * Source sites (grep `INSERT INTO order_items` backend/src — exactly 3, all
 * stamped; storefront_order_items is a different table, owned by 5c):
 *   1. backend/src/api/orders.js POST / — generic client items: NO source
 *      (orderItemSchema strips unknown keys, reference_id NULL by design)
 *      and NO parent (orders.project_id never stamped here — 5c owns the
 *      checkout shape) ⇒ NULL, bound explicitly with the column present.
 *   2. backend/src/api/orders.js POST / — meal_plans: product.project_id
 *      from the server-side pos_products lookup (never from the client).
 *   3. backend/src/api/reservations.js POST / — meal-plan items: same
 *      product.project_id stamp. NULL only for legacy untagged rows.
 *
 * Pattern: REAL routers against REAL SQLite (better-sqlite3 :memory:)
 * through the phase-4f D1-compatible shim (5a idiom). No KV writes, no
 * network (Paymob disabled ⇒ fallback path), no deploy.sh.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import ordersRoutes from '../src/api/orders.js';
import reservationsRoutes from '../src/api/reservations.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 't_ord5b';

// ─── D1-compatible shim (5a idiom) ───────────────────────────────────────────
function wrapD1(sqlite, sqlLog) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          const bound = {
            _sql: sql,
            _params: params,
            all: async () => {
              sqlLog.push(sql);
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return { results: s.all(...params) };
              const info = s.run(...params);
              return { results: [], meta: { changes: Number(info.changes) } };
            },
            first: async () => {
              sqlLog.push(sql);
              return sqlite.prepare(sql).get(...params) ?? null;
            },
            run: async () => {
              sqlLog.push(sql);
              const info = sqlite.prepare(sql).run(...params);
              return { meta: { changes: Number(info.changes) } };
            },
          };
          return bound;
        },
      };
    },
    batch: async (stmts) => {
      const out = [];
      for (const st of stmts) {
        sqlLog.push(st._sql);
        const s = sqlite.prepare(st._sql);
        if (isRead(st._sql)) out.push({ results: s.all(...st._params) });
        else {
          const info = s.run(...st._params);
          out.push({ meta: { changes: Number(info.changes) } });
        }
      }
      return out;
    },
  };
}

// ─── Behavior DB (post-0102/0111 shape: order_items.project_id nullable) ────
function buildOrdersDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      deleted_at TEXT, min_stay INTEGER, max_stay INTEGER
    );
    CREATE TABLE rooms_new (
      id TEXT PRIMARY KEY, camp_id TEXT NOT NULL,
      product_id TEXT, max_guests INTEGER
    );
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id INTEGER,
      project_id TEXT,
      name TEXT NOT NULL, selling_price REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE customers (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE tenant_org_mapping (tenant_id TEXT PRIMARY KEY, organization_id INTEGER NOT NULL);
    CREATE TABLE pos_stores (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL);
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, camp_id TEXT, room_id TEXT,
      customer_id TEXT, order_state_id TEXT,
      check_in_date TEXT, check_out_date TEXT, number_of_people INTEGER,
      total_amount REAL, amount_paid REAL, payment_method TEXT,
      payment_status TEXT, reference TEXT UNIQUE, notes TEXT,
      project_id TEXT, payment_intent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, type TEXT,
      reference_id TEXT, name TEXT, quantity INTEGER,
      unit_price REAL, total_price REAL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, organization_id INTEGER,
      store_id INTEGER, order_number TEXT, cashier_id TEXT, status TEXT,
      subtotal REAL, tax_amount REAL, tax_rate REAL, total_amount REAL,
      paid_amount REAL, payment_method TEXT, payment_status TEXT, notes TEXT,
      kitchen_status TEXT, project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE rate_plans_new (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT,
      price_per_night REAL, start_date TEXT, end_date TEXT, season TEXT
    );
    CREATE TABLE price_overrides (product_id TEXT NOT NULL, date TEXT NOT NULL, price REAL);
    INSERT INTO projects (id, tenant_id, deleted_at) VALUES
      ('camp_5b', '${TENANT}', NULL),
      ('proj_meal_a', '${TENANT}', NULL),
      ('proj_meal_b', '${TENANT}', NULL);
    INSERT INTO rooms_new (id, camp_id, product_id, max_guests) VALUES
      ('room_5b', 'camp_5b', 'room_prod_5b', 4);
    INSERT INTO pos_products (id, tenant_id, organization_id, project_id, name, selling_price, is_active) VALUES
      ('room_prod_5b', '${TENANT}', 7, 'camp_5b', 'Sea View Room', 200, 1),
      ('meal_a', '${TENANT}', 7, 'proj_meal_a', 'Camp Breakfast', 50, 1),
      ('meal_b', '${TENANT}', 7, 'proj_meal_b', 'Desert Dinner', 80, 1);
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('${TENANT}', 7);
    INSERT INTO pos_stores (id, organization_id) VALUES (3, 7);
  `);
  return sqlite;
}

const postJson = (path, body) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const ORDER_BODY = {
  camp_id: 'camp_5b',
  room_id: 'room_5b',
  guest_name: 'Mixed Guest',
  check_in_date: '2030-08-01',
  check_out_date: '2030-08-05',
  items: [{ type: 'addon', name: 'Extra Bed', quantity: 1, unit_price: 30 }],
  meal_plans: [
    { product_id: 'meal_a', quantity: 1 },
    { product_id: 'meal_b', quantity: 2 },
  ],
};

// ─── POST /orders: generic NULL + 2 meal lines correctly tagged ──────────────
describe('POST /orders stamps order_items.project_id per line', () => {
  it('mixed-origin order ⇒ generic NULL + 2 meal items with correct project_ids', async () => {
    const sqlite = buildOrdersDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const app = mountRouter(ordersRoutes, { tenantId: TENANT, basePath: '/api/orders' });

    const res = await app.request(postJson('/api/orders', ORDER_BODY), {}, env);
    const body = await res.json();
    expect(body.success).toBe(true);

    const rows = sqlite
      .prepare('SELECT type, reference_id, name, project_id FROM order_items ORDER BY name')
      .all();
    expect(rows).toHaveLength(3);

    // Generic client item: no source + no parent ⇒ NULL (documented).
    const generic = rows.find((r) => r.type === 'addon');
    expect(generic.name).toBe('Extra Bed');
    expect(generic.project_id).toBeNull();

    // Meal-plan lines: each carries its own product's project.
    const mealA = rows.find((r) => r.reference_id === 'meal_a');
    const mealB = rows.find((r) => r.reference_id === 'meal_b');
    expect(mealA.project_id).toBe('proj_meal_a');
    expect(mealB.project_id).toBe('proj_meal_b');
    const tagged = rows.filter((r) => r.project_id !== null).map((r) => r.project_id).sort();
    expect(tagged).toEqual(['proj_meal_a', 'proj_meal_b']);
    expect(new Set(tagged).size).toBe(2);

    // Every order_items INSERT binds project_id (none omits the column).
    const inserts = sqlLog.filter((s) => s.includes('INSERT INTO order_items'));
    expect(inserts.length).toBeGreaterThan(0);
    for (const sql of inserts) expect(sql).toContain('project_id');
  });
});

// ─── POST /public/reservations: 2 mixed meal lines correctly tagged ──────────
describe('POST /public/reservations stamps order_items.project_id per line', () => {
  it('mixed-origin reservation ⇒ 2 items with correct project_ids', async () => {
    const sqlite = buildOrdersDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const app = mountRouter(reservationsRoutes, { tenantId: TENANT, basePath: '/api/public/reservations' });

    const res = await app.request(
      postJson('/api/public/reservations', {
        room_id: 'room_5b',
        check_in_date: '2030-08-01',
        check_out_date: '2030-08-05',
        guest_name: 'Mixed Guest',
        items: [
          { product_id: 'meal_a', quantity: 1 },
          { product_id: 'meal_b', quantity: 1 },
        ],
      }),
      {},
      env
    );
    const body = await res.json();
    expect(body.success).toBe(true);

    const rows = sqlite
      .prepare('SELECT reference_id, project_id FROM order_items ORDER BY reference_id')
      .all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.reference_id === 'meal_a').project_id).toBe('proj_meal_a');
    expect(rows.find((r) => r.reference_id === 'meal_b').project_id).toBe('proj_meal_b');
    for (const row of rows) expect(row.project_id).not.toBeNull();

    const inserts = sqlLog.filter((s) => s.includes('INSERT INTO order_items'));
    expect(inserts.length).toBeGreaterThan(0);
    for (const sql of inserts) expect(sql).toContain('project_id');
  });
});
