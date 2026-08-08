import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const VALID_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const VALID_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

async function loginAsPOSUser(page: import('@playwright/test').Page) {
  await page.goto(TENANT_URL('/pos/login', TENANT_ID));
  await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
  await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
  await page.locator('[data-testid="pos-signin-btn"]').click();
  // Wait for dashboard or shift overlay
  await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
    .waitFor({ state: 'visible', timeout: 10000 });
  // If shift overlay appeared, open a shift to access dashboard
  if (await page.locator('[data-testid="shift-overlay"]').isVisible()) {
    const cashInput = page.locator('[data-testid="shift-overlay"] input');
    if (await cashInput.first().isVisible()) {
      await cashInput.first().fill('100');
    }
    await page.locator('[data-testid="open-shift-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
  }
}

test.describe('POS Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPOSUser(page);
  });

  test('dashboard page loads with stat cards', async ({ page }) => {
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible();
  });

  test('revenue stat card is visible', async ({ page }) => {
    const revenue = page.locator('[data-testid="stat-revenue"]');
    await expect(revenue).toBeVisible();
    const text = await revenue.textContent();
    expect(text).toContain('$');
  });

  test('orders stat card is visible', async ({ page }) => {
    const orders = page.locator('[data-testid="stat-orders"]');
    await expect(orders).toBeVisible();
  });

  test('low stock stat card is visible', async ({ page }) => {
    const lowStock = page.locator('[data-testid="stat-low-stock"]');
    await expect(lowStock).toBeVisible();
  });

  test('recent orders section is visible', async ({ page }) => {
    const recentSection = page.locator('[data-testid="recent-orders"]');
    await expect(recentSection).toBeVisible();
  });

  test('dashboard has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto(TENANT_URL('/pos/dashboard', TENANT_ID));
    await page.locator('[data-testid="pos-dashboard"], [data-testid="pos-login"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('sidebar navigation is visible on dashboard', async ({ page }) => {
    const sidebar = page.locator('[data-testid="pos-sidebar"]');
    await expect(sidebar).toBeVisible();
  });
});
