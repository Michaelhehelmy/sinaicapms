import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tagsRoutes, projectTagsRoutes } from '../src/api/tags.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 't1';
const SUPER_USER = { id: 'su1', role: 'super_admin' };
const ADMIN_USER = { id: 'a1', role: 'admin', tenantId: TENANT };
const FOREIGN_USER = { id: 'f1', role: 'admin', tenantId: 'other_tenant' };

function mockDb(handlers = {}) {
  const db = {
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]),
    calls: [],
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bindArgs: undefined,
        bind: vi.fn((...args) => {
          chain.bindArgs = args;
          return chain;
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      for (const [sub, setup] of Object.entries(handlers)) {
        if (sql.includes(sub)) setup(chain, sql);
      }
      db.calls.push(chain);
      return chain;
    }),
  };
  return db;
}

function findBy(db, sub) {
  return db.calls.find((c) => c.sql.includes(sub));
}

describe('tagsRoutes', () => {
  let app;
  let env;

  const request = (method, url, body = null, user = SUPER_USER) => {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = {};
    app = mountRouter(tagsRoutes, { tenantId: TENANT, user: SUPER_USER, basePath: '/api/tags' });
  });

  // ─── GET / ──────────────────────────────────────────────────
  describe('GET /api/tags', () => {
    it('returns all tags for the tenant', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{ id: 'tag_1', name: 'Beach', slug: 'beach' }],
          }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/tags');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
    });

    it('returns 401 when no tenant', async () => {
      app = mountRouter(tagsRoutes, { tenantId: null, user: SUPER_USER, basePath: '/api/tags' });
      env.DB = { prepare: vi.fn() };
      const res = await app.request('http://localhost/api/tags', { method: 'GET' }, env);
      expect(res.status).toBe(401);
    });
  });

  // ─── POST / ─────────────────────────────────────────────────
  describe('POST /api/tags', () => {
    it('creates a tag with auto-generated slug', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/tags', { name: 'Beach Front' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('creates a tag with explicit slug', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/tags', { name: 'Beach', slug: 'my-beach' });
      expect(res.status).toBe(200);
    });

    it('returns validation error for empty name', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/tags', { name: '' });
      expect(res.status).toBe(400);
    });

    it('returns 409 when tag with slug already exists', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 'existing' }] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/tags', { name: 'Beach' });
      expect(res.status).toBe(409);
    });

    it('returns 400 for name without alphanumeric chars', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/tags', { name: '!!!' });
      expect(res.status).toBe(400);
    });

    it('returns 401 for unauthenticated write', async () => {
      app = mountRouter(tagsRoutes, { tenantId: TENANT, user: null, basePath: '/api/tags' });
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/tags', { name: 'Beach' });
      expect(res.status).toBe(401);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/tags', { name: 'Beach' });
      expect(res.status).toBe(400);
    });
  });

  // ─── PUT /:id ───────────────────────────────────────────────
  describe('PUT /api/tags/:id', () => {
    it('updates tag name (auto-generates slug)', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
      };
      env.DB = db;
      const res = await request('PUT', '/api/tags/tag_1', { name: 'Updated Beach' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('updates tag with explicit slug', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
      };
      env.DB = db;
      const res = await request('PUT', '/api/tags/tag_1', { slug: 'new-slug' });
      expect(res.status).toBe(200);
    });

    it('returns 409 on slug collision', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 'other' }] }),
        })),
      };
      env.DB = db;
      const res = await request('PUT', '/api/tags/tag_1', { slug: 'collision' });
      expect(res.status).toBe(409);
    });

    it('returns 404 when tag not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
        })),
      };
      env.DB = db;
      const res = await request('PUT', '/api/tags/nonexistent', { name: 'X' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid slug', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('PUT', '/api/tags/tag_1', { slug: '!!!' });
      expect(res.status).toBe(400);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('PUT', '/api/tags/tag_1', { name: 'X' });
      expect(res.status).toBe(400);
    });
  });

  // ─── DELETE /:id ────────────────────────────────────────────
  describe('DELETE /api/tags/:id', () => {
    it('deletes a tag', async () => {
      const db = mockDb();
      env.DB = db;
      const res = await request('DELETE', '/api/tags/tag_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when tag not found', async () => {
      const db = mockDb();
      db.batch.mockResolvedValue([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
      env.DB = db;
      const res = await request('DELETE', '/api/tags/tag_1');
      expect(res.status).toBe(404);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('DELETE', '/api/tags/tag_1');
      expect(res.status).toBe(400);
    });
  });
});

describe('projectTagsRoutes', () => {
  let app;
  let env;

  const request = (method, url, body = null, user = SUPER_USER) => {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = {};
    app = mountRouter(projectTagsRoutes, {
      tenantId: TENANT,
      user: SUPER_USER,
      basePath: '/api/projects/:projectId/tags',
    });
  });

  // ─── GET / ──────────────────────────────────────────────────
  describe('GET /api/projects/:projectId/tags', () => {
    it('returns tags for a project', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          all: sql.includes('projects WHERE')
            ? vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: TENANT }] })
            : vi.fn().mockResolvedValue({ results: [{ id: 'tag_1', name: 'Beach' }] }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/projects/p1/tags');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
    });

    it('returns 404 when project not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/projects/nonexistent/tags');
      expect(res.status).toBe(404);
    });
  });

  // ─── POST / ─────────────────────────────────────────────────
  describe('POST /api/projects/:projectId/tags', () => {
    it('attaches tags by tag_ids', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          all: sql.includes('projects WHERE')
            ? vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: TENANT }] })
            : vi.fn().mockResolvedValue({ results: [{ id: 'tag_1' }] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 2 } }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/projects/p1/tags', { tag_ids: ['tag_1'] });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('attaches tags by tag_names (find-or-create)', async () => {
      const db = {
        prepare: vi.fn((sql) => {
          const chain = {
            bind: vi.fn().mockReturnThis(),
            all: () => Promise.resolve({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
          };
          if (sql.includes('projects WHERE')) {
            chain.all = () => Promise.resolve({ results: [{ id: 'p1', tenant_id: TENANT }] });
          }
          if (sql.includes('SELECT id FROM tags WHERE tenant_id = ? AND slug')) {
            chain.all = () => Promise.resolve({ results: [] });
          }
          if (sql.includes('SELECT id FROM tags WHERE tenant_id = ? AND id IN')) {
            chain.all = () => Promise.resolve({ results: [{ id: 'tag_new' }] });
          }
          return chain;
        }),
        batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
      };
      env.DB = db;
      const res = await request('POST', '/api/projects/p1/tags', { tag_names: ['New Tag'] });
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid body (no tag_ids or tag_names)', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          all: sql.includes('projects WHERE')
            ? vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: TENANT }] })
            : vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/projects/p1/tags', {});
      expect(res.status).toBe(400);
    });

    it('returns 400 when no valid tags provided', async () => {
      const db = {
        prepare: vi.fn((sql) => {
          const chain = {
            bind: vi.fn().mockReturnThis(),
            all: () => Promise.resolve({ results: [] }),
          };
          if (sql.includes('projects WHERE')) {
            chain.all = () => Promise.resolve({ results: [{ id: 'p1', tenant_id: TENANT }] });
          }
          return chain;
        }),
      };
      env.DB = db;
      const res = await request('POST', '/api/projects/p1/tags', { tag_ids: ['foreign_tag'] });
      expect(res.status).toBe(400);
    });

    it('returns 404 when project not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/projects/p1/tags', { tag_ids: ['tag_1'] });
      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /:tagId ─────────────────────────────────────────
  describe('DELETE /api/projects/:projectId/tags/:tagId', () => {
    it('removes a tag from a project', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          all: sql.includes('projects WHERE')
            ? vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: TENANT }] })
            : vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
      };
      env.DB = db;
      const res = await request('DELETE', '/api/projects/p1/tags/tag_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when tag not attached', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          all: sql.includes('projects WHERE')
            ? vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: TENANT }] })
            : vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
        })),
      };
      env.DB = db;
      const res = await request('DELETE', '/api/projects/p1/tags/tag_1');
      expect(res.status).toBe(404);
    });

    it('returns 404 when project not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('DELETE', '/api/projects/p1/tags/tag_1');
      expect(res.status).toBe(404);
    });
  });
});
