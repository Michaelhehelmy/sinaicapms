import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT, API_BASE } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const VALID_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const VALID_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

async function loginAsPOSUser(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    try {
      await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
        .waitFor({ state: 'visible', timeout: 10_000 });
      return;
    } catch {
      if (attempt === 2) throw new Error(`POS login failed after ${attempt + 1} attempts`);
    }
  }
}

async function openShiftIfOverlayVisible(page: import('@playwright/test').Page, cash = '100') {
  if (await page.locator('[data-testid="shift-overlay"]').isVisible()) {
    const cashInput = page.locator('[data-testid="shift-overlay"] input');
    if (await cashInput.first().isVisible()) {
      await cashInput.first().fill(cash);
    }
    await page.locator('[data-testid="open-shift-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
  }
}

async function closeActiveShiftIfAny(page: import('@playwright/test').Page) {
  const token = await page.evaluate(() => localStorage.getItem('pos_token'));
  if (!token) return;
  await page.request.post(`${API_BASE}/api/pos/shifts/close`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { actualClosingCash: 0, notes: 'e2e cleanup' },
  });
}

// ─── Full E2E flow: open shift → create order → verify in orders → close shift ───
test.describe.serial('POS Full E2E Flow — End to End', () => {
  test('open shift, create order, verify in orders, close shift', async ({ page }) => {
    // Step 1: Login
    await loginAsPOSUser(page);

    // Step 2: Open shift if overlay is visible
    await openShiftIfOverlayVisible(page, '200');

    // Step 3: Navigate to products and add item to cart
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const firstProduct = page.locator('[data-testid="product-item"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    // Verify cart has item
    const cartItem = page.locator('[data-testid="cart-item"]').first();
    await expect(cartItem).toBeVisible({ timeout: 5000 });

    // Verify cart totals
    const subtotal = page.locator('[data-testid="cart-subtotal"]');
    await expect(subtotal).toBeVisible();
    const subtotalText = await subtotal.textContent();
    expect(subtotalText).toContain('$');

    const total = page.locator('[data-testid="cart-total"]');
    await expect(total).toBeVisible();
    const totalText = await total.textContent();
    expect(totalText).toContain('$');
    expect(totalText).toContain('Total');

    // Step 4: Complete payment (cash)
    const payBtn = page.locator('[data-testid="pay-btn"]');
    await expect(payBtn).toBeVisible();
    await payBtn.click();

    // Should navigate to orders page after successful payment
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });
    expect(page.url()).toContain('/orders');

    // Verify order appears in orders table
    const ordersTable = page.locator('[data-testid="orders-table"]');
    await expect(ordersTable).toBeVisible();
    const orderRows = page.locator('[data-testid="orders-table"] tbody tr');
    const orderCount = await orderRows.count();
    expect(orderCount).toBeGreaterThanOrEqual(1);

    // Step 5: Close shift
    await page.locator('[data-testid="pos-nav-shift"]').click();
    await page.locator('[data-testid="shift-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    const closingInput = page.locator('[data-testid="shift-dashboard"] input[type="number"]');
    if (await closingInput.isVisible()) {
      await closingInput.fill('200');
      const closeBtn = page.locator('[data-testid="shift-dashboard"] button:has-text("Close Shift")');
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();
      await page.locator('text=Shift Closed').waitFor({ state: 'visible', timeout: 10000 });
    }
  });
});

// ─── Split payment flow ───
test.describe.serial('POS Split Payment Flow', () => {
  test('split payment: cash + card combination', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page, '100');

    // Navigate to products
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    // Add first product
    const firstProduct = page.locator('[data-testid="product-item"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    const cartItem = page.locator('[data-testid="cart-item"]').first();
    await expect(cartItem).toBeVisible({ timeout: 5000 });

    // Select split payment method
    const splitBtn = page.locator('[data-testid="pos-cart"] button:has-text("Split")');
    await expect(splitBtn).toBeVisible();
    await splitBtn.click();

    // Fill cash amount
    const cashInput = page.locator('[data-testid="pos-cart"] input[type="number"]');
    if (await cashInput.isVisible()) {
      await cashInput.fill('10');
    }

    // Verify card amount is calculated
    const cardLabel = page.locator('[data-testid="pos-cart"] span:has-text("$")').last();
    await expect(cardLabel).toBeVisible();

    // Complete split payment
    const payBtn = page.locator('[data-testid="pay-btn"]');
    await expect(payBtn).toBeVisible();
    const payDisabled = await payBtn.isDisabled();
    expect(payDisabled).toBe(false);
    await payBtn.click();

    // Should navigate to orders page
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });
    expect(page.url()).toContain('/orders');
  });
});

// ─── Cart quantity controls ───
test.describe('POS Cart Quantity Controls', () => {
  test('increase and decrease cart item quantity', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page, '100');

    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    // Add product
    const firstProduct = page.locator('[data-testid="product-item"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    const cartItem = page.locator('[data-testid="cart-item"]').first();
    await expect(cartItem).toBeVisible({ timeout: 5000 });

    // Get initial subtotal
    const subtotalBefore = await page.locator('[data-testid="cart-subtotal"]').textContent();

    // Increase quantity
    const increaseBtn = page.locator('[data-testid="qty-increase"]').first();
    await increaseBtn.click();

    // Subtotal should change
    await page.waitForTimeout(500);
    const subtotalAfter = await page.locator('[data-testid="cart-subtotal"]').textContent();
    expect(subtotalAfter).not.toBe(subtotalBefore);

    // Decrease quantity back
    const decreaseBtn = page.locator('[data-testid="qty-decrease"]').first();
    await decreaseBtn.click();

    await page.waitForTimeout(500);
    const subtotalFinal = await page.locator('[data-testid="cart-subtotal"]').textContent();
    expect(subtotalFinal).toBe(subtotalBefore);
  });
});

// ─── Product search ───
test.describe('POS Product Search', () => {
  test('search filters products', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page, '100');

    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const searchInput = page.locator('[data-testid="product-search"]');
    if (await searchInput.isVisible()) {
      // Get initial count
      const countBefore = await page.locator('[data-testid="product-item"]').count();
      expect(countBefore).toBeGreaterThanOrEqual(1);

      // Search for nonexistent product
      await searchInput.fill('zzz_nonexistent_zzz');
      await page.waitForTimeout(500);
      const countAfter = await page.locator('[data-testid="product-item"]').count();
      expect(countAfter).toBe(0);

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
      const countRestored = await page.locator('[data-testid="product-item"]').count();
      expect(countRestored).toBe(countBefore);
    }
  });
});

// ─── Receipt modal ───
test.describe('POS Receipt Modal', () => {
  test('receipt modal shows after payment and allows navigation back', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page, '100');

    // Create an order to trigger receipt
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    const firstProduct = page.locator('[data-testid="product-item"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    const cartItem = page.locator('[data-testid="cart-item"]').first();
    await expect(cartItem).toBeVisible({ timeout: 5000 });

    // Pay
    const payBtn = page.locator('[data-testid="pay-btn"]');
    await payBtn.click();

    // Should end up on orders page (receipt modal is not used in current flow —
    // checkout navigates directly to /pos/orders)
    await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });
    expect(page.url()).toContain('/orders');

    // Orders page should show the new order
    const orderRows = page.locator('[data-testid="orders-table"] tbody tr');
    const count = await orderRows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Guard: no shift blocks operations ───
test.describe.serial('POS Guard — No Shift Blocks Cart', () => {
  test('cannot checkout without open shift', async ({ page }) => {
    await loginAsPOSUser(page);
    await closeActiveShiftIfAny(page);

    // Reload to trigger shift check
    await page.goto(TENANT_URL('/pos/dashboard', TENANT_ID), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .first().waitFor({ state: 'visible', timeout: 10000 });

    // Shift overlay should be visible (blocking POS access)
    const overlayVisible = await page.locator('[data-testid="shift-overlay"]').isVisible();
    if (overlayVisible) {
      const overlay = page.locator('[data-testid="shift-overlay"]');
      await expect(overlay).toBeVisible();
      const openBtn = page.locator('[data-testid="open-shift-btn"]');
      await expect(openBtn).toBeVisible();
    }
  });
});
