/**
 * Coverage-instrumented test fixture.
 *
 * Wraps Playwright's built-in `page` fixture so that V8 JS coverage is
 * automatically started before each test and collected after each test
 * (Chromium only, gated on COVERAGE_ENABLED env var).
 *
 * All non-production spec files import { test, expect } from this module
 * instead of directly from `@playwright/test`.
 */

import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { startCoverage, collectCoverage } from '../utils/coverage';

const COVERAGE_ENABLED = !!process.env.COVERAGE_ENABLED;

let workerCounter = 0;

export const test = base.extend({
  page: async ({ page, browserName }, use) => {
    if (COVERAGE_ENABLED && browserName === 'chromium') {
      await startCoverage(page);
    }
    await use(page);
    if (COVERAGE_ENABLED && browserName === 'chromium') {
      // Use PID + atomic counter so each worker gets a unique key even if
      // PIDs collide (unlikely but defensive).
      const key = `w${process.pid}-${workerCounter++}`;
      await collectCoverage(page, key);
    }
  },
});

export { expect, type Page, type APIRequestContext };
