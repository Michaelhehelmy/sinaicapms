import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import mealPlanRoutes from '../src/api/meal-plans.js';
import { orderPostSchema } from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 'tenant_1';

function makeDb(handlers = {}) {
  const db = {
    calls: [],
    batch: vi.fn().mockResolvedValue([]),
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

function bindArgsOf(db, sub) {
  const chain = findBy(db, sub);
  return chain ? chain.bindArgs : undefined;
}

describe('Meal Plans (0070)', () => {
  describe('GET /api/projects/:id/meal-plans', () => {
    function makeApp(user = null) {
      return mountRouter(mealPlanRoutes, {
        tenantId: TENANT,
        user,
        basePath: '/api/projects',
      });
    }

    it('returns products when category is set', async () => {
      const db = makeDb({
        'SELECT tenant_id, meal_plan_category_id FROM projects': (ch) =>
          ch.first.mockResolvedValue({ tenant_id: TENANT, meal_plan_category_id: 5 }),
        'SELECT organization_id FROM tenant_org_mapping': (ch) =>
          ch.all.mockResolvedValue({ results: [{ organization_id: 3 }] }),
        'SELECT id, name, selling_price, description, image_url': (ch) =>
          ch.all.mockResolvedValue({
            results: [
              { id: 'pp_1', name: 'Full Board', selling_price: 45.0, description: '3 meals', image_url: null },
              { id: 'pp_2', name: 'Half Board', selling_price: 30.0, description: '2 meals', image_url: 'img.jpg' },
            ],
          }),
      });
      const app = makeApp();
      const res = await app.request('/api/projects/proj_1/meal-plans', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mealPlans).toHaveLength(2);
      expect(body.mealPlans[0].id).toBe('pp_1');
      expect(body.mealPlans[0].name).toBe('Full Board');
      expect(body.mealPlans[0].sellingPrice).toBe(45.0);
      expect(bindArgsOf(db, 'FROM projects')).toEqual(['proj_1']);
    });

    it('returns empty array when project has no meal_plan_category_id', async () => {
      const db = makeDb({
        'SELECT tenant_id, meal_plan_category_id FROM projects': (ch) =>
          ch.first.mockResolvedValue({ tenant_id: TENANT, meal_plan_category_id: null }),
      });
      const app = makeApp();
      const res = await app.request('/api/projects/proj_1/meal-plans', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mealPlans).toEqual([]);
      expect(findBy(db, 'FROM pos_products')).toBeUndefined();
    });

    it('returns empty array when project does not exist', async () => {
      const db = makeDb({
        'SELECT tenant_id, meal_plan_category_id FROM projects': (ch) =>
          ch.first.mockResolvedValue(null),
      });
      const app = makeApp();
      const res = await app.request('/api/projects/missing/meal-plans', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mealPlans).toEqual([]);
    });

    it('returns empty when tenant has no organization mapping', async () => {
      const db = makeDb({
        'SELECT tenant_id, meal_plan_category_id FROM projects': (ch) =>
          ch.first.mockResolvedValue({ tenant_id: TENANT, meal_plan_category_id: 5 }),
        'SELECT organization_id FROM tenant_org_mapping': (ch) =>
          ch.all.mockResolvedValue({ results: [] }),
      });
      const app = makeApp();
      const res = await app.request('/api/projects/proj_1/meal-plans', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mealPlans).toEqual([]);
    });

    it('returns 405 for non-GET methods', async () => {
      const app = makeApp();
      const res = await app.request('/api/projects/proj_1/meal-plans', { method: 'POST', body: '{}' }, {});
      expect(res.status).toBe(405);
    });
  });

  describe('orderPostSchema accepts meal_plans', () => {
    it('validates a payload with meal_plans', () => {
      const result = orderPostSchema.safeParse({
        camp_id: 'camp_1',
        room_id: 'room_1',
        check_in_date: '2026-09-01',
        check_out_date: '2026-09-05',
        meal_plans: [
          { product_id: 'pp_1', quantity: 2 },
          { product_id: 'pp_2', quantity: 1 },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.data.meal_plans).toHaveLength(2);
    });

    it('validates a payload without meal_plans (optional)', () => {
      const result = orderPostSchema.safeParse({
        camp_id: 'camp_1',
        room_id: 'room_1',
        check_in_date: '2026-09-01',
        check_out_date: '2026-09-05',
      });
      expect(result.success).toBe(true);
      expect(result.data.meal_plans).toBeUndefined();
    });

    it('rejects meal_plans with empty product_id', () => {
      const result = orderPostSchema.safeParse({
        camp_id: 'camp_1',
        room_id: 'room_1',
        check_in_date: '2026-09-01',
        check_out_date: '2026-09-05',
        meal_plans: [{ product_id: '', quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects meal_plans with zero quantity', () => {
      const result = orderPostSchema.safeParse({
        camp_id: 'camp_1',
        room_id: 'room_1',
        check_in_date: '2026-09-01',
        check_out_date: '2026-09-05',
        meal_plans: [{ product_id: 'pp_1', quantity: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects meal_plans with negative quantity', () => {
      const result = orderPostSchema.safeParse({
        camp_id: 'camp_1',
        room_id: 'room_1',
        check_in_date: '2026-09-01',
        check_out_date: '2026-09-05',
        meal_plans: [{ product_id: 'pp_1', quantity: -1 }],
      });
      expect(result.success).toBe(false);
    });
  });
});
