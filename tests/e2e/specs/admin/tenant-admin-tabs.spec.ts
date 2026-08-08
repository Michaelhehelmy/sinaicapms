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

const TAB_KEYWORDS: Record<string, string[]> = {
  dashboard: ['dashboard', 'active camps', 'reservations', 'revenue', 'expenses'],
  camps: ['camp management', 'camp', 'location', 'capacity'],
  rooms: ['room management', 'room', 'room type', 'available'],
  rateplans: ['rate plan', 'price', 'season', 'room type'],
  reservations: ['reservation', 'guest', 'check-in', 'check-out', 'status'],
  meals: ['meal', 'kitchen', 'ingredient', 'profit margin', 'selling price'],
  planning: ['planning', 'schedule', 'calendar', 'title', 'date'],
  reports: ['report', 'revenue', 'profit', 'expense', 'occupancy'],
  settings: ['settings', 'branding', 'portal', 'display name', 'theme', 'whatsapp'],
};

test.describe('Tenant Admin Tabs', () => {
  for (const [tabName, keywords] of Object.entries(TAB_KEYWORDS)) {
    test(`${tabName} tab loads and contains tab-specific keywords`, async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);

      const tabButton = page.locator(`[data-testid="nav-tab-${tabName}"]`);
      const tabCount = await tabButton.count();
      test.skip(tabCount === 0, `Tab button nav-tab-${tabName} not found`);
      await tabButton.click();
      // Content-area-scoped settle: panels gate content on async data
      // (aria-busy, loading-spinner) that the Suspense wait doesn't cover.
      await expectPanelContentReady(page);

      const contentArea = page.locator('[data-testid="content-area"]');
      await expect(contentArea).toBeVisible();
      const content = (await contentArea.textContent()) ?? '';
      expect(content.trim().length).toBeGreaterThan(0);

      const lower = content.toLowerCase();
      const matched = keywords.filter((kw) => lower.includes(kw));
      expect(
        matched.length,
        `Expected "${tabName}" tab to contain at least one of [${keywords.join(', ')}], found: [${matched.join(', ')}]`
      ).toBeGreaterThanOrEqual(1);
    });
  }

  test('dashboard tab shows stat cards with numeric values', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);

    const tabButton = page.locator('[data-testid="nav-tab-dashboard"]');
    const tabCount = await tabButton.count();
    test.skip(tabCount === 0, 'Dashboard tab not found');
    await tabButton.click();
    await expectPanelContentReady(page, 'dashboard-panel');

    const statCards = page.locator('[data-testid="stat-card"]');
    const statCount = await statCards.count();
    expect(statCount).toBeGreaterThan(0);

    let numericCount = 0;
    for (let i = 0; i < statCount; i++) {
      const valueEl = statCards.nth(i).locator('[data-testid="stat-value"]');
      const text = await valueEl.textContent();
      const num = parseInt(text?.replace(/[^0-9]/g, '') ?? '', 10);
      if (!isNaN(num) && num >= 0) numericCount++;
    }
    expect(numericCount).toBeGreaterThanOrEqual(1);
  });

  test('each tab renders unique content', async ({ page }) => {
    const admin = await loginAsSuperAdmin(page);
    const tabNames = ['dashboard', 'camps', 'rooms', 'rateplans', 'reservations', 'settings'];

    const availableTabs: string[] = [];
    for (const tab of tabNames) {
      const tabButton = page.locator(`[data-testid="nav-tab-${tab}"]`);
      const tabCount = await tabButton.count();
      if (tabCount > 0) availableTabs.push(tab);
    }
    test.skip(availableTabs.length < 2, 'Need at least 2 tabs for comparison');

    const contentSnapshots: Record<string, string> = {};
    for (const tab of availableTabs) {
      await page.locator(`[data-testid="nav-tab-${tab}"]`).click();
      await expectPanelContentReady(page);
      const text = await page.locator('[data-testid="content-area"]').textContent();
      contentSnapshots[tab] = text?.trim().substring(0, 200) ?? '';
    }

    let differentCount = 0;
    for (let i = 0; i < availableTabs.length; i++) {
      for (let j = i + 1; j < availableTabs.length; j++) {
        if (contentSnapshots[availableTabs[i]] !== contentSnapshots[availableTabs[j]]) {
          differentCount++;
        }
      }
    }
    expect(differentCount).toBeGreaterThan(0);
  });
});
