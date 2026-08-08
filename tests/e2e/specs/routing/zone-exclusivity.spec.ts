import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Zone exclusivity (marketplace vs tenant)', () => {
  test('marketplace zone forbids tenant-only routes with a branded 404', async ({ page }) => {
    for (const path of ['/rooms', '/book', '/menu', '/pos', '/pos/login', '/pos/sales']) {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${path} should be 404 on the marketplace zone`).toBe(404);
      await expect(page.locator('[data-testid="not-found-page"]'), `${path} branded 404`).toBeVisible();
    }
  });

  test('tenant zone forbids marketplace-only routes with a branded 404', async ({ page }) => {
    const paths = [
      '/camps',
      '/camp',
      `/camp/${TENANT_ID}`,
      `/camp/${TENANT_ID}/book`,
      `/camp/${TENANT_ID}/menu`,
    ];
    for (const path of paths) {
      const res = await page.goto(`${path}?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${path} should be 404 on the tenant zone`).toBe(404);
      await expect(page.locator('[data-testid="not-found-page"]'), `${path} branded 404`).toBeVisible();
    }
  });

  test('marketplace routes render on the marketplace zone', async ({ page }) => {
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="camps-grid"], [data-testid="search-input"]').first()).toBeVisible();

    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="hero-banner"]')).toBeVisible();
  });

  test('tenant routes render on the tenant zone', async ({ page }) => {
    await page.goto(`/rooms?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1:has-text("Accommodations"), [data-testid="rooms-section"]').first()).toBeVisible();

    await page.goto(`/book?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="reservation-page"]')).toBeVisible();

    await page.goto(`/menu?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="menu-page"]')).toBeVisible();
  });

  test('system routes are never zone-restricted', async ({ page }) => {
    // Marketplace zone
    const res = await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);

    // Tenant zone
    const tenantRes = await page.goto(`/admin?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    expect(tenantRes?.status()).toBe(200);
  });

  test('pos renders on the tenant zone', async ({ page }) => {
    const res = await page.goto(`/pos/login?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), '/pos/login should be 200 on the tenant zone').toBe(200);
    await expect(page.locator('[data-testid="pos-login-root"], #pos-login-root')).toBeVisible();
  });

  test('shared routes render in both zones', async ({ page }) => {
    for (const path of ['/', '/about', '/contact', '/faq', '/gallery']) {
      const mkt = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(mkt?.status(), `${path} marketplace`).toBe(200);
      expect(await page.locator('[data-testid="not-found-page"]').count(), `${path} marketplace not 404`).toBe(0);

      const tenant = await page.goto(`${path}?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      expect(tenant?.status(), `${path} tenant`).toBe(200);
      expect(await page.locator('[data-testid="not-found-page"]').count(), `${path} tenant not 404`).toBe(0);
    }
  });
});
