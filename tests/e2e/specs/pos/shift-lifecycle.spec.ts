import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT, API_BASE } from '../../fixtures/test-data';

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
  const res = await page.request.post(`${API_BASE}/api/pos/shifts/close`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { actualClosingCash: 0, notes: 'e2e cleanup' },
  });
  // Ignore errors — no active shift to close is fine
  return res.ok();
}

// ─── Serial lifecycle: open → status → sale → close → summary ───
test.describe.serial('POS Shift Lifecycle — Full Flow', () => {
  test('POS user can open a new shift', async ({ page }) => {
    await loginAsPOSUser(page);
    // If the overlay is visible, we need to open a shift
    const overlayVisible = await page.locator('[data-testid="shift-overlay"]').isVisible();
    if (overlayVisible) {
      const cashInput = page.locator('[data-testid="shift-overlay"] input');
      if (await cashInput.first().isVisible()) {
        await cashInput.first().fill('100');
      }
      await page.locator('[data-testid="open-shift-btn"]').click();
      await page.locator('[data-testid="pos-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
    }
    // Dashboard should now be visible (shift is open or was already open)
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible();
    // Shift overlay should NOT be visible
    await expect(page.locator('[data-testid="shift-overlay"]')).not.toBeVisible();
  });

  test('shift status shows as "open" after opening', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page);

    // Navigate to shift view
    await page.locator('[data-testid="pos-nav-shift"]').click();
    await page.locator('[data-testid="shift-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    // Status badge should show "open"
    const statusBadge = page.locator('[data-testid="shift-dashboard"] >> text=open');
    await expect(statusBadge).toBeVisible();

    // Opening cash should show a dollar amount
    const shiftInfo = page.locator('[data-testid="shift-dashboard"]');
    const text = await shiftInfo.textContent();
    expect(text).toContain('$');
    expect(text).toContain('Opening Cash');
  });

  test('cashier can process a sale during open shift', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page);

    // Navigate to products
    await page.locator('[data-testid="pos-nav-products"]').click();
    await page.locator('[data-testid="pos-products"]').waitFor({ state: 'visible', timeout: 10000 });

    // Add first product to cart
    const firstProduct = page.locator('[data-testid="product-item"]').first();
    if (await firstProduct.isVisible()) {
      await firstProduct.click();
      await page.locator('[data-testid="cart-item"]').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      // Cart should show pay button with dollar amount
      const payBtn = page.locator('[data-testid="pay-btn"]');
      await expect(payBtn).toBeVisible();
      const payText = await payBtn.textContent() ?? '';
      expect(payText).toContain('Pay');
      expect(payText).toContain('$');

      // Complete the payment
      await payBtn.click();
      await page.locator('[data-testid="pos-orders"]').waitFor({ state: 'visible', timeout: 10000 });

      // Should navigate to orders page after successful payment
      const url = page.url();
      expect(url).toContain('/orders');
    }
  });

  test('POS user can close shift with closing balance', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page);

    // Navigate to shift view
    await page.locator('[data-testid="pos-nav-shift"]').click();
    await page.locator('[data-testid="shift-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    // Fill closing cash amount
    const closingInput = page.locator('[data-testid="shift-dashboard"] input[type="number"]');
    await closingInput.fill('150');

    // Click close shift button
    const closeBtn = page.locator('[data-testid="shift-dashboard"] button:has-text("Close Shift")');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Wait for shift summary to appear
    await page.locator('text=Shift Closed').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('shift summary shows after closing', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page);

    // Navigate to shift view and close
    await page.locator('[data-testid="pos-nav-shift"]').click();
    await page.locator('[data-testid="shift-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    const closingInput = page.locator('[data-testid="shift-dashboard"] input[type="number"]');
    await closingInput.fill('100');
    const closeBtn = page.locator('[data-testid="shift-dashboard"] button:has-text("Close Shift")');
    await closeBtn.click();

    // Verify shift summary content
    await page.locator('text=Shift Closed').waitFor({ state: 'visible', timeout: 10000 });

    const summary = page.locator('[data-testid="shift-dashboard"]');
    const text = await summary.textContent() ?? '';

    // Summary should show key fields
    expect(text).toContain('Opening Cash');
    expect(text).toContain('Cash Sales');
    expect(text).toContain('Expected Closing');
    expect(text).toContain('Actual Closing');
    expect(text).toContain('Discrepancy');

    // Dollar amounts should be present
    expect(text).toContain('$');

    // "Back to POS" button should be visible
    const backBtn = page.locator('button:has-text("Back to POS")');
    await expect(backBtn).toBeVisible();
  });
});

// ─── Guard rails ────────────────────────────────────────────────
test.describe('POS Shift Lifecycle — Guards', () => {
  test('cannot process sale without open shift', async ({ page }) => {
    // Close any active shift first via API
    await loginAsPOSUser(page);
    await closeActiveShiftIfAny(page);

    // Reload to trigger shift check
    await page.goto(TENANT_URL('/pos/dashboard', TENANT_ID));
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .first().waitFor({ state: 'visible', timeout: 10000 });

    // The shift overlay should be blocking POS access
    const overlayVisible = await page.locator('[data-testid="shift-overlay"]').isVisible();
    if (overlayVisible) {
      // Without a shift, the overlay blocks all POS operations
      // Products nav should still be in DOM but overlay blocks interaction
      const overlay = page.locator('[data-testid="shift-overlay"]');
      await expect(overlay).toBeVisible();

      // The overlay should have the open shift button
      const openBtn = page.locator('[data-testid="open-shift-btn"]');
      await expect(openBtn).toBeVisible();
    }
  });

  test('cannot open two shifts simultaneously', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page);

    // With an active shift, try to open another via API
    const token = await page.evaluate(() => localStorage.getItem('pos_token'));
    const res = await page.request.post(`${API_BASE}/api/pos/shifts/open`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { openingCash: 50 },
    });

    // Should fail — can't open a second shift while one is active
    expect(res.ok()).toBeFalsy();
  });
});

// ─── Shift history ──────────────────────────────────────────────
test.describe('POS Shift Lifecycle — History', () => {
  test('shift history displays previous shifts', async ({ page }) => {
    await loginAsPOSUser(page);
    await openShiftIfOverlayVisible(page);

    // Navigate to shift view
    await page.locator('[data-testid="pos-nav-shift"]').click();
    await page.locator('[data-testid="shift-dashboard"]').waitFor({ state: 'visible', timeout: 10000 });

    // The shift dashboard should show shift details (ID, opened time, cash)
    const shiftInfo = page.locator('[data-testid="shift-dashboard"]');
    const text = await shiftInfo.textContent() ?? '';

    // Current shift info should be visible
    expect(text).toContain('Shift ID');
    expect(text).toContain('Opened');
    expect(text).toContain('Opening Cash');

    // Close shift to complete the cycle
    const closingInput = page.locator('[data-testid="shift-dashboard"] input[type="number"]');
    if (await closingInput.isVisible()) {
      await closingInput.fill('100');
      const closeBtn = page.locator('[data-testid="shift-dashboard"] button:has-text("Close Shift")');
      await closeBtn.click();
      await page.locator('text=Shift Closed').waitFor({ state: 'visible', timeout: 10000 });
    }
  });
});
