import { describe, it, expect, vi } from 'vitest';
import reportsRoutes from '../src/api/reports.js';
import { mountRouter } from './helpers/routerHarness.js';

// Drive the sub-router exactly as index.js mounts it in production.
const makeApp = () =>
  mountRouter(reportsRoutes, { tenantId: 'tenant_1', basePath: '/api/reports' });

describe('reportsRoutes', () => {
  describe('method not allowed', () => {
    it('returns 405 for non-GET methods', async () => {
      const db = { prepare: vi.fn() };
      const app = makeApp();
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        const res = await app.request('/api/reports/occupancy', { method }, { DB: db });
        await res.json();
        expect(res.status).toBe(405);
      }
    });
  });

  describe('GET /api/reports/occupancy', () => {
    it('returns occupancy stats', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [{ count: 10 }] });
              return Promise.resolve({ results: [{ count: 3 }] });
            }),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/occupancy', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.totalRooms).toBe(10);
      expect(data.occupiedRooms).toBe(3);
      expect(data.occupancyRate).toBe(30);
    });

    it('returns 0% occupancy when no rooms', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [{ count: 0 }] });
              return Promise.resolve({ results: [{ count: 0 }] });
            }),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/occupancy', {}, { DB: db });
      const data = await res.json();
      expect(data.totalRooms).toBe(0);
      expect(data.occupancyRate).toBe(0);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/occupancy', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to generate occupancy report');
    });
  });

  describe('GET /api/reports/revenue', () => {
    it('returns revenue report with default days', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) {
                return Promise.resolve({ results: [{ date: '2026-07-01', total: 500, count: 3 }] });
              }
              return Promise.resolve({ results: [{ total_revenue: 500, total_collected: 400, total_outstanding: 100, total_orders: 3 }] });
            }),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/revenue', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.summary.totalRevenue).toBe(500);
      expect(data.details).toHaveLength(1);
      expect(data.start).toBeTruthy();
      expect(data.end).toBeTruthy();
    });

    it('accepts custom start/end params', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [] });
              return Promise.resolve({ results: [{ total_revenue: 0, total_collected: 0, total_outstanding: 0, total_orders: 0 }] });
            }),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request(
        '/api/reports/revenue?start=2026-01-01&end=2026-06-30&days=7', {}, { DB: db }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.start).toBe('2026-01-01');
      expect(data.end).toBe('2026-06-30');
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/revenue', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to generate revenue report');
    });
  });

  describe('GET /api/reports/bookings', () => {
    it('returns bookings report', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) {
                return Promise.resolve({ results: [{ state: 'confirmed', count: 5 }] });
              }
              return Promise.resolve({ results: [{ camp_name: 'Sinai', count: 5, revenue: 2500 }] });
            }),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/bookings', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.byState).toHaveLength(1);
      expect(data.byCamp).toHaveLength(1);
    });

    it('accepts custom date params', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [] });
              return Promise.resolve({ results: [] });
            }),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request(
        '/api/reports/bookings?start=2026-07-01&end=2026-07-31&days=15', {}, { DB: db }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.start).toBe('2026-07-01');
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const app = makeApp();
      const res = await app.request('/api/reports/bookings', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to generate bookings report');
    });
  });

  describe('unknown report type', () => {
    it('returns 404 for unknown report type', async () => {
      const db = { prepare: vi.fn() };
      const app = makeApp();
      const res = await app.request('/api/reports/unknown', {}, { DB: db });
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Report type not found');
    });
  });
});
