import { describe, it, expect, vi } from 'vitest';
import { handleMealSchedulesRoute } from '../src/api/meal-schedules.js';

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const tenantId = 'tenant_1';

describe('handleMealSchedulesRoute', () => {
  describe('GET /api/meal-schedules', () => {
    it('returns all schedules for tenant', async () => {
      const schedules = [{ id: 'msch_1', date: '2026-08-01' }];
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: schedules }),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(makeReq('http://localhost/api/meal-schedules'), { DB: db }, tenantId);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(schedules);
    });

    it('filters by camp_id', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules?campId=camp_1'), { DB: db }, tenantId
      );
      expect(res.status).toBe(200);
    });

    it('filters by date_from and date_to', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules?dateFrom=2026-08-01&dateTo=2026-08-31'),
        { DB: db }, tenantId
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/meal-schedules', () => {
    it('creates a schedule', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockImplementation(() => {
              callIdx++;
              return Promise.resolve({ id: callIdx === 1 ? 'meal_1' : 'camp_1' });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'POST', {
          camp_id: 'camp_1', date: '2026-08-01', meal_id: 'meal_1'
        }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^msch_/);
    });

    it('returns 400 for missing fields', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'POST', { date: '2026-08-01' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid date format', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'POST', {
          camp_id: 'c1', date: 'not-a-date', meal_id: 'm1'
        }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('returns 404 when meal not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'POST', {
          camp_id: 'camp_1', date: '2026-08-01', meal_id: 'meal_999'
        }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Meal not found');
    });

    it('returns 404 when camp not found', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockImplementation(() => {
              callIdx++;
              // First call: meal check (found), second call: camp check (not found)
              if (callIdx === 1) return Promise.resolve({ id: 'meal_1' });
              return Promise.resolve(null);
            }),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'POST', {
          camp_id: 'camp_999', date: '2026-08-01', meal_id: 'meal_1'
        }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Camp not found');
    });

    it('handles DB errors', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockImplementation(() => {
              callIdx++;
              return Promise.resolve({ id: 'x' });
            }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'POST', {
          camp_id: 'c1', date: '2026-08-01', meal_id: 'm1'
        }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create meal schedule');
    });
  });

  describe('DELETE /api/meal-schedules/:id', () => {
    it('deletes a schedule', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue({ id: 'msch_1' }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules/msch_1', 'DELETE'),
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
            first: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules/msch_999', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Schedule not found');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const db = { prepare: vi.fn() };
      const res = await handleMealSchedulesRoute(
        makeReq('http://localhost/api/meal-schedules', 'PUT'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
