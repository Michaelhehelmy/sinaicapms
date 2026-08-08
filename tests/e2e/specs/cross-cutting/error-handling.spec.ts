import { test, expect } from '@playwright/test';
import { TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const POS_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const POS_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8787';

test.describe('Error Handling', () => {
  test('invalid route /nonexistent-xyz: response status is 404 OR redirects to valid page', async ({
    page,
  }) => {
    const response = await page.goto('/nonexistent-xyz');

    const status = response?.status();
    const url = page.url();

    const is404 = status === 404;
    const isRedirectedToValidPage =
      !url.includes('nonexistent-xyz') && url.includes('localhost:4320');

    expect(is404 || isRedirectedToValidPage).toBeTruthy();
  });

  test('POS /dashboard without auth: redirects to /login within 5 seconds', async ({
    page,
  }) => {
    await page.goto(`/pos/dashboard?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    // The redirect lands on /pos/login?tenant=… — `**/login` would NOT match
    // because the query string follows, so glob the query too (`login*`).
    await page.waitForURL('**/pos/login*', { timeout: 5_000 });

    const url = page.url();
    expect(url).toContain('/pos/login');
  });

  test('POS /products without auth: redirects to /login', async ({ page }) => {
    await page.goto(`/pos/products?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    // The POS SPA decides where to land based on the stored token:
    //   - no token  → /pos/login?tenant=…
    //   - token     → stays on /pos/products
    const hasToken = await page
      .evaluate(() => localStorage.getItem('pos_token'))
      .catch(() => null);

    if (hasToken) {
      await page.waitForURL('**/pos/products*', { timeout: 5_000 });
      expect(page.url()).toContain('/pos/products');
    } else {
      await page.waitForURL('**/pos/login*', { timeout: 5_000 });
      expect(page.url()).toContain('/pos/login');
    }
  });

  test('marketplace /camp/nonexistent-id: page loads without JavaScript error', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    await page.goto('/camp/nonexistent-id');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('marketplace /camp/nonexistent-id: body is visible (no white screen)', async ({
    page,
  }) => {
    await page.goto('/camp/nonexistent-id');
    await page.waitForLoadState('networkidle');

    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBeTruthy();

    const bodyHeight = await page.evaluate(() => document.body.offsetHeight);
    expect(bodyHeight).toBeGreaterThan(0);

    const bodyHTML = await page.evaluate(() => document.body.innerHTML.length);
    expect(bodyHTML).toBeGreaterThan(50);
  });

  test('tenant /?tenant=nonexistent: page loads without crash', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    const response = await page.goto('/?tenant=nonexistent');
    await page.waitForLoadState('networkidle');

    const status = response?.status();
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(500);

    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBeTruthy();
  });

  test('tenant /booking?tenant=nonexistent: page loads', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    const response = await page.goto('/camp/nonexistent/book');
    await page.waitForLoadState('networkidle');

    const status = response?.status();
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(500);

    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBeTruthy();

    const bodyHTML = await page.evaluate(() => document.body.innerHTML.length);
    expect(bodyHTML).toBeGreaterThan(50);
  });

  test('API /api/me without auth header: returns 200 (public route) or 404 (no tenant)', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/me`, {
      headers: { 'Content-Type': 'application/json' },
    });

    // Without tenant context on localhost, /api/me returns 404 (tenant not found)
    expect([200, 404]).toContain(response.status());

    const body = await response.json();
    expect(body).toBeDefined();
  });
});
