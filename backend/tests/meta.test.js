import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantMetaRoutes, projectMetaRoutes, loadProjectMeta } from '../src/api/meta.js';
import { mountRouter } from './helpers/routerHarness.js';

const superAdmin = { id: 'adm1', role: 'super_admin', email: 'root@x.com' };
const tenantAdmin = { id: 'adm2', role: 'admin', email: 'a@b.com' };

/** DB where the tenant-existence check succeeds but every mutation returns `changes` rows. */
function makeDbWithChanges(changes) {
  return {
    batch: vi.fn(),
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bind: vi.fn((...args) => (chain.args = args, chain)),
        all: vi.fn().mockResolvedValue({ results: sql.includes('FROM tenants WHERE id') ? [{ id: 'tee1', tenant_id: 'tee1' }] : [] }),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes, last_row_id: 7 } }),
      };
      return chain;
    }),
  };
}

function mockDb(meta = {}) {
  const db = {
    batch: meta.batch || vi.fn().mockResolvedValue({}),
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bind: vi.fn((...args) => {
          chain.args = args;
          return chain;
        }),
        all: vi.fn(),
        run: vi.fn(),
      };
      // Default behaviors based on SQL intent
      if (sql.startsWith('SELECT')) {
        // Existence checks (tenant/project lookup) must return a row so the
        // entity resolves; meta list queries use meta.selectAll.
        const isExistence =
          sql.includes('FROM tenants WHERE id') || sql.includes('FROM projects WHERE id');
        chain.all.mockResolvedValue({ results: isExistence ? [{ id: 'x', tenant_id: 'tee1' }] : meta.selectAll || [] });
      } else {
        chain.run.mockResolvedValue({ success: true, meta: { changes: 1, last_row_id: 7 } });
      }
      return chain;
    }),
  };
  return db;
}

describe('tenantMetaRoutes', () => {
  let app;
  let env;

  const request = (method, url, body = null) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = { DB: null };
    app = mountRouter(tenantMetaRoutes, {
      basePath: '/api/tenants/:tenantId/meta',
      user: superAdmin,
    });
  });

  // ─── GET / ─────────────────────────────────────────────────
  it('lists tenant meta rows', async () => {
    env.DB = mockDb({ selectAll: [{ id: 1, meta_key: 'notes', meta_value: 'hello', sort_order: 0, tenant_id: 'tee1' }] });
    const res = await request('GET', '/api/tenants/tee1/meta');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].metaKey).toBe('notes');
  });

  // ─── POST / ────────────────────────────────────────────────
  it('creates a tenant meta row and returns its id', async () => {
    env.DB = mockDb();
    const res = await request('POST', '/api/tenants/tee1/meta', { meta_key: 'notes', meta_value: 'hi' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.id).toBe(7);
  });

  it('returns 400 for missing meta_key', async () => {
    env.DB = mockDb();
    const res = await request('POST', '/api/tenants/tee1/meta', { meta_value: 'hi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing meta_value', async () => {
    env.DB = mockDb();
    const res = await request('POST', '/api/tenants/tee1/meta', { meta_key: 'notes' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative sort_order', async () => {
    env.DB = mockDb();
    const res = await request('POST', '/api/tenants/tee1/meta', { meta_key: 'notes', meta_value: 'hi', sort_order: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error during create', async () => {
    env.DB = { prepare: vi.fn(() => ({ bind: () => ({ run: () => { throw new Error('x'); } }) })) };
    const res = await request('POST', '/api/tenants/tee1/meta', { meta_key: 'k', meta_value: 'v' });
    expect(res.status).toBe(400);
  });

  // ─── PUT /:id ──────────────────────────────────────────────
  it('updates meta value', async () => {
    env.DB = mockDb();
    const res = await request('PUT', '/api/tenants/tee1/meta/1', { meta_value: 'new' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 400 for non-numeric id', async () => {
    env.DB = mockDb();
    const res = await request('PUT', '/api/tenants/tee1/meta/abc', { meta_value: 'new' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when meta row not found', async () => {
    env.DB = makeDbWithChanges(0);
    const res = await request('PUT', '/api/tenants/tee1/meta/999', { meta_value: 'new' });
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB error during update', async () => {
    env.DB = { prepare: vi.fn(() => ({ bind: () => ({ run: () => { throw new Error('x'); } }) })) };
    const res = await request('PUT', '/api/tenants/tee1/meta/1', { meta_value: 'new' });
    expect(res.status).toBe(400);
  });

  // ─── DELETE /:id ───────────────────────────────────────────
  it('deletes meta row', async () => {
    env.DB = mockDb();
    const res = await request('DELETE', '/api/tenants/tee1/meta/1');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 404 when delete targets missing row', async () => {
    env.DB = makeDbWithChanges(0);
    const res = await request('DELETE', '/api/tenants/tee1/meta/1');
    expect(res.status).toBe(404);
  });

  // ─── PATCH /reorder ────────────────────────────────────────
  it('reorders meta items in a batch transaction', async () => {
    env.DB = mockDb({ batch: vi.fn().mockResolvedValue({}) });
    const res = await request('PATCH', '/api/tenants/tee1/meta/reorder', {
      items: [{ id: 1, sort_order: 3 }, { id: 2, sort_order: 1 }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.updated).toBe(2);
    expect(env.DB.batch).toHaveBeenCalled();
  });

  it('returns 400 for empty items', async () => {
    env.DB = mockDb({ batch: vi.fn() });
    const res = await request('PATCH', '/api/tenants/tee1/meta/reorder', { items: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing items', async () => {
    env.DB = mockDb({ batch: vi.fn() });
    const res = await request('PATCH', '/api/tenants/tee1/meta/reorder', {});
    expect(res.status).toBe(400);
  });

  // ─── GET /:key ─────────────────────────────────────────────
  it('lists rows for a single meta_key (multi-value)', async () => {
    env.DB = mockDb({ selectAll: [{ id: 1, meta_key: 'note', meta_value: 'a', sort_order: 0 }] });
    const res = await request('GET', '/api/tenants/tee1/meta/note');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].metaKey).toBe('note');
  });

  // ─── Access gates ──────────────────────────────────────────
  it('returns 401 when no scope user for a write', async () => {
    const appUnauth = mountRouter(tenantMetaRoutes, {
      basePath: '/api/tenants/:tenantId/meta',
      user: null,
      tenantId: null,
    });
    const res = await appUnauth.request('http://localhost/api/tenants/tee1/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_key: 'k', meta_value: 'v' }),
    }, { DB: mockDb() });
    expect(res.status).toBe(401);
  });

  it('returns 403 when non-super_admin scoped to another tenant', async () => {
    const appWrong = mountRouter(tenantMetaRoutes, {
      basePath: '/api/tenants/:tenantId/meta',
      user: tenantAdmin,
      tenantId: 'OTHER_TENANT',
    });
    const res = await appWrong.request('http://localhost/api/tenants/tee1/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_key: 'k', meta_value: 'v' }),
    }, { DB: mockDb() });
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenant does not exist (GET)', async () => {
    env.DB = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }), // tenant lookup empty
      })),
    };
    const res = await request('GET', '/api/tenants/WHO/meta');
    expect(res.status).toBe(404);
  });

  it('returns 405 for unsupported method', async () => {
    env.DB = mockDb();
    const res = await request('OPTIONS', '/api/tenants/tee1/meta/post');
    expect(res.status).toBe(405);
  });
});

describe('projectMetaRoutes', () => {
  let app;
  let env;
  const request = (method, url, body = null) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = { DB: null };
    app = mountRouter(projectMetaRoutes, {
      basePath: '/api/projects/:projectId/meta',
      user: superAdmin,
    });
  });

  it('lists project meta rows', async () => {
    env.DB = mockDb({
      selectAll: [{ id: 1, meta_key: 'activities', meta_value: 'trek', sort_order: 0, project_id: 'proj1', tenant_id: 'tee1' }],
    });
    const res = await request('GET', '/api/projects/proj1/meta');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data[0].metaKey).toBe('activities');
  });

  it('creates project meta row', async () => {
    env.DB = mockDb();
    const res = await request('POST', '/api/projects/proj1/meta', { meta_key: 'activities', meta_value: 'trek' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('loadProjectMeta', () => {
  it('folds meta rows into a key→value map', async () => {
    const DB = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: [
            { meta_key: 'notes', meta_value: 'a' },
            { meta_key: 'activities', meta_value: 'trek' },
            { meta_key: null, meta_value: 'skip' }, // should be skipped
          ],
        }),
      })),
    };
    const map = await loadProjectMeta(DB, 'proj1');
    expect(map).toEqual({ notes: 'a', activities: 'trek' });
    expect(map.skip).toBeUndefined();
  });
});
