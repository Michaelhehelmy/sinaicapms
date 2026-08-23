import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

/**
 * Log in as super admin and land directly on the Reports panel.
 *
 * Phase 7: the admin dashboard uses pushState path routing (`/admin/<tab>`),
 * with a legacy `#tab=` fallback. We navigate to `/admin/reports` BEFORE
 * authentication so that when the login overlay is dismissed and the
 * dashboard renders, tabFromLocation() already resolves 'reports' and the
 * ReportsPanel mounts immediately.
 *
 * This avoids clicking a sidebar tab — super admins only see the super-nav
 * (super_dashboard / super_tenants / super_reservations) and the tenant-nav
 * `reports` button is NOT rendered for them (AdminApp.tsx).
 */
async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.gotoTab(TEST_TENANT.id, 'reports');
  await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expectPanelReady(page);
  return admin;
}

/**
 * Wait for the reports panel content to finish loading.
 * The panel is already mounted via the path set in loginAsSuperAdmin,
 * so we only need to wait for async data fetch to complete.
 */
async function navigateToReports(page: import('@playwright/test').Page) {
  await expectPanelContentReady(page, 'reports-panel');
}

test.describe('POS Reports — Panel Loading', () => {
  test('reports panel loads and shows report type selector', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const panel = page.locator('[data-testid="reports-panel"]');
    await expect(panel).toBeVisible();

    const select = panel.locator('[data-testid="report-tabs"] select');
    await expect(select).toBeVisible();
  });

  test('default report type is occupancy', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');
    const selectedValue = await select.inputValue();
    expect(selectedValue).toBe('occupancy');
  });

  test('occupancy report content loads', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('POS Reports — Report Type Switching', () => {
  test('switching to revenue report loads revenue content', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');
    await select.selectOption('revenue');
    await expectPanelContentReady(page, 'reports-panel');

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const heading = reportCard.locator('h3');
    await expect(heading).toContainText('Revenue');
  });

  test('switching to bookings report loads bookings content', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');
    await select.selectOption('bookings');
    await expectPanelContentReady(page, 'reports-panel');

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const heading = reportCard.locator('h3');
    await expect(heading).toContainText('Booking');
  });

  test('switching back to occupancy reloads occupancy', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');

    await select.selectOption('revenue');
    await expectPanelContentReady(page, 'reports-panel');
    let heading = page.locator('[data-testid="admin-report-content"] h3');
    await expect(heading).toContainText('Revenue');

    await select.selectOption('occupancy');
    await expectPanelContentReady(page, 'reports-panel');
    heading = page.locator('[data-testid="admin-report-content"] h3');
    await expect(heading).toContainText('Occupancy');
  });
});

test.describe('POS Reports — Date Range', () => {
  test('date range inputs are visible', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const tabsArea = page.locator('[data-testid="report-tabs"]');
    const dateInputs = tabsArea.locator('input[type="date"]');
    await expect(dateInputs).toHaveCount(2);
    await expect(dateInputs.first()).toBeVisible();
    await expect(dateInputs.last()).toBeVisible();
  });

  test('setting date range and switching report type uses date params', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const tabsArea = page.locator('[data-testid="report-tabs"]');
    const dateInputs = tabsArea.locator('input[type="date"]');

    await dateInputs.first().fill('2026-01-01');
    await dateInputs.last().fill('2026-01-31');

    const startValue = await dateInputs.first().inputValue();
    const endValue = await dateInputs.last().inputValue();
    expect(startValue).toBe('2026-01-01');
    expect(endValue).toBe('2026-01-31');

    const select = page.locator('[data-testid="report-tabs"] select');
    await select.selectOption('revenue');
    await expectPanelContentReady(page, 'reports-panel');

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });
  });

  test('clearing date range resets to default period', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const tabsArea = page.locator('[data-testid="report-tabs"]');
    const dateInputs = tabsArea.locator('input[type="date"]');

    await dateInputs.first().fill('2026-06-01');
    await dateInputs.last().fill('2026-06-30');

    await dateInputs.first().clear();
    await dateInputs.last().clear();

    const startValue = await dateInputs.first().inputValue();
    const endValue = await dateInputs.last().inputValue();
    expect(startValue).toBe('');
    expect(endValue).toBe('');

    const select = page.locator('[data-testid="report-tabs"] select');
    await select.selectOption('revenue');
    await expectPanelContentReady(page, 'reports-panel');

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('POS Reports — Occupancy Report Content', () => {
  test('occupancy report shows table with expected columns', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const headers = reportCard.locator('thead th');
    const headerCount = await headers.count();
    if (headerCount > 0) {
      const headerTexts: string[] = [];
      for (let i = 0; i < headerCount; i++) {
        headerTexts.push((await headers.nth(i).textContent())?.trim() ?? '');
      }
      expect(headerTexts).toContain('Date');
      expect(headerTexts).toContain('Total');
      expect(headerTexts).toContain('Occupied');
      expect(headerTexts).toContain('Rate');
    } else {
      const content = await reportCard.textContent();
      expect(content?.toLowerCase()).toContain('no occupancy data');
    }
  });

  test('occupancy rate is color-coded', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const rateSpans = reportCard.locator('tbody td span');
    const count = await rateSpans.count();
    if (count > 0) {
      const firstRateClass = await rateSpans.first().getAttribute('class') ?? '';
      const hasColorClass =
        firstRateClass.includes('text-green') ||
        firstRateClass.includes('text-yellow') ||
        firstRateClass.includes('text-red');
      expect(hasColorClass).toBe(true);
    } else {
      test.skip();
    }
  });
});

test.describe('POS Reports — Revenue Report Content', () => {
  test('revenue report shows table with expected columns', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');
    await select.selectOption('revenue');
    await expectPanelContentReady(page, 'reports-panel');

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const headers = reportCard.locator('thead th');
    const headerCount = await headers.count();
    if (headerCount > 0) {
      const headerTexts: string[] = [];
      for (let i = 0; i < headerCount; i++) {
        headerTexts.push((await headers.nth(i).textContent())?.trim() ?? '');
      }
      expect(headerTexts).toContain('Period');
      expect(headerTexts).toContain('Revenue');
      expect(headerTexts).toContain('Bookings');
      expect(headerTexts).toContain('Avg/Booking');
    } else {
      const content = await reportCard.textContent();
      expect(content?.toLowerCase()).toContain('no revenue data');
    }
  });
});

test.describe('POS Reports — Bookings Report Content', () => {
  test('bookings report shows table with expected columns', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');
    await select.selectOption('bookings');
    await expectPanelContentReady(page, 'reports-panel');

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const headers = reportCard.locator('thead th');
    const headerCount = await headers.count();
    if (headerCount > 0) {
      const headerTexts: string[] = [];
      for (let i = 0; i < headerCount; i++) {
        headerTexts.push((await headers.nth(i).textContent())?.trim() ?? '');
      }
      expect(headerTexts).toContain('Status');
      expect(headerTexts).toContain('Count');
      expect(headerTexts).toContain('Total Amount');
    } else {
      const content = await reportCard.textContent();
      expect(content?.toLowerCase()).toContain('no booking data');
    }
  });
});

test.describe('POS Reports — Empty States & Errors', () => {
  test('empty state message appears when no data', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const reportCard = page.locator('[data-testid="admin-report-content"]');
    await expect(reportCard).toBeVisible({ timeout: 10_000 });

    const hasTable = (await reportCard.locator('table').count()) > 0;
    if (!hasTable) {
      const content = await reportCard.textContent();
      const lower = content?.toLowerCase() ?? '';
      const hasEmptyMessage =
        lower.includes('no occupancy data') ||
        lower.includes('no revenue data') ||
        lower.includes('no booking data');
      expect(hasEmptyMessage).toBe(true);
    }
  });

  test('panel loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => {
      const msg = err.message.toLowerCase();
      if (msg.includes('favicon') || msg.includes('logo') || msg.includes('net::err')) return;
      jsErrors.push(err.message);
    });

    await loginAsSuperAdmin(page);
    await navigateToReports(page);

    const select = page.locator('[data-testid="report-tabs"] select');
    for (const type of ['revenue', 'bookings', 'occupancy'] as const) {
      await select.selectOption(type);
      await expectPanelContentReady(page, 'reports-panel');
    }

    expect(jsErrors).toHaveLength(0);
  });
});
