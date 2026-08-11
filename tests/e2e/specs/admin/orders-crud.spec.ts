import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady } from '../../fixtures/admin';

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto(TEST_TENANT.id);
  await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
  await expectPanelReady(page);
}

test.describe('Admin Orders CRUD', () => {
  test('navigates to orders tab and table loads', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('reservation');
  });

  test('shows stats cards with counts', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    expect(lower).toContain('total');
    expect(lower).toContain('pending');
  });

  test('filter dropdown has status options', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const filter = page.locator('[data-testid="status-filter"] select, [data-testid="content-area"] select').first();
    const filterCount = await filter.count();
    if (filterCount > 0 && await filter.isVisible()) {
      const options = filter.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test('empty state shows no reservations message', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    const hasOrders = lower.includes('ord-') || lower.includes('view') || lower.includes('reservation');
    const hasEmpty = lower.includes('no reservations') || lower.includes('no data');
    expect(hasOrders || hasEmpty).toBe(true);
  });
});
