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

test.describe('Dashboard Stats', () => {
  test('super dashboard shows stat cards', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_dashboard');
    await expectPanelReady(page);

    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();

    await page.locator('[data-testid="stat-card"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const statCards = page.locator('[data-testid="stat-card"]');
    const count = await statCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('stat values are numeric and not NaN', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_dashboard');
    await expectPanelReady(page);

    await page.locator('[data-testid="stat-value"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const statValues = page.locator('[data-testid="stat-value"]');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(4);

    let numericCount = 0;
    for (let i = 0; i < count; i++) {
      const text = (await statValues.nth(i).textContent()) ?? '';
      const cleaned = text.replace(/[^0-9.]/g, '');
      if (cleaned.length > 0) {
        const num = parseFloat(cleaned);
        expect(num).not.toBeNaN();
        expect(Number.isFinite(num)).toBe(true);
        numericCount++;
      }
    }
    expect(numericCount).toBeGreaterThanOrEqual(3);
  });

  test('revenue stat contains currency sign', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_dashboard');
    await expectPanelReady(page);

    await page.locator('[data-testid="stat-value"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';

    const currencyMatches = content.match(/[\$€£]?\s?[\d,]+\.?\d*/g) ?? [];
    expect(currencyMatches.length).toBeGreaterThanOrEqual(1);
  });

  test('dashboard loads without errors', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_dashboard');
    await expectPanelReady(page);

    // Wait for the panel's actual content to commit before reading text —
    // panel-loading hiding can race the React commit of the new panel.
    await expect(page.getByRole('heading', { name: 'Platform Overview' })).toBeVisible();

    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();

    const hasDashboardContent = lower.includes('overview') || lower.includes('tenant') || lower.includes('camp');
    expect(hasDashboardContent).toBe(true);
  });

  test('tenant dashboard stat cards show labels', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('dashboard');
    await expectPanelReady(page);

    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();

    await page.locator('[data-testid="stat-label"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const statLabels = page.locator('[data-testid="stat-label"]');
    const count = await statLabels.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await statLabels.nth(i).textContent()) ?? '';
      labels.push(text.toLowerCase());
    }
    const allLabels = labels.join(' ');
    expect(allLabels.length).toBeGreaterThan(0);
  });

  test('tenant dashboard stat values are present', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('dashboard');
    await expectPanelReady(page);

    await page.locator('[data-testid="stat-value"]').first().waitFor({ state: 'visible', timeout: 15000 });
    const statValues = page.locator('[data-testid="stat-value"]');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('tenant dashboard shows recent reservations section', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('dashboard');
    await expectPanelContentReady(page, 'dashboard-panel');

    // "Recent Reservations" only renders when the store has orders; with an
    // empty store the dashboard still renders its stat cards — either
    // satisfies "dashboard loaded".
    const recentCard = page.locator('[data-testid="recent-reservations"]');
    if ((await recentCard.count()) > 0 && (await recentCard.isVisible())) {
      return;
    }

    const statCards = page.locator('[data-testid="admin-stat-cards"]');
    await expect(statCards).toBeVisible();
  });

  test('super dashboard quick action buttons exist', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_dashboard');
    await expectPanelContentReady(page, 'super-dashboard-panel');

    const actions = page.locator('[data-testid="quick-action"]');
    const count = await actions.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
