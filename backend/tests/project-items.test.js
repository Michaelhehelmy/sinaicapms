import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectItemsRoutes } from '../src/api/project-items.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 'tee1';
const SUPER_USER = { id: 'su1', role: 'super_admin' };

/** Build a DB mock with a row-store so joins/list reads behave realistically. */
const projectStore = {
  pa: { id: 'pa', tenant_id: TENANT, name: 'Alpha Camp', slug: 'alpha', project_type: 'camp', deleted_at: null },
  pb: { id: 'pb', tenant_id: TENANT, name: 'Beta Restaurant', slug: 'beta', project_type: 'restaurant', deleted_at: null },
  foreign: { id: 'pf', tenant_id: 'other', name: 'Foreign', slug: 'foreign', project_type: 'camp', deleted_at: null },
};

function mockDb({ items = [] } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        args: undefined,
        bind: vi.fn((...args) => (chain.args = args, chain)),
        all: vi.fn(),
        run: vi.fn(),
      };
      // Lookups run AFTER bind, so resolve lazily from the recorded args.
      chain.all.mockImplementation(async () => {
        if (sql.includes('FROM projects WHERE')) {
          const pid = chain.args?.[0];
          const p = Object.values(projectStore).find((x) => x.id === pid && x.deleted_at === null);
          return { results: p ? [p] : [] };
        }
        if (sql.includes('WHERE pi.id = ?')) {
          const iid = chain.args?.[0];
          const row = items.find((x) => x.id === iid);
          return { results: row ? [row] : [] };
        }
        if (sql.includes('WHERE id = ? AND tenant_id = ?')) {
          const iid = chain.args?.[0];
          const row = items.find((x) => x.id === iid && x.tenant_id === chain.args?.[1]);
          return { results: row ? [row] : [] };
        }
        if (sql.includes('FROM project_items pi')) {
          return { results: items };
        }
        return { results: [] };
      });
      // Mutations mutate the in-memory row-store so refetches reflect them.
      chain.run.mockImplementation(async () => {
        if (sql.includes('INSERT INTO project_items')) {
          const [id, tenant_id, project_id, item_type, name, description, base_price, quantity, meta_data, status] = chain.args;
          const p = Object.values(projectStore).find((x) => x.id === project_id);
          items.push({
            id, tenant_id, project_id, item_type, name, description,
            base_price, quantity, meta_data, status,
            created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00',
            p_id: p?.id ?? null, p_name: p?.name ?? null, p_slug: p?.slug ?? null, p_project_type: p?.project_type ?? null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE project_items')) {
          const item = items.find((x) => x.id === chain.args[chain.args.length - 2] && x.tenant_id === chain.args[chain.args.length - 1]);
          if (!item) return { success: true, meta: { changes: 0 } };
          const setClause = sql.split(' SET ')[1].split(' WHERE ')[0];
          let idx = 0;
          for (const set of setClause.split(', ')) {
            const col = set.split(' = ')[0].trim();
            if (col === 'updated_at') continue;
            item[col] = chain.args[idx];
            idx++;
          }
          item.updated_at = '2026-01-01 00:00:01';
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes('DELETE FROM project_items')) {
          const idx = items.findIndex((x) => x.id === chain.args[0] && x.tenant_id === chain.args[1]);
          if (idx === -1) return { success: true, meta: { changes: 0 } };
          items.splice(idx, 1);
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      });
      calls.push(chain);
      return chain;
    }),
  };
  return { db, calls };
}

/** A joined row matching the GET/refetch SELECT shape. */
function joinedItem(id, overrides = {}) {
  return {
    id,
    tenant_id: TENANT,
    item_type: 'product',
    name: 'Widget',
    description: null,
    base_price: 10,
    quantity: 3,
    meta_data: null,
    status: 'active',
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    p_id: projectStore.pa.id,
    p_name: projectStore.pa.name,
    p_slug: projectStore.pa.slug,
    p_project_type: projectStore.pa.project_type,
    ...overrides,
  };
}

describe('projectItemsRoutes', () => {
  let app;
  let env;

  const request = (method, url, body = null, user = SUPER_USER) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = {};
    app = mountRouter(projectItemsRoutes, { tenantId: TENANT, user: SUPER_USER, basePath: '/api/projects/items' });
  });

  // ─── GET / ──────────────────────────────────────────────────
  describe('GET /api/projects/items', () => {
    it('lists all items for the tenant with the joined project', async () => {
      const { db } = mockDb({
        items: [joinedItem('pi1', { item_type: 'vehicle', name: 'Truck', meta_data: '{"seats":4,"ac":true}', base_price: 250, quantity: 2 })],
      });
      env.DB = db;
      const res = await request('GET', '/api/projects/items');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].itemType).toBe('vehicle');
      expect(data[0].name).toBe('Truck');
      expect(data[0].basePrice).toBe(250);
      expect(data[0].quantity).toBe(2);
      expect(data[0].metaData).toBe('{"seats":4,"ac":true}');
      expect(data[0].project).toEqual({ id: 'pa', name: 'Alpha Camp', slug: 'alpha', projectType: 'camp' });
    });

    it('filters by projectId', async () => {
      const { db } = mockDb({
        items: [
          joinedItem('pi1'),
          joinedItem('pi2', { id: 'pi2', project_id: projectStore.pb.id, p_id: projectStore.pb.id, p_name: 'Beta Restaurant', p_slug: 'beta', p_project_type: 'restaurant' }),
        ],
      });
      env.DB = db;
      const res = await request('GET', '/api/projects/items?projectId=pa');
      await res.json();
      const select = db.calls.find((c) => c.sql.includes('FROM project_items pi'));
      expect(select.sql).toContain('AND pi.project_id = ?');
      expect(select.args).toEqual([TENANT, 'pa']);
      expect(res.status).toBe(200);
    });

    it('filters by itemType', async () => {
      const { db } = mockDb({ items: [joinedItem('pi1', { item_type: 'vehicle' })] });
      env.DB = db;
      const res = await request('GET', '/api/projects/items?itemType=vehicle');
      await res.json();
      const select = db.calls.find((c) => c.sql.includes('FROM project_items pi'));
      expect(select.sql).toContain('AND pi.item_type = ?');
      expect(select.args).toEqual([TENANT, 'vehicle']);
      expect(res.status).toBe(200);
    });

    it('returns 401 without a tenant context', async () => {
      app = mountRouter(projectItemsRoutes, { tenantId: null, user: SUPER_USER, basePath: '/api/projects/items' });
      env.DB = { prepare: vi.fn() };
      const res = await request('GET', '/api/projects/items');
      expect(res.status).toBe(401);
    });
  });

  // ─── POST / ─────────────────────────────────────────────────
  describe('POST /api/projects/items', () => {
    it('creates an item under a same-tenant project and returns it (201)', async () => {
      const { db } = mockDb();
      env.DB = db;
      const res = await request('POST', '/api/projects/items', { projectId: 'pa', itemType: 'vehicle', name: 'Truck' });
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.id).toMatch(/^pi_/);
      expect(data.itemType).toBe('vehicle');
      expect(data.name).toBe('Truck');
      expect(data.project.id).toBe('pa');
      const insert = db.calls.find((c) => c.sql.includes('INSERT INTO project_items'));
      expect(insert.args[0]).toMatch(/^pi_/);
      expect(insert.args[1]).toBe(TENANT);
      expect(insert.args[2]).toBe('pa');
    });

    it('defaults item_type to product and status to active', async () => {
      const { db } = mockDb();
      env.DB = db;
      const res = await request('POST', '/api/projects/items', { projectId: 'pa', name: 'Box' });
      expect(res.status).toBe(201);
      const insert = db.calls.find((c) => c.sql.includes('INSERT INTO project_items'));
      expect(insert.args[3]).toBe('product');
      expect(insert.args[6]).toBe(0);
      expect(insert.args[7]).toBe(1);
      expect(insert.args[9]).toBe('active');
    });

    it('stores metaData as JSON (round-trip)', async () => {
      const { db } = mockDb();
      env.DB = db;
      const res = await request('POST', '/api/projects/items', { projectId: 'pa', name: 'Truck', metaData: { seats: 4, ac: true } });
      expect(res.status).toBe(201);
      const insert = db.calls.find((c) => c.sql.includes('INSERT INTO project_items'));
      expect(JSON.parse(insert.args[8])).toEqual({ seats: 4, ac: true });
    });

    it('rejects an item for a project in a different tenant', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/items', { projectId: 'pf', name: 'Truck' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('your tenant');
    });

    it('returns 404 when the project does not exist', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/items', { projectId: 'missing', name: 'Truck' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for a missing name', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/items', { projectId: 'pa' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('name is required');
    });

    it('returns 401 for a write without a user', async () => {
      app = mountRouter(projectItemsRoutes, { tenantId: TENANT, user: null, basePath: '/api/projects/items' });
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/items', { projectId: 'pa', name: 'Truck' });
      expect(res.status).toBe(401);
    });
  });

  // ─── PUT /:id ───────────────────────────────────────────────
  describe('PUT /api/projects/items/:id', () => {
    it('updates mutable fields on an item in the tenant', async () => {
      const { db } = mockDb({ items: [joinedItem('pi1', { name: 'Widget', status: 'active' })] });
      env.DB = db;
      const res = await request('PUT', '/api/projects/items/pi1', {
        name: 'Widget Pro',
        status: 'inactive',
        itemType: 'product',
        metaData: { color: 'red' },
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.name).toBe('Widget Pro');
      const upd = db.calls.find((c) => c.sql.includes('UPDATE project_items'));
      expect(upd.sql).toContain('name = ?');
      expect(upd.sql).toContain('status = ?');
      expect(upd.sql).toContain('item_type = ?');
      expect(upd.args[0]).toBe('Widget Pro');
      expect(upd.args[1]).toBe('{"color":"red"}');
      expect(upd.args[2]).toBe('inactive');
      expect(upd.args[3]).toBe('product');
      expect(upd.args.slice(-2)).toEqual(['pi1', TENANT]);
    });

    it('rejects an invalid itemType', async () => {
      env.DB = mockDb().db;
      const res = await request('PUT', '/api/projects/items/pi1', { itemType: 'garbage' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for an empty body', async () => {
      env.DB = mockDb().db;
      const res = await request('PUT', '/api/projects/items/pi1', {});
      expect(res.status).toBe(400);
    });

    it('returns 404 when the item does not exist in the tenant', async () => {
      const { db } = mockDb();
      env.DB = db;
      const res = await request('PUT', '/api/projects/items/nope', { name: 'Nope' });
      expect(res.status).toBe(404);
    });

    it('returns 401 for a write without a user', async () => {
      app = mountRouter(projectItemsRoutes, { tenantId: TENANT, user: null, basePath: '/api/projects/items' });
      env.DB = mockDb().db;
      const res = await request('PUT', '/api/projects/items/pi1', { name: 'Nope' });
      expect(res.status).toBe(401);
    });
  });

  // ─── DELETE /:id ────────────────────────────────────────────
  describe('DELETE /api/projects/items/:id', () => {
    it('deletes an item belonging to the tenant', async () => {
      const { db } = mockDb({ items: [joinedItem('pi1')] });
      env.DB = db;
      const res = await request('DELETE', '/api/projects/items/pi1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      const del = db.calls.find((c) => c.sql.includes('DELETE FROM project_items'));
      expect(del.args).toEqual(['pi1', TENANT]);
    });

    it('returns 404 when the item is not found / not in the tenant', async () => {
      const { db } = mockDb();
      db.prepare.mockImplementationOnce((sql) => ({
        sql,
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
      }));
      env.DB = db;
      const res = await request('DELETE', '/api/projects/items/nope');
      expect(res.status).toBe(404);
    });

    it('returns 401 for a delete without a user', async () => {
      app = mountRouter(projectItemsRoutes, { tenantId: TENANT, user: null, basePath: '/api/projects/items' });
      env.DB = mockDb().db;
      const res = await request('DELETE', '/api/projects/items/pi1');
      expect(res.status).toBe(401);
    });
  });
});