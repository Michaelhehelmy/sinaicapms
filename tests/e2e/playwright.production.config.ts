import { defineConfig, devices } from '@playwright/test';

/**
 * Production/Staging E2E config — READ-ONLY smoke tests.
 *
 * Points at live Cloudflare Pages (sinaicamps.com or staging.sinaicamps.com).
 * No local webServer — the backend+frontend are already deployed.
 *
 * ⚠️  Only production-safe specs are included:
 *   - Read-only browsing (marketplace, tenant pages, public pages, routing)
 *   - API smoke tests (no auth, no mutations)
 *   - Critical flow checks (the production/ project)
 *
 * EXCLUDED (need auth or mutate data):
 *   - admin/   — CRUD operations, needs SUPER_ADMIN/tenant admin auth
 *   - auth/    — login flows with test credentials that may not exist on prod
 *   - pos/     — needs POS cashier auth (TEST_POS_USER seed may fail)
 *   - public/booking-submission  — needs admin login to verify bookings
 *   - public/gallery-navigation   — uses ?tenant= query param (ignored on prod root host)
 *   - cross-cutting/ (most)       — need POS auth or ?tenant= query param
 *
 * Usage:
 *   npx playwright test --config=tests/e2e/playwright.production.config.ts
 *   STAGING=1 npx playwright test --config=tests/e2e/playwright.production.config.ts
 */

const IS_STAGING = !!process.env.STAGING;
const PROD_BASE = 'https://sinaicamps.com';
const STAGING_BASE = 'https://staging.sinaicamps.com';
const BASE_URL = IS_STAGING ? STAGING_BASE : PROD_BASE;

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup-production.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 2,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['html', { outputFolder: `./results/html${IS_STAGING ? '-staging' : '-prod'}` }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  timeout: 60_000,
  expect: { timeout: 10_000 },
  projects: [
    {
      name: 'production',
      testDir: './specs/production',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'marketplace',
      testDir: './specs/marketplace',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tenant',
      testDir: './specs/tenant',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'public',
      testDir: './specs/public',
      // Exclude specs that need admin auth or use ?tenant= query param
      // (ignored on production root host — logbook line 67)
      // Exclude menu-filtering: /camp/{id}/menu redirects to /404 on sinaicamps.com
      // (same-zone Worker fetch issue — logbook line 66)
      testIgnore: /booking-submission|gallery-navigation|menu-filtering/,
      use: { ...devices['Desktop Chrome'] },
    },
    // routing/ excluded: zone-exclusivity tests use ?tenant= query param
    // which is IGNORED on production root host (logbook line 67)
    {
      name: 'cross-cutting-read-only',
      testDir: './specs/cross-cutting',
      // Only include specs that are fully read-only: no auth, no ?tenant=, no mutations
      // Exclude i18n: Cloudflare challenge script injection differs between page loads
      testMatch: /api-comprehensive|api-endpoints|axe-accessibility/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — production is already live
});
