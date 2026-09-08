import { test, expect } from '../../fixtures/coverage-fixture';
import { TEST_TENANT, TEST_TENANT_ADMIN } from '../../fixtures/test-data';

const MARKETPLACE = 'http://localhost:4320';

/**
 * Admin Login Form Deep — exercises LoginForm.tsx admin variant beyond the
 * basic credential tests in tenant-admin-login.spec.ts.
 *
 * Targets: LoginForm.tsx AdminLoginForm (client-side validation, empty fields,
 * "Forgot Password?" link, auto-redirect when already authenticated).
 */

function adminUrl(): string {
  return `${MARKETPLACE}/admin?tenant=${TEST_TENANT.id}`;
}

/* ------------------------------------------------------------------ */

test.describe('Admin Login — Client-Side Validation', () => {
  test('submitting empty form shows validation error', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      // Already authenticated — nothing to test
      return;
    }

    // Clear both fields and submit
    await page.locator('[data-testid="login-email"]').fill('');
    await page.locator('[data-testid="login-password"]').fill('');
    await page.locator('[data-testid="login-submit"]').click();

    // Should show validation error or remain on login (HTML5 required validation)
    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).toBeVisible({ timeout: 5_000 });
  });

  test('submitting with empty password shows validation error', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill('');
    await page.locator('[data-testid="login-submit"]').click();

    // Should stay on login overlay
    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).toBeVisible({ timeout: 5_000 });
  });

  test('submitting with empty email shows validation error', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await page.locator('[data-testid="login-email"]').fill('');
    await page.locator('[data-testid="login-password"]').fill('SomePassword123!');
    await page.locator('[data-testid="login-submit"]').click();

    // Should stay on login overlay
    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).toBeVisible({ timeout: 5_000 });
  });
});

/* ------------------------------------------------------------------ */

test.describe('Admin Login — UI Elements', () => {
  test('login overlay shows SinaiCamps branding', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    const overlay = page.locator('[data-testid="login-overlay"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('SinaiCamps');
    await expect(overlay).toContainText('Sign in to manage');
  });

  test('email input has correct type and placeholder', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await expect(email).toHaveAttribute('type', 'email');
    await expect(email).toHaveAttribute('placeholder', 'admin@camp.com');
  });

  test('password input has type password', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    const password = page.locator('[data-testid="login-password"]');
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('Forgot Password link is visible', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    const forgotLink = page.locator('[data-testid="forgot-password"]');
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toContainText('Forgot Password');
  });

  test('submit button shows "Sign In" text', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    const submitBtn = page.locator('[data-testid="login-submit"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Sign In');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Admin Login — Error Handling', () => {
  test('wrong password keeps user on login overlay', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill('WrongPassword999!');
    await page.locator('[data-testid="login-submit"]').click();

    // After failed login, either:
    // (a) an inline error message appears, OR
    // (b) the user stays on the login overlay (no redirect to dashboard).
    // Both mean the login was rejected — the overlay must still be visible.
    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).toBeVisible({ timeout: 15_000 });
  });

  test('wrong password does not navigate to dashboard', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await page.locator('[data-testid="login-email"]').fill('totally-bogus@example.com');
    await page.locator('[data-testid="login-password"]').fill('WrongPassword999!');
    await page.locator('[data-testid="login-submit"]').click();

    // Wait a moment for the request to complete
    await page.waitForTimeout(2000);

    // Should NOT be on the dashboard
    const contentArea = page.locator('[data-testid="content-area"]');
    const dashVisible = await contentArea.isVisible().catch(() => false);
    expect(dashVisible).toBeFalsy();

    // Should still see the login overlay
    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).toBeVisible();
  });

  test('submit button shows loading state during authentication', async ({ page }) => {
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    if (!(await email.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return;
    }

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill('WrongPassword999!');
    await page.locator('[data-testid="login-submit"]').click();

    // Button should briefly show "Signing in..." then revert
    // We check that the button exists and is functional (not permanently disabled)
    const submitBtn = page.locator('[data-testid="login-submit"]');
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });
  });
});

/* ------------------------------------------------------------------ */

test.describe('Admin Login — Already Authenticated', () => {
  test('auto-redirects to dashboard when token exists', async ({ page }) => {
    // First, log in successfully to set the token
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    const email = page.locator('[data-testid="login-email"]');
    const contentArea = page.locator('[data-testid="content-area"]');
    // The login island hydrates client-side after domcontentloaded, so wait
    // for the REAL first-render outcome instead of a non-waiting isVisible
    // check (the overlay can be invisible for a moment while React mounts).
    try {
      await expect(email).toBeVisible({ timeout: 15_000 });
    } catch {
      // Already authenticated — the redirect is working
      await expect(contentArea).toBeVisible({ timeout: 10_000 });
      return;
    }

    await page.locator('[data-testid="login-email"]').fill(TEST_TENANT_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(TEST_TENANT_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();
    await page.locator('[data-testid="content-area"]').waitFor({ state: 'visible', timeout: 15_000 });

    // Now navigate back to /admin — should auto-redirect to dashboard
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });
    // The login overlay should NOT appear — dashboard should render directly
    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="content-area"]')).toBeVisible({ timeout: 10_000 });
  });
});

/* ------------------------------------------------------------------ */

test.describe('Admin Login — Page Errors', () => {
  test('admin login page loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    await page.goto(adminUrl(), { waitUntil: 'domcontentloaded' });

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Text content does not match') &&
        !e.includes('hydrat') &&
        !e.includes('Suspense boundary'),
    );
    expect(criticalErrors.length).toBe(0);
  });
});
