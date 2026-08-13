import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

// E2E tenant pages can hang on `load` in astro dev (logo/favicon point at dead
// localhost:8001) — see AGENT_LOGBOOK.md. Use domcontentloaded like the rest of
// the zone/E2E specs; images settle async after navigation.
const GOTO_OPTS = { waitUntil: 'domcontentloaded' as const };

test.describe('Visual Regression — Page Snapshots', () => {
  test('marketplace homepage matches baseline', async ({ page }) => {
    await page.goto('/', GOTO_OPTS);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('marketplace-homepage.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('tenant homepage matches baseline', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, GOTO_OPTS);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('tenant-homepage.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('tenant booking page matches baseline', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, GOTO_OPTS);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('tenant-booking.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('marketplace homepage mobile matches baseline', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', GOTO_OPTS);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('marketplace-homepage-mobile.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('tenant homepage mobile matches baseline', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/camp/${TENANT_ID}`, GOTO_OPTS);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('tenant-homepage-mobile.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('POS login page matches baseline', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('pos-login.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
  });
});
