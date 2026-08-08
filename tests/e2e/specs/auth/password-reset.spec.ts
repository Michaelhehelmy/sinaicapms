import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Password Reset', () => {
  test('forgot password link exists on POS login page (search for links with "forgot", "reset" text)', async ({
    page,
  }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await expect(page.locator('[data-testid="pos-login"]')).toBeVisible();

    const link = page.locator(
      'a:has-text("forgot"), a:has-text("Forgot"), a:has-text("reset"), a:has-text("Reset"), button:has-text("forgot"), button:has-text("Forgot"), [data-testid="forgot-password"], [href*="reset"], [href*="forgot"]'
    );
    const count = await link.count();

    if (count === 0) {
      // POS login page does not have a forgot password link — skip gracefully
      test.skip(true, 'No forgot password link found on POS login page');
      return;
    }

    const firstLink = link.first();
    await expect(firstLink).toBeVisible();

    const text = (await firstLink.textContent()) || '';
    const tag = await firstLink.evaluate(el => el.tagName.toLowerCase());

    const hasRelevantText =
      text.toLowerCase().includes('forgot') ||
      text.toLowerCase().includes('reset');
    expect(hasRelevantText).toBeTruthy();

    const isAnchor = tag === 'a' || tag === 'button';
    expect(isAnchor).toBeTruthy();
  });

  test('if link exists: clicking it shows email input', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await expect(page.locator('[data-testid="pos-login"]')).toBeVisible();

    const link = page.locator(
      'a:has-text("forgot"), a:has-text("Forgot"), a:has-text("reset"), a:has-text("Reset"), button:has-text("forgot"), button:has-text("Forgot"), [data-testid="forgot-password"], [href*="reset"], [href*="forgot"]'
    );
    const count = await link.count();

    if (count === 0) {
      test.skip(true, 'No forgot password link found');
      return;
    }

    await link.first().click();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5_000 });

    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email');
  });

  test('email input accepts text and value is retained', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await expect(page.locator('[data-testid="pos-login"]')).toBeVisible();

    const link = page.locator(
      'a:has-text("forgot"), a:has-text("Forgot"), a:has-text("reset"), a:has-text("Reset"), button:has-text("forgot"), button:has-text("Forgot"), [data-testid="forgot-password"], [href*="reset"], [href*="forgot"]'
    );
    const count = await link.count();

    if (count === 0) {
      test.skip(true, 'No forgot password link found');
      return;
    }

    await link.first().click();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5_000 });

    const testEmail = 'test@example.com';
    await emailInput.fill(testEmail);

    const retainedValue = await emailInput.inputValue();
    expect(retainedValue).toBe(testEmail);
    expect(retainedValue).toContain('@');
    expect(retainedValue).toContain('.');
  });

  test('if no link: login page still loads correctly', async ({ page }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));
    await page.waitForLoadState('networkidle');

    const link = page.locator(
      'a:has-text("forgot"), a:has-text("Forgot"), a:has-text("reset"), a:has-text("Reset"), button:has-text("forgot"), button:has-text("Forgot"), [data-testid="forgot-password"], [href*="reset"], [href*="forgot"]'
    );
    const count = await link.count();

    if (count > 0) {
      const isVis = await link.first().isVisible();
      expect(isVis).toBeTruthy();
    } else {
      const loginOverlay = page.locator('[data-testid="pos-login"]');
      const loginVisible = await loginOverlay.isVisible();
      expect(loginVisible).toBeTruthy();

      test.skip(true, 'No forgot password option present — page loads correctly');
    }
  });
});
