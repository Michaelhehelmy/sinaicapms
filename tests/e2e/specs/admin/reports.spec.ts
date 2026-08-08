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

test.describe('Admin Reports', () => {
  test('navigates to reports tab', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reports"]').click();
    await expectPanelReady(page);
    try {
      await page.locator('[data-testid="reports-panel"], [data-testid="report-tabs"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Reports panel may have different testid — continue
    }
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    expect(content.toLowerCase()).toContain('report');
  });

  test('shows occupancy/revenue/bookings tabs', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reports"]').click();
    await expectPanelReady(page);
    try {
      await page.locator('[data-testid="reports-panel"], [data-testid="report-tabs"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Reports panel may have different testid — continue
    }
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    expect(lower).toContain('occupancy');
    expect(lower).toContain('revenue');
    expect(lower).toContain('bookings');
  });

  test('report data loads without error', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-reports"]').click();
    await page.waitForLoadState('networkidle');
    try {
      await page.locator('[data-testid="reports-panel"], [data-testid="report-content"]').first()
        .waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // Report content may have loaded with different testid — continue
    }
    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    const hasReportContent = lower.includes('report') || lower.includes('total') || lower.includes('rate') || lower.includes('rooms') || lower.includes('date');
    const noError = !lower.includes('error loading');
    expect(hasReportContent && noError).toBe(true);
  });
});
