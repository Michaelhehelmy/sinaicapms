import { test, expect } from '@playwright/test';

test.describe('Password Reset Flow', () => {
  test('forgot password page loads', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
    const heading = page.locator('h2:has-text("Forgot Your Password")');
    await expect(heading).toBeVisible();
  });

  test('forgot password has email input', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('[data-testid="forgot-email"]');
    await expect(emailInput).toBeVisible();
    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email');
  });

  test('forgot password has submit button', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.locator('[data-testid="forgot-submit"]');
    await expect(submitBtn).toBeVisible();
    const text = await submitBtn.textContent();
    expect(text).toContain('Send Reset Link');
  });

  test('forgot password has back to login link', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');
    const loginLink = page.locator('a[href="/login"]');
    const count = await loginLink.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('reset password page loads', async ({ page }) => {
    await page.goto('/auth/reset-password?token=test-token');
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
    const heading = page.locator('h2:has-text("Reset Your Password")');
    await expect(heading).toBeVisible();
  });

  test('reset password has new password input', async ({ page }) => {
    await page.goto('/auth/reset-password?token=test-token');
    await page.waitForLoadState('networkidle');
    const pwInput = page.locator('[data-testid="reset-password"]');
    const confirmInput = page.locator('[data-testid="reset-confirm-password"]');
    await expect(pwInput).toBeVisible();
    await expect(confirmInput).toBeVisible();
    const pwType = await pwInput.getAttribute('type');
    expect(pwType).toBe('password');
  });

  test('reset password has submit button', async ({ page }) => {
    await page.goto('/auth/reset-password?token=test-token');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.locator('[data-testid="reset-submit"]');
    await expect(submitBtn).toBeVisible();
    const text = await submitBtn.textContent();
    expect(text).toContain('Reset Password');
  });

  test('reset password has back to login link', async ({ page }) => {
    await page.goto('/auth/reset-password?token=test-token');
    await page.waitForLoadState('networkidle');
    const loginLink = page.locator('a[href="/login"]');
    const count = await loginLink.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('forgot password page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('reset password page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/auth/reset-password?token=test-token');
    await page.waitForLoadState('networkidle');
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
