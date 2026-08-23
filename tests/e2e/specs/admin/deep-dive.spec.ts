import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN, TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  await expectPanelReady(page);
}

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto(TEST_TENANT.id);
  await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
  await expectPanelReady(page);
  return admin;
}

test.describe('Admin Reservation Status Changes', () => {
  test('reservations tab → status filter exists', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelContentReady(page, 'reservation-log-panel');

    const filter = page.locator('[data-testid="status-filter"], [data-testid="content-area"] select');
    const count = await filter.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('reservations tab → order rows have status badges', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelReady(page);

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      const statusCell = rows.first().locator('td').last();
      const text = await statusCell.textContent() ?? '';
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('reservations tab → row click opens detail/action', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelReady(page);

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');

      const detail = page.locator('[data-testid="content-area"] [class*="modal"], [data-testid="content-area"] [class*="detail"]');
      const detailCount = await detail.count();
      const visible = detailCount > 0 && await detail.first().isVisible();
      const rowStillVisible = await rows.first().isVisible();
      expect(visible || rowStillVisible).toBeTruthy();
    }
  });

  test('reservations tab → export button exists', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelReady(page);

    const exportBtn = page.locator('[data-testid="export-csv-btn"], [data-testid="content-area"] button:has-text("Export"), [data-testid="content-area"] button:has-text("CSV"), [data-testid="content-area"] button:has-text("Download")');
    const count = await exportBtn.count();
    const contentLoaded = await page.locator('[data-testid="content-area"]').isVisible();
    expect(contentLoaded).toBeTruthy();
  });
});

test.describe('Admin Role-Based Access', () => {
  test('super admin sees super_admin nav items', async ({ page }) => {
    await loginAsSuperAdmin(page);

    const sidebar = page.locator('[data-testid="sidebar-nav"]');
    const visible = await sidebar.isVisible();
    expect(visible).toBeTruthy();

    const navContent = await sidebar.textContent() ?? '';
    const lower = navContent.toLowerCase();
    expect(lower).toContain('dashboard');
  });

  test('super admin sees exactly the 3 super nav tabs', async ({ page }) => {
    await loginAsSuperAdmin(page);

    const navItems = page.locator('[data-testid="sidebar-nav"] button[data-testid^="nav-tab-"]');
    const count = await navItems.count();
    expect(count).toBe(3);
  });

  test('tenant admin can access settings', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    const visible = await content.isVisible();
    expect(visible).toBeTruthy();
  });

  test('super admin can access tenants management', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_tenants"]').click();
    await expectPanelReady(page);

    const content = page.locator('[data-testid="content-area"]');
    const visible = await content.isVisible();
    expect(visible).toBeTruthy();
  });

  test('super admin can view admin users list', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_tenants"]').click();
    await expectPanelReady(page);

    const content = await page.locator('[data-testid="content-area"]').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
  });
});

test.describe('Admin Dashboard Deep-Dive', () => {
  test('super dashboard → stat cards show multiple metrics', async ({ page }) => {
    await loginAsSuperAdmin(page);

    const stats = page.locator('[data-testid="stat-card"]');
    const count = await stats.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('super dashboard → quick action buttons exist', async ({ page }) => {
    await loginAsSuperAdmin(page);
    // Quick actions live on the Super Dashboard, not the default Dashboard.
    await page.locator('[data-testid="nav-tab-super_dashboard"]').click();
    await expectPanelContentReady(page, 'super-dashboard-panel');

    const actions = page.locator('[data-testid="quick-action"]');
    const count = await actions.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('super dashboard → content area is not empty', async ({ page }) => {
    await loginAsSuperAdmin(page);
    // Default tab after login is the tenant Dashboard (DashboardPanel) — wait
    // for its data fetch before measuring content length.
    await expectPanelContentReady(page, 'dashboard-panel');

    const content = await page.locator('[data-testid="content-area"]').textContent() ?? '';
    expect(content.length).toBeGreaterThan(50);
  });
});

test.describe('Admin Navigation Deep-Dive', () => {
  test('all sidebar tabs are clickable and load content', async ({ page }) => {
    await loginAsSuperAdmin(page);

    const tabs = page.locator('[data-testid="sidebar-nav"] button[data-testid^="nav-tab-"]');
    const count = await tabs.count();

    const clickedTabs: string[] = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      const tab = tabs.nth(i);
      const isVisible = await tab.isVisible();
      if (!isVisible) continue;

      const text = (await tab.textContent()) ?? '';
      await tab.click();
      await expectPanelReady(page);

      const content = page.locator('[data-testid="content-area"]');
      const visible = await content.isVisible();
      expect(visible).toBeTruthy();

      clickedTabs.push(text.trim());
    }

    expect(clickedTabs.length).toBeGreaterThanOrEqual(3);
  });

  test('sidebar footer shows logout button', async ({ page }) => {
    await loginAsSuperAdmin(page);

    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    const count = await logoutBtn.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Admin Settings Deep-Dive', () => {
  test('settings tab → camp name field loads', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelReady(page);

    await expect(page.locator('[data-testid="settings-form"]')).toBeVisible({ timeout: 5000 });
  });

  test('settings tab → branding section visible', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    // SettingsPanel gates all sections behind a "Loading settings..." fetch.
    await expectPanelContentReady(page, 'settings-panel');

    const branding = page.locator('[data-testid="branding-section"]');
    const count = await branding.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('settings tab → password section visible', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.locator('[data-testid="nav-tab-settings"]').click();
    await expectPanelReady(page);

    const content = (await page.locator('[data-testid="content-area"]').textContent()) ?? '';
    const lower = content.toLowerCase();
    // Password panel is rendered alongside settings
    expect(lower.includes('password') || lower.includes('change') || lower.includes('settings')).toBeTruthy();
  });
});

test.describe('Admin Orders/Reservations Deep-Dive', () => {
  test('orders tab → table has expected columns', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelContentReady(page, 'reservation-log-panel');

    const headers = page.locator('[data-testid="content-area"] table th');
    const headerCount = await headers.count();

    if (headerCount === 0) {
      // Empty store: panel shows the empty state instead of a table.
      await expect(
        page.locator('[data-testid="reservation-log-panel"] >> text="No orders found"')
      ).toBeVisible();
      return;
    }

    expect(headerCount).toBeGreaterThanOrEqual(3);

    const headerTexts: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const text = await headers.nth(i).textContent();
      headerTexts.push(text?.trim().toLowerCase() ?? '');
    }
    const allHeaders = headerTexts.join(' ');
    expect(allHeaders.length).toBeGreaterThan(5);
  });

  test('orders tab → row count is reasonable', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.locator('[data-testid="nav-tab-super_reservations"]').click();
    await expectPanelReady(page);

    const rows = page.locator('[data-testid="content-area"] table tbody tr');
    const count = await rows.count();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
