import { test, expect } from '../../fixtures/coverage-fixture';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT, TEST_TENANT_ADMIN } from '../../fixtures/test-data';
import { expectPanelContentReady } from '../../fixtures/admin';

// T37 — blind tenant admin panels.
//
// Covers the 10 tenant panels the E2E audit (AUDIT_E2E_GAPS_FINDINGS.md)
// flagged as having no gateway test: calendar, analytics, staff, financials,
// hr, supply, crm, storefront, ai, billing.
//
// Gate-pass proof (per the audit's D5 criterion): deep-link into each panel
// as the tenant admin, wait for the lazy Suspense fallback ("Loading panel…")
// to disappear AND all aria-busy / loading-spinner markers to clear, then
// assert the panel's own root testid is visible with real content rendered.
//
// NOTE: /admin/analytics, /admin/storefront and /admin/billing are
// tenant-scoped reports that used to crash under SUPER admins (tenantless
// scope) — that constraint is why this suite always logs in as
// e2e-admin@test.com, never as the super admin.

const TENANT_ID = TEST_TENANT.id;

const PANELS: Array<[tab: string, panelTestId: string]> = [
  ['calendar', 'booking-calendar'],
  ['analytics', 'analytics-panel'],
  ['staff', 'staff-panel'],
  ['financials', 'financial-panel'],
  ['hr', 'hr-panel'],
  ['supply', 'supply-panel'],
  ['crm', 'crm-panel'],
  ['storefront', 'storefront-panel'],
  ['ai', 'ai-panel'],
  ['billing', 'billing-panel'],
];

async function openTenantPanel(
  page: import('@playwright/test').Page,
  tab: string,
): Promise<AdminDashboardPage> {
  const admin = new AdminDashboardPage(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.gotoTab(TENANT_ID, tab);
    if (await admin.isLoginOverlayVisible()) {
      await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
    }
    try {
      await expectPanelContentReady(page, 'content-area');
      return admin;
    } catch {
      if (attempt === 2) throw new Error(`Tenant panel ${tab} failed to open after ${attempt + 1} attempts`);
    }
  }
  return admin;
}

test.describe('Blind tenant admin panels — 10/10 render and load', () => {
  for (const [tab, panelTestId] of PANELS) {
    test(`panel ${tab} renders its own root with data loading finished`, async ({ page }) => {
      await openTenantPanel(page, tab);

      // Scoped to the panel root: the loading fallback must be gone and no
      // aria-busy / spinner marker may remain (D5 gate-pass proof).
      await expectPanelContentReady(page, panelTestId);

      const root = page.locator(`[data-testid="${panelTestId}"]`);
      await expect(root).toBeVisible();
      const text = (await root.textContent()) ?? '';
      expect(text).not.toContain('Loading panel…');

      // Version pin: every panel must report a title header so a future
      // regression renders *something* instead of an empty shell.
      expect(text.trim().length).toBeGreaterThan(0);
    });
  }
});