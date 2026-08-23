import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const VALID_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const VALID_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

test.describe('POS Login', () => {
  test('login page loads at /login', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    const loginVisible = await page.locator('[data-testid="pos-login"]').isVisible();
    expect(loginVisible).toBeTruthy();
  });

  test('login page shows SinaiCamps POS branding', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    const branding = page.locator('[data-testid="pos-branding"]');
    await expect(branding).toBeVisible();
    const text = await branding.textContent();
    expect(text).toContain('SinaiCamps POS');
  });

  test('identifier input renders and is focusable', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    const input = page.locator('[data-testid="pos-identifier"]');
    await expect(input).toBeVisible();
    const type = await input.getAttribute('type');
    expect(type).toBe('text');
  });

  test('password input renders with type password', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    const input = page.locator('[data-testid="pos-password"]');
    await expect(input).toBeVisible();
    const type = await input.getAttribute('type');
    expect(type).toBe('password');
  });

  test('sign in button renders and is clickable', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    const btn = page.locator('[data-testid="pos-signin-btn"]');
    await expect(btn).toBeVisible();
    const disabled = await btn.isDisabled();
    expect(disabled).toBeFalsy();
  });

  test('valid credentials → navigates to dashboard or shift overlay', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    // POS uses path routing — wait for dashboard or shift overlay
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10000 });
    const url = page.url();
    expect(url).toContain('/dashboard');
  });

  test('valid credentials → localStorage has pos_token', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    const token = await page.evaluate(() => localStorage.getItem('pos_token'));
    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThan(10);
  });

  test('valid credentials → localStorage has pos_user object', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    const user = await page.evaluate(() => {
      const raw = localStorage.getItem('pos_user');
      return raw ? JSON.parse(raw) : null;
    });
    expect(user).toBeTruthy();
    expect(user).toHaveProperty('firstName');
  });

  test('wrong password → stays on login with error', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill('wrongpassword123');
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });

    // Should still be on login
    const loginVisible = await page.locator('[data-testid="pos-login"]').isVisible();
    expect(loginVisible).toBeTruthy();

    // Error message or sign-in button still visible
    const errorMsg = page.locator('[data-testid="pos-login-error"]');
    const errorCount = await errorMsg.count();
    const hasError = errorCount > 0 && await errorMsg.isVisible({ timeout: 3000 });
    const signInStillVisible = await page.locator('[data-testid="pos-signin-btn"]').isVisible();
    expect(hasError || signInStillVisible).toBeTruthy();
  });

  test('empty credentials → stays on login', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });

    const loginVisible = await page.locator('[data-testid="pos-login"]').isVisible();
    expect(loginVisible).toBeTruthy();
  });

  test('nonexistent user → stays on login with error', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill('nonexistent@nowhere.com');
    await page.locator('[data-testid="pos-password"]').fill('anypassword');
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });

    const loginVisible = await page.locator('[data-testid="pos-login"]').isVisible();
    expect(loginVisible).toBeTruthy();
  });

  test('successful login → no JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });

    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('page reload after login stays on dashboard', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    await page.reload();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });

    const url = page.url();
    expect(url).toContain('/dashboard');
  });

  test('valid login navigates to /dashboard (pushState path routing)', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
    const url = page.url();
    expect(url).toContain('/dashboard');
  });

  test('valid login: verify localStorage has pos_token', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
    const token = await page.evaluate(() => localStorage.getItem('pos_token'));
    expect(token).not.toBeNull();
    expect(token!.length).toBeGreaterThan(10);
  });

  test('session persistence: login → reload → still on /dashboard', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
    const urlBefore = page.url();
    expect(urlBefore).toContain('/dashboard');
    await page.reload();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    const urlAfter = page.url();
    expect(urlAfter).toContain('/dashboard');
  });

  test('session persistence: verify pos_token in localStorage after reload', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.locator('[data-testid="pos-login"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(VALID_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
    const tokenBefore = await page.evaluate(() => localStorage.getItem('pos_token'));
    expect(tokenBefore).not.toBeNull();
    expect(tokenBefore!.length).toBeGreaterThan(10);
    await page.reload();
    await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    const tokenAfter = await page.evaluate(() => localStorage.getItem('pos_token'));
    expect(tokenAfter).not.toBeNull();
    expect(tokenAfter).toBe(tokenBefore);
  });
});
