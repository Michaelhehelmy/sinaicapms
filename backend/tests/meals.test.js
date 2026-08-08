import { describe, it, expect, vi } from 'vitest';
import { handleMealsRoute } from '../src/api/meals.js';

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const tenantId = 'tenant_1';

describe('handleMealsRoute', () => {
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
      const res = await handleMealsRoute(makeReq('http://localhost/api/meals'), { DB: db }, tenantId);
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
      const res = await handleMealsRoute(makeReq('http://localhost/api/meals/meal_1'), { DB: db }, tenantId);
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
      const res = await handleMealsRoute(makeReq('http://localhost/api/meals/meal_999'), { DB: db }, tenantId);
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals', 'POST', { name: 'Lunch', price: 25, description: 'Yummy' }),
        { DB: db }, tenantId
      );
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals', 'POST', { price: 25 }),
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals', 'POST', { name: 'Meal', price: 10 }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create meal');
    });
  });

  describe('PUT /api/meals/:id', () => {
    it('updates a meal with name', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              return Promise.resolve({ results: [{ id: 'meal_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_1', 'PUT', { name: 'Updated Meal', price: 30 }),
        { DB: db }, tenantId
      );
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_1', 'PUT', { price: 50 }),
        { DB: db }, tenantId
      );
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_999', 'PUT', { name: 'X' }),
        { DB: db }, tenantId
      );
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_1', 'PUT', { price: -5 }),
        { DB: db }, tenantId
      );
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_1', 'PUT', { name: 'X' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update meal');
    });
  });

  describe('DELETE /api/meals/:id', () => {
    it('deletes a meal', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ id: 'meal_1' }] }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_1', 'DELETE'),
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_999', 'DELETE'),
        { DB: db }, tenantId
      );
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
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals/meal_1', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete meal');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const db = { prepare: vi.fn() };
      const res = await handleMealsRoute(
        makeReq('http://localhost/api/meals', 'PATCH'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
