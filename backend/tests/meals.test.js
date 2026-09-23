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
    // P2: project lookup (FROM projects) + optional category lookup
    // (FROM meal_categories) are answered inline; everything else runs.
    const p2Db = (runImpl = vi.fn().mockResolvedValue({})) => ({
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM projects')) {
          return { bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: tenantId }] }) })) };
        }
        return { bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [] }), run: runImpl })) };
      }),
    });

    it('creates a meal', async () => {
      const db = p2Db();
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meals', { name: 'Lunch', price: 25, description: 'Yummy', projectId: 'p1' });
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
      const res = await request('POST', 'http://localhost/api/meals', { price: 25, projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('returns 400 with structured errors for missing projectId', async () => {
      env = { DB: { prepare: vi.fn() } };
      const res = await request('POST', 'http://localhost/api/meals', { name: 'Lunch', price: 25 });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'projectId' })])
      );
    });

    it('handles DB errors', async () => {
      const db = p2Db(vi.fn().mockRejectedValue(new Error('DB fail')));
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meals', { name: 'Meal', price: 10, projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.error).toContain('Failed to create meal');
    });
  });

  describe('POST /api/meals/bulk', () => {
    it('creates multiple meals in a single batch', async () => {
      const sqls = [];
      const db = {
        prepare: vi.fn((sql) => {
          sqls.push(sql);
          // P2: project lookup resolves p1; no category rows for cat_1… but the
          // second item references cat_1, so answer it in-project.
          if (sql.includes('FROM projects')) {
            return { bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: tenantId }] }) })) };
          }
          if (sql.includes('FROM meal_categories')) {
            return { bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [{ id: 'cat_1', tenant_id: tenantId, project_id: 'p1' }] }) })) };
          }
          return { bind: vi.fn(() => ({})) };
        }),
        batch: vi.fn().mockResolvedValue([]),
      };
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meals/bulk', {
        items: [
          { name: 'Breakfast Set', price: 20, projectId: 'p1' },
          { name: 'Lunch Set', price: 30, mealCategoryId: 'cat_1', projectId: 'p1' },
        ],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);
      expect(data.ids).toHaveLength(2);
      expect(data.ids[0]).toMatch(/^meal_/);
      // 2 INSERT meals + 2 INSERT meal_lang statements, all in one batch.
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(sqls.filter((s) => s.includes('INSERT INTO meals'))).toHaveLength(2);
      expect(sqls.filter((s) => s.includes('INSERT INTO meal_lang'))).toHaveLength(2);
    });

    it('returns 400 when items is empty', async () => {
      env = { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch: vi.fn() } };
      const res = await request('POST', 'http://localhost/api/meals/bulk', { items: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid item (missing name)', async () => {
      env = { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })), batch: vi.fn() } };
      const res = await request('POST', 'http://localhost/api/meals/bulk', {
        items: [{ name: '', price: 10, projectId: 'p1' }],
      });
      expect(res.status).toBe(400);
    });

    it('handles DB errors during batch', async () => {
      const db = {
        prepare: vi.fn((sql) => {
          if (sql.includes('FROM projects')) {
            return { bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: tenantId }] }) })) };
          }
          return { bind: vi.fn(() => ({})) };
        }),
        batch: vi.fn().mockRejectedValue(new Error('DB fail')),
      };
      env = { DB: db };
      const res = await request('POST', 'http://localhost/api/meals/bulk', {
        items: [{ name: 'Set', price: 20, projectId: 'p1' }],
      });
      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.error).toContain('Failed to create meals in bulk');
    });
  });

  describe('PUT /api/meals/:id', () => {
    // P2: PUT requires projectId — ownership rows carry project_id 'p1'.
    const putDb = (ownershipRows = [{ id: 'meal_1', project_id: 'p1' }], runImpl = vi.fn().mockResolvedValue({})) => ({
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM projects')) {
          return { bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [{ id: 'p1', tenant_id: tenantId }] }) })) };
        }
        return {
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => Promise.resolve({ results: ownershipRows })),
            run: runImpl,
          })),
        };
      }),
    });

    it('updates a meal with name', async () => {
      const db = putDb();
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { name: 'Updated Meal', price: 30, projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('updates without name (skips meal_lang upsert)', async () => {
      const db = putDb();
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { price: 50, projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when meal not found', async () => {
      const db = putDb([]);
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_999', { name: 'X', projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid input', async () => {
      const db = putDb();
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { price: -5, projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors', async () => {
      const db = putDb([{ id: 'meal_1', project_id: 'p1' }], vi.fn().mockRejectedValue(new Error('DB fail')));
      env = { DB: db };
      const res = await request('PUT', 'http://localhost/api/meals/meal_1', { name: 'X', projectId: 'p1' });
      const data = await res.json();
      expect(res.status).toBe(500);
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
      expect(res.status).toBe(500);
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
