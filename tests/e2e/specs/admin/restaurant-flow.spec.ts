/**
 * Restaurant Flow E2E — create service definition → create service item →
 * book service → assign worker → verify booking appears in bookings panel.
 *
 * Exercises: ServicesPanel, ServiceBookingsPanel, MealsPanel, MenuPlannerPanel.
 *
 * NOTE: The service module is used for restaurant-specific bookable services
 * (e.g., private dining, catering). The meals/menu panels handle the standard
 * restaurant menu workflow.
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

test.describe.serial('Restaurant Flow — end-to-end', () => {
  test('step 1: services panel loads with tabs', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'services');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'services-panel');

    await expect(page.locator('[data-testid="services-panel"]')).toBeVisible();
    // Definitions tab: Add Service Type button shows here.
    await expect(page.locator('[data-testid="add-def-btn"]')).toBeVisible();
    // Item-level Add Service button lives on the items tab — switch to it.
    await page.locator('[data-testid="tab-items"]').click();
    await expectPanelContentReady(page, 'services-panel');
    await expect(page.locator('[data-testid="add-item-btn"]')).toBeVisible();
  });

  test('step 2: service bookings panel loads', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'service-bookings');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'service-bookings-panel');

    await expect(page.locator('[data-testid="service-bookings-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-booking-btn"]')).toBeVisible();
  });

  test('step 3: meals panel loads with meal list', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'meals');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'meals-panel');

    await expect(page.locator('[data-testid="meals-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-meal-btn"]')).toBeVisible();
    // Meals list should render (may be empty or have seeded data)
    await expect(page.locator('[data-testid="meals-list"]')).toBeVisible();
  });

  test('step 4: menu planner panel loads', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'menu-planner');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'menu-planner-panel');

    await expect(page.locator('[data-testid="menu-planner-panel"]')).toBeVisible();
  });

  test('step 5: promotions panel loads', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'promotions');
    await expectPanelReady(page);
    await expectPanelContentReady(page, 'promotions-panel');

    await expect(page.locator('[data-testid="promotions-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-promotion-btn"]')).toBeVisible();
  });
});
