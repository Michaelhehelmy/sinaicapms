import { test, expect } from '../../fixtures/coverage-fixture';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelContentReady } from '../../fixtures/admin';

// T37 — blind super-admin panels.
//
// Covers the 13 super panels the E2E audit (AUDIT_E2E_GAPS_FINDINGS.md)
// flagged as having no gateway test: super_users, super_settings, super_audit,
// super_subscriptions, super_financials, super_hr, super_supply, super_crm,
// super_storefront, super_ai, super_reports, super_health, super_performance.
//
// Super panels deep-link through the marketplace admin shell
// (/admin/<tab>?tenant=marketplace).
//
// Marker selection notes (root testids vary by panel):
//   - super_financials → super-financials-panel (aria-busy; payouts section)
//   - super_settings → SystemSettingsPanel has NO root testid and opens on
//     the Feature Flags tab; its distinctive field (setting-platform-name)
//     lives in the Branding tab, so the test clicks that tab first
//   - super_audit → AuditLogPanel exposes only audit-export-btn
//   - super_subscriptions → SubscriptionsPanel has NO data-testids at all —
//     assert on the rendered subscription copy inside content-area
//   - all others → their own panel root testid

interface PanelSpec {
  tab: string;
  panelTestId?: string;
  markerSelector?: string;
  markerText?: RegExp;
  preClickLabel?: string;
}

const PANELS: PanelSpec[] = [
  { tab: 'super_users', panelTestId: 'users-panel' },
  { tab: 'super_financials', panelTestId: 'super-financials-panel' },
  { tab: 'super_hr', panelTestId: 'super-hr-panel' },
  { tab: 'super_supply', panelTestId: 'super-supply-panel' },
  { tab: 'super_crm', panelTestId: 'super-crm-panel' },
  { tab: 'super_storefront', panelTestId: 'super-storefront-panel' },
  { tab: 'super_ai', panelTestId: 'super-ai-panel' },
  { tab: 'super_reports', panelTestId: 'super-reports-panel' },
  { tab: 'super_health', panelTestId: 'system-health-panel' },
  { tab: 'super_performance', panelTestId: 'tenant-performance-panel' },
  { tab: 'super_settings', markerSelector: '[data-testid="setting-platform-name"]', preClickLabel: 'Branding' },
  { tab: 'super_audit', markerSelector: '[data-testid="audit-export-btn"]' },
  { tab: 'super_subscriptions', markerText: /[Ss]ubscription/ },
];

async function openSuperPanel(
  page: import('@playwright/test').Page,
  tab: string,
): Promise<AdminDashboardPage> {
  const admin = new AdminDashboardPage(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.gotoTab('marketplace', tab);
    if (await admin.isLoginOverlayVisible()) {
      await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
    }
    try {
      await expectPanelContentReady(page, 'content-area');
      return admin;
    } catch {
      if (attempt === 2) throw new Error(`Super panel ${tab} failed to open after ${attempt + 1} attempts`);
    }
  }
  return admin;
}

test.describe('Blind super-admin panels — 13/13 render and load', () => {
  for (const { tab, panelTestId, markerSelector, markerText, preClickLabel } of PANELS) {
    test(`panel ${tab} renders with data loading finished`, async ({ page }) => {
      await openSuperPanel(page, tab);

      if (panelTestId) {
        await expectPanelContentReady(page, panelTestId);
        const root = page.locator(`[data-testid="${panelTestId}"]`);
        await expect(root).toBeVisible();
        const text = (await root.textContent()) ?? '';
        expect(text).not.toContain('Loading panel…');
        expect(text.trim().length).toBeGreaterThan(0);
      } else if (markerSelector) {
        // Panels without a root testid: prove the panel replaced the loading
        // fallback and its distinctive control is wired. For panels whose
        // target control sits behind an internal tab (SystemSettingsPanel's
        // Branding tab), click through first.
        await expectPanelContentReady(page, 'content-area');
        if (preClickLabel) {
          await page.getByRole('button', { name: preClickLabel }).click();
        }
        await expect(page.locator(markerSelector)).toBeVisible({ timeout: 10_000 });
      } else {
        // SubscriptionsPanel has no testids — assert on visible copy.
        await expectPanelContentReady(page, 'content-area');
        const content = page.locator('[data-testid="content-area"]');
        await expect(content).toContainText(markerText as RegExp, { timeout: 10_000 });
      }
    });
  }
});