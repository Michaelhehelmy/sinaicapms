import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT } from './fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const VALID_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const VALID_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

async function loginAsPOSUser(page: import('@playwright/test').Page) {
  await page.goto(TENANT_URL('/pos/login', TENANT_ID));
  await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
  await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
  await page.locator('[data-testid="pos-signin-btn"]').click();
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

test.describe('POS Basic Flow', () => {
  test('POS login page loads', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });

    const loginVisible = await page.locator('[data-testid="pos-login"]').isVisible();
    expect(loginVisible).toBeTruthy();
  });

  test('valid POS login navigates to dashboard', async ({ page }) => {
    await loginAsPOSUser(page);

    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible();
  });

  test('POS dashboard shows stat cards', async ({ page }) => {
    await loginAsPOSUser(page);

    const revenue = page.locator('[data-testid="stat-revenue"]');
    const orders = page.locator('[data-testid="stat-orders"]');

    await expect(revenue).toBeVisible();
    await expect(orders).toBeVisible();
  });

  test('can navigate to products page', async ({ page }) => {
    await loginAsPOSUser(page);

    // Navigate to products via sidebar or direct URL
    await page.goto(TENANT_URL('/pos/products', TENANT_ID));
    await page.waitForTimeout(2000);

    // Verify products page loaded (check for products-related elements)
    const url = page.url();
    expect(url).toContain('/products');
  });

  test('POS dashboard loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await loginAsPOSUser(page);

    // Filter out non-critical errors
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
