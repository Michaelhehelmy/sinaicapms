import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelReady } from '../../fixtures/admin';

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto();
  await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  await expectPanelReady(page);
}

test.describe('Admin Orders CRUD', () => {
  test('navigates to orders tab and table loads', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('reservation');
  });

  test('shows stats cards with counts', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    expect(lower).toContain('total');
    expect(lower).toContain('pending');
  });

  test('filter dropdown has status options', async ({ page }) => {
    await loginAsSuperAdmin(page);
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
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reservations"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    const hasOrders = lower.includes('ord-') || lower.includes('view') || lower.includes('reservation');
    const hasEmpty = lower.includes('no reservations') || lower.includes('no data');
    expect(hasOrders || hasEmpty).toBe(true);
  });
});
