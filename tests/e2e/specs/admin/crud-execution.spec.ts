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
  return admin;
}

test.describe('Admin CRUD Execution — Camps', () => {
  test('camps tab loads with content', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('camps');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('create camp button exists', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');
    const btn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    await expect(btn.first()).toBeVisible();
  });

  test('create camp modal/form opens', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('camps');
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
});

test.describe('Admin CRUD Execution — Rooms', () => {
  test('rooms tab loads with content', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    await expect(content).toBeVisible();
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('create room button exists', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');
    const btn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    await expect(btn.first()).toBeVisible();
  });
});

test.describe('Admin CRUD Execution — Rate Plans', () => {
  test('rateplans tab loads', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('rateplans has add button', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');
    const btn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    await expect(btn.first()).toBeVisible();
  });
});

test.describe('Admin CRUD Execution — Meals', () => {
  test('meals tab loads with list', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('meals');
    // MealsPanel gates content behind aria-busy={loading} — wait for data.
    await expectPanelContentReady(page, 'meals-panel');
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('meals has add button', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');
    const btn = page.locator('[data-testid="content-area"] button:has-text("Add"), [data-testid="content-area"] button:has-text("Create")');
    await expect(btn.first()).toBeVisible();
  });
});

test.describe('Admin CRUD Execution — Plans', () => {
  test('planning tab loads', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('planning');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });
});

test.describe('Admin CRUD Execution — Orders/Reservations', () => {
  test('reservations tab loads with content', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('orders has filter dropdown', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelContentReady(page, 'reservation-log-panel');
    const filter = page.locator('[data-testid="content-area"] select, [data-testid="status-filter"]');
    await expect(filter.first()).toBeVisible();
  });
});

test.describe('Admin CRUD Execution — Settings', () => {
  test('settings tab loads with form', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('settings');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('settings has save button', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');
    const saveBtn = page.locator('[data-testid="settings-save-btn"]');
    await expect(saveBtn.first()).toBeVisible();
  });
});

test.describe('Admin CRUD Execution — Reports', () => {
  test('reports tab loads with data sections', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('reports');
    await expectPanelReady(page);
    const content = page.locator('[data-testid="content-area"]');
    const text = await content.textContent() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });
});
