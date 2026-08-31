import { test, expect } from '@playwright/test';
import { TEST_TENANT, SUPER_ADMIN } from '../../fixtures/test-data';

const TENANT_ID = process.env.E2E_TENANT_ID || TEST_TENANT.id;

// No horizontal overflow: the root scroll width may not exceed the viewport
// width by more than 1px (allow 1px subpixel rounding).
async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(scrollW).toBeLessThanOrEqual(innerW + 1);
}

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  // Wait for the dashboard to hydrate and render
  await expect(page.locator('[data-testid="content-area"]')).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Mobile Responsive — no horizontal overflow at 390px', () => {
  test.describe('390×844 phone viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@smoke marketplace: / has no horizontal overflow', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke marketplace: /camps has no horizontal overflow', async ({ page }) => {
      await page.goto('/camps', { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke marketplace: /camp/:id has no horizontal overflow', async ({ page }) => {
      await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke tenant: /book has no horizontal overflow', async ({ page }) => {
      await page.goto(`/book?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke tenant: /menu has no horizontal overflow', async ({ page }) => {
      await page.goto(`/menu?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke tenant: /rooms has no horizontal overflow', async ({ page }) => {
      await page.goto(`/rooms?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke admin: login screen has no horizontal overflow', async ({ page }) => {
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke admin: dashboard + Tenants panel have no horizontal overflow', async ({
      page,
    }) => {
      await loginAsSuperAdmin(page);
      await expectNoHorizontalOverflow(page);

      // Navigate to a guaranteed super-admin panel (Tenants). The "Projects"
      // panel only exists for tenant admins; super admin has no camps nav item.
      // At 390px the sidebar is an off-canvas drawer, so navigation goes
      // through the mobile bottom nav.
      await page.locator('[data-testid="mobile-nav-super_tenants"]').click({
        // The Astro dev toolbar overlays the mobile bottom nav in dev; in CI
        // (production build) no overlay intercepts this click.
        force: true,
      });
      await expect(page.locator('[data-testid="content-area"]')).toBeVisible({
        timeout: 15_000,
      });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke pos: /pos has no horizontal overflow', async ({ page }) => {
      await page.goto(`/pos?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      await expectNoHorizontalOverflow(page);
    });

    test('@smoke admin: sidebar drawer toggles via hamburger at 390px', async ({ page }) => {
      await loginAsSuperAdmin(page);

      const sidebar = page.locator('[data-testid="admin-sidebar"]');
      const toggle = page.locator('[data-testid="mobile-toggle"]');

      // The hamburger is only rendered on mobile (md:hidden)
      await expect(toggle).toBeVisible({ timeout: 10_000 });

      // The sidebar drawer uses an off-canvas transform (-translate-x-full).
      // Assert on the bounding-box x-position rather than visibility, since an
      // element translated off-screen still resolves as "visible" in Playwright.
      async function sidebarOnScreen() {
        const box = await sidebar.boundingBox();
        return box !== null && box.x >= 0;
      }

      // Closed by default: off-canvas (negative/0 x)
      expect(await sidebarOnScreen()).toBe(false);

      // Open the drawer via the hamburger
      await toggle.click();
      await expect.poll(sidebarOnScreen).toBe(true);

      // Close the drawer by clicking the scrim/backdrop (standard drawer
      // dismiss). The backdrop occupies the full screen but the open drawer's
      // <aside> sits above it (z-[100] vs z-[90]) across the left 240px, so
      // click the backdrop at a point clear of the sidebar.
      const bg = page.locator('[data-testid="sidebar-backdrop"]');
      await bg.click({ position: { x: 380, y: 400 } });
      await expect.poll(sidebarOnScreen).toBe(false);
    });
  });
});
