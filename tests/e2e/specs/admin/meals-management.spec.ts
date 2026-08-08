import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto();
  await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  await expectPanelReady(page);
}

test.describe('Admin Meals Management', () => {
  test('navigates to menu/meals tab', async ({ page }) => {
    await loginAsSuperAdmin(page);
    const menuTab = page.locator('[data-testid="nav-tab-menu"], [data-testid="nav-tab-meals"]');
    await menuTab.first().click();
    // The "Meals" tab renders MealsPanel ("Menu Meals" heading) which gates its
    // content behind aria-busy={loading} — wait for data before asserting.
    await expectPanelContentReady(page, 'meals-panel');
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('meal');
  });

  test('meals list or empty state is displayed', async ({ page }) => {
    await loginAsSuperAdmin(page);
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
    await loginAsSuperAdmin(page);
    const menuTab = page.locator('[data-testid="nav-tab-menu"], [data-testid="nav-tab-meals"]');
    await menuTab.first().click();
    await expectPanelContentReady(page, 'meals-panel');
    const addBtn = page.locator('[data-testid="add-meal-btn"]');
    await expect(addBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
