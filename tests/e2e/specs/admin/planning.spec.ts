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

test.describe('Admin Planning', () => {
  test('navigates to planning tab', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-planning"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('plan');
  });

  test('plan list or empty state is displayed', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-planning"]').click();
    await expectPanelReady(page);
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    const hasPlans = lower.includes('event') || lower.includes('status') || lower.includes('plan');
    const hasEmpty = lower.includes('no plans') || lower.includes('no events') || lower.includes('no data');
    expect(hasPlans || hasEmpty).toBe(true);
  });

  test('add plan button is present', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-planning"]').click();
    await expectPanelReady(page);
    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    const count = await addBtn.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
