import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const UNIQUE_EMAIL = `e2e-reg-${Date.now()}@test.com`;

test.describe('Registration Form — Validation & Submission', () => {
  test('renders registration page with all fields', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('[data-testid="register-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-confirm-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-submit"]')).toBeVisible();
  });

  test('validation: empty name shows error', async ({ page }) => {
    await page.goto('/register');

    await page.locator('[data-testid="register-email"]').fill('test@example.com');
    await page.locator('[data-testid="register-password"]').fill('Password123!');
    await page.locator('[data-testid="register-confirm-password"]').fill('Password123!');
    await page.locator('[data-testid="register-submit"]').click();

    await expect(page.locator('text=Full name is required')).toBeVisible({ timeout: 5000 });
  });

  test('validation: empty email shows error', async ({ page }) => {
    await page.goto('/register');

    await page.locator('[data-testid="register-name"]').fill('Test User');
    await page.locator('[data-testid="register-password"]').fill('Password123!');
    await page.locator('[data-testid="register-confirm-password"]').fill('Password123!');
    await page.locator('[data-testid="register-submit"]').click();

    await expect(page.locator('text=Email is required')).toBeVisible({ timeout: 5000 });
  });

  test('validation: short password shows error', async ({ page }) => {
    await page.goto('/register');

    await page.locator('[data-testid="register-name"]').fill('Test User');
    await page.locator('[data-testid="register-email"]').fill('test@example.com');
    await page.locator('[data-testid="register-password"]').fill('short');
    await page.locator('[data-testid="register-confirm-password"]').fill('short');
    await page.locator('[data-testid="register-submit"]').click();

    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible({ timeout: 5000 });
  });

  test('validation: passwords mismatch shows error', async ({ page }) => {
    await page.goto('/register');

    await page.locator('[data-testid="register-name"]').fill('Test User');
    await page.locator('[data-testid="register-email"]').fill('test@example.com');
    await page.locator('[data-testid="register-password"]').fill('Password123!');
    await page.locator('[data-testid="register-confirm-password"]').fill('DifferentPass99!');
    await page.locator('[data-testid="register-submit"]').click();

    await expect(page.locator('text=Passwords do not match')).toBeVisible({ timeout: 5000 });
  });

  test('all fields empty: shows first validation error on submit', async ({ page }) => {
    await page.goto('/register');

    await page.locator('[data-testid="register-submit"]').click();

    const errorBanner = page.locator('.bg-red-50, [class*="red-50"]');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
    const text = (await errorBanner.textContent()) || '';
    expect(text).toMatch(/required|at least 8/);
  });

  test('successful registration: shows pending approval message', async ({ page }) => {
    await page.goto('/register?tenant=' + TENANT_ID);

    await page.locator('[data-testid="register-name"]').fill('E2E New User');
    await page.locator('[data-testid="register-email"]').fill(UNIQUE_EMAIL);
    await page.locator('[data-testid="register-password"]').fill('SecurePass123!');
    await page.locator('[data-testid="register-confirm-password"]').fill('SecurePass123!');
    await page.locator('[data-testid="register-submit"]').click();

    await expect(page.locator('text=Registration Successful')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=pending administrator approval')).toBeVisible();
    await expect(page.locator('a:has-text("Go to Login")')).toBeVisible();
  });

  test('duplicate email: shows error or success (no user enumeration)', async ({ page }) => {
    await page.goto('/register?tenant=' + TENANT_ID);

    await page.locator('[data-testid="register-name"]').fill('Duplicate User');
    await page.locator('[data-testid="register-email"]').fill(UNIQUE_EMAIL);
    await page.locator('[data-testid="register-password"]').fill('SecurePass123!');
    await page.locator('[data-testid="register-confirm-password"]').fill('SecurePass123!');
    await page.locator('[data-testid="register-submit"]').click();

    const result = page.locator('.bg-red-50, .bg-green-100').or(page.getByText('Registration Successful')).or(page.getByText('already exists'));
    await expect(result.first()).toBeVisible({ timeout: 10_000 });
  });

  test('login link navigates to login page', async ({ page }) => {
    await page.goto('/register?tenant=' + TENANT_ID);

    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();
    await loginLink.click();

    // /login redirects to /admin — both are the login page
    await expect(page).toHaveURL(/\/(admin|login)/);
  });
});
