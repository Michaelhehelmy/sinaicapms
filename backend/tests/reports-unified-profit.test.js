/**
 * T40 profit union fix — GET /api/reports/profit UNION ALL line grain.
 *
 * Booking leg (order_items JOIN orders) UNION ALL storefront leg
 * (storefront_order_items JOIN storefront_orders), grouped once in the outer
 * query by line project_id with the Unassigned bucket for NULL lines.
 *
 * Seed mirrors the staging truth audited in
 * `.opencode/audits/full-audit-2026-09-24/08-t40-profit-grain.md` §1:
 * 2 storefront orders x 1550 (1500 Camp + 50 Restaurant lines each) ⇒
 * header 3100; line truth Camp 3000/2, Restaurant 100/2, grand 3100/4/2.
 *
 * Gates (spec `.opencode/agents/tmp/2026-09-28-t40pf.md`):
 *   A. union total 3100 (storefront picked up while the booking leg is empty)
 *   B. Camp 3000 + Restaurant 100 split, revenue-DESC order, footer == aggregate,
 *      ?projectId= narrow hits the shop leg
 *   C. booking contribution (booking line adds to the union, nothing regresses)
 *   D. empty tenant ⇒ empty rows + zero total (both legs tenant-scoped, no double)
 *
 * Pattern: REAL reports router against REAL SQLite (better-sqlite3 :memory:)
 * through the 5a/5b D1-compatible shim (same idiom as profit-report.test.js).
 * No KV writes, no D1 writes, no deploy.sh.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import reportsRoutes from '../src/api/reports.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 't_t40profit';
const OTHER = 't_t40profit_empty';
const CAMP = 'proj_27709a3f-f50';
const REST = 'camp_e323b315-725';

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

// ─── Behavior DB (post-0123 lineage shape; FK clauses omitted — scope only) ─
// Staging-mirror seed: 2 storefront orders x 1550, each with one 1500 Camp
// line + one 50 Restaurant line. Booking tables present but empty (Test A/B);
// Test C adds one booking line.
function buildUnionDb() {
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
    -- B.7-folio-attribution fixture catch-up (parity class): /profit now
    -- UNIONs the folio_charges leg + NOT EXISTS-excludes folio-linked orders,
    -- so the fixture declares both tables (empty ⇒ no exclusion fires and
    -- the folio leg contributes nothing ⇒ gates A–D hold verbatim).
    CREATE TABLE folios (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      primary_order_id TEXT, status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE folio_charges (
      id TEXT PRIMARY KEY, folio_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
      project_id TEXT, total_price REAL DEFAULT 0,
      posted_at TEXT DEFAULT (datetime('now')), voided_at TEXT
    );
    INSERT INTO projects (id, tenant_id, name, project_type, deleted_at) VALUES
      ('${CAMP}', '${TENANT}', 'Acacia Camp', 'camp', NULL),
      ('${REST}', '${TENANT}', 'Acacia Restaurant', 'restaurant', NULL);
    INSERT INTO storefront_orders (id, tenant_id, reference, total_amount, status, payment_status, created_at) VALUES
      ('2cb3872d-52b4-453e-90b0-033fade38e54', '${TENANT}', 'ORD-6S4R6R', 1550, 'pending', 'pending', datetime('now')),
      ('30d9da91-48d5-4b11-8c3e-aaa7bb7bd520', '${TENANT}', 'ORD-6SJU3V', 1550, 'pending', 'pending', datetime('now'));
    INSERT INTO storefront_order_items (id, order_id, product_name, quantity, unit_price, total_price, project_id) VALUES
      ('sl1', '2cb3872d-52b4-453e-90b0-033fade38e54', 'Beach Tent', 1, 1500, 1500, '${CAMP}'),
      ('sl2', '2cb3872d-52b4-453e-90b0-033fade38e54', 'P5 Restaurant Meal', 1, 50, 50, '${REST}'),
      ('sl3', '30d9da91-48d5-4b11-8c3e-aaa7bb7bd520', 'Beach Tent', 1, 1500, 1500, '${CAMP}'),
      ('sl4', '30d9da91-48d5-4b11-8c3e-aaa7bb7bd520', 'P5 Restaurant Meal', 1, 50, 50, '${REST}');
  `);
  return sqlite;
}

function mount(sqlite, sqlLog, tenantId = TENANT) {
  const env = { DB: wrapD1(sqlite, sqlLog) };
  const app = mountRouter(reportsRoutes, { tenantId, basePath: '/api/reports' });
  return { app, env };
}

const WINDOW = 'start=2000-01-01&end=2100-01-01';

describe('GET /api/reports/profit union line grain (T40)', () => {
  // Gate A: storefront revenue is picked up while the booking leg is empty —
  // union total 3100 over 4 lines / 2 orders (staging §1 truth).
  it('A: union total 3100 — 4 lines / 2 orders with an empty booking leg', async () => {
    const sqlite = buildUnionDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total.totalRevenue).toBe(3100);
    expect(body.total.totalLines).toBe(4);
    expect(body.total.totalOrders).toBe(2);
    // Both legs present in the issued SQL (UNION ALL over both item tables).
    const unionSql = sqlLog.find((s) => s.includes('UNION ALL'));
    expect(unionSql).toBeDefined();
    expect(unionSql).toContain('FROM order_items');
    expect(unionSql).toContain('FROM storefront_order_items');
  });

  // Gate B: per-project split Camp 3000 (2 lines) + Restaurant 100 (2 lines),
  // revenue-DESC order, footer SUM == aggregate, narrow hits the shop leg.
  it('B: Camp 3000 + Restaurant 100; revenue DESC; footer == aggregate; narrow', async () => {
    const sqlite = buildUnionDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    const body = await res.json();
    expect(body.byProject).toHaveLength(2);
    expect(body.byProject[0].projectName).toBe('Acacia Camp');
    expect(body.byProject[0].revenue).toBe(3000);
    expect(body.byProject[0].lineCount).toBe(2);
    expect(body.byProject[1].projectName).toBe('Acacia Restaurant');
    expect(body.byProject[1].revenue).toBe(100);
    expect(body.byProject[1].lineCount).toBe(2);
    const sum = body.byProject.reduce((a, r) => a + r.revenue, 0);
    expect(sum).toBe(3100);
    expect(body.total.totalRevenue).toBe(sum);

    const narrowRes = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}&projectId=${REST}`,
      { method: 'GET' },
      env,
    );
    expect(narrowRes.status).toBe(200);
    const narrow = await narrowRes.json();
    expect(narrow.byProject).toHaveLength(1);
    expect(narrow.byProject[0].projectName).toBe('Acacia Restaurant');
    expect(narrow.byProject[0].revenue).toBe(100);
    expect(narrow.total.totalRevenue).toBe(100);
  });

  // Gate C: booking leg contributes — one 200 Camp booking line joins the
  // union (total 3300, Camp 3200/3 lines, Restaurant untouched at 100).
  it('C: booking line 200 joins the union — total 3300, Camp 3200', async () => {
    const sqlite = buildUnionDb();
    sqlite.prepare(
      `INSERT INTO orders (id, tenant_id, order_state_id, total_amount, reference, created_at)
       VALUES ('o_book', '${TENANT}', 'confirmed', 200, 'REF-T40', datetime('now'))`,
    ).run();
    sqlite.prepare(
      `INSERT INTO order_items (id, order_id, name, quantity, unit_price, total_price, project_id)
       VALUES ('li_book', 'o_book', 'Sea View Room', 1, 200, 200, '${CAMP}')`,
    ).run();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    const body = await res.json();
    const camp = body.byProject.find((r) => r.projectName === 'Acacia Camp');
    const rest = body.byProject.find((r) => r.projectName === 'Acacia Restaurant');
    expect(camp.revenue).toBe(3200);
    expect(camp.lineCount).toBe(3);
    expect(rest.revenue).toBe(100);
    expect(body.total.totalRevenue).toBe(3300);
    expect(body.total.totalLines).toBe(5);
    expect(body.total.totalOrders).toBe(3);
  });

  // Gate D: empty tenant sees nothing — both legs tenant-scoped, no double
  // count, no cross-tenant leak (zero rows, zero total).
  it('D: empty tenant ⇒ no rows + zero total (no double, no leak)', async () => {
    const sqlite = buildUnionDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog, OTHER);
    const res = await app.request(
      `http://localhost/api/reports/profit?${WINDOW}`,
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byProject).toEqual([]);
    expect(body.total.totalRevenue).toBe(0);
    expect(body.total.totalLines).toBe(0);
    expect(body.total.totalOrders).toBe(0);
  });
});
