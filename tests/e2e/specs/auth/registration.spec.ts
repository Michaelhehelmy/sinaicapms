import { test, expect } from '@playwright/test';

test.describe('Staff Registration (/register)', () => {
  test('registration page loads', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
    const heading = page.locator('h2:has-text("Create Your Account")');
    await expect(heading).toBeVisible();
  });

  test('registration page has form fields', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const nameInput = page.locator('[data-testid="register-name"]');
    const emailInput = page.locator('[data-testid="register-email"]');
    const passwordInput = page.locator('[data-testid="register-password"]');
    const confirmInput = page.locator('[data-testid="register-confirm-password"]');
    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(confirmInput).toBeVisible();
  });

  test('registration page has name input', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const nameInput = page.locator('[data-testid="register-name"]');
    await expect(nameInput).toBeVisible();
    const inputType = await nameInput.getAttribute('type');
    expect(inputType).toBe('text');
  });

  test('registration page has email input', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('[data-testid="register-email"]');
    await expect(emailInput).toBeVisible();
    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email');
  });

  test('registration page has password input', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const pwInput = page.locator('[data-testid="register-password"]');
    const confirmInput = page.locator('[data-testid="register-confirm-password"]');
    await expect(pwInput).toBeVisible();
    await expect(confirmInput).toBeVisible();
    const pwType = await pwInput.getAttribute('type');
    const confirmType = await confirmInput.getAttribute('type');
    expect(pwType).toBe('password');
    expect(confirmType).toBe('password');
  });

  test('registration page has submit button', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.locator('[data-testid="register-submit"]');
    await expect(submitBtn).toBeVisible();
    const text = await submitBtn.textContent();
    expect(text).toContain('Register');
  });

  test('registration page has login link', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const loginLink = page.locator('a[href="/login"]');
    const count = await loginLink.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('registration page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
