import { describe, it, expect, vi, beforeEach } from 'vitest';
import mealsRoutes from '../src/api/meals.js';
import { mountRouter } from './helpers/routerHarness.js';

const tenantId = 'tenant_1';

describe('mealsRoutes', () => {
  let env;
  let app;

  const request = (method, url, body = null) => {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    return app.request(url, opts, env);
  };

  beforeEach(() => {
    app = mountRouter(mealsRoutes, { tenantId, basePath: '/api/meals' });
  });

  describe('GET /api/meals', () => {
    it('returns all meals', async () => {
      const meals = [{ id: 'meal_1', name: 'Breakfast' }];
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: meals }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/meals');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(meals);
    });
  });

  describe('GET /api/meals/:id', () => {
    it('returns a specific meal', async () => {
      const meal = { id: 'meal_1', name: 'Breakfast' };
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(meal),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/meals/meal_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(meal);
    });

    it('returns 404 when not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('GET', 'http://localhost/api/meals/meal_999');
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Meal not found');
    });
  });

  describe('POST /api/meals', () => {
    it('creates a meal', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meals', { name: 'Lunch', price: 25, description: 'Yummy' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^meal_/);
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
      const res = await request('POST', 'http://localhost/api/meals', { price: 25 });
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
      const res = await request('POST', 'http://localhost/api/meals', { name: 'Meal', price: 10 });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create meal');
    });
  });

  describe('PUT /api/meals/:id', () => {
    it('updates a meal with name', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              return Promise.resolve({ results: [{ id: 'meal_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { name: 'Updated Meal', price: 30 });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('updates without name (skips meal_lang upsert)', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'meal_1' }] }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { price: 50 });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when meal not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_999', { name: 'X' });
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid input', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'meal_1' }] }),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { price: -5 });
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'meal_1' }] }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { name: 'X' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update meal');
    });
  });

  describe('DELETE /api/meals/:id', () => {
    it('deletes a meal and cascades schedules + translations first', async () => {
      const sqls = [];
      const db = {
        prepare: vi.fn((sql) => {
          sqls.push(sql);
          return {
            bind: vi.fn(() => ({
              all: vi.fn().mockResolvedValue({ results: [{ id: 'meal_1' }] }),
              run: vi.fn().mockResolvedValue({}),
            })),
          };
        }),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/meals/meal_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // Phase 3 cascade: meal_schedules + meal_lang are removed before the meal row.
      expect(sqls.some((s) => s.includes('DELETE FROM meal_schedules WHERE meal_id'))).toBe(true);
      expect(sqls.some((s) => s.includes('DELETE FROM meal_lang WHERE meal_id'))).toBe(true);
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
      const res = await request('DELETE', 'http://localhost/api/meals/meal_999');
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'meal_1' }] }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = { DB: db };
      const res = await request('DELETE', 'http://localhost/api/meals/meal_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete meal');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      env = { DB: { prepare: vi.fn() } };
      const res = await request('PATCH', 'http://localhost/api/meals');
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
