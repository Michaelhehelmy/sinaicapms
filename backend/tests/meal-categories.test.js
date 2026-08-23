import { describe, it, expect, vi, beforeEach } from 'vitest';
import mealCategoriesRoutes from '../src/api/meal-categories.js';
import { mountRouter } from './helpers/routerHarness.js';

const tenantId = 'tenant_1';

describe('mealCategoriesRoutes', () => {
  let env;
  let app;

  const request = (method, url, body = null) => {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    return app.request(url, opts, env);
  };

  beforeEach(() => {
    app = mountRouter(mealCategoriesRoutes, { tenantId, basePath: '/api/meal-categories' });
  });

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
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/meal-categories');
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
      const res = await request('GET', 'http://localhost/api/meal-categories');
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
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/meal-categories/mcat_1');
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
      const res = await request('GET', 'http://localhost/api/meal-categories/mcat_999');
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
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/meal-categories/mcat_1');
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
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meal-categories', { name: 'Dinner', position: 2 });
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
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meal-categories', { position: 1 });
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
      const res = await request('POST', 'http://localhost/api/meal-categories', { name: 'Cat' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create meal category');
    });
  });

  describe('PUT /api/meal-categories/:id', () => {
    it('updates a meal category', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              return Promise.resolve({ results: [{ id: 'mcat_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meal-categories/mcat_1', { name: 'Updated', position: 5 });
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
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meal-categories/mcat_999', { name: 'X' });
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
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meal-categories/mcat_1', { position: 'not-a-number' });
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
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meal-categories/mcat_1', { name: 'X' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update meal category');
    });
  });

  describe('DELETE /api/meal-categories/:id', () => {
    it('deletes a meal category', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              return Promise.resolve({ results: [{ id: 'mcat_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/meal-categories/mcat_1');
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
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/meal-categories/mcat_999');
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
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/meal-categories/mcat_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete meal category');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      env = { DB: { prepare: vi.fn() } };
      const res = await request('PATCH', 'http://localhost/api/meal-categories');
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
