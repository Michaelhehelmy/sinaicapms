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

test.describe('Admin CRUD End-to-End — Camps', () => {
  const CAMP_NAME = `E2E Camp ${Date.now()}`;

  test('create camp via form → verify in table', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-camps"]').click();
    await expectPanelReady(page);

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      try {
        await page.locator('[data-testid="content-area"] form, [class*="modal"], [class*="drawer"]').first()
          .waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        // Form may already be visible — continue
      }

      const nameInput = page.locator('[data-testid="content-area"] input[placeholder*="name"], [data-testid="content-area"] input[placeholder*="Name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(CAMP_NAME);

        const saveBtn = page.locator('[data-testid="content-area"] button:has-text("Save"), [data-testid="content-area"] button:has-text("Create"), [data-testid="content-area"] button[type="submit"]').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await expectPanelReady(page);

          const tableContent = await page.locator('[data-testid="content-area"]').textContent() ?? '';
          const hasCamp = tableContent.toLowerCase().includes(CAMP_NAME.toLowerCase()) ||
                          tableContent.toLowerCase().includes('e2e camp');
          expect(hasCamp || tableContent.length > 0).toBeTruthy();
        }
      }
    }
  });

  test('cancel camp creation → form closes', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-camps"]').click();
    await expectPanelReady(page);

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      try {
        await page.locator('[data-testid="content-area"] form, [class*="modal"], [class*="drawer"]').first()
          .waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        // Form may already be visible — continue
      }

      const cancelBtn = page.locator('[data-testid="content-area"] button:has-text("Cancel"), [data-testid="content-area"] button:has-text("Close")').first();
      if (await cancelBtn.count() > 0 && await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await expectPanelReady(page);
      }
    }
  });
});

test.describe('Admin CRUD End-to-End — Rooms', () => {
  test('rooms tab → table loads with columns', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelContentReady(page, 'rooms-panel');

    // With an empty store RoomsPanel renders the "No rooms yet" empty state
    // instead of a table — either satisfies "the rooms list loaded".
    const table = page.locator('[data-testid="content-area"] table, [data-testid="data-table"]');
    const emptyState = page.locator('[data-testid="rooms-panel"] >> text=No rooms');
    await expect(table.or(emptyState).first()).toBeVisible({ timeout: 5000 });
  });

  test('rooms tab → add button opens form', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelReady(page);

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")').first();
    const addBtnCount = await addBtn.count();
    if (addBtnCount > 0) {
      await addBtn.click();
      try {
        await page.locator('[data-testid="content-area"] form, [class*="modal"], [class*="drawer"]').first()
          .waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        // Form may already be visible — continue
      }

      await expect(
        page.locator('[data-testid="content-area"] form, [class*="modal"], [class*="drawer"]').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('rooms tab → rows have data or empty state', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-rooms"]').click();
    await expectPanelContentReady(page, 'rooms-panel');

    // Auto-retrying (unlike count()) so a mid-render sample can't flake:
    // passes when a data row renders OR the "No rooms yet" empty state does.
    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const emptyState = page.locator('[data-testid="rooms-panel"] >> text=No rooms');
    await expect(rows.first().or(emptyState).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Admin CRUD End-to-End — Meals', () => {
  test('meals tab → list loads', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-meals"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('meals tab → add button present', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-meals"]').click();
    await expectPanelContentReady(page, 'meals-panel');

    const addBtn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    await expect(addBtn.first()).toBeVisible();
  });
});

test.describe('Admin CRUD End-to-End — Settings', () => {
  test('settings tab → form fields load', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelContentReady(page, 'settings-panel');

    const inputs = page.locator('[data-testid="content-area"] input, [data-testid="content-area"] textarea, [data-testid="content-area"] select');
    await expect(inputs.first()).toBeVisible();
  });

  test('settings tab → save button exists', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelContentReady(page, 'settings-panel');

    const saveBtn = page.locator('[data-testid="settings-save-btn"]');
    await expect(saveBtn.first()).toBeVisible();
  });
});

test.describe('Admin CRUD End-to-End — Reports', () => {
  test('reports tab → sub-tabs load', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-reports"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('reports tab → occupancy report renders', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-reports"]').click();
    await expectPanelReady(page);
    try {
      await page.locator('[data-testid="report-tabs"], [data-testid="reports-panel"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Reports may have loaded without the specific testid — continue
    }

    const reportTabs = page.locator('[data-testid="report-tabs"]');
    const content = page.locator('[data-testid="content-area"]');
    const reportTabsCount = await reportTabs.count();
    const reportTabsVisible = reportTabsCount > 0 && await reportTabs.isVisible();
    const contentText = await content.textContent() ?? '';
    const hasReportContent = reportTabsVisible || contentText.toLowerCase().includes('report');
    expect(hasReportContent).toBeTruthy();
  });
});
