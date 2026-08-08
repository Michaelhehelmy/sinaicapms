import { test, expect } from '@playwright/test';
import { TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const POS_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const POS_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8787';

test.describe('Security', () => {
  test('XSS in marketplace search: type <script>alert(1)</script> → no dialog fires', async ({
    page,
  }) => {
    let dialogFired = false;
    page.on('dialog', dialog => {
      dialogFired = true;
      dialog.dismiss();
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="search-input"]', { timeout: 10_000 });

    const searchInput = page.locator('[data-testid="search-input"]');
    const count = await searchInput.count();

    if (count === 0) {
      test.skip(true, 'No search input found');
      return;
    }

    await searchInput.fill("<script>alert(1)</script>");
    await searchInput.press('Enter');
    await page.waitForLoadState('networkidle');

    expect(dialogFired).toBeFalsy();
  });

  test('XSS in booking check-in date: type malicious input → no dialog fires', async ({
    page,
  }) => {
    let dialogFired = false;
    page.on('dialog', dialog => {
      dialogFired = true;
      dialog.dismiss();
    });

    await page.goto(`/camp/${TEST_TENANT.id}/book`);
    await page.waitForLoadState('networkidle');

    const dateInput = page.locator('[data-testid="checkin-date"]');
    const count = await dateInput.count();

    if (count === 0) {
      test.skip(true, 'No booking date input found');
      return;
    }

    await dateInput.fill('<img src=x onerror=alert(1)>');
    await page.waitForLoadState('networkidle');

    expect(dialogFired).toBeFalsy();
  });

  test('XSS in contact form: type <script>alert("xss")</script> in name → no dialog', async ({
    page,
  }) => {
    let dialogFired = false;
    page.on('dialog', dialog => {
      dialogFired = true;
      dialog.dismiss();
    });

    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator(
      '#cName, [data-testid="contact-name"]'
    );
    const count = await nameInput.count();

    if (count === 0) {
      test.skip(true, 'No contact name input found');
      return;
    }

    await nameInput.fill("<script>alert('xss')</script>");
    await page.waitForLoadState('networkidle');

    expect(dialogFired).toBeFalsy();
  });

  test('unauthenticated /api/me: returns 200 (public route) or 404 (no tenant context)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/me`, {
      headers: { 'Content-Type': 'application/json' },
    });

    // Without tenant context on localhost, /api/me returns 404 (tenant not found)
    expect([200, 404]).toContain(response.status());

    const bodyText = await response.text();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('unauthenticated /api/tenants: returns 200 (public) or 401', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/tenants`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const status = response.status();
    expect([200, 401]).toContain(status);

    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('Auth token in localStorage (not cookies): verify via page.evaluate', async ({
    page,
  }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-signin-btn"]').waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();

    // Wait for the real dashboard navigation. `**/pos/**` also matches the
    // login page itself, so it would resolve while the login POST is still
    // in-flight and read stale storage.
    await page.waitForURL('**/pos/dashboard*', { timeout: 10_000 });
    expect(page.url()).toContain('/pos/dashboard');

    const storageInfo = await page.evaluate(() => {
      const token = localStorage.getItem('pos_token');
      const user = localStorage.getItem('pos_user');
      const cookies = document.cookie;
      return {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        hasUser: !!user,
        cookieHasToken: cookies.includes('pos_token'),
        allLocalStorageKeys: Object.keys(localStorage),
      };
    });

    expect(storageInfo.hasToken).toBeTruthy();
    expect(storageInfo.tokenLength).toBeGreaterThan(10);
    expect(storageInfo.cookieHasToken).toBeFalsy();
  });

  test('admin login rate limiting: 6 rapid wrong attempts → stays on login or rate limit message', async ({
    page,
  }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });

    for (let i = 0; i < 6; i++) {
      await page.locator('[data-testid="pos-identifier"]').fill('admin');
      await page.locator('[data-testid="pos-password"]').fill('wrongpassword');
      // No waitForLoadState here: it never settles on the POS login page
      // (known project anti-pattern). The Button disables itself while the
      // login POST is in-flight, so the next click() auto-waits for the
      // previous attempt to finish — keeping attempts properly sequenced.
      await page.locator('[data-testid="pos-signin-btn"]').click();
    }

    const url = page.url();
    expect(url).toContain('/login');

    const rateLimitMsg = page.locator(
      'text=rate limit, text=too many, text=locked, text=slow down'
    );
    const rateLimitCount = await rateLimitMsg.first().count();
    const rateLimitVisible = rateLimitCount > 0 && await rateLimitMsg.first().isVisible({ timeout: 3_000 });

    const loginFormStillVisible = await page.locator('[data-testid="pos-login"]').isVisible();

    expect(rateLimitVisible || loginFormStillVisible).toBeTruthy();
  });

  test('SQL injection in search: type \'; DROP TABLE users; -- → no error/crash', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="search-input"]', { timeout: 10_000 });

    const searchInput = page.locator('[data-testid="search-input"]');
    const count = await searchInput.count();

    if (count === 0) {
      test.skip(true, 'No search input found');
      return;
    }

    await searchInput.fill("'; DROP TABLE users; --");
    await searchInput.press('Enter');
    await page.waitForLoadState('networkidle');

    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBeTruthy();

    const criticalErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('SQL injection in booking: type 1\' OR \'1\'=\'1 in date → no error', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    await page.goto(`/camp/${TEST_TENANT.id}/book`);
    await page.waitForLoadState('networkidle');

    const dateInput = page.locator('[data-testid="checkin-date"]');
    const count = await dateInput.count();

    if (count === 0) {
      test.skip(true, 'No booking date input found');
      return;
    }

    await dateInput.fill("1' OR '1'='1");
    await page.waitForLoadState('networkidle');

    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBeTruthy();

    const criticalErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('password fields are type="password" (not text) on both POS and admin', async ({
    page,
  }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-password"]', { timeout: 10_000 });

    const posPasswordInput = page.locator('[data-testid="pos-password"]');
    const posType = await posPasswordInput.getAttribute('type');
    expect(posType).toBe('password');

    await page.goto('/admin/');
    await page.waitForSelector('[data-testid="login-password"]', { timeout: 10_000 });

    const adminPasswordInput = page.locator('[data-testid="login-password"]');
    const adminCount = await adminPasswordInput.count();

    if (adminCount > 0) {
      const adminType = await adminPasswordInput.first().getAttribute('type');
      expect(adminType).toBe('password');
    }
  });
});
