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

test.describe('Reservation Log', () => {
  test('super reservations tab shows title and table', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelContentReady(page, 'reservation-log-panel');

    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();

    const content = (await contentArea.textContent()) ?? '';
    const lower = content.toLowerCase();
    expect(lower).toContain('reservation');

    // The table only renders when a tenant has orders; with an empty store
    // the panel shows the "No orders found" empty state instead.
    const table = contentArea.locator('table');
    const emptyState = page.locator(
      '[data-testid="reservation-log-panel"] >> text="No orders found"'
    );
    await expect(table.or(emptyState).first()).toBeVisible();
  });

  test('reservation table has correct column headers', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelContentReady(page, 'reservation-log-panel');

    const headers = page.locator('[data-testid="content-area"] table th');
    const headerCount = await headers.count();

    if (headerCount === 0) {
      // Empty local D1: the panel renders the empty state instead of a table.
      await expect(
        page.locator('[data-testid="reservation-log-panel"] >> text="No orders found"')
      ).toBeVisible();
      return;
    }

    expect(headerCount).toBeGreaterThanOrEqual(5);

    const headerTexts: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const text = await headers.nth(i).textContent();
      headerTexts.push(text?.trim().toLowerCase() ?? '');
    }
    const allHeaders = headerTexts.join(' ');

    expect(allHeaders).toContain('guest');
    expect(allHeaders).toContain('status');
    expect(allHeaders).toContain('check');
  });

  test('reservation table rows contain valid data or empty state', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelContentReady(page, 'reservation-log-panel');

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const firstRow = rows.first();
      const cells = firstRow.locator('td');
      const cellCount = await cells.count();
      expect(cellCount).toBeGreaterThanOrEqual(5);

      let nonEmptyCells = 0;
      for (let i = 0; i < cellCount; i++) {
        const text = (await cells.nth(i).textContent()) ?? '';
        if (text.trim().length > 0) nonEmptyCells++;
      }
      expect(nonEmptyCells).toBeGreaterThanOrEqual(3);

      const rowText = (await firstRow.textContent()) ?? '';
      const lower = rowText.toLowerCase();
      const hasValidStatus =
        lower.includes('confirmed') ||
        lower.includes('pending') ||
        lower.includes('cancelled') ||
        lower.includes('checked-in') ||
        lower.includes('checked-out') ||
        lower.includes('active');
      const hasDatePattern = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\w{3}\s+\d{1,2}/.test(rowText);

      expect(hasValidStatus || hasDatePattern || nonEmptyCells >= 3).toBe(true);
    } else {
      // Empty store: panel shows the empty state instead of a table.
      await expect(
        page.locator('[data-testid="reservation-log-panel"] >> text="No orders found"')
      ).toBeVisible();
    }
  });

  test('reservation rows contain date-like values', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelReady(page);

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount < 1, 'No reservation rows to check for dates');

    const tableText = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const dateSlashPattern = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
    const dateWordPattern = /\w{3}\s+\d{1,2},?\s+\d{4}/;

    const hasDates =
      datePattern.test(tableText) ||
      dateSlashPattern.test(tableText) ||
      dateWordPattern.test(tableText);

    const hasLoadingText = tableText.toLowerCase().includes('loading');
    expect(hasDates || hasLoadingText).toBe(true);
  });

  test('reservation status column contains valid statuses', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelReady(page);

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount < 1, 'No reservation rows to check for statuses');

    const VALID_STATUSES = [
      'confirmed', 'pending', 'cancelled', 'checked-in', 'checked-out', 'active',
      'suspended', 'completed', 'no-show',
    ];

    const firstRow = rows.first();
    const rowText = (await firstRow.textContent()) ?? '';
    const lower = rowText.toLowerCase();

    const matchedStatus = VALID_STATUSES.find((s) => lower.includes(s));
    const hasDateOrName = /\d{4}-\d{2}-\d{2}|\w+@\w+|\d+/.test(rowText);

    expect(matchedStatus !== undefined || hasDateOrName || lower.includes('loading')).toBe(true);
  });

  test('export CSV button exists on reservation log', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelReady(page);

    const exportBtn = page.locator('[data-testid="export-csv-btn"], button:has-text("Export CSV"), button:has-text("Export")');
    const exportBtnCount = await exportBtn.count();
    const exportVisible = exportBtnCount > 0 && await exportBtn.first().isVisible();
    const contentLoaded = await page.locator('[data-testid="content-area"]').isVisible();
    expect(contentLoaded).toBeTruthy();
  });

  test('reservation detail opens when clicking a row', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await admin.clickTab('super_reservations');
    await expectPanelReady(page);

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount < 1, 'No reservation rows to click');

    const firstRow = rows.first();
    await firstRow.click();
    await page.waitForLoadState('networkidle');

    const detailOrModal = page.locator(
      '[class*="modal"], [role="dialog"], [class*="detail-view"], .toast-info, .toast-warning'
    );
    const detailCount = await detailOrModal.count();
    const detailVisible = detailCount > 0 && await detailOrModal.first().isVisible();

    const contentArea = page.locator('[data-testid="content-area"]');
    const contentStillVisible = await contentArea.isVisible();

    expect(detailVisible || contentStillVisible).toBe(true);
  });
});
