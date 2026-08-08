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
  return admin;
}

test.describe('Admin Tenant Management', () => {
  test('super dashboard shows stat cards with numeric values', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_dashboard');
    await expectPanelReady(page);

    await page.locator('[data-testid="stat-value"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();

    const statValues = page.locator('[data-testid="stat-value"]');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(4);

    let numericCount = 0;
    for (let i = 0; i < count; i++) {
      const text = (await statValues.nth(i).textContent()) ?? '';
      const cleaned = text.replace(/[^0-9.]/g, '');
      if (cleaned.length > 0 && !isNaN(parseFloat(cleaned))) numericCount++;
    }
    expect(numericCount).toBeGreaterThanOrEqual(3);
  });

  test('super tenants tab shows tenant directory', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_tenants');
    await expectPanelReady(page);

    try {
      await page.locator('[data-testid="tenants-table"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Tenants table may have different testid — continue
    }
    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();

    const content = (await contentArea.textContent()) ?? '';
    const lower = content.toLowerCase();
    expect(lower).toContain('tenant');

    const tenantsTable = page.locator('[data-testid="tenants-table"]');
    await expect(tenantsTable).toBeVisible();
  });

  test('tenant cards show status badges', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_tenants');
    await expectPanelReady(page);

    try {
      await page.locator('[data-testid="tenants-table"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Tenants table may be loading — continue
    }
    const tenantsTable = page.locator('[data-testid="tenants-table"]');
    await expect(tenantsTable).toBeVisible();

    const content = (await tenantsTable.textContent()) ?? '';
    const lower = content.toLowerCase();
    // Should show tenant cards with status info
    expect(lower.includes('active') || lower.includes('suspended') || lower.includes('no tenants')).toBeTruthy();
  });

  test('edit tenant button exists', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_tenants');
    await expectPanelReady(page);

    try {
      await page.locator('[data-testid="tenants-table"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Tenants table may be loading — continue
    }

    const editBtns = page.locator('[data-testid="edit-tenant-btn"]');
    const editCount = await editBtns.count();
    // At least one edit button should exist if there are tenants
    const tenantsContent = (await page.locator('[data-testid="tenants-table"]').textContent()) ?? '';
    const hasNoTenants = tenantsContent.toLowerCase().includes('no tenants');
    expect(editCount >= 1 || hasNoTenants).toBeTruthy();
  });

  test('edit tenant button toggles edit form', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_tenants');
    await expectPanelReady(page);

    try {
      await page.locator('[data-testid="tenants-table"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Tenants table may be loading — continue
    }
    const editBtns = page.locator('[data-testid="edit-tenant-btn"]');
    const editCount = await editBtns.count();
    test.skip(editCount < 1, 'No edit buttons found in tenant table');

    await editBtns.first().click();
    await expectPanelReady(page);

    // Should show admin account form fields
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    expect(lower.includes('admin') || lower.includes('email') || lower.includes('password')).toBeTruthy();
  });
});
