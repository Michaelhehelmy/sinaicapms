import { test as base, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { API_BASE, SUPER_ADMIN, TEST_TENANT_ADMIN, TEST_POS_USER, TEST_TENANT } from './test-data';

type AuthFixtures = {
  superAdminPage: Page;
  tenantAdminPage: Page;
  posUserPage: Page;
  apiContext: APIRequestContext;
};

export const test = base.extend<AuthFixtures>({
  apiContext: async ({ playwright }, use: (r: APIRequestContext) => Promise<void>) => {
    const ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    await use(ctx);
    await ctx.dispose();
  },

  superAdminPage: async ({ page }, use) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('#loginEmail, input[name="identifier"], input[placeholder*="admin"]', SUPER_ADMIN.email);
    await page.fill('#loginPassword, input[type="password"]', SUPER_ADMIN.password);
    await page.click('button:has-text("Sign In"), button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 }).catch(() => {});
    await use(page);
  },

  tenantAdminPage: async ({ page }, use) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('#loginEmail, input[name="identifier"], input[placeholder*="admin"]', TEST_TENANT_ADMIN.email);
    await page.fill('#loginPassword, input[type="password"]', TEST_TENANT_ADMIN.password);
    await page.click('button:has-text("Sign In"), button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 }).catch(() => {});
    await use(page);
  },

  posUserPage: async ({ page }, use) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="identifier"], input[placeholder*="admin"]', TEST_POS_USER.identifier);
    await page.fill('input[type="password"]', TEST_POS_USER.password);
    await page.click('button:has-text("Sign In"), button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 }).catch(() => {});
    await use(page);
  },
});

export { expect } from '@playwright/test';
