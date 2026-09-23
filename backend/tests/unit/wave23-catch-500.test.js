/**
 * Wave 2.3 — explicit-500 regression tests for the 8 errorResponse catch traps.
 *
 * Previously these catch blocks relied on errorResponse()'s default status
 * (500) while the audit listed them as possibly returning 200 with
 * success:false. Each block now passes an explicit `, 500`.
 *
 * Routes covered:
 *   - orders.js:379        GET /api/orders/status?ref=&email=   ('Failed to fetch order status')
 *   - inbox.js:137         GET /api/inbox                       ('Failed to fetch inbox')
 *   - categories.js:48     GET /api/categories                  ('Failed to load categories')
 *   - admin-settings.js:136 GET /api/admin/settings             ('Failed to load settings')
 *   - admin-settings.js:211 PUT /api/admin/settings             ('Failed to update settings')
 *   - admin-settings.js:241 GET /api/admin/settings/feature-flags ('Failed to load feature flags')
 *   - admin-settings.js:269 PUT /api/admin/settings/feature-flags/:id ('Failed to toggle feature flag')
 *   - admin-hr.js:43       GET /api/admin/hr/overview           ('Failed to load HR overview')
 *   - admin-hr.js:75       GET /api/admin/hr/employees          ('Failed to load employees')
 */
import { describe, it, expect, vi } from 'vitest';
import ordersRoutes from '../../src/api/orders.js';
import inboxRoutes from '../../src/api/inbox.js';
import categoriesRoutes from '../../src/api/categories.js';
import adminSettingsRoutes from '../../src/api/admin-settings.js';
import adminHrRoutes from '../../src/api/admin-hr.js';
import { mountRouter } from '../helpers/routerHarness.js';

// The admin-settings gate is instantiated at module load from requireAuth();
// mock it so every request passes auth and DB failure drives the 500 paths.
vi.mock('../../src/middleware/requireAuth.js', () => ({
  requireAuth: () => async () => ({ user: { userId: 'super-admin-1', sub: 'super-admin-1', role: 'super_admin' } }),
}));

/** A DB whose every call rejects — every route below hits its catch block. */
const failingDb = () => {
  const reject = vi.fn(async () => { throw new Error('DB boom'); });
  return {
    prepare: vi.fn(() => ({ bind: vi.fn(() => ({ all: reject, first: reject, run: reject })) })),
  };
};

/** Assert a request yields HTTP 500 (never 200) with the given error text. */
async function expect500(app, method, url, env, body = null) {
  const res = await app.request(url, { method, body: body ? JSON.stringify(body) : undefined }, env);
  expect(res.status).toBe(500);
  const data = await res.json();
  expect(data.success).toBe(false);
  return data;
}

describe('Wave 2.3 — errorResponse catch traps return explicit 500', () => {
  it('orders GET /status returns 500 (not 200) when the DB read rejects', async () => {
    const app = mountRouter(ordersRoutes, { tenantId: 't1', basePath: '/api/orders' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/orders/status/ORD-X?email=a%40b.co', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to fetch order status');
  });

  it('inbox GET / returns 500 (not 200) when the DB read rejects', async () => {
    const app = mountRouter(inboxRoutes, { tenantId: 't1', basePath: '/api/inbox' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/inbox?kind=all&page=1&pageSize=20', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to fetch inbox');
  });

  it('categories GET / returns 500 (not 200) when the DB read rejects', async () => {
    const app = mountRouter(categoriesRoutes, { tenantId: 't1', basePath: '/api/categories' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/categories', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to load categories');
  });

  it('admin-settings GET / returns 500 (not 200) when the settings read rejects', async () => {
    const app = mountRouter(adminSettingsRoutes, { tenantId: null, basePath: '/api/admin/settings' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/admin/settings', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to load settings');
  });

  it('admin-settings PUT / returns 500 (not 200) when the settings write rejects', async () => {
    const app = mountRouter(adminSettingsRoutes, { tenantId: null, basePath: '/api/admin/settings' });
    const data = await expect500(
      app, 'PUT', 'http://localhost/api/admin/settings', { DB: failingDb() }, { defaults: { taxRate: 14 } }
    );
    expect(data.error).toContain('Failed to update settings');
  });

  it('admin-settings GET /feature-flags returns 500 when the read rejects', async () => {
    const app = mountRouter(adminSettingsRoutes, { tenantId: null, basePath: '/api/admin/settings' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/admin/settings/feature-flags', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to load feature flags');
  });

  it('admin-settings PUT /feature-flags/:id returns 500 when the write rejects', async () => {
    const app = mountRouter(adminSettingsRoutes, { tenantId: null, basePath: '/api/admin/settings' });
    const data = await expect500(
      app, 'PUT', 'http://localhost/api/admin/settings/feature-flags/financials', { DB: failingDb() }, { enabled: true }
    );
    expect(data.error).toContain('Failed to toggle feature flag');
  });

  it('admin-hr GET /overview returns 500 (not 200) when the read rejects', async () => {
    const app = mountRouter(adminHrRoutes, { tenantId: 't1', basePath: '/api/admin/hr' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/admin/hr/overview', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to load HR overview');
  });

  it('admin-hr GET /employees returns 500 (not 200) when the read rejects', async () => {
    const app = mountRouter(adminHrRoutes, { tenantId: 't1', basePath: '/api/admin/hr' });
    const data = await expect500(
      app, 'GET', 'http://localhost/api/admin/hr/employees', { DB: failingDb() }
    );
    expect(data.error).toContain('Failed to load employees');
  });
});