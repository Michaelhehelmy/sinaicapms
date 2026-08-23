import { defineConfig, devices } from '@playwright/test';

/**
 * Production/Staging E2E config — CRITICAL-FLOWS ONLY.
 *
 * Points at live Cloudflare Pages (sinaicamps.com or staging.sinaicamps.com).
 * No local webServer — the backend+frontend are already deployed.
 *
 * ⚠️  Only the production/ project is included (11 tests).
 *     All other projects (marketplace, tenant, public, cross-cutting, admin,
 *     auth, pos) are run via the local config (playwright.config.ts).
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
    // Critical-flows only — the 11 tests that must pass before every deploy.
    // All other projects (marketplace, tenant, public, cross-cutting, admin,
    // auth, pos) are run via the local config (playwright.config.ts) only.
    {
      name: 'production',
      testDir: './specs/production',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — production is already live
});
