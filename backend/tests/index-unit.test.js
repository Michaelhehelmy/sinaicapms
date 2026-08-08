import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all route handlers to return simple responses, but keep the REAL
// module exports (zod schemas etc.) via importOriginal — registry.js
// (imported by src/index.js for the OpenAPI document) reads schemas from
// these modules, so fully replacing them would break the spec-definition
// layer. Each handler mock below overrides the real export with identical
// behavior to the previous full mocks.
vi.mock('../src/api/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleAuthRoute: vi.fn().mockResolvedValue(new Response('auth', { status: 200 })),
  verifyJWT: vi.fn(),
}));
vi.mock('../src/api/tenants.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleTenants: vi.fn().mockResolvedValue(new Response('tenants', { status: 200 })),
  handleMe: vi.fn().mockResolvedValue(new Response('me', { status: 200 })),
}));
vi.mock('../src/api/admin.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleAdminRoute: vi.fn().mockResolvedValue(new Response('admin', { status: 200 })),
}));
vi.mock('../src/api/camps.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCampsRoute: vi.fn().mockResolvedValue(new Response('camps', { status: 200 })),
  handleProductsRoute: vi.fn().mockResolvedValue(new Response('products', { status: 200 })),
  handleRoomsRoute: vi.fn().mockResolvedValue(new Response('rooms', { status: 200 })),
  handleRatePlansRoute: vi.fn().mockResolvedValue(new Response('rateplans', { status: 200 })),
}));
vi.mock('../src/api/orders.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleOrdersRoute: vi.fn().mockResolvedValue(new Response('orders', { status: 200 })),
  handleAvailability: vi.fn().mockResolvedValue(new Response('availability', { status: 200 })),
}));
vi.mock('../src/api/meals.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleMealsRoute: vi.fn().mockResolvedValue(new Response('meals', { status: 200 })),
}));
vi.mock('../src/api/meal-schedules.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleMealSchedulesRoute: vi.fn().mockResolvedValue(new Response('meal-schedules', { status: 200 })),
}));
vi.mock('../src/api/others.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handlePlansRoute: vi.fn().mockResolvedValue(new Response('plans', { status: 200 })),
}));
vi.mock('../src/api/categories.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCategoriesRoute: vi.fn().mockResolvedValue(new Response('categories', { status: 200 })),
}));
vi.mock('../src/api/meal-categories.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleMealCategoriesRoute: vi.fn().mockResolvedValue(new Response('meal-categories', { status: 200 })),
}));
vi.mock('../src/api/payments.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCreatePaymentIntent: vi.fn().mockResolvedValue(new Response('payment-intent', { status: 200 })),
  handleConfirmPayment: vi.fn().mockResolvedValue(new Response('payment-confirm', { status: 200 })),
  handleStripeWebhook: vi.fn().mockResolvedValue(new Response('webhook', { status: 200 })),
}));
vi.mock('../src/api/reports.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleReportsRoute: vi.fn().mockResolvedValue(new Response('reports', { status: 200 })),
}));
vi.mock('../src/api/inventory.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleInventoryRoute: vi.fn().mockResolvedValue(new Response('inventory', { status: 200 })),
}));
vi.mock('../src/api/leads.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleLeadsRoute: vi.fn().mockResolvedValue(new Response('leads', { status: 200 })),
}));
vi.mock('../src/api/upload.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleUploadRoute: vi.fn().mockResolvedValue(new Response('upload', { status: 200 })),
  handleMediaRoute: vi.fn().mockResolvedValue(new Response('media', { status: 200 })),
}));
vi.mock('../src/routes/pos/index.js', () => {
  const { Hono } = require('hono');
  const pos = new Hono();
  pos.get('/test', (c) => c.json({ pos: true }));
  pos.post('/auth/login', (c) => c.json({ login: true }));
  return { default: pos };
});
vi.mock('../src/middleware/tenant.js', () => ({
  getTenant: vi.fn().mockResolvedValue('tenant_1'),
}));
vi.mock('../src/middleware/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (c, next) => { await next(); }),
}));

import app from '../src/index.js';

const env = {
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({}),
    })),
  },
  JWT_SECRET: 'test-secret',
  ENVIRONMENT: 'test',
};

function makeRequest(method, path, body = null, headers = {}) {
  const url = `https://sinaicamps.com${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

describe('App entry (index.js)', () => {
  describe('GET /', () => {
    it('returns HTML page', async () => {
      const res = await app.fetch(makeRequest('GET', '/'), env);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('SinaiCamps API');
    });
  });

  describe('CORS', () => {
    it('allows requests with no origin (server-to-server)', async () => {
      const res = await app.fetch(makeRequest('GET', '/'), env);
      expect(res.status).toBe(200);
    });

    it('allows requests from exact match origins', async () => {
      const res = await app.fetch(
        makeRequest('GET', '/', null, { Origin: 'http://localhost:5173' }),
        env
      );
      expect(res.status).toBe(200);
    });

    it('rejects unrecognized origins', async () => {
      const res = await app.fetch(
        makeRequest('OPTIONS', '/api/camps', null, {
          Origin: 'https://evil.com',
          'Access-Control-Request-Method': 'GET',
        }),
        env
      );
      const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
      expect(allowOrigin).not.toBe('https://evil.com');
    });
  });

  describe('Root catch-all 404', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await app.fetch(makeRequest('GET', '/unknown-path'), env);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not found');
    });
  });

  describe('API catch-all dispatcher', () => {
    it('routes /api/me to handleMe (public)', async () => {
      const { handleMe } = await import('../src/api/tenants.js');
      const res = await app.fetch(makeRequest('GET', '/api/me?tenant_id=t1'), env);
      expect(handleMe).toHaveBeenCalled();
    });

    it('returns 401 for non-public API paths without auth', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/reports?tenant_id=t1'), env);
      expect(res.status).toBe(401);
    });

    it('returns 401 when tenant not found for protected routes', async () => {
      const { getTenant } = await import('../src/middleware/tenant.js');
      getTenant.mockResolvedValueOnce(null);
      const res = await app.fetch(makeRequest('GET', '/api/reports?tenant_id=unknown'), env);
      const body = await res.json();
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown API paths', async () => {
      const { verifyJWT } = await import('../src/api/auth.js');
      verifyJWT.mockResolvedValueOnce({ sub: 'admin1', userId: 'admin1', role: 'admin', tenantId: 'tenant_1' });
      const res = await app.fetch(makeRequest('GET', '/api/unknown-endpoint?tenant_id=t1', null, {
        Authorization: 'Bearer fake-token',
      }), {
        ...env,
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({}),
          })),
        },
      });
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error).toContain('API endpoint not found');
    });

    it('routes public GET /api/camps without auth', async () => {
      const { handleCampsRoute } = await import('../src/api/camps.js');
      const res = await app.fetch(makeRequest('GET', '/api/camps?tenant_id=t1'), env);
      expect(handleCampsRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/products without auth', async () => {
      const { handleProductsRoute } = await import('../src/api/camps.js');
      const res = await app.fetch(makeRequest('GET', '/api/products?tenant_id=t1'), env);
      expect(handleProductsRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/rooms without auth', async () => {
      const { handleRoomsRoute } = await import('../src/api/camps.js');
      const res = await app.fetch(makeRequest('GET', '/api/rooms?tenant_id=t1'), env);
      expect(handleRoomsRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/rateplans without auth', async () => {
      const { handleRatePlansRoute } = await import('../src/api/camps.js');
      const res = await app.fetch(makeRequest('GET', '/api/rateplans?tenant_id=t1'), env);
      expect(handleRatePlansRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/meals without auth', async () => {
      const { handleMealsRoute } = await import('../src/api/meals.js');
      const res = await app.fetch(makeRequest('GET', '/api/meals?tenant_id=t1'), env);
      expect(handleMealsRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/categories without auth', async () => {
      const { handleCategoriesRoute } = await import('../src/api/categories.js');
      const res = await app.fetch(makeRequest('GET', '/api/categories?tenant_id=t1'), env);
      expect(handleCategoriesRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/meal-categories without auth', async () => {
      const { handleMealCategoriesRoute } = await import('../src/api/meal-categories.js');
      const res = await app.fetch(makeRequest('GET', '/api/meal-categories?tenant_id=t1'), env);
      expect(handleMealCategoriesRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/availability without auth', async () => {
      const { handleAvailability } = await import('../src/api/orders.js');
      const res = await app.fetch(makeRequest('GET', '/api/availability?tenant_id=t1&checkIn=2026-08-01&checkOut=2026-08-05'), env);
      expect(handleAvailability).toHaveBeenCalled();
    });

    it('routes public POST /api/orders without auth', async () => {
      const { handleOrdersRoute } = await import('../src/api/orders.js');
      const res = await app.fetch(makeRequest('POST', '/api/orders?tenant_id=t1'), env);
      expect(handleOrdersRoute).toHaveBeenCalled();
    });

    it('routes public POST /api/leads without auth', async () => {
      const { handleLeadsRoute } = await import('../src/api/leads.js');
      const res = await app.fetch(makeRequest('POST', '/api/leads?tenant_id=t1'), env);
      expect(handleLeadsRoute).toHaveBeenCalled();
    });

    it('returns 401 for POST /api/upload without auth (tenant-admin only)', async () => {
      const res = await app.fetch(makeRequest('POST', '/api/upload?tenant_id=t1'), env);
      expect(res.status).toBe(401);
    });

    it('routes POST /api/upload to handleUploadRoute when authenticated', async () => {
      const { verifyJWT } = await import('../src/api/auth.js');
      const { handleUploadRoute } = await import('../src/api/upload.js');
      verifyJWT.mockResolvedValueOnce({ sub: 'admin1', userId: 'admin1', role: 'admin', tenantId: 'tenant_1' });
      const res = await app.fetch(makeRequest('POST', '/api/upload?tenant_id=t1', null, {
        Authorization: 'Bearer fake-token',
      }), {
        ...env,
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({}),
          })),
        },
      });
      expect(handleUploadRoute).toHaveBeenCalled();
    });

    it('routes public GET /api/media/* without auth', async () => {
      const { handleMediaRoute } = await import('../src/api/upload.js');
      const res = await app.fetch(makeRequest('GET', '/api/media/tenant_1/uuid-123.jpg'), env);
      expect(handleMediaRoute).toHaveBeenCalled();
    });

    it('routes /api/meals with GET to public handler', async () => {
      const { handleMealsRoute } = await import('../src/api/meals.js');
      handleMealsRoute.mockClear();
      const res = await app.fetch(makeRequest('GET', '/api/meals/meal_1?tenant_id=t1'), env);
      expect(handleMealsRoute).toHaveBeenCalled();
    });

    it('returns 401 for /api/inventory/low-stock without auth', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/inventory/low-stock?tenant_id=t1'), env);
      expect(res.status).toBe(401);
    });

    it('routes authenticated GET /api/inventory/low-stock to handleInventoryRoute', async () => {
      const { verifyJWT } = await import('../src/api/auth.js');
      const { handleInventoryRoute } = await import('../src/api/inventory.js');
      verifyJWT.mockResolvedValueOnce({ sub: 'admin1', userId: 'admin1', role: 'admin', tenantId: 'tenant_1' });
      const res = await app.fetch(makeRequest('GET', '/api/inventory/low-stock?tenant_id=t1', null, {
        Authorization: 'Bearer fake-token',
      }), {
        ...env,
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({}),
          })),
        },
      });
      expect(handleInventoryRoute).toHaveBeenCalled();
    });

    it('rejects POS sessions for /api/inventory/low-stock with 403', async () => {
      const { verifyJWT } = await import('../src/api/auth.js');
      verifyJWT.mockResolvedValueOnce({ sub: 'pos1', userId: 'pos1', role: 'cashier', posType: 'pos', tenantId: 'tenant_1' });
      const res = await app.fetch(makeRequest('GET', '/api/inventory/low-stock?tenant_id=t1', null, {
        Authorization: 'Bearer fake-token',
      }), {
        ...env,
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({}),
          })),
        },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Auth routes', () => {
    it('delegates /api/auth/* to handleAuthRoute', async () => {
      const { handleAuthRoute } = await import('../src/api/auth.js');
      handleAuthRoute.mockClear();
      handleAuthRoute.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const res = await app.fetch(makeRequest('POST', '/api/auth/login', { email: 'a@b.com', password: 'pass', tenantId: 't1' }), env);
      expect(handleAuthRoute).toHaveBeenCalled();
    });
  });

  describe('Admin routes', () => {
    it('delegates /api/admin/* to handleAdminRoute', async () => {
      const { handleAdminRoute } = await import('../src/api/admin.js');
      handleAdminRoute.mockClear();
      handleAdminRoute.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const res = await app.fetch(makeRequest('GET', '/api/admin/stats'), env);
      expect(handleAdminRoute).toHaveBeenCalled();
    });
  });

  describe('POS routes', () => {
    it('routes /api/pos/* to POS router', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/pos/test'), env);
      expect(res.status).toBe(200);
    });
  });

  describe('Tenant routes', () => {
    it('delegates GET /api/tenants to handleTenants', async () => {
      const { handleTenants } = await import('../src/api/tenants.js');
      handleTenants.mockClear();
      handleTenants.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
      const res = await app.fetch(makeRequest('GET', '/api/tenants'), env);
      expect(handleTenants).toHaveBeenCalled();
    });

    it('delegates POST /api/tenants to handleTenants', async () => {
      const { handleTenants } = await import('../src/api/tenants.js');
      handleTenants.mockClear();
      handleTenants.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const res = await app.fetch(makeRequest('POST', '/api/tenants'), env);
      expect(handleTenants).toHaveBeenCalled();
    });
  });

  describe('Meal Schedules routes', () => {
    it('returns 401 for unauthenticated /api/meal-schedules', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/meal-schedules?tenant_id=t1'), env);
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated /api/meal-schedules/sub', async () => {
      const res = await app.fetch(makeRequest('GET', '/api/meal-schedules/sub?tenant_id=t1'), env);
      expect(res.status).toBe(401);
    });
  });

  describe('Global error handler', () => {
    it('returns 500 on unhandled errors', async () => {
      const { getTenant } = await import('../src/middleware/tenant.js');
      getTenant.mockRejectedValueOnce(new Error('Unexpected'));
      const res = await app.fetch(makeRequest('GET', '/api/unknown?tenant_id=t1'), env);
      expect(res.status).toBe(500);
    });
  });
});
