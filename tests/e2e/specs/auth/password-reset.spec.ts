import { test, expect } from '@playwright/test';

test.describe('Forgot Password — Request Flow', () => {
  test('renders forgot password page with email field', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    await expect(page.locator('[data-testid="forgot-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="forgot-submit"]')).toBeVisible();
    await expect(page.locator('text=Forgot Your Password')).toBeVisible();
  });

  test('validation: empty email shows error', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    await page.locator('[data-testid="forgot-submit"]').click();

    await expect(page.locator('text=Please enter your email address')).toBeVisible({ timeout: 5000 });
  });

  test('successful request: shows check-your-email message', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    await page.locator('[data-testid="forgot-email"]').fill('anyone@example.com');
    await page.locator('[data-testid="forgot-submit"]').click();

    await expect(page.locator('text=Check Your Email')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=anyone@example.com')).toBeVisible();
    await expect(page.locator('a:has-text("Back to Login")')).toBeVisible();
  });

  test('non-existent email: still shows success (no user enumeration)', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    await page.locator('[data-testid="forgot-email"]').fill('nonexistent-never-registered-999@test.com');
    await page.locator('[data-testid="forgot-submit"]').click();

    await expect(page.locator('text=Check Your Email')).toBeVisible({ timeout: 10_000 });
    const errorBanner = page.locator('.bg-red-50');
    const errorCount = await errorBanner.count();
    expect(errorCount).toBe(0);
  });

  test('back-to-login link navigates to /login', async ({ page }) => {
    await page.goto('/auth/forgot-password');

    const backLink = page.locator('a[href="/login"]');
    await expect(backLink).toBeVisible();
    await backLink.click();

    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Reset Password — Token & Form', () => {
  test('no token: shows error about missing token', async ({ page }) => {
    await page.goto('/auth/reset-password');

    await expect(page.locator('text=No reset token found')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=password reset link')).toBeVisible();
  });

  test('with fake token: form renders, submit shows server error', async ({ page }) => {
    await page.goto('/auth/reset-password?token=fake-expired-token-abc123');

    await expect(page.locator('[data-testid="reset-password"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="reset-confirm-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="reset-submit"]')).toBeVisible();

    await page.locator('[data-testid="reset-password"]').fill('NewPass123!');
    await page.locator('[data-testid="reset-confirm-password"]').fill('NewPass123!');
    await page.locator('[data-testid="reset-submit"]').click();

    await expect(page.locator('text=expired or invalid')).toBeVisible({ timeout: 10_000 });
  });

  test('password too short: shows validation error', async ({ page }) => {
    await page.goto('/auth/reset-password?token=fake-token');

    await page.locator('[data-testid="reset-password"]').fill('short');
    await page.locator('[data-testid="reset-confirm-password"]').fill('short');
    await page.locator('[data-testid="reset-submit"]').click();

    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible({ timeout: 5000 });
  });

  test('passwords mismatch: shows validation error', async ({ page }) => {
    await page.goto('/auth/reset-password?token=fake-token');

    await page.locator('[data-testid="reset-password"]').fill('NewPassword123!');
    await page.locator('[data-testid="reset-confirm-password"]').fill('DifferentPass99!');
    await page.locator('[data-testid="reset-submit"]').click();

    await expect(page.locator('text=Passwords do not match')).toBeVisible({ timeout: 5000 });
  });

  test('back-to-login link navigates to /login', async ({ page }) => {
    await page.goto('/auth/reset-password?token=fake-token');

    const backLink = page.locator('a[href="/login"]');
    await expect(backLink).toBeVisible();
    await backLink.click();

    await expect(page).toHaveURL(/\/login/);
  });
});
