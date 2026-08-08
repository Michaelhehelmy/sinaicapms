import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN } from '../../fixtures/test-data';
import { expectPanelReady } from '../../fixtures/admin';

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto();
  await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
  await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
  await page.locator('[data-testid="login-submit"]').click();
  await expectPanelReady(page);
  return admin;
}

test.describe('Admin Login', () => {
  test('shows login overlay on load with correct fields', async ({ page }) => {
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

    const emailTag = await emailField.evaluate((el: HTMLInputElement) => el.tagName.toLowerCase());
    const passwordTag = await passwordField.evaluate((el: HTMLInputElement) => el.tagName.toLowerCase());
    expect(emailTag).toBe('input');
    expect(passwordTag).toBe('input');
  });

  test('valid credentials load dashboard directly (no passcode step)', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();

    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();

    // No passcode step — dashboard loads directly
    await expectPanelReady(page);
    await expect(page.locator('[data-testid="content-area"]')).toBeVisible();
  });

  test('invalid credentials keep login overlay or show error', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    await admin.goto();

    await page.locator('[data-testid="login-email"]').fill('wrong@example.com');
    await page.locator('[data-testid="login-password"]').fill('wrongpassword');
    await page.locator('[data-testid="login-submit"]').click();

    try {
      await page.locator('[data-testid="login-overlay"], [data-testid="login-error"]').first()
        .waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // May show error without these exact testids — continue
    }

    const errorVisible = await page.locator('[data-testid="login-error"], .toast-error, .error').isVisible();
    const loginStillVisible = await page.locator('[data-testid="login-overlay"]').isVisible();

    expect(errorVisible || loginStillVisible).toBeTruthy();
  });

  test('valid credentials loads dashboard with content-area visible', async ({ page }) => {
    await loginAsSuperAdmin(page);

    const contentArea = page.locator('[data-testid="content-area"]');
    await expect(contentArea).toBeVisible();

    const contentText = await contentArea.textContent();
    expect(contentText).toBeTruthy();
    expect((contentText?.trim().length ?? 0)).toBeGreaterThan(0);
  });
});
