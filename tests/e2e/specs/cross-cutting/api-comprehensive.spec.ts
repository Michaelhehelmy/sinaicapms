import { test, expect } from '@playwright/test';
import { API_BASE, TEST_TENANT } from '../../fixtures/test-data';

test.describe('Meals API Endpoints', () => {
  test('GET /api/meals without auth returns 200 (public route)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/meals`);
    expect(response.status()).toBe(200);
  });

  test('GET /api/meals with invalid token returns 200 (public, ignores token)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/meals`, {
      headers: { Authorization: 'Bearer invalid-token-xyz' },
    });
    expect(response.status()).toBe(200);
  });

  test('GET /api/meal-categories without auth returns 200 (public route)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/meal-categories`);
    expect(response.status()).toBe(200);
  });
});

test.describe('Payments API Endpoints', () => {
  // create-checkout (byte-for-byte alias of create-intent) was retired in
  // Phase 0 of the Unified Architecture Plan — create-intent is canonical.
  test('POST /api/payments/create-checkout is retired and no longer creates intents', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/payments/create-checkout`, {
      data: { amount: 100, currency: 'usd' },
      headers: { 'x-tenant-id': TEST_TENANT.id },
    });
    expect([401, 404]).toContain(response.status());
  });

  test('POST /api/payments/create-intent without auth returns 401', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/payments/create-intent`, {
      data: { amount: 100, currency: 'usd' },
      headers: { 'x-tenant-id': TEST_TENANT.id },
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/payments/config without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/payments/config`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Reports API Endpoints', () => {
  test('GET /api/reports without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/reports`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/reports/occupancy without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/reports/occupancy`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/reports/revenue without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/reports/revenue`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Admin API Endpoints', () => {
  test('GET /api/admin/admins without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/admin/admins`);
    expect(response.status()).toBe(401);
  });

  test('PUT /api/admin/admins/:id without auth returns 401', async ({ request }) => {
    const response = await request.put(`${API_BASE}/api/admin/admins/1`, {
      data: { is_active: true },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Categories API Endpoints', () => {
  test('GET /api/categories without auth returns 200 (public route)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/categories`);
    expect(response.status()).toBe(200);
  });

  test('GET /api/product-categories without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/product-categories`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Leads API Endpoints', () => {
  test('POST /api/leads with valid data returns success', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/leads`, {
      data: {
        name: 'E2E Test Lead',
        email: 'e2e-lead@test.com',
        phone: '+20100998877',
        message: 'Test lead from E2E',
      },
    });
    const status = response.status();
    expect([200, 201]).toContain(status);
  });

  test('POST /api/leads with missing fields returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/leads`, {
      data: {},
    });
    const status = response.status();
    expect([400, 422]).toContain(status);
  });

  test('GET /api/leads without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/leads`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Contact API Endpoints', () => {
  test('POST /api/contact with valid data returns 201', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/contact`, {
      data: {
        name: 'E2E Contact Test',
        email: 'e2e-contact@test.com',
        message: 'Test message from E2E',
      },
    });
    const status = response.status();
    expect([200, 201]).toContain(status);
  });

  test('POST /api/contact with missing fields returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/contact`, {
      data: {},
    });
    const status = response.status();
    expect([400, 422]).toContain(status);
  });
});

test.describe('Settings API Endpoints', () => {
  test('GET /api/settings without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/settings`);
    expect(response.status()).toBe(401);
  });

  test('PUT /api/settings without auth returns 401', async ({ request }) => {
    const response = await request.put(`${API_BASE}/api/settings`, {
      data: { camp_name: 'Test' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Orders API Endpoints', () => {
  test('GET /api/orders without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/orders`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/orders/:id without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/orders/1`);
    expect(response.status()).toBe(401);
  });

  test('POST /api/orders with missing fields returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/orders`, {
      data: {},
    });
    const status = response.status();
    expect([400, 401, 422]).toContain(status);
  });
});

test.describe('Rooms API Endpoints', () => {
  test('GET /api/rooms without auth returns 200 (public route)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/rooms`);
    expect(response.status()).toBe(200);
  });

  test('GET /api/rooms/:id without auth returns 200 (public route)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/rooms/1`);
    const status = response.status();
    expect([200, 404]).toContain(status);
  });

  test('DELETE /api/rooms/:id without auth returns 401', async ({ request }) => {
    const response = await request.delete(`${API_BASE}/api/rooms/1`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Reservations API Endpoints', () => {
  test('GET /api/reservations without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/reservations`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/reservations/:id without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/reservations/1`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Plans API Endpoints', () => {
  test('GET /api/plans without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/plans`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Rate Plans API Endpoints', () => {
  test('GET /api/rate-plans without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/rate-plans`);
    expect(response.status()).toBe(401);
  });
});
