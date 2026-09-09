import { test, expect } from '../../fixtures/coverage-fixture';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';

const MARKETPLACE = 'http://localhost:4320';

/**
 * Human-testing debug feedback widget — smoke coverage.
 *
 * The widget ships on three surfaces:
 *   - public pages: SSR-gated on the `sc_debug` cookie / `?debug=1` query so
 *     normal visitors ship zero extra JS (see PublicLayout.astro)
 *   - admin SPA: always mounted inside AdminShell
 *   - POS SPA: always mounted inside PosShell
 *
 * This spec verifies the public gate (hidden by default, visible after
 * `?debug=1`), a full end-to-end public submission reaching the backend, and
 * the admin submit + the super-admin Feedback panel tab actually rendering
 * (validates the AdminApp `super_feedback` registration).
 */
test.describe('Debug Feedback Widget', () => {

  test('public marketplace: widget stays hidden without ?debug=1', async ({ page }) => {
    await page.goto(`${MARKETPLACE}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="debug-feedback-open"]')).toHaveCount(0, { timeout: 8_000 });
  });

  test('public marketplace: ?debug=1 reveals the widget and submits a report', async ({ page }) => {
    await page.goto(`${MARKETPLACE}/?debug=1`, { waitUntil: 'domcontentloaded' });

    // client:visible island — fixed-position button hydrates as soon as the
    // island intersects; give hydration time.
    const open = page.locator('[data-testid="debug-feedback-open"]');
    await expect(open).toBeVisible({ timeout: 15_000 });
    await open.click();

    const modal = page.locator('[data-testid="debug-feedback-modal"]');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    await page.locator('[data-testid="debug-feedback-category-flow"]').check();
    await page.locator('[data-testid="debug-feedback-message"]').fill('E2E smoke: public widget submission');
    await page.locator('[data-testid="debug-feedback-personal-view"]').fill('Automated smoke test from the public surface.');

    await page.locator('[data-testid="debug-feedback-submit"]').click();
    await expect(page.locator('[data-testid="debug-feedback-done"]')).toBeVisible({ timeout: 15_000 });

    // Cookie persisted for the rest of the visit.
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'sc_debug' && c.value === '1')).toBeTruthy();
  });

  test('admin surface: widget submits and the super-admin Feedback panel renders', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto('marketplace');
    await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);

    await expect(page.locator('[data-testid="content-area"]')).toBeVisible({ timeout: 15_000 });

    // Widget is always mounted in AdminShell.
    const open = page.locator('[data-testid="debug-feedback-open"]');
    await expect(open).toBeVisible({ timeout: 10_000 });
    await open.click();
    await expect(page.locator('[data-testid="debug-feedback-modal"]')).toBeVisible({ timeout: 8_000 });

    await page.locator('[data-testid="debug-feedback-category-bug"]').check();
    await page.locator('[data-testid="debug-feedback-message"]').fill('E2E smoke: admin surface submission');
    await page.locator('[data-testid="debug-feedback-submit"]').click();
    await expect(page.locator('[data-testid="debug-feedback-done"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="debug-feedback-done"]').click();

    // The super admin Feedback tab is registered in SUPPER_NAV + renderPanel —
    // rendering the filter card proves the lazy registration works.
    await admin.clickTab('super_feedback');
    await expect(page.locator('[data-testid="feedback-panel"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Human-Testing Feedback')).toBeVisible();
  });
});