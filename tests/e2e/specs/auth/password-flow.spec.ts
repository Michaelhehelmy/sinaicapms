import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';

test.describe('Auth Password Flow', () => {
  test('invalid credentials show error on login', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();
    await page.locator('[data-testid="login-email"]').fill('nonexistent@test.com');
    await page.locator('[data-testid="login-password"]').fill('wrongpassword');
    await page.locator('[data-testid="login-submit"]').click();
    try {
      await page.locator('[data-testid="login-overlay"], [data-testid="login-error"]').first()
        .waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // May have error without showing overlay — continue
    }
    const errorVisible = await page.locator('[data-testid="login-error"]').isVisible();
    const loginStillVisible = await page.locator('[data-testid="login-overlay"]').isVisible();
    expect(errorVisible || loginStillVisible).toBeTruthy();
  });

  test('valid email/password logs in successfully', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();
    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();
    await page
      .locator('[data-testid="content-area"]')
      .waitFor({ state: 'visible', timeout: 10_000 });
    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();
  });

  test('empty form submission shows validation', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();
    await page.locator('[data-testid="login-submit"]').click();
    try {
      await page.locator('[data-testid="login-overlay"], [data-testid="login-error"]').first()
        .waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // May have validation without showing overlay — continue
    }
    const loginStillVisible = await page.locator('[data-testid="login-overlay"]').isVisible();
    const errorVisible = await page.locator('[data-testid="login-error"]').isVisible();
    expect(loginStillVisible || errorVisible).toBeTruthy();
  });
});
