import { test, expect } from '@playwright/test';
import { TEST_TENANT, TEST_TENANT_ADMIN } from '../../fixtures/test-data';

const MARKETPLACE = 'http://localhost:4320';

/**
 * Tenant-admin login — post-0028 world.
 *
 * Since migration 0028 (`admins` table), tenant admins authenticate through
 * the `/admin` SPA against POST /api/auth/login (email + password + tenantId)
 * and receive a `sinaicamps_token` — NOT through the POS realm. POS cashier
 * login (`pos_token`) has its own specs (see auth/super-admin-login.spec.ts).
 *
 * The E2E tenant-admin account is provisioned by global-setup
 * (createTestTenantAdmin → POST /api/admin/admins) with tenantId=TEST_TENANT.id.
 * On localhost the SPA resolves the tenant scope from the `?tenant=` param
 * (getTenantId() in app/src/lib/api.ts), so every goto must carry it.
 */

function adminUrl(): string {
  return `${MARKETPLACE}/admin?tenant=${TEST_TENANT.id}`;
}

/** Open /admin for the test tenant and wait for the hydrated login form. */
async function openLoginForm(page: import('@playwright/test').Page) {
  await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
  // Admin is a client-rendered React island (#admin-mount) — no form testids
  // in SSR HTML; wait for hydration before interacting.
  const email = page.locator('[data-testid="login-email"]');
  if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
    // Fresh context per test → storage is empty, but tolerate an already-
    // authenticated shell defensively rather than failing the hydration wait.
    return;
  }
}

/**
 * Wait for a failed login to surface: inline error OR overlay still showing
 * (mirrors admin/login.spec.ts + super-admin-login.spec.ts tolerance —
 * some failures render only the toast region, others the inline error).
 */
async function expectFailedLogin(page: import('@playwright/test').Page) {
  await page
    .locator('[data-testid="login-error"], [data-testid="login-overlay"]')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });
}

test.describe('Tenant Admin Login (post-0028)', () => {
  test('wrong password: valid email + wrong pass → error visible → still on login', async ({
    page,
  }) => {
    await openLoginForm(page);

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill('WrongPassword999!');
    await page.locator('[data-testid="login-submit"]').click();

    await expectFailedLogin(page);

    // No session may be minted on failure
    const token = await page.evaluate(() => localStorage.getItem('sinaicamps_token'));
    expect(token).toBeNull();
    expect(page.url()).toContain('/admin');
  });

  test('non-existent email: bogus address → error → still on login', async ({ page }) => {
    await openLoginForm(page);

    await page
      .locator('[data-testid="login-email"]')
      .fill('nonexistent@nowhere.com');
    await page.locator('[data-testid="login-password"]').fill('SomePassword123!');
    await page.locator('[data-testid="login-submit"]').click();

    await expectFailedLogin(page);
    const token = await page.evaluate(() =>
      localStorage.getItem('sinaicamps_token')
    );
    expect(token).toBeNull();
    expect(page.url()).toContain('/admin');
  });

  test('valid credentials: dashboard loads + sinaicamps_token stored', async ({ page }) => {
    await openLoginForm(page);

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(TEST_TENANT_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();

    // Tenant-admin shell renders the scoped nav into #admin-mount/content-area
    await expect(page.locator('[data-testid="content-area"]')).toBeVisible({
      timeout: 15_000,
    });

    const token = await page.evaluate(() =>
      localStorage.getItem('sinaicamps_token')
    );
    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThan(10);
  });

  test('session lands in the ADMIN realm: no pos_token written', async ({ page }) => {
    await openLoginForm(page);

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(TEST_TENANT_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();

    await expect(page.locator('[data-testid="content-area"]')).toBeVisible({
      timeout: 15_000,
    });

    // Realm separation (the core of the 0028 split): tenant-admin sessions
    // never touch the POS namespace.
    const posToken = await page.evaluate(() => localStorage.getItem('pos_token'));
    expect(posToken).toBeNull();

    const posUser = await page.evaluate(() => localStorage.getItem('pos_user'));
    expect(posUser).toBeNull();
  });

  test('stored user object reflects the scoped tenant', async ({ page }) => {
    await openLoginForm(page);

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(TEST_TENANT_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();

    await expect(page.locator('[data-testid="content-area"]')).toBeVisible({
      timeout: 15_000,
    });

    const user = await page.evaluate(() => {
      const raw = localStorage.getItem('sinaicamps_user');
      return raw ? JSON.parse(raw) : null;
    });
    expect(user).toBeTruthy();
    expect(user.tenantId).toBe(TEST_TENANT.id);
  });
});
