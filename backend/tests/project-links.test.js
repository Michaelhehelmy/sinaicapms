import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectLinksRoutes } from '../src/api/project-links.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 'tee1';
const SUPER_USER = { id: 'su1', role: 'super_admin' };

/** Build a DB mock with a row-store so joins/list reads behave realistically. */
const projectStore = {
  pa: { id: 'pa', tenant_id: TENANT, name: 'Alpha Camp', slug: 'alpha', project_type: 'camp', deleted_at: null },
  pb: { id: 'pb', tenant_id: TENANT, name: 'Beta Restaurant', slug: 'beta', project_type: 'restaurant', deleted_at: null },
  foreign: { id: 'pf', tenant_id: 'other', name: 'Foreign', slug: 'foreign', project_type: 'camp', deleted_at: null },
};

function mockDb({ links = [] } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        args: undefined,
        bind: vi.fn((...args) => (chain.args = args, chain)),
        all: vi.fn(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      // Lookups run AFTER bind, so resolve lazily from the recorded args.
      chain.all.mockImplementation(async () => {
        if (sql.includes('FROM projects WHERE')) {
          const pid = chain.args?.[0];
          const p = Object.values(projectStore).find((x) => x.id === pid && x.deleted_at === null);
          return { results: p ? [p] : [] };
        }
        if (sql.includes('FROM project_links pl')) {
          return { results: links };
        }
        return { results: [] };
      });
      calls.push(chain);
      return chain;
    }),
  };
  return { db, calls };
}

/** A joined row matching the GET/refetch SELECT shape. */
function joinedRow(id, a, b, linkType = 'connection', metaData = null) {
  return {
    id, tenant_id: TENANT, link_type: linkType, meta_data: metaData, created_at: '2026-01-01 00:00:00',
    a_id: a.id, a_name: a.name, a_slug: a.slug, a_project_type: a.project_type,
    b_id: b.id, b_name: b.name, b_slug: b.slug, b_project_type: b.project_type,
  };
}

describe('projectLinksRoutes', () => {
  let app;
  let env;

  const request = (method, url, body = null, user = SUPER_USER) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = {};
    app = mountRouter(projectLinksRoutes, { tenantId: TENANT, user: SUPER_USER, basePath: '/api/projects/links' });
  });

  // ─── GET / ──────────────────────────────────────────────────
  describe('GET /api/projects/links', () => {
    it('lists all links for the tenant', async () => {
      const { db } = mockDb({
        links: [joinedRow('pl1', projectStore.pa, projectStore.pb)],
      });
      env.DB = db;
      const res = await request('GET', '/api/projects/links');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].linkType).toBe('connection');
      expect(data[0].a).toEqual({ id: 'pa', name: 'Alpha Camp', slug: 'alpha', projectType: 'camp' });
      expect(data[0].b).toEqual({ id: 'pb', name: 'Beta Restaurant', slug: 'beta', projectType: 'restaurant' });
    });

    it('filters by projectId returning both directions (a or b)', async () => {
      const { db } = mockDb({
        links: [joinedRow('pl1', projectStore.pa, projectStore.pb)],
      });
      env.DB = db;
      const res = await request('GET', '/api/projects/links?projectId=pa');
      await res.json();
      const select = db.calls.find((c) => c.sql.includes('FROM project_links pl'));
      expect(select.sql).toContain('(pl.project_id_a = ? OR pl.project_id_b = ?)');
      expect(select.args).toEqual([TENANT, 'pa', 'pa']);
      expect(res.status).toBe(200);
    });

    it('returns 401 without a tenant context', async () => {
      app = mountRouter(projectLinksRoutes, { tenantId: null, user: SUPER_USER, basePath: '/api/projects/links' });
      env.DB = { prepare: vi.fn() };
      const res = await request('GET', '/api/projects/links');
      expect(res.status).toBe(401);
    });
  });

  // ─── POST / ─────────────────────────────────────────────────
  describe('POST /api/projects/links', () => {
    it('creates a same-tenant link and returns it (201)', async () => {
      const { db } = mockDb({ links: [joinedRow('pl_new', projectStore.pa, projectStore.pb, 'serves')] });
      env.DB = db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pb', linkType: 'serves' });
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.id).toMatch(/^pl_/);
      expect(data.linkType).toBe('serves');
      expect(data.a.id).toBe('pa');
      expect(data.b.id).toBe('pb');
      const insert = db.calls.find((c) => c.sql.includes('INSERT INTO project_links'));
      expect(insert.args[0]).toMatch(/^pl_/);
      expect(insert.args[1]).toBe(TENANT);
    });

    it('defaults link_type to connection', async () => {
      const { db } = mockDb({ links: [joinedRow('pl_new', projectStore.pa, projectStore.pb)] });
      env.DB = db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pb' });
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.linkType).toBe('connection');
      const insert = db.calls.find((c) => c.sql.includes('INSERT INTO project_links'));
      expect(insert.args[4]).toBe('connection');
    });

    it('stores metaData when provided', async () => {
      const { db } = mockDb({ links: [joinedRow('pl_new', projectStore.pa, projectStore.pb, 'connection', '{"role":"kitchen"}')] });
      env.DB = db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pb', metaData: { role: 'kitchen' } });
      expect(res.status).toBe(201);
      const insert = db.calls.find((c) => c.sql.includes('INSERT INTO project_links'));
      expect(insert.args[5]).toBe('{"role":"kitchen"}');
    });

    it('rejects a self-link (projectIdA === projectIdB)', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pa' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('itself');
    });

    it('rejects a cross-tenant link', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pf' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('your tenant');
    });

    it('returns 404 when a project does not exist', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'missing' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing projectIdA', async () => {
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/links', { projectIdB: 'pb' });
      expect(res.status).toBe(400);
    });

    it('returns 401 for unauthenticated write', async () => {
      app = mountRouter(projectLinksRoutes, { tenantId: TENANT, user: null, basePath: '/api/projects/links' });
      env.DB = mockDb().db;
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pb' });
      expect(res.status).toBe(401);
    });

    it('returns 400 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/projects/links', { projectIdA: 'pa', projectIdB: 'pb' });
      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE /:id ────────────────────────────────────────────
  describe('DELETE /api/projects/links/:id', () => {
    it('deletes a link belonging to the tenant', async () => {
      const { db } = mockDb();
      env.DB = db;
      const res = await request('DELETE', '/api/projects/links/pl1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      const del = db.calls.find((c) => c.sql.includes('DELETE FROM project_links'));
      expect(del.args).toEqual(['pl1', TENANT]);
    });

    it('returns 404 when link not found / not in tenant', async () => {
      const { db } = mockDb();
      db.prepare.mockImplementationOnce((sql) => ({
        sql,
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
      }));
      env.DB = db;
      const res = await request('DELETE', '/api/projects/links/nope');
      expect(res.status).toBe(404);
    });

    it('returns 401 for unauthenticated delete', async () => {
      app = mountRouter(projectLinksRoutes, { tenantId: TENANT, user: null, basePath: '/api/projects/links' });
      env.DB = mockDb().db;
      const res = await request('DELETE', '/api/projects/links/pl1');
      expect(res.status).toBe(401);
    });
  });
});
