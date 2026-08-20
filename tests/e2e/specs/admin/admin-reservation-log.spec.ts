import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

/* ------------------------------------------------------------------ */
/* Admin Reservation Log - requires super_admin login (excluded from    */
/* production E2E where seed data may not exist).                       */
/* ------------------------------------------------------------------ */

test.describe('Admin Reservation Log', () => {
  test('reservation log tab renders with title and table or empty state', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();
    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();
    await expectPanelReady(page);

    await admin.clickTab('super_reservations');
    await expectPanelContentReady(page, 'reservation-log-panel');

    const contentArea = page.locator('[data-testid="content-area"]');
    const content = (await contentArea.textContent()) ?? '';
    expect(content.toLowerCase()).toContain('reservation');
  });

  test('reservation log table has expected columns when data exists', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();
    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();
    await expectPanelReady(page);

    await admin.clickTab('super_reservations');
    await expectPanelContentReady(page, 'reservation-log-panel');

    const headers = page.locator('[data-testid="content-area"] table th');
    const headerCount = await headers.count();

    if (headerCount > 0) {
      expect(headerCount).toBeGreaterThanOrEqual(5);
      const headerTexts: string[] = [];
      for (let i = 0; i < headerCount; i++) {
        headerTexts.push((await headers.nth(i).textContent())?.trim().toLowerCase() ?? '');
      }
      const allHeaders = headerTexts.join(' ');
      expect(allHeaders).toContain('guest');
      expect(allHeaders).toContain('status');
      expect(allHeaders).toContain('check');
    } else {
      await expect(
        page.locator('[data-testid="reservation-log-panel"] >> text="No orders found"')
      ).toBeVisible();
    }
  });
});
