import { describe, it, expect, vi } from 'vitest';
import { handleCategoriesRoute } from '../src/api/categories.js';

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const tenantId = 'tenant_1';

describe('handleCategoriesRoute', () => {
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
      const res = await handleCategoriesRoute(makeReq('http://localhost/api/categories'), { DB: db }, tenantId);
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
      const res = await handleCategoriesRoute(makeReq('http://localhost/api/categories'), { DB: db }, tenantId);
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
      const res = await handleCategoriesRoute(makeReq('http://localhost/api/categories/cat_1'), { DB: db }, tenantId);
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
      const res = await handleCategoriesRoute(makeReq('http://localhost/api/categories/cat_999'), { DB: db }, tenantId);
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
      const res = await handleCategoriesRoute(makeReq('http://localhost/api/categories/cat_1'), { DB: db }, tenantId);
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories', 'POST', { name: 'New Category', description: 'Desc' }),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories', 'POST', { description: 'No name' }),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories', 'POST', { name: 'Cat' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create category');
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('updates a category', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              return Promise.resolve({ results: [{ id: 'cat_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_1', 'PUT', { name: 'Updated' }),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_999', 'PUT', { name: 'X' }),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_1', 'PUT', { name: 12345 }),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_1', 'PUT', { name: 'X' }),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_1', 'DELETE'),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_999', 'DELETE'),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_1', 'DELETE'),
        { DB: db }, tenantId
      );
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
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories/cat_1', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete category');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const db = { prepare: vi.fn() };
      const res = await handleCategoriesRoute(
        makeReq('http://localhost/api/categories', 'PATCH'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
