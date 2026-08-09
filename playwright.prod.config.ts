import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * PRODUCTION Playwright configuration.
 *
 * Runs E2E tests against the LIVE site (https://sinaicamps.com) WITHOUT
 * launching any local servers. Extends the base local config but overrides
 * baseURL, disables webServer, and only includes projects that are safe to
 * run against production.
 *
 * SAFETY (see .opencode/prompts/safety-rules.md):
 * - webServer: []  → NO local servers are ever started.
 * - No `admin` / `auth` / `pos` projects (write-heavy or localhost-bound).
 * - The `cross-cutting` project EXCLUDES specs that write to the production
 *   API (POST/PUT/DELETE), attempt auth/logins, or assert hardcoded localhost
 *   URLs — see `testIgnore` below.
 * - The new `production` project (tests/e2e/specs/production) is READ-ONLY.
 */
export default defineConfig({
  ...baseConfig,

  // Point every request at the live production origin.
  use: {
    ...baseConfig.use,
    baseURL: 'https://sinaicamps.com',
  },

  // Point the shared API_BASE fixture at the production API (the fixtures
  // default to the local wrangler port 127.0.0.1:8787; without this override
  // security-headers / multi-tenancy API tests ECONNREFUSED against prod).
  // The config module is evaluated in the main process before worker
  // processes are forked, so the assignment is inherited by workers before
  // the fixtures are imported.
  webServer: [],
  ...(() => {
    process.env.API_BASE_URL ||= 'https://sinaicamps.com';
    return {};
  })(),

  fullyParallel: true,
  workers: 4,
  retries: 1,
  timeout: 60_000,
  expect: {
    ...baseConfig.expect,
    timeout: 10_000,
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/results/prod-e2e/html' }],
    ['json', { outputFile: 'tests/e2e/results/prod-e2e/report.json' }],
  ],

  projects: [
    {
      name: 'marketplace',
      testDir: './tests/e2e/specs/marketplace',
      use: { ...devices['Desktop Chrome'], baseURL: 'https://sinaicamps.com' },
    },
    {
      name: 'tenant',
      testDir: './tests/e2e/specs/tenant',
      use: { ...devices['Desktop Chrome'], baseURL: 'https://sinaicamps.com' },
    },
    {
      name: 'cross-cutting',
      testDir: './tests/e2e/specs/cross-cutting',
      // Only production-safe (READ-ONLY) specs may run here. Excluded:
      //  - api-comprehensive / api-endpoints: POST/PUT/DELETE against the live API
      //  - security: attempts POS/admin logins + rate-limit hammering
      //  - data-table: POS auth + admin CRUD navigation
      //  - browser-behavior / keyboard-nav: assert hardcoded localhost:4320 URLs
      //  - error-handling: hardcoded 127.0.0.1 API base + localhost-only logic
      //  - visual-regression: localhost screenshot baselines
      //  - grepInvert /POS/: POS-zone tests navigate /pos/* which is tenant-only
      //    on production (branded 404 on the marketplace root by design).
      //  - security-headers / multi-tenancy use the shared API_BASE fixture which
      //    is redirected to the production API via API_BASE_URL above (read-only).
      testIgnore: [
        'api-comprehensive.spec.ts',
        'api-endpoints.spec.ts',
        'security.spec.ts',
        'data-table.spec.ts',
        'browser-behavior.spec.ts',
        'keyboard-nav.spec.ts',
        'error-handling.spec.ts',
        'visual-regression.spec.ts',
      ],
      grepInvert: /POS/,
      use: { ...devices['Desktop Chrome'], baseURL: 'https://sinaicamps.com' },
    },
    {
      name: 'production',
      testDir: './tests/e2e/specs/production',
      use: { ...devices['Desktop Chrome'], baseURL: 'https://sinaicamps.com' },
    },
  ],
});
