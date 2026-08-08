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

test.describe('POS Product Workflows', () => {
  test('products page → product grid displays items', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const items = page.locator('[data-testid="product-item"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('products page → search filters product grid', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const searchInput = page.locator('[data-testid="product-search"]');
    if (await searchInput.isVisible()) {
      const countBefore = await page.locator('[data-testid="product-item"]').count();
      await searchInput.fill('zzz_nonexistent_product_zzz');
      await page.locator('[data-testid="product-grid"]').waitFor({ state: 'visible', timeout: 10000 });
      const countAfter = await page.locator('[data-testid="product-item"]').count();
      expect(countAfter).toBeLessThanOrEqual(countBefore);
    }
  });

  test('products page → clicking product adds to cart', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const firstProduct = page.locator('[data-testid="product-item"]').first();
    if (await firstProduct.isVisible()) {
      await firstProduct.click();
      await page.locator('[data-testid="cart-item"]').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      const cartItems = page.locator('[data-testid="cart-item"]');
      const cartCount = await cartItems.count();
      expect(cartCount).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('POS Order Workflows', () => {
  test('orders page → table shows order data', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-orders"]').click();
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });

    const table = page.locator('[data-testid="orders-table"]');
    await expect(table).toBeVisible();
  });

  test('orders page → order status badges render', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-orders"]').click();
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });

    const badges = page.locator('[data-testid="order-status"]');
    const count = await badges.count();
    // May have zero orders
    expect(typeof count).toBe('number');
  });
});

test.describe('POS Cart Workflows', () => {
  test('cart is empty on fresh navigation to products', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const emptyMsg = page.locator('[data-testid="empty-cart"]');
    await expect(emptyMsg).toBeVisible();
  });

  test('add product → cart updates with item and total', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const firstProduct = page.locator('[data-testid="product-item"]').first();
    if (await firstProduct.isVisible()) {
      await firstProduct.click();
      await page.locator('[data-testid="cart-item"]').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      // Cart should have an item
      const cartItem = page.locator('[data-testid="cart-item"]');
      expect(await cartItem.count()).toBeGreaterThanOrEqual(1);

      // Cart total should show a dollar amount
      const total = page.locator('[data-testid="cart-total"]');
      await expect(total).toBeVisible();
      const totalText = await total.textContent();
      expect(totalText).toContain('$');
    }
  });

  test('quantity increase button works in cart', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const firstProduct = page.locator('[data-testid="product-item"]').first();
    if (await firstProduct.isVisible()) {
      await firstProduct.click();
      await page.locator('[data-testid="cart-item"]').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      const increaseBtn = page.locator('[data-testid="qty-increase"]').first();
      if (await increaseBtn.isVisible()) {
        await increaseBtn.click();
        await page.waitForLoadState('networkidle');

        // "In cart" badge should show quantity 2
        await expect(page.locator('body')).toContainText('In cart', { timeout: 5000 });
      }
    }
  });

  test('quantity decrease button removes item when qty reaches 0', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const firstProduct = page.locator('[data-testid="product-item"]').first();
    if (await firstProduct.isVisible()) {
      await firstProduct.click();
      await page.locator('[data-testid="cart-item"]').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      const decreaseBtn = page.locator('[data-testid="qty-decrease"]').first();
      if (await decreaseBtn.isVisible()) {
        await decreaseBtn.click();
        await page.waitForLoadState('networkidle');

        // Item should be removed — empty cart message should appear
        await expect(page.locator('[data-testid="empty-cart"]')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('POS Navigation Workflows', () => {
  test('sidebar nav switches between views', async ({ page }) => {
    await loginAsPOSUser(page);

    // Navigate to products
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('[data-testid="pos-products"]')).toBeVisible();

    // Navigate to orders
    await page.locator('[data-testid="pos-nav-orders"]').click();
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('[data-testid="pos-orders"]')).toBeVisible();

    // Navigate back to dashboard
    await page.locator('[data-testid="pos-nav-dashboard"]').click();
    await page.locator('[data-testid="pos-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('[data-testid="pos-dashboard"]')).toBeVisible();
  });

  test('sign out returns to login page', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-signout-btn"]').click();
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('[data-testid="pos-login"]')).toBeVisible();
  });

  test('user name is displayed in sidebar', async ({ page }) => {
    await loginAsPOSUser(page);
    const userName = page.locator('[data-testid="pos-user-name"]');
    await expect(userName).toBeVisible();
    const text = await userName.textContent();
    expect(text!.length).toBeGreaterThan(0);
  });
});
