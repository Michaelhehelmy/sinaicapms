import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 8787;
const UNIFIED_PORT = 4320;

export default defineConfig({
  testDir: './tests/e2e/specs',
  // Recreates the E2E seed chain (super admin → tenant admin → POS cashier)
  // on every run. Required for a fresh D1: migration 0051 removed the old
  // seed rows, so without this the POS/auth specs have no cashier/admin to
  // log in as and every real-login test 401s.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['html', { outputFolder: 'tests/e2e/results/html' }],
    ['list'],
  ],
  use: {
    baseURL: `http://localhost:${UNIFIED_PORT}`,
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
      name: 'marketplace',
      testDir: './tests/e2e/specs/marketplace',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'tenant',
      testDir: './tests/e2e/specs/tenant',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'admin',
      testDir: './tests/e2e/specs/admin',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'auth',
      testDir: './tests/e2e/specs/auth',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'cross-cutting',
      testDir: './tests/e2e/specs/cross-cutting',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'pos',
      testDir: './tests/e2e/specs/pos',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'public',
      testDir: './tests/e2e/specs/public',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
    {
      name: 'routing',
      testDir: './tests/e2e/specs/routing',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UNIFIED_PORT}`,
      },
    },
  ],
  webServer: [
    {
      // wrangler dev does NOT auto-migrate its local D1 (`--local` starts
      // from .wrangler/state; a fresh/cleared state is a BLANK database —
      // no tables at all, so every seed/login call 500s and the whole gate
      // fails). Apply migrations first so the gate is hermetic from a
      // clean checkout. The apply is idempotent (tracked in d1_migrations)
      // and adds ~1s when already applied.
      command:
        'cd backend && npx wrangler d1 migrations apply campmaster-db --local && npx wrangler dev --port 8787 --local',
      port: BACKEND_PORT,
      reuseExistingServer: true,
      // 240s: a cold first boot (D1 migrations apply + workerd compile) can
      // exceed 90s on slower/laptop hardware — timeouts there killed the first
      // 4 per-project runs before caches warmed.
      timeout: 240_000,
    },
    {
      command: 'cd app && npx astro dev --port 4320 --host',
      port: UNIFIED_PORT,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
