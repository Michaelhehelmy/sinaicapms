/**
 * Phase 5 step 5f — GET /api/reports/profit per-project P&L split.
 *
 * Line-grain aggregation over order_items.project_id (stamped server-side
 * since 5b) with tenant scope via the parent order join; NULL-project lines
 * form an explicit 'Unassigned' bucket; footer total == tenant aggregate
 * (design §7.2 shape 2 + §7.3 acceptance).
 *
 * Pattern: REAL reports router against REAL SQLite (better-sqlite3 :memory:)
 * through the 5a/5b D1-compatible shim. No KV writes, no D1 writes, no deploy.sh.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import reportsRoutes from '../src/api/reports.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 't_profit5f';

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

// ─── Behavior DB (post-0106 lineage shape; FK clauses omitted — scope only) ─
function buildProfitDb() {
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
      total_amount REAL DEFAULT 0, reference TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0, project_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO projects (id, tenant_id, name, project_type, deleted_at) VALUES
      ('proj_camp', '${TENANT}', 'Accommodation', 'camp', NULL),
      ('proj_rest', '${TENANT}', 'Restaurant', 'restaurant', NULL);
    INSERT INTO orders (id, tenant_id, camp_id, room_id, order_state_id, check_in_date, check_out_date, total_amount, reference, created_at) VALUES
      ('o1', '${TENANT}', 'proj_camp', 'r1', 'confirmed', '2026-08-01', '2026-08-03', 250, 'REF-5F', datetime('now'));
    INSERT INTO order_items (id, order_id, name, quantity, unit_price, total_price, project_id) VALUES
      ('li1', 'o1', 'Sea View Room', 1, 200, 200, 'proj_camp'),
      ('li2', 'o1', 'Desert Dinner', 1, 50, 50, 'proj_rest');
  `);
  return sqlite;
}

function mount(sqlite, sqlLog) {
  const env = { DB: wrapD1(sqlite, sqlLog) };
  const app = mountRouter(reportsRoutes, { tenantId: TENANT, basePath: '/api/reports' });
  return { app, env };
}

describe('GET /api/reports/profit per-project P&L split (5f)', () => {
  // Numeric gate: order total 250 ⇒ Camp 200 + Restaurant 50 + sum 250,
  // footer SUM equals the tenant aggregate.
  it('order total 250 ⇒ Camp 200 + Restaurant 50 + sum 250; footer == aggregate', async () => {
    const sqlite = buildProfitDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      'http://localhost/api/reports/profit?start=2000-01-01&end=2100-01-01',
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.start).toBe('2000-01-01');
    expect(body.end).toBe('2100-01-01');
    expect(body.byProject).toHaveLength(2);
    const camp = body.byProject.find((r) => r.projectName === 'Accommodation');
    const rest = body.byProject.find((r) => r.projectName === 'Restaurant');
    expect(camp.revenue).toBe(200);
    expect(rest.revenue).toBe(50);
    const sum = body.byProject.reduce((a, r) => a + r.revenue, 0);
    expect(sum).toBe(250);
    expect(body.total.totalRevenue).toBe(250);
    expect(body.total.totalRevenue).toBe(sum);
  });

  it('optional projectId narrow returns the single project row + matching total', async () => {
    const sqlite = buildProfitDb();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      'http://localhost/api/reports/profit?start=2000-01-01&end=2100-01-01&projectId=proj_rest',
      { method: 'GET' },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byProject).toHaveLength(1);
    expect(body.byProject[0].projectName).toBe('Restaurant');
    expect(body.byProject[0].revenue).toBe(50);
    expect(body.total.totalRevenue).toBe(50);
  });

  it('NULL-project lines form an explicit Unassigned bucket (nothing silently dropped)', async () => {
    const sqlite = buildProfitDb();
    sqlite.prepare(
      "INSERT INTO order_items (id, order_id, name, quantity, unit_price, total_price, project_id) VALUES ('li3', 'o1', 'Legacy Addon', 1, 10, 10, NULL)",
    ).run();
    const sqlLog = [];
    const { app, env } = mount(sqlite, sqlLog);
    const res = await app.request(
      'http://localhost/api/reports/profit?start=2000-01-01&end=2100-01-01',
      { method: 'GET' },
      env,
    );
    const body = await res.json();
    const unassigned = body.byProject.find((r) => r.projectName === 'Unassigned');
    expect(unassigned).toBeDefined();
    expect(unassigned.revenue).toBe(10);
    const sum = body.byProject.reduce((a, r) => a + r.revenue, 0);
    expect(sum).toBe(260);
    expect(body.total.totalRevenue).toBe(sum);
  });

  it('returns 500 on DB error', async () => {
    const app = mountRouter(reportsRoutes, { tenantId: TENANT, basePath: '/api/reports' });
    const env = { DB: { prepare: () => { throw new Error('db'); } } };
    const res = await app.request('http://localhost/api/reports/profit', { method: 'GET' }, env);
    expect(res.status).toBe(500);
  });
});
