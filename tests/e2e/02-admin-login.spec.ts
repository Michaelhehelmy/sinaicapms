import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from './pages/admin/dashboard.page';
import { SUPER_ADMIN } from './fixtures/test-data';
import { expectPanelReady } from './fixtures/admin';

test.describe('Admin Login Flow', () => {
  test('admin login page loads with login form', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();

    const loginOverlay = page.locator('[data-testid="login-overlay"]');
    await expect(loginOverlay).toBeVisible();

    const emailField = page.locator('[data-testid="login-email"]');
    const passwordField = page.locator('[data-testid="login-password"]');
    const submitBtn = page.locator('[data-testid="login-submit"]');

    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test('valid credentials navigate to admin dashboard', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();

    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();

    await expectPanelReady(page);

    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();
  });

  test('dashboard shows sidebar navigation', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();

    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();

    await expectPanelReady(page);

    const sidebar = page.locator('[data-testid="sidebar-nav"]');
    await expect(sidebar).toBeVisible();
  });

  test('invalid credentials show error or stay on login', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();

    await page.locator('[data-testid="login-email"]').fill('wrong@example.com');
    await page.locator('[data-testid="login-password"]').fill('wrongpassword');
    await page.locator('[data-testid="login-submit"]').click();

    // Should remain on login or show error
    await page.waitForTimeout(2000);
    const loginVisible = await page.locator('[data-testid="login-overlay"]').isVisible();
    const errorVisible = await page.locator('[data-testid="login-error"], .toast-error, .error').isVisible();

    expect(loginVisible || errorVisible).toBeTruthy();
  });
});
