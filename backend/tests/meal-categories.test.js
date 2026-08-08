import { describe, it, expect, vi } from 'vitest';
import { handleMealCategoriesRoute } from '../src/api/meal-categories.js';

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const tenantId = 'tenant_1';

describe('handleMealCategoriesRoute', () => {
  describe('GET /api/meal-categories', () => {
    it('returns all meal categories', async () => {
      const cats = [{ id: 'mcat_1', name: 'Breakfast' }];
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: cats }),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(makeReq('http://localhost/api/meal-categories'), { DB: db }, tenantId);
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
      const res = await handleMealCategoriesRoute(makeReq('http://localhost/api/meal-categories'), { DB: db }, tenantId);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to load meal categories');
    });
  });

  describe('GET /api/meal-categories/:id', () => {
    it('returns a specific meal category', async () => {
      const cat = { id: 'mcat_1', name: 'Lunch' };
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [cat] }),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1'), { DB: db }, tenantId
      );
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
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_999'), { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Meal category not found');
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1'), { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to load meal category');
    });
  });

  describe('POST /api/meal-categories', () => {
    it('creates a meal category', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories', 'POST', { name: 'Dinner', position: 2 }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^mcat_/);
    });

    it('returns 400 for missing name', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories', 'POST', { position: 1 }),
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
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories', 'POST', { name: 'Cat' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create meal category');
    });
  });

  describe('PUT /api/meal-categories/:id', () => {
    it('updates a meal category', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              return Promise.resolve({ results: [{ id: 'mcat_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1', 'PUT', { name: 'Updated', position: 5 }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_999', 'PUT', { name: 'X' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid input', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'mcat_1' }] }),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1', 'PUT', { position: 'not-a-number' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'mcat_1' }] }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1', 'PUT', { name: 'X' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update meal category');
    });
  });

  describe('DELETE /api/meal-categories/:id', () => {
    it('deletes a meal category', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              return Promise.resolve({ results: [{ id: 'mcat_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_999', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'mcat_1' }] }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories/mcat_1', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete meal category');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const db = { prepare: vi.fn() };
      const res = await handleMealCategoriesRoute(
        makeReq('http://localhost/api/meal-categories', 'PATCH'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
