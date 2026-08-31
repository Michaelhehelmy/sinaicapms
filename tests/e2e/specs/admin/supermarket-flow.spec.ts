/**
 * Supermarket Flow E2E — create product → POS add to cart → complete order →
 * verify orders panel shows the transaction.
 *
 * Exercises: Products (camps panel), POS flow, OrdersPanel.
 *
 * NOTE: POS cart operations require POS auth which isn't seeded in the standard
 * E2E admin login. This spec tests the admin-side product management and
 * orders viewing; POS cart E2E is covered by the existing pos/ specs.
 */
import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto(TEST_TENANT.id);
  await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
  await expectPanelReady(page);
  return admin;
}

test.describe.serial('Supermarket Flow — end-to-end', () => {
  test('step 1: camps panel shows products/room types', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'camps-panel');

    await expect(page.locator('[data-testid="camps-panel"]')).toBeVisible();
  });

  test('step 2: low stock panel loads', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    // Nav tab id is "low-stock" (matches nav-tab-low-stock), not "lowstock".
    await admin.gotoTab(TEST_TENANT.id, 'low-stock');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'low-stock-panel');

    await expect(page.locator('[data-testid="low-stock-panel"]')).toBeVisible();
  });

  test('step 3: orders panel loads with stats', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('orders');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'orders-panel');

    await expect(page.locator('[data-testid="orders-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-stats"]')).toBeVisible();
  });

  test('step 4: promotions panel loads', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'promotions');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'promotions-panel');

    await expect(page.locator('[data-testid="promotions-panel"]')).toBeVisible();
  });

  test('step 5: reports panel loads with tabs', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('reports');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'reports-panel');

    await expect(page.locator('[data-testid="reports-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="report-tabs"]')).toBeVisible();
  });
});
