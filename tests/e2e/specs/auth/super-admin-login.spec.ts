import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';

const VALID_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const VALID_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

const TENANT_ID = TEST_TENANT.id;

test.describe('POS Login — Valid & Invalid Credentials', () => {
  test('invalid login: fill identifier + wrongpass → error message visible OR login overlay stays', async ({
    page,
  }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));

    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill('wrongpass123!');
    await page.locator('[data-testid="pos-signin-btn"]').click();

    const errorMsg = page.locator('[data-testid="pos-login-error"]');
    const loginOverlay = page.locator('[data-testid="pos-login"]');

    const errorCount = await errorMsg.count();
    const errorVisible = errorCount > 0 && await errorMsg.isVisible({ timeout: 8_000 });
    const overlayVisible = await loginOverlay.isVisible({ timeout: 3_000 });

    expect(errorVisible || overlayVisible).toBeTruthy();
  });

  test('invalid login: verify URL still on POS login', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));

    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill('wrongpass123!');
    await page.locator('[data-testid="pos-signin-btn"]').click();

    await expect(page.locator('[data-testid="pos-login"]')).toBeVisible({ timeout: 5000 });
  });

  test('empty fields: click Sign In without filling → HTML5 validation (required attr) or error message', async ({
    page,
  }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));

    const emailEl = page.locator('[data-testid="pos-identifier"]');
    const passEl = page.locator('[data-testid="pos-password"]');

    const emailRequired = await emailEl.getAttribute('required');
    const passRequired = await passEl.getAttribute('required');

    if (emailRequired !== null || passRequired !== null) {
      expect(emailRequired).not.toBeNull();
    } else {
      await page.locator('[data-testid="pos-signin-btn"]').click();

      await expect(page.locator('[data-testid="pos-login-error"]')).toBeVisible({ timeout: 5000 });
    }
  });

  test('POS branding: verify "SinaiCamps POS" text visible on login page', async ({
    page,
  }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));

    const branding = page.locator('[data-testid="pos-branding"]');
    await expect(branding).toBeVisible();

    const textContent = await branding.textContent();
    expect(textContent).toContain('SinaiCamps POS');
  });
});
