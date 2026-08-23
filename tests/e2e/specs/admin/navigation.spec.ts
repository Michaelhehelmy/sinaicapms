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

test.describe('Admin Navigation', () => {
  test('super admin sees all expected tabs', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    const tabButtons = page.locator('[data-testid="sidebar-nav"] button[data-testid^="nav-tab-"]');
    const tabCount = await tabButtons.count();
    // T6: super-admin nav is separated — exactly the 3 super panels, no tenant tabs.
    expect(tabCount).toBe(3);

    const tabNames: string[] = [];
    for (let i = 0; i < tabCount; i++) {
      const testId = await tabButtons.nth(i).getAttribute('data-testid');
      if (testId) tabNames.push(testId.replace('nav-tab-', ''));
    }

    expect(tabNames).toContain('super_dashboard');
    expect(tabNames).toContain('super_tenants');
    expect(tabNames).toContain('super_reservations');
    // Tenant 'dashboard' tab must NOT leak into the super-admin nav.
    expect(tabNames).not.toContain('dashboard');
  });

  test('clicking each tab changes content area', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    const tabButtons = page.locator('[data-testid="sidebar-nav"] button[data-testid^="nav-tab-"]');
    const tabCount = await tabButtons.count();

    for (let i = 0; i < tabCount; i++) {
      const testId = await tabButtons.nth(i).getAttribute('data-testid');
      if (!testId) continue;
      const tabName = testId.replace('nav-tab-', '');

      await admin.clickTab(tabName);
      await expectPanelReady(page);

      const contentArea = page.locator('[data-testid="content-area"]');
      await expect(contentArea).toBeVisible();

      const content = await contentArea.textContent();
      expect(content).toBeTruthy();
      expect((content?.trim().length ?? 0)).toBeGreaterThan(0);
    }
  });

  test('mobile toggle shows and hides sidebar', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.locator('[data-testid="mobile-toggle"]').waitFor({ state: 'attached', timeout: 5000 });

    const toggleBtn = page.locator('[data-testid="mobile-toggle"]');
    const sidebar = page.locator('[data-testid="admin-sidebar"]');

    // The sidebar is hidden/shown via a CSS transform (`-translate-x-full` vs
    // `translate-x-0`), so Playwright `isVisible()` returns true in BOTH states
    // (any non-empty bounding box counts as visible). Assert the box x-position
    // instead: closed = off-screen (x < 0), open = on-screen (x === 0).
    const sidebarX = async () =>
      (await sidebar.boundingBox()).x;

    if (await toggleBtn.count() > 0 && await toggleBtn.isVisible()) {
      const beforeX = await sidebarX();
      await toggleBtn.click();
      // The sidebar animates with `transition-transform duration-200`, so poll
      // until the open state settles (x === 0) rather than trusting networkidle.
      await expect.poll(async () => Math.round((await sidebar.boundingBox()).x), { timeout: 3000 }).toBe(0);
      const afterX = await sidebarX();
      expect(afterX).not.toBe(beforeX);
      expect(Math.round(afterX)).toBe(0);
    } else {
      await expect(page.locator('[data-testid="content-area"]')).toBeVisible();
    }
  });

  test('logout returns to login overlay', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    await expect(page.locator('[data-testid="content-area"]')).toBeVisible();

    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Wait for login overlay or content area to disappear
    try {
      await page.locator('[data-testid="login-overlay"]').waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // Overlay might not appear immediately — check content area instead
    }

    const loginVisible = await page.locator('[data-testid="login-overlay"]').isVisible();
    const contentHidden = await page.locator('[data-testid="content-area"]').isHidden();
    expect(loginVisible || contentHidden).toBeTruthy();
  });

  test('sidebar shows branding in header', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    await expect(page.locator('text=/SinaiCamps|Management Panel/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('tab switching uses pushState (no page reload) and updates the URL', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    const tabButtons = page.locator('[data-testid="sidebar-nav"] button[data-testid^="nav-tab-"]');
    const tabCount = await tabButtons.count();
    expect(tabCount).toBeGreaterThan(1);

    const firstTestId = await tabButtons.nth(0).getAttribute('data-testid');
    const secondTestId = await tabButtons.nth(1).getAttribute('data-testid');
    const firstTab = firstTestId?.replace('nav-tab-', '');
    const secondTab = secondTestId?.replace('nav-tab-', '');

    if (firstTab && secondTab) {
      await admin.clickTab(firstTab);
      await expectPanelReady(page);
      // Phase 7 baseline: one document navigation (the initial goto).
      const navigationCountBefore = await page.evaluate(
        () => performance.getEntriesByType('navigation').length,
      );
      await expect(page).toHaveURL(new RegExp(`/admin/${firstTab}(\\?|$)`));

      await admin.clickTab(secondTab);
      await expectPanelReady(page);

      // pushState must NOT create a new document — the navigation-entry count
      // stays at 1 (a full reload would append a second entry).
      const navigationCountAfter = await page.evaluate(
        () => performance.getEntriesByType('navigation').length,
      );
      expect(navigationCountAfter).toBe(navigationCountBefore);
      await expect(page).toHaveURL(new RegExp(`/admin/${secondTab}(\\?|$)`));
      await expect(page.locator('[data-testid="content-area"]')).toBeVisible();
    }
  });

  test('legacy #tab= deep links still resolve during the Phase 7 migration window', async ({ page }) => {
    // Pre-kernel bookmarks used `/admin#tab=<tab>`; AdminApp's parseHashTab
    // fallback keeps them working until hash routing is fully retired.
    await page.goto('/admin?tenant=marketplace#tab=super_tenants', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();
    await expectPanelReady(page);
    await expect(page.locator('[data-testid="super-tenants-panel"]')).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar footer has logout button', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    await expect(page.locator('[data-testid="logout-btn"]')).toBeVisible({ timeout: 5000 });
  });
});
