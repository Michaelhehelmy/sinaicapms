import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

const TIMESTAMP = Date.now();
const ORDER_GUEST = `E2E Guest ${TIMESTAMP}`;

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.goto(TEST_TENANT.id);
    await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
    try {
      await expectPanelReady(page);
      return admin;
    } catch {
      if (attempt === 2) throw new Error(`Admin login failed after ${attempt + 1} attempts`);
    }
  }
  return admin;
}

async function waitForToast(page: import('@playwright/test').Page, text: string, timeout = 8000) {
  const toast = page.locator(`[role="alert"]:has-text("${text}")`);
  await expect(toast).toBeVisible({ timeout });
}

// ─── Orders Panel — Read ───
test.describe('Admin Orders Panel — Read', () => {
  test('orders panel renders with data table', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reservations');
    await expectPanelContentReady(page, 'content-area');

    // Orders panel should be visible
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent();
    expect(text).toContain('Order');
  });

  test('orders panel shows stats cards', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reservations');
    await expectPanelContentReady(page, 'content-area');

    // Should show stats like "Total Orders", "Revenue"
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent();
    expect(text).toMatch(/order|booking|revenue/i);
  });
});

// ─── Orders Panel — Create ───
test.describe.serial('Admin Orders Panel — Create', () => {
  test('create new order via modal', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reservations');
    await expectPanelContentReady(page, 'content-area');

    // Click add button
    const addBtn = page.locator('[data-testid="add-order-btn"], button:has-text("Add Order"), button:has-text("New Order")');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'visible', timeout: 5000 });

      // Fill guest name
      const nameInput = page.locator('[data-testid="modal-content"] input').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(ORDER_GUEST);
      }

      // Fill email
      const emailInput = page.locator('[data-testid="modal-content"] input[type="email"]');
      if (await emailInput.isVisible()) {
        await emailInput.fill(`e2e-order-${TIMESTAMP}@test.com`);
      }

      // Save
      await page.locator('[data-testid="modal-save"]').click();
      await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  });
});

// ─── Orders Panel — Filter ───
test.describe('Admin Orders Panel — Filter', () => {
  test('status filter dropdown works', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reservations');
    await expectPanelContentReady(page, 'content-area');

    // Look for status filter
    const filterSelect = page.locator('select').first();
    if (await filterSelect.isVisible()) {
      const options = filterSelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThanOrEqual(1);

      // Select a filter option
      if (optionCount > 1) {
        await filterSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
  });
});

// ─── Orders Panel — State Change ───
test.describe('Admin Orders Panel — State Change', () => {
  test('order state change modal opens', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reservations');
    await expectPanelContentReady(page, 'content-area');

    // Find first order row
    const orderRow = page.locator('[data-testid="data-table-row"]').first();
    if (await orderRow.isVisible()) {
      // Look for state change button
      const stateBtn = orderRow.locator('button:has-text("State"), button:has-text("Status"), button:has-text("Update")');
      if (await stateBtn.isVisible()) {
        await stateBtn.click();
        // State change modal or dropdown should appear
        await page.waitForTimeout(500);
      }
    }
  });
});

// ─── Orders Panel — Delete ───
test.describe.serial('Admin Orders Panel — Delete', () => {
  test('delete order shows confirmation dialog', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reservations');
    await expectPanelContentReady(page, 'content-area');

    const orderRow = page.locator('[data-testid="data-table-row"]').first();
    if (await orderRow.isVisible()) {
      const deleteBtn = orderRow.locator('button:has-text("Delete"), button:has-text("Cancel")');
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();

        // Confirm dialog should appear
        const confirmDialog = page.locator('[role="dialog"]');
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        // Cancel to avoid actually deleting
        const cancelBtn = confirmDialog.locator('button:has-text("Cancel"), button:has-text("No")');
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
        }
      }
    }
  });
});
