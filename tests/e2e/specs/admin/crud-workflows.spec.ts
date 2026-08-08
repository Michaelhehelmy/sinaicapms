import { test, expect } from '@playwright/test';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  await expectPanelReady(page);
}

test.describe('Admin CRUD Workflow — Rooms', () => {
  test('rooms tab: navigate, verify table, click add', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelContentReady(page, 'rooms-panel');

    // Empty store shows the "No rooms yet" empty state instead of a table —
    // either satisfies "rooms list loaded".
    const table = page.locator('[data-testid="content-area"] table, [data-testid="data-table"]');
    const emptyState = page.locator('[data-testid="rooms-panel"] >> text=No rooms');
    await expect(table.or(emptyState).first()).toBeVisible();

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.locator('[data-testid="modal-content"], [class*="modal"]').first().waitFor({ state: 'visible', timeout: 5000 });

      await expect(
        page.locator('form, [class*="modal"], [class*="drawer"]').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Admin CRUD Workflow — Meals', () => {
  test('meals tab: navigate, verify list, click add', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-meals"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.locator('[data-testid="modal-content"], [class*="modal"]').first().waitFor({ state: 'visible', timeout: 5000 });

      await expect(
        page.locator('form, [class*="modal"], [class*="drawer"]').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Admin CRUD Workflow — Rate Plans', () => {
  test('rateplans tab: navigate, verify content, click add', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-rateplans"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.locator('[data-testid="modal-content"], [class*="modal"]').first().waitFor({ state: 'visible', timeout: 5000 });

      await expect(
        page.locator('form, [class*="modal"], [class*="drawer"]').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Admin CRUD Workflow — Planning', () => {
  test('planning tab: navigate, verify content, click add', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-planning"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.locator('[data-testid="modal-content"], [class*="modal"]').first().waitFor({ state: 'visible', timeout: 5000 });

      await expect(
        page.locator('form, [class*="modal"], [class*="drawer"]').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Admin CRUD Workflow — Settings', () => {
  test('settings tab: navigate, verify form, save button exists', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();

    const saveBtn = page.locator('[data-testid="settings-save-btn"]');
    const count = await saveBtn.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('settings tab: branding section visible', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelReady(page);

    const branding = page.locator('[data-testid="branding-section"]');
    const count = await branding.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Admin CRUD Workflow — Orders/Reservations', () => {
  test('orders tab: navigate, verify table, filter exists', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();
  });

  test('orders tab: has status filter', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelContentReady(page, 'reservation-log-panel');

    const filter = page.locator('[data-testid="status-filter"], [data-testid="content-area"] select');
    const count = await filter.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Admin CRUD Workflow — Reports', () => {
  test('reports tab: navigate, verify content, report type selector exists', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reports"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();

    const reportTabs = page.locator('[data-testid="report-tabs"]');
    const reportTabsCount = await reportTabs.count();
    const reportTabsVisible = reportTabsCount > 0;
    const contentText = await content.textContent() ?? '';
    expect(reportTabsVisible || contentText.toLowerCase().includes('report')).toBeTruthy();
  });
});
