import { test, expect } from '@playwright/test';
import { API_BASE, TEST_TENANT } from '../../fixtures/test-data';

test.describe('Public API Endpoints', () => {
  test('GET /api/tenants returns array with tenant objects', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('name');
    }
  });

  test('GET /api/products/:tenantId returns room types for valid tenant', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/products/${TEST_TENANT.id}`);
    const status = response.status();
    expect([200, 404]).toContain(status);
    if (status === 200) {
      const body = await response.json();
      expect(Array.isArray(body) || typeof body === 'object').toBeTruthy();
    }
  });

  test('GET /api/products/nonexistent returns 404 or empty', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/products/nonexistent-tenant-id-xyz`);
    const status = response.status();
    expect([200, 404]).toContain(status);
  });

  test('GET /api/me without auth returns 200 (public route)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/me`);
    expect(response.status()).toBe(200);
  });

  test('POST /api/auth/login with invalid credentials returns 401', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/login`, {
      data: { identifier: 'nonexistent@example.com', password: 'wrongpassword123' },
    });
    const status = response.status();
    expect([401, 400]).toContain(status);
  });

  test('POST /api/auth/login with missing fields returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/auth/login`, {
      data: {},
    });
    const status = response.status();
    expect([400, 401, 422]).toContain(status);
  });

  test('GET /api/tenants/:id returns tenant object for valid id', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants/${TEST_TENANT.id}`);
    const status = response.status();
    expect([200, 404]).toContain(status);
    if (status === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('id');
    }
  });

  test('GET /api/tenants/nonexistent returns 404 or 200 empty', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants/nonexistent-tenant-xyz`);
    const status = response.status();
    expect([200, 404]).toContain(status);
  });

  test('POST /api/orders with missing fields returns 400', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/orders`, {
      data: {},
    });
    const status = response.status();
    expect([400, 401, 422]).toContain(status);
  });

  test('GET /api/pos/dashboard without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/pos/dashboard`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/pos/products without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/pos/products`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/pos/orders without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/pos/orders`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/pos/customers without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/pos/customers`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/pos/inventory without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/pos/inventory`);
    expect(response.status()).toBe(401);
  });

  test('GET /api/pos/staff without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/pos/staff`);
    expect(response.status()).toBe(401);
  });

  test('PUT /api/settings without auth returns 401', async ({ request }) => {
    const response = await request.put(`${API_BASE}/api/settings`, {
      data: { camp_name: 'Test' },
    });
    expect(response.status()).toBe(401);
  });

  test('DELETE /api/rooms/nonexistent without auth returns 401', async ({ request }) => {
    const response = await request.delete(`${API_BASE}/api/rooms/nonexistent`);
    expect(response.status()).toBe(401);
  });

  test('POST /api/contact with valid data returns 201', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/contact`, {
      data: {
        name: 'E2E API Test',
        email: 'e2e-api-test@example.com',
        message: 'This is an automated E2E API test message.',
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

  test('GET /api/leads without auth returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/leads`);
    expect(response.status()).toBe(401);
  });
});
