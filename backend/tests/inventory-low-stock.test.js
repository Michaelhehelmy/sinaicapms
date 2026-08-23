import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import inventoryRoutes from '../src/api/inventory.js';
import { mountRouter } from './helpers/routerHarness.js';

// Thin D1-compatible wrapper over better-sqlite3 so the router runs against a
// real in-memory DB (real JOIN / NULLIF ratio sort / tenant isolation).
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

// Mirrors the real schema: pos_products (migration 0010 + 0042) and
// tenant_org_mapping (0041) — minus columns the endpoint ignores.
// `pos_categories` was dropped by migration 0057; the endpoint no longer joins it.
function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tenant_org_mapping (
      tenant_id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL
    );
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('t1', 1);
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('t2', 2);
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('t4', 3);

    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      stock_quantity INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 10,
      unit TEXT DEFAULT 'pcs',
      category_id INTEGER,
      is_active INTEGER DEFAULT 1,
      deleted_at DATETIME
    );

    -- org 1: three low/out items (p2 ratio 0, p1 0.5, p7 1.0) + above-threshold p3
    -- + inactive p4 + soft-deleted p5.
    INSERT INTO pos_products (id, organization_id, name, stock_quantity, min_stock_level, unit, category_id, is_active, deleted_at) VALUES
      ('p1', 1, 'Coffee', 5, 10, 'pcs', 1, 1, NULL),
      ('p2', 1, 'Milk', 0, 10, 'carton', 1, 1, NULL),
      ('p3', 1, 'Sugar', 20, 10, 'bag', 1, 1, NULL),
      ('p4', 1, 'Tea', 8, 10, 'pcs', 1, 0, NULL),
      ('p5', 1, 'Juice', 8, 10, 'carton', 1, 1, '2026-01-01 00:00:00'),
      ('p7', 1, 'Bread', 10, 10, 'loaf', 2, 1, NULL);
    -- org 2: one low item (must NOT leak to org 1 tenants).
    INSERT INTO pos_products (id, organization_id, name, stock_quantity, min_stock_level, unit, category_id, is_active, deleted_at) VALUES
      ('p6', 2, 'OtherCampProduct', 2, 10, 'pcs', NULL, 1, NULL);
  `);
  return db;
}

describe('GET /api/inventory/low-stock', () => {
  let env;

  const URL = 'https://x.com/api/inventory/low-stock';

  const request = (path = URL, method = 'GET', body = null) => {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    return app.request(path, opts, env);
  };

  let app;
  let appFor;

  beforeAll(() => {
    env = { DB: makeD1(createTestDb()) };
    // Default scope (t1); per-tenant variants built on demand.
    app = mountRouter(inventoryRoutes, { tenantId: 't1', basePath: '/api/inventory' });
    appFor = (tenantId) =>
      mountRouter(inventoryRoutes, { tenantId, basePath: '/api/inventory' });
  });

  it('returns low-stock items for the tenant org with camelCase keys and status', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(3);
    // Phase 3: `data` mirrors `items` (paginated-envelope convergence).
    expect(body.data).toEqual(body.items);
    // Sorted by stock/min ratio ascending: most critical first.
    expect(body.items.map((i) => i.id)).toEqual(['p2', 'p1', 'p7']);
    expect(body.items[0].status).toBe('out'); // stock 0
    expect(body.items[1].status).toBe('low');
    expect(body.items[2].status).toBe('low'); // stock == min (included)
    expect(Object.keys(body.items[0]).sort()).toEqual([
      'category', 'id', 'minStockLevel', 'name', 'status', 'stockQuantity', 'unit',
    ]);
    expect(body.items[1].category).toBeNull(); // category dropped with pos_categories (migration 0057)
    expect(body.items[1].minStockLevel).toBe(10);
    expect(body.items[1].stockQuantity).toBe(5);
    expect(body.items[1].unit).toBe('pcs');
  });

  it('excludes inactive and soft-deleted products', async () => {
    const res = await request();
    const body = await res.json();
    const ids = body.items.map((i) => i.id);
    expect(ids).not.toContain('p4'); // inactive
    expect(ids).not.toContain('p5'); // soft-deleted
    expect(ids).not.toContain('p3'); // above threshold
  });

  it('does not leak another org low products', async () => {
    const res = await appFor('t2').request(URL, {}, env);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items.map((i) => i.id)).toEqual(['p6']);
  });

  it('returns an empty page for a tenant with no mapping row', async () => {
    const res = await appFor('t3').request(URL, {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it('returns an empty page for an org with no low products', async () => {
    const res = await appFor('t4').request(URL, {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('paginates with page/pageSize and reports hasMore', async () => {
    const page1 = await request(`${URL}?page=1&pageSize=1`);
    const body1 = await page1.json();
    expect(body1.items).toHaveLength(1);
    expect(body1.items[0].id).toBe('p2');
    expect(body1.total).toBe(3);
    expect(body1.hasMore).toBe(true);

    const page2 = await request(`${URL}?page=2&pageSize=1`);
    const body2 = await page2.json();
    expect(body2.items[0].id).toBe('p1');
    expect(body2.hasMore).toBe(true);

    const page3 = await request(`${URL}?page=3&pageSize=1`);
    const body3 = await page3.json();
    expect(body3.items[0].id).toBe('p7');
    expect(body3.hasMore).toBe(false);
  });

  it('clamps an oversized pageSize to the max of 200', async () => {
    const res = await request(`${URL}?page=1&pageSize=9999`);
    const body = await res.json();
    expect(body.pageSize).toBe(200);
  });

  it('returns 405 for non-GET methods', async () => {
    const res = await request(URL, 'POST', {});
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 for an unknown inventory sub-path', async () => {
    const res = await request('https://x.com/api/inventory/foo');
    expect(res.status).toBe(404);
  });
});
