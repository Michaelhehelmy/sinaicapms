/**
 * Folio B.7 reporting attribution — GET /api/reports/profit folio leg.
 *
 * The profit union gains a folio_charges leg while the booking
 * (order_items) leg NOT EXISTS-excludes folio-linked orders, so a stay whose
 * room charges were auto-posted to its folio (B.4 check-in) counts ONCE via
 * the folio leg instead of twice. The storefront leg is verbatim.
 *
 * Master fixture: Camp 300 (folio room) + Restaurant 50 (legacy booking) +
 * Shop 30 (storefront) = 380 with the folio-linked order_items excluded.
 *
 * Pattern: REAL reports router against REAL SQLite (better-sqlite3 :memory:)
 * through the 5a/5b D1-compatible shim. No KV writes, no D1 writes, no deploy.sh.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import reportsRoutes from '../src/api/reports.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 't_folioB7';
const CAMP = 'proj_b7_camp';
const REST = 'proj_b7_rest';
const SHOP = 'proj_b7_shop';

// ─── D1-compatible shim (5a/5b idiom) ───────────────────────────────────────
function wrapD1(sqlite, sqlLog) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => ({
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
        }),
      };
    },
    batch: async () => [],
  };
}

// ─── Behavior DB (post-0124 lineage shape; FK clauses omitted — scope only) ─
// o1 is folio-linked (folio f1 settled, room charge 300 Camp via the folio
// leg; its 300 order_items line MUST be excluded); o2 is a legacy booking
// (50 Restaurant via the orders leg); so1 is a storefront order (30 Shop).
function buildFolioDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      name TEXT NOT NULL, project_type TEXT NOT NULL DEFAULT 'camp',
      deleted_at TEXT
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, camp_id TEXT, room_id TEXT,
      order_state_id TEXT NOT NULL,
      check_in_date TEXT, check_out_date TEXT,
      total_amount REAL DEFAULT 0, amount_paid REAL DEFAULT 0, reference TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0, project_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE folios (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      guest_id TEXT, primary_order_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      total_amount REAL NOT NULL DEFAULT 0,
      opened_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE folio_charges (
      id TEXT PRIMARY KEY, folio_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
      project_id TEXT, source TEXT NOT NULL DEFAULT 'room',
      reference_id TEXT, description TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0, total_price REAL NOT NULL DEFAULT 0,
      posted_at TEXT DEFAULT (datetime('now')), voided_at TEXT
    );
    CREATE TABLE storefront_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT,
      reference TEXT UNIQUE NOT NULL, session_id TEXT,
      total_amount REAL DEFAULT 0, currency TEXT DEFAULT 'EGP',
      status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'pending',
      notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT,
      project_id TEXT
    );
    CREATE TABLE storefront_order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL,
      product_id TEXT, product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
      project_id TEXT
    );
    INSERT INTO projects (id, tenant_id, name, project_type, deleted_at) VALUES
      ('${CAMP}', '${TENANT}', 'Acacia Camp', 'camp', NULL),
      ('${REST}', '${TENANT}', 'Acacia Restaurant', 'restaurant', NULL),
      ('${SHOP}', '${TENANT}', 'Acacia Shop', 'retail', NULL);
    INSERT INTO orders (id, tenant_id, camp_id, order_state_id, total_amount, reference, created_at) VALUES
      ('o1', '${TENANT}', '${CAMP}', 'confirmed', 300, 'REF-B7-FOLIO', datetime('now')),
      ('o2', '${TENANT}', '${REST}', 'confirmed', 50, 'REF-B7-LEGACY', datetime('now'));
    INSERT INTO order_items (id, order_id, name, quantity, unit_price, total_price, project_id) VALUES
      ('li1', 'o1', 'Sea View Room', 1, 300, 300, '${CAMP}'),
      ('li2', 'o2', 'Desert Dinner', 1, 50, 50, '${REST}');
    INSERT INTO folios (id, tenant_id, guest_id, primary_order_id, status, total_amount) VALUES
      ('f1', '${TENANT}', 'cust_1', 'o1', 'settled', 300);
    INSERT INTO folio_charges (id, folio_id, tenant_id, project_id, source, reference_id, description, quantity, unit_price, total_price, posted_at, voided_at) VALUES
      ('fc1', 'f1', '${TENANT}', '${CAMP}', 'room', 'o1', 'Room charge', 1, 300, 300, datetime('now'), NULL);
    INSERT INTO storefront_orders (id, tenant_id, reference, total_amount, status, payment_status, created_at) VALUES
      ('so1', '${TENANT}', 'ORD-B7', 30, 'pending', 'pending', datetime('now'));
    INSERT INTO storefront_order_items (id, order_id, product_name, quantity, unit_price, total_price, project_id) VALUES
      ('sl1', 'so1', 'Gift Scarf', 1, 30, 30, '${SHOP}');
  `);
  return sqlite;
}

function mount(sqlite, sqlLog, tenantId = TENANT) {
  const env = { DB: wrapD1(sqlite, sqlLog) };
  const app = mountRouter(reportsRoutes, { tenantId, basePath: '/api/reports' });
  return { app, env };
}

const WINDOW = 'start=2000-01-01&end=2100-01-01';

describe('GET /api/reports/profit folio attribution (B.7)', () => {
  // Gate 1 — master numeric: Camp 300 (folio) + Restaurant 50 (legacy
  // booking) + Shop 30 (storefront) = 380, folio room counted once.
  it('1: Camp 300 + Restaurant 50 + Shop 30 = 380 with the folio room counted once', async () => {
    const sqlite = buildFolioDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byProject).toHaveLength(3);
    const camp = body.byProject.find((r) => r.projectName === 'Acacia Camp');
    const rest = body.byProject.find((r) => r.projectName === 'Acacia Restaurant');
    const shop = body.byProject.find((r) => r.projectName === 'Acacia Shop');
    expect(camp.revenue).toBe(300);
    expect(rest.revenue).toBe(50);
    expect(shop.revenue).toBe(30);
    const sum = body.byProject.reduce((a, r) => a + r.revenue, 0);
    expect(sum).toBe(380);
    expect(body.total.totalRevenue).toBe(380);
    expect(body.total.totalRevenue).toBe(sum);
    expect(body.total.totalLines).toBe(3);
    expect(body.total.totalOrders).toBe(3);
  });

  // Gate 2 — no double count: without the NOT EXISTS exclusion the
  // folio-linked 300 would appear in BOTH legs (680); the folio leg must
  // carry it exactly once and the union SQL must show the exclusion.
  it('2: no double count — folio-linked order_items excluded, union carries NOT EXISTS + folio leg', async () => {
    const sqlite = buildFolioDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    const body = await res.json();
    expect(body.total.totalRevenue).toBe(380);
    expect(body.total.totalRevenue).not.toBe(680);
    const camp = body.byProject.find((r) => r.projectName === 'Acacia Camp');
    expect(camp.revenue).toBe(300);
    expect(camp.lineCount).toBe(1);
    const unionSql = sqlLog.find((s) => s.includes('UNION ALL'));
    expect(unionSql).toBeDefined();
    expect(unionSql).toContain('FROM folio_charges');
    expect(unionSql).toContain('NOT EXISTS');
    expect(unionSql).toContain('primary_order_id');
  });

  // Gate 3 — legacy path intact: an order with no folio counts once via the
  // orders leg (isolated single-order fixture ⇒ exactly 50).
  it('3: legacy order without a folio counted once via the orders leg', async () => {
    const sqlite = buildFolioDb();
    sqlite.prepare(`DELETE FROM folios`).run();
    sqlite.prepare(`DELETE FROM folio_charges`).run();
    sqlite.prepare(`DELETE FROM orders WHERE id = 'o1'`).run();
    sqlite.prepare(`DELETE FROM order_items WHERE order_id = 'o1'`).run();
    sqlite.prepare(`DELETE FROM storefront_orders`).run();
    sqlite.prepare(`DELETE FROM storefront_order_items`).run();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    const body = await res.json();
    expect(body.byProject).toHaveLength(1);
    expect(body.byProject[0].projectName).toBe('Acacia Restaurant');
    expect(body.byProject[0].revenue).toBe(50);
    expect(body.total.totalRevenue).toBe(50);
    expect(body.total.totalLines).toBe(1);
  });

  // Gate 4 — storefront leg unchanged: the shop line counts once and the
  // union SQL still carries the verbatim storefront leg.
  it('4: storefront leg unchanged — shop 30 counted once', async () => {
    const sqlite = buildFolioDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}&projectId=${SHOP}`,
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byProject).toHaveLength(1);
    expect(body.byProject[0].projectName).toBe('Acacia Shop');
    expect(body.byProject[0].revenue).toBe(30);
    expect(body.total.totalRevenue).toBe(30);
    const unionSql = sqlLog.find((s) => s.includes('UNION ALL'));
    expect(unionSql).toContain('FROM storefront_order_items');
    expect(unionSql).toContain('FROM folio_charges');
  });

  // Gate 5 — voided out: a voided charge (voided_at) and a charge on a
  // voided folio never enter the folio leg (total stays 380).
  it('5: voided folio charges excluded — voided_at line + voided-folio line add nothing', async () => {
    const sqlite = buildFolioDb();
    sqlite.prepare(
      `INSERT INTO folio_charges (id, folio_id, tenant_id, project_id, source, reference_id, description, quantity, unit_price, total_price, posted_at, voided_at)
       VALUES ('fc_void', 'f1', '${TENANT}', '${CAMP}', 'room', 'o1', 'Voided night', 1, 999, 999, datetime('now'), datetime('now'))`,
    ).run();
    sqlite.prepare(
      `INSERT INTO folios (id, tenant_id, guest_id, primary_order_id, status, total_amount)
       VALUES ('f2', '${TENANT}', 'cust_9', 'o9', 'voided', 777)`,
    ).run();
    sqlite.prepare(
      `INSERT INTO folio_charges (id, folio_id, tenant_id, project_id, source, reference_id, description, quantity, unit_price, total_price, posted_at, voided_at)
       VALUES ('fc_orphan', 'f2', '${TENANT}', '${CAMP}', 'room', 'o9', 'Voided folio charge', 1, 777, 777, datetime('now'), NULL)`,
    ).run();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    const body = await res.json();
    expect(body.total.totalRevenue).toBe(380);
    const camp = body.byProject.find((r) => r.projectName === 'Acacia Camp');
    expect(camp.revenue).toBe(300);
    expect(body.total.totalLines).toBe(3);
  });
});
