import { describe, it, expect, vi, beforeEach } from 'vitest';
import categoriesRoutes from '../src/api/categories.js';
import { mountRouter } from './helpers/routerHarness.js';

const tenantId = 'tenant_1';

describe('categoriesRoutes', () => {
  let env;
  let app;

  const request = (method, url, body = null) => {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    return app.request(url, opts, env);
  };

  beforeEach(() => {
    app = mountRouter(categoriesRoutes, { tenantId, basePath: '/api/categories' });
  });

  describe('GET /api/categories', () => {
    it('returns all categories for tenant', async () => {
      const cats = [{ id: 'cat_1', name: 'Rooms' }];
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: cats }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/categories');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(cats);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/categories');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to load categories');
    });
  });

  describe('GET /api/categories/:id', () => {
    it('returns a specific category', async () => {
      const cat = { id: 'cat_1', name: 'Rooms' };
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [cat] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/categories/cat_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(cat);
    });

    it('returns 404 when not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/categories/cat_999');
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Category not found');
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/categories/cat_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to load category');
    });
  });

  describe('POST /api/categories', () => {
    it('creates a category', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/categories', { name: 'New Category', description: 'Desc' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^cat_/);
    });

    it('returns 400 for missing name', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/categories', { description: 'No name' });
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/categories', { name: 'Cat' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create category');
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('updates a category', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              return Promise.resolve({ results: [{ id: 'cat_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/categories/cat_1', { name: 'Updated' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when category not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/categories/cat_999', { name: 'X' });
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid input', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'cat_1' }] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/categories/cat_1', { name: 12345 });
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => Promise.resolve({ results: [{ id: 'cat_1' }] })),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/categories/cat_1', { name: 'X' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update category');
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('deletes a category', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              // ownership check returns found, products check returns empty
              return Promise.resolve({ results: callIdx === 1 ? [{ id: 'cat_1' }] : [] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/categories/cat_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when category not found or is global', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/categories/cat_999');
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Category not found or is global');
    });

    it('returns 400 when category has linked products', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [{ id: 'cat_1' }] }); // ownership
              return Promise.resolve({ results: [{ id: 'prod_1' }] }); // has products
            }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/categories/cat_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Cannot delete category with linked products');
    });

    it('handles DB errors', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx <= 2) return Promise.resolve({ results: callIdx === 1 ? [{ id: 'cat_1' }] : [] });
              return Promise.resolve({ results: [] });
            }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/categories/cat_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete category');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      env = { DB: { prepare: vi.fn() } };
      const res = await request('PATCH', 'http://localhost/api/categories');
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
