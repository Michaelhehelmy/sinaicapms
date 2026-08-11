import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto(TEST_TENANT.id);
  await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
  await expectPanelReady(page);
}

test.describe('Admin Meals Management', () => {
  test('navigates to menu/meals tab', async ({ page }) => {
    await loginAsTenantAdmin(page);
    const menuTab = page.locator('[data-testid="nav-tab-menu"], [data-testid="nav-tab-meals"]');
    await menuTab.first().click();
    // The "Meals" tab renders MealsPanel ("Menu Meals" heading) which gates its
    // content behind aria-busy={loading} — wait for data before asserting.
    await expectPanelContentReady(page, 'meals-panel');
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('meal');
  });

  test('meals list or empty state is displayed', async ({ page }) => {
    await loginAsTenantAdmin(page);
    const menuTab = page.locator('[data-testid="nav-tab-menu"], [data-testid="nav-tab-meals"]');
    await menuTab.first().click();
    await expectPanelContentReady(page, 'meals-panel');
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    const hasMeals = lower.includes('price') || lower.includes('category') || lower.includes('meal');
    const hasEmpty = lower.includes('no meals') || lower.includes('no data');
    expect(hasMeals || hasEmpty).toBe(true);
  });

  test('add meal button is present', async ({ page }) => {
    await loginAsTenantAdmin(page);
    const menuTab = page.locator('[data-testid="nav-tab-menu"], [data-testid="nav-tab-meals"]');
    await menuTab.first().click();
    await expectPanelContentReady(page, 'meals-panel');
    const addBtn = page.locator('[data-testid="add-meal-btn"]');
    await expect(addBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
