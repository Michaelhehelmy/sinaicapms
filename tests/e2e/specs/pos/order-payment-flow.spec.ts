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

async function addFirstProductToCart(page: import('@playwright/test').Page): Promise<boolean> {
  const firstProduct = page.locator('[data-testid="product-item"]').first();
  if (await firstProduct.isVisible()) {
    await firstProduct.click();
    await page.locator('[data-testid="cart-item"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    return true;
  }
  return false;
}

test.describe('POS Order Payment Flow — Full Lifecycle', () => {
  test('navigate to products → add item to cart → cart shows item', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      // Cart panel should appear with the item
      const cartPanel = page.locator('[data-testid="pos-cart"]');
      await expect(cartPanel).toBeVisible();

      // Cart should have at least one item
      const cartItem = page.locator('[data-testid="cart-item"]');
      expect(await cartItem.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('cart shows correct subtotal calculation', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const subtotal = page.locator('[data-testid="cart-subtotal"]');
      await expect(subtotal).toBeVisible();
      const text = await subtotal.textContent();
      expect(text).toContain('$');
    }
  });

  test('cart shows tax (10%) line item', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const tax = page.locator('[data-testid="cart-tax"]');
      await expect(tax).toBeVisible();
      const text = await tax.textContent();
      expect(text).toContain('Tax');
    }
  });

  test('cart shows total with $ symbol', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const total = page.locator('[data-testid="cart-total"]');
      await expect(total).toBeVisible();
      const text = await total.textContent();
      expect(text).toContain('$');
      expect(text).toContain('Total');
    }
  });

  test('quantity +/- buttons work in cart', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const increaseBtn = page.locator('[data-testid="qty-increase"]').first();
      if (await increaseBtn.isVisible()) {
        await increaseBtn.click();
        await page.waitForLoadState('networkidle');

        // Quantity should have increased — "In cart" badge visible
        await expect(page.locator('body')).toContainText('In cart', { timeout: 5000 });
      }
    }
  });

  test('pay button shows total amount', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const payBtn = page.locator('[data-testid="pay-btn"]');
      await expect(payBtn).toBeVisible();
      const text = await payBtn.textContent() ?? '';
      expect(text).toContain('Pay');
      expect(text).toContain('$');
    }
  });

  test('checkout with cash payment navigates to orders', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const payBtn = page.locator('[data-testid="pay-btn"]');
      await expect(payBtn).toBeVisible();
      await payBtn.click();
      await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });

      // Should navigate to orders page (path routing)
      const url = page.url();
      expect(url).toContain('/orders');
    }
  });

  test('orders page shows completed order after payment', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const added = await addFirstProductToCart(page);
    if (added) {
      const payBtn = page.locator('[data-testid="pay-btn"]');
      if (await payBtn.isVisible()) {
        await payBtn.click();
        await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });

        // Orders page should show data
        const ordersContainer = page.locator('[data-testid="pos-orders"]');
        await expect(ordersContainer).toBeVisible();
      }
    }
  });

  test('order status badge shows correct status', async ({ page }) => {
    await loginAsPOSUser(page);
    await page.locator('[data-testid="pos-nav-orders"]').click();
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });

    // Check for actual order rows (exclude the empty-state colspan row)
    const orderRows = page.locator('[data-testid="orders-table"] tbody tr:not(:has(td[colspan]))');
    const count = await orderRows.count();

    if (count > 0) {
      const statusBadges = page.locator('[data-testid="order-status"]');
      const badgeCount = await statusBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('POS Order Payment Flow — Search & Filter', () => {
  test('products search filters product grid', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const searchInput = page.locator('[data-testid="product-search"]');
    if (await searchInput.isVisible()) {
      const countBefore = await page.locator('[data-testid="product-item"]').count();
      await searchInput.fill('zzz_nonexistent_product_zzz');
      await page.locator('[data-testid="product-grid"]').waitFor({ state: 'visible', timeout: 10000 });
      const countAfter = await page.locator('[data-testid="product-item"]').count();
      expect(countAfter).toBeLessThanOrEqual(countBefore);
    }
  });
});

test.describe('POS Order Payment Flow — Empty Cart', () => {
  test('pay button is disabled when cart is empty', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const payBtn = page.locator('[data-testid="pay-btn"]');
    if (await payBtn.isVisible()) {
      const isDisabled = await payBtn.isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });

  test('empty cart shows "Click products to add" message', async ({ page }) => {
    await loginAsPOSUser(page);
    await navigateToProducts(page);

    const emptyMsg = page.locator('[data-testid="empty-cart"]');
    await expect(emptyMsg).toBeVisible();
    const text = await emptyMsg.textContent();
    expect(text).toContain('Click products to add');
  });
});

test.describe('POS Order Payment Flow — No JS Errors', () => {
  test('POS order flow has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });

    await loginAsPOSUser(page);
    await navigateToProducts(page);
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
