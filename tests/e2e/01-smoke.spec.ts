import { test, expect } from '@playwright/test';
import { API_BASE } from './fixtures/test-data';

test.describe('Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\//);

    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('API healthz endpoint returns 200', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/healthz`);
    expect(response.status()).toBe(200);
  });

  test('GET /api/tenants returns tenant data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);

    const firstTenant = body[0];
    expect(firstTenant).toHaveProperty('id');
    expect(firstTenant).toHaveProperty('name');
  });
});
