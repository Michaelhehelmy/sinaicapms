import { describe, it, expect, vi, beforeEach } from 'vitest';
import marketplaceRoutes from '../src/api/marketplace.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 'tenant_1';

function mockDb(handlers = {}) {
  const db = {
    calls: [],
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
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

describe('marketplaceRoutes', () => {
  let app;
  let env;

  const get = (url) => app.request(`http://localhost${url}`, { method: 'GET' }, env);
  const post = (url, body) =>
    app.request(`http://localhost${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, env);

  beforeEach(() => {
    env = {};
    app = mountRouter(marketplaceRoutes, { basePath: '/api/marketplace' });
  });

  // ─── GET / ──────────────────────────────────────────────────
  describe('GET /api/marketplace', () => {
    it('returns marketplace listing with default pagination', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(function (...args) { this._args = args; return this; }),
          all: vi.fn(function () {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ count: 1 }] });
            return Promise.resolve({ results: [{ tenant_id: 't1', project_id: 'p1' }] });
          }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(12);
    });

    it('applies search filter', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(function (...args) { this._args = args; return this; }),
          all: vi.fn(function () {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ count: 0 }] });
            return Promise.resolve({ results: [] });
          }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace?search=acacia');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toEqual([]);
    });

    it('applies category filter', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(function (...args) { this._args = args; return this; }),
          all: vi.fn(function () {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ count: 0 }] });
            return Promise.resolve({ results: [] });
          }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace?category=cat_1');
      expect(res.status).toBe(200);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await get('/api/marketplace');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /categories ────────────────────────────────────────
  describe('GET /api/marketplace/categories', () => {
    it('returns categories with project counts', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{ id: 'c1', name: 'Camping', project_count: 5 }],
          }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace/categories');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Camping');
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await get('/api/marketplace/categories');
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /:tenantSlug ───────────────────────────────────────
  describe('GET /api/marketplace/:tenantSlug', () => {
    it('returns tenant profile with projects, reviews, categories', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          first: sql.includes('FROM tenants')
            ? vi.fn().mockResolvedValue({ id: 't1', name: 'Acacia', subdomain: 'acacia' })
            : undefined,
          all: vi.fn().mockResolvedValue({
            results: sql.includes('projects')
              ? [{ id: 'p1', name: 'Main Camp' }]
              : sql.includes('reviews')
              ? [{ id: 'r1', rating: 5 }]
              : [{ name: 'Camping' }],
          }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace/acacia');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.tenant.name).toBe('Acacia');
      expect(data.projects).toHaveLength(1);
    });

    it('returns 404 when tenant not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await get('/api/marketplace/acacia');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /reviews ──────────────────────────────────────────
  describe('POST /api/marketplace/reviews', () => {
    it('creates a review successfully', async () => {
      const db = {
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          first: sql.includes('FROM projects')
            ? vi.fn().mockResolvedValue({ id: 'p1', tenant_id: 't1' })
            : undefined,
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      };
      env.DB = db;
      const res = await post('/api/marketplace/reviews', {
        project_id: 'p1',
        reviewer_name: 'John',
        rating: 5,
        comment: 'Great camp!',
      });
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
    });

    it('returns 400 for invalid rating', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await post('/api/marketplace/reviews', {
        project_id: 'p1',
        rating: 10,
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing project_id', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await post('/api/marketplace/reviews', {
        rating: 5,
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 when project not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        })),
      };
      env.DB = db;
      const res = await post('/api/marketplace/reviews', {
        project_id: 'nonexistent',
        rating: 5,
      });
      expect(res.status).toBe(404);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await post('/api/marketplace/reviews', {
        project_id: 'p1',
        rating: 5,
      });
      expect(res.status).toBe(500);
    });
  });

  // ─── GET /reviews/:projectId ────────────────────────────────
  describe('GET /api/marketplace/reviews/:projectId', () => {
    it('returns reviews for a project', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{ id: 'r1', reviewer_name: 'John', rating: 5 }],
          }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace/reviews/p1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
    });

    it('returns empty array when no reviews', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await get('/api/marketplace/reviews/p1');
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await get('/api/marketplace/reviews/p1');
      expect(res.status).toBe(500);
    });
  });
});
