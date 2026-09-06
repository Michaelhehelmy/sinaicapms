import { test, expect } from '../../fixtures/coverage-fixture';
import type { Page } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelContentReady } from '../../fixtures/admin';
import { superAdminLogin, apiRequest } from '../../utils/api-helpers';

// T39 — SuperFinancialsPanel payouts ledger, panel-level contract coverage.
//
// The super-financials panel's Payouts section talks to the /api/admin/payouts*
// family through the app client (app/src/lib/api.ts). A FE↔BE contract drift
// (e.g. the client calling /admin/financials/payouts/:id/paid while the backend
// mounts /admin/payouts/:id/pay) would surface as a 404 on every query — an
// EmptyState that never resolves, row clicks that toast "Failed to load payout
// details", and console/network errors. None of that is visible to the API-level
// specs (payments-offline.spec.ts, payouts.spec.ts), which talk to the backend
// directly, so this spec drives the REAL admin UI as super admin:
//
//   1. opens the super_financials tab through the marketplace admin shell and
//      waits for the panel AND its async payouts query to finish,
//   2. asserts the Payouts ledger renders: DataTable rows + click-through
//      detail card when payouts exist, or the EmptyState when they don't,
//   3. asserts zero console/page/network errors while the ledger loads — the
//      actual contract guarantee (no 404/401/500 on /admin/payouts* +
//      /admin/financials/* while the panel renders).
//
// The branch is decided in beforeAll by probing the SAME query the panel
// issues (GET /api/admin/payouts?page=1&pageSize=20). Locally no marketplace
// capture can exist offline (Paymob is disabled and no API seeds
// marketplace_payments), so the empty-state branch is the deterministic
// offline path and the list/detail branch exercises seeded/on-gateway DBs.

const PANEL_TESTID = 'super-financials-panel';
const PANEL_TAB = 'super_financials';

let hasPayouts = false;

test.beforeAll(async () => {
  const token = await superAdminLogin();
  // Same request the panel issues via getAdminPayouts (default page 1 /
  // pageSize 20 / no status filter). A non-2xx here is itself a contract
  // break — fail loudly so the drift is reported by the gate, not masked.
  const res = await apiRequest('GET', '/api/admin/payouts?page=1&pageSize=20', undefined, {
    Authorization: `Bearer ${token}`,
  });
  if (!res.ok) {
    throw new Error(`payout list API probe failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const list = (body?.data ?? []) as Array<{ id: string }>;
  hasPayouts = list.length > 0;
  console.log(`  SuperFinancialsPanel payouts probe: ${list.length} payout(s) -> ${hasPayouts ? 'list/detail' : 'empty-state'} branch`);
});

async function openSuperFinancialsPanel(page: Page): Promise<AdminDashboardPage> {
  const admin = new AdminDashboardPage(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.gotoTab('marketplace', PANEL_TAB);
    if (await admin.isLoginOverlayVisible()) {
      await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
    }
    try {
      // Polls out the panel-level aria-busy, DataTable busy state, and any
      // loading-spinner (including "Loading payouts..." / "Loading marketplace
      // payments...") so the payouts ledger is rendered before we assert.
      await expectPanelContentReady(page, PANEL_TESTID, 15_000);
      return admin;
    } catch {
      if (attempt === 2) throw new Error(`SuperFinancialsPanel (${PANEL_TAB}) failed to open after ${attempt + 1} attempts`);
    }
  }
  return admin;
}

test.describe('SuperFinancialsPanel — payouts ledger (panel-level contract)', () => {
  test('super financials panel opens and the Payouts ledger section renders', async ({ page }) => {
    await openSuperFinancialsPanel(page);
    const panel = page.locator(`[data-testid="${PANEL_TESTID}"]`);
    await expect(panel).toBeVisible();
    const text = (await panel.textContent()) ?? '';
    expect(text).not.toContain('Loading panel…');
    expect(text).not.toContain('Loading payout');
    // The Payouts ledger header + subtitle are always rendered (the section is
    // not gated on data presence — only the stats cards and DataTable are).
    // exact: true — getByRole `name` substring-matches by default and would
    // also catch the `<h3>No payouts found</h3>` empty-state heading.
    await expect(panel.getByRole('heading', { name: 'Payouts', exact: true })).toBeVisible();
    await expect(panel.getByText('Settlement payouts owed to tenants')).toBeVisible();
  });

  test('payout list renders rows and opens the detail view when a payout exists', async ({ page }) => {
    test.skip(!hasPayouts, 'no payout rows exist in this environment — the empty-state branch covers the drift check');
    await openSuperFinancialsPanel(page);
    const panel = page.locator(`[data-testid="${PANEL_TESTID}"]`);

    // The payouts DataTable is the last `.overflow-x-auto table` in the panel
    // before the detail card mounts (marketplace breakdown → payments ledger →
    // payouts ledger → detail). Assert rows rendered, then click the first one.
    const payoutsTable = panel.locator('.overflow-x-auto table').last();
    await expect(payoutsTable.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
    await payoutsTable.locator('tbody tr').first().click();

    // Row click issues getAdminPayout(payout.id) → GET /api/admin/payouts/:id
    // and mounts the payout-detail card.
    await expect(panel.getByTestId('payout-detail')).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole('heading', { name: 'Payout Line Items' })).toBeVisible();
  });

  test('payouts empty state renders with zero console or network errors', async ({ page }) => {
    test.skip(hasPayouts, 'payout rows exist — the list/detail branch covers this path');
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // NOTE: SuperFinancialsPanel logs a KNOWN React missing-key warning on
      // every render (pre-existing FE defect in app/src/components/admin/
      // SuperFinancialsPanel.tsx, surfaced by this spec but out of scope of the
      // T39 test-only change). Tolerate exactly that warning; any other console
      // error — including a key warning from any OTHER component — still fails.
      if (
        text.startsWith('Each child in a list should have a unique "key" prop.') &&
        text.includes('SuperFinancialsPanel')
      ) {
        return;
      }
      errors.push(`[console] ${text}`);
    });
    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/api/')) {
        errors.push(`[http ${res.status()}] ${res.url()}`);
      }
    });

    await openSuperFinancialsPanel(page);
    const panel = page.locator(`[data-testid="${PANEL_TESTID}"]`);

    // Payout-specific EmptyState copy (distinct from the payments ledger's
    // "No marketplace payments found").
    await expect(panel.getByText('No settlement payouts match the current filter.')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('No payouts found')).toBeVisible();

    // The real contract guard: the panel's api.ts payout calls
    // (/admin/payouts*), the financials ledger calls (/admin/financials/*) and
    // the tenants load must all succeed — a 404/401/500 here is FE↔BE drift.
    expect(errors).toEqual([]);
  });
});