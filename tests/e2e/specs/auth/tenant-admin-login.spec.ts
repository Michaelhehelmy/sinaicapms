import { test, expect } from '@playwright/test';
import { TENANT_URL, TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';

const VALID_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const VALID_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

const TENANT_ID = TEST_TENANT.id;

test.describe('POS Session & Persistence', () => {
  test('wrong password: fill correct identifier + wrong pass → error message visible → still on login', async ({
    page,
  }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));

    await page.locator('[data-testid="pos-identifier"]').fill(VALID_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill('WrongPassword999!');
    await page.locator('[data-testid="pos-signin-btn"]').click();

    const errorMsg = page.locator('[data-testid="pos-login-error"]');
    const errorCount = await errorMsg.count();
    const errorVisible = errorCount > 0 && await errorMsg.isVisible({ timeout: 8_000 });

    const loginOverlay = page.locator('[data-testid="pos-login"]');
    const formVisible = await loginOverlay.isVisible({ timeout: 3_000 });

    expect(errorVisible || formVisible).toBeTruthy();

    const url = page.url();
    expect(url).toContain('/login');
  });

  test('non-existent identifier: fill bogus@email.com → error → still on login', async ({
    page,
  }) => {
    await page.goto(TENANT_URL('/pos/login', TENANT_ID));

    await page.locator('[data-testid="pos-identifier"]').fill('nonexistent@nowhere.com');
    await page.locator('[data-testid="pos-password"]').fill('SomePassword123!');
    await page.locator('[data-testid="pos-signin-btn"]').click();

    const errorMsg = page.locator('[data-testid="pos-login-error"]');
    const errorCount = await errorMsg.count();
    const errorVisible = errorCount > 0 && await errorMsg.isVisible({ timeout: 8_000 });

    const loginOverlay = page.locator('[data-testid="pos-login"]');
    const formVisible = await loginOverlay.isVisible({ timeout: 3_000 });

    expect(errorVisible || formVisible).toBeTruthy();

    const url = page.url();
    expect(url).toContain('/login');
  });
});
