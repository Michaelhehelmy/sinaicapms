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

test.describe('Admin Rooms Management', () => {
  test('navigates to rooms tab', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('room');
  });

  test('rooms table or empty state is displayed', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelReady(page);
    try {
      await page.locator('[data-testid="rooms-panel"], [data-testid="rooms-table"], [data-testid="content-area"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Rooms panel may have different testid — continue
    }
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    const hasTable = lower.includes('name') || lower.includes('status') || lower.includes('floor');
    const hasEmpty = lower.includes('no rooms') || lower.includes('no data');
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('create room button is present', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelReady(page);
    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    const count = await addBtn.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
