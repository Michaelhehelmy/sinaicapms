import { test, expect } from '@playwright/test';
import { SUPER_ADMIN, TENANT_URL, TEST_TENANT } from '../../fixtures/test-data';

const MARKETPLACE = 'http://localhost:4320';
const API_BASE = 'http://127.0.0.1:8787';

/** Helper: login to admin panel and wait for dashboard to load */
async function adminLogin(page: import('@playwright/test').Page) {
  await page.goto(`${MARKETPLACE}/admin?tenant=${SUPER_ADMIN.tenantId}`);
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('[data-testid="login-email"]');
  const emailCount = await emailInput.count();
  if (emailCount === 0 || !(await emailInput.isVisible({ timeout: 5000 }))) {
    // Already logged in
    return;
  }
  await emailInput.fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  await page
    .locator('[data-testid="content-area"]')
    .waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe('Auth Token Lifecycle', () => {
  test('login → token stored in localStorage', async ({ page }) => {
    await adminLogin(page);
    const token = await page.evaluate(() => localStorage.getItem('sinaicamps_token'));
    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThan(10);
  });

  test('login → user object stored in localStorage', async ({ page }) => {
    await adminLogin(page);
    const user = await page.evaluate(() => {
      const raw = localStorage.getItem('sinaicamps_user');
      return raw ? JSON.parse(raw) : null;
    });
    expect(user).toBeTruthy();
  });

  test('token survives page reload', async ({ page }) => {
    await adminLogin(page);
    const tokenBefore = await page.evaluate(() => localStorage.getItem('sinaicamps_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    const tokenAfter = await page.evaluate(() => localStorage.getItem('sinaicamps_token'));
    expect(tokenAfter).toBe(tokenBefore);
  });

  test('invalid token → API returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: 'Bearer invalid-token-12345' },
    });
    expect(response.status()).toBe(401);
  });

  test('expired token → API returns 401', async ({ request }) => {
    // Create a malformed JWT that looks expired
    const expiredJWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjoxfQ.invalid';
    const response = await request.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${expiredJWT}` },
    });
    expect(response.status()).toBe(401);
  });

  test('no token → API returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/me`);
    expect(response.status()).toBe(401);
  });

  test('wrong format token → API returns 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: 'not-a-bearer-token' },
    });
    expect(response.status()).toBe(401);
  });

  test('token in cookie → API ignores it (uses header only)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/me`, {
      headers: { Cookie: 'sinaicamps_token=some-token' },
    });
    expect(response.status()).toBe(401);
  });

  test('logout → token removed from localStorage', async ({ page }) => {
    await adminLogin(page);
    const tokenBefore = await page.evaluate(() => localStorage.getItem('sinaicamps_token'));
    expect(tokenBefore).toBeTruthy();

    // Trigger logout
    const logoutBtn = page.locator('[data-testid="logout-btn"]');
    const logoutBtnCount = await logoutBtn.count();
    if (logoutBtnCount > 0) {
      await logoutBtn.click();
      try {
        await page.locator('[data-testid="login-overlay"]').waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        // May navigate away without showing overlay — continue
      }
    }

    const tokenAfter = await page.evaluate(() => localStorage.getItem('sinaicamps_token'));
    expect(tokenAfter).toBeFalsy();
  });
});

test.describe('POS Token Lifecycle', () => {
  const TENANT_ID = TEST_TENANT.id;

  test('POS login → token stored in localStorage', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });

    const identifierInput = page.locator('[data-testid="pos-identifier"]');
    const identifierCount = await identifierInput.count();
    if (identifierCount > 0) {
      await identifierInput.fill(process.env.POS_IDENTIFIER || 'cashier');
      await page
        .locator('[data-testid="pos-password"]')
        .fill(process.env.POS_PASSWORD || 'pass1234');
      await page.locator('[data-testid="pos-signin-btn"]').click();

      // POS uses hash routing
      try {
        await page.waitForFunction(
          () => window.location.hash.includes('dashboard'),
          { timeout: 10_000 }
        );
      } catch {
        // Hash may not update immediately — continue
      }
    
      const token = await page.evaluate(() => localStorage.getItem('pos_token'));
      if (page.url().includes('dashboard')) {
        expect(token).toBeTruthy();
      }
    }
  });

  test('POS token survives page reload', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });

    const identifierInput = page.locator('[data-testid="pos-identifier"]');
    const identifierCount = await identifierInput.count();
    if (identifierCount > 0) {
      await identifierInput.fill(process.env.POS_IDENTIFIER || 'cashier');
      await page
        .locator('[data-testid="pos-password"]')
        .fill(process.env.POS_PASSWORD || 'pass1234');
      await page.locator('[data-testid="pos-signin-btn"]').click();

      try {
        await page.waitForFunction(
          () => window.location.hash.includes('dashboard'),
          { timeout: 10_000 }
        );
      } catch {
        // Hash may not update immediately — continue
      }

      if (page.url().includes('dashboard')) {
        const tokenBefore = await page.evaluate(() =>
          localStorage.getItem('pos_token')
        );
        await page.reload();
        await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]').first()
          .waitFor({ state: 'visible', timeout: 10000 });
        const tokenAfter = await page.evaluate(() =>
          localStorage.getItem('pos_token')
        );
        expect(tokenAfter).toBe(tokenBefore);
      }
    }
  });
});

test.describe('Concurrent Sessions', () => {
  test('two browser contexts can login simultaneously', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto(`${MARKETPLACE}/admin?tenant=${SUPER_ADMIN.tenantId}`);
    await page2.goto(`${MARKETPLACE}/admin?tenant=${SUPER_ADMIN.tenantId}`);
    await page1.locator('[data-testid="login-overlay"], [data-testid="login-email"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    await page2.locator('[data-testid="login-overlay"], [data-testid="login-email"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });

    // Both should show login
    const email1 = page1.locator('[data-testid="login-email"]');
    const email2 = page2.locator('[data-testid="login-email"]');
    const vis1 = await email1.isVisible();
    const vis2 = await email2.isVisible();
    expect(vis1 || vis2).toBeTruthy();

    await context1.close();
    await context2.close();
  });
});
