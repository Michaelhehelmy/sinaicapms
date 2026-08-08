import { expect, type Page } from '@playwright/test';

/**
 * Wait until an admin panel is fully rendered — not just the `content-area`
 * shell.
 *
 * `AdminApp` renders `<main data-testid="content-area">` immediately and wraps
 * the active panel in a React `<Suspense>` whose fallback is
 * `<div data-testid="panel-loading">` ("Loading panel…"). Tests that assert on
 * panel content right after `content-area` becomes visible race that fallback,
 * producing the classic failure signature: content-area visible, expected
 * markers count 0, content === "Loading panel…".
 *
 * This helper waits for the lazy panel to replace the fallback. It resolves
 * immediately when the fallback never appears (non-lazy panel), and otherwise
 * waits until it is hidden/detached.
 *
 * Call it after every navigation or tab switch that should land on a panel,
 * BEFORE asserting on panel content.
 */
export async function expectPanelReady(page: Page, timeout = 10_000) {
  await page
    .locator('[data-testid="content-area"]')
    .waitFor({ state: 'visible', timeout });

  await page
    .locator('[data-testid="panel-loading"]')
    .waitFor({ state: 'hidden', timeout });
}

/**
 * Wait until a panel has finished its async data fetch, not just its
 * Suspense shell.
 *
 * `expectPanelReady` only covers the lazy-load race. Panels then fetch data
 * and gate rendering on it in several ways:
 *  - `aria-busy={loading || undefined}` on the panel root (dashboard,
 *    super-dashboard, orders, reservation-log);
 *  - `aria-busy={loading}` on a `DataTable` (rendered while paging/loading);
 *  - a `<LoadingSpinner data-testid="loading-spinner">` (rooms, etc.).
 *
 * When `panelTestId` is provided the checks are scoped to that panel root;
 * otherwise they are scoped to `content-area` (useful for loops over tabs
 * whose panel roots vary).
 *
 * Call it AFTER `expectPanelReady` (or instead of it, since it calls it) and
 * BEFORE asserting on data-backed panel content.
 */
export async function expectPanelContentReady(
  page: Page,
  panelTestId?: string,
  timeout = 10_000,
) {
  await expectPanelReady(page, timeout);

  const scope = panelTestId
    ? `[data-testid="${panelTestId}"]`
    : '[data-testid="content-area"]';

  if (panelTestId) {
    await page.locator(scope).waitFor({ state: 'visible', timeout });
  }

  await expect
    .poll(
      async () => {
        // Self-attribute (panel root) busy state.
        if ((await page.locator(`${scope}[aria-busy="true"]`).count()) > 0) {
          return false;
        }
        // Descendant busy state (DataTable or nested panels).
        if ((await page.locator(`${scope} [aria-busy="true"]`).count()) > 0) {
          return false;
        }
        // Page-level loading spinners.
        if (
          (await page
            .locator(`${scope} [data-testid="loading-spinner"]:visible`)
            .count()) > 0
        ) {
          return false;
        }
        // Suspense fallback still visible (defensive).
        if (
          (await page
            .locator(`${scope} [data-testid="panel-loading"]:visible`)
            .count()) > 0
        ) {
          return false;
        }
        return true;
      },
      {
        timeout,
        message: `panel ${panelTestId ?? 'content-area'} finished loading data`,
      },
    )
    .toBe(true);
}
