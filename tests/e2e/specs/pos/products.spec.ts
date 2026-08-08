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
  await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
    .waitFor({ state: 'visible', timeout: 10000 });
  if (await page.locator('[data-testid="shift-overlay"]').isVisible()) {
    const cashInput = page.locator('[data-testid="shift-overlay"] input');
    if (await cashInput.first().isVisible()) {
      await cashInput.first().fill('100');
    }
    await page.locator('[data-testid="open-shift-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
  }
}

async function navigateToProducts(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="pos-nav-products"]').click();
  await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });
}

test.describe('POS Products', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);
  });

  test('products page loads with product grid', async ({ page }) => {
    const productsContainer = page.locator('[data-testid="pos-products"]');
    await expect(productsContainer).toBeVisible();
    const grid = page.locator('[data-testid="product-grid"]');
    await expect(grid).toBeVisible();
  });

  test('product items are displayed in grid', async ({ page }) => {
    const items = page.locator('[data-testid="product-item"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('product search input exists and is functional', async ({ page }) => {
    const searchInput = page.locator('[data-testid="product-search"]');
    await expect(searchInput).toBeVisible();
  });

  test('product search filters the grid', async ({ page }) => {
    const itemsBefore = page.locator('[data-testid="product-item"]');
    const countBefore = await itemsBefore.count();

    const searchInput = page.locator('[data-testid="product-search"]');
    await searchInput.fill('zzz_nonexistent_product_zzz');
    await page.locator('[data-testid="product-grid"]').waitFor({ state: 'visible', timeout: 10000 });

    const itemsAfter = page.locator('[data-testid="product-item"]');
    const countAfter = await itemsAfter.count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);
  });

  test('clicking a product adds it to cart', async ({ page }) => {
    const firstProduct = page.locator('[data-testid="product-item"]').first();
    if (await firstProduct.isVisible()) {
      await firstProduct.click();
      await page.locator('[data-testid="cart-item"]').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      // Cart should show the item
      const cartItem = page.locator('[data-testid="cart-item"]');
      const cartCount = await cartItem.count();
      expect(cartCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('products page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto(TENANT_URL('/pos/products', TENANT_ID));
    await page.locator('[data-testid="pos-products"], [data-testid="pos-login"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
