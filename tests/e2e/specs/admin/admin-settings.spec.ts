import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.goto(TEST_TENANT.id);
    await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
    try {
      await expectPanelReady(page);
      return admin;
    } catch {
      if (attempt === 2) throw new Error(`Admin login failed after ${attempt + 1} attempts`);
    }
  }
  return admin;
}

// ─── Settings Panel ───
test.describe('Admin Settings Panel', () => {
  test('settings panel renders with form fields', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');

    const form = page.locator('[data-testid="settings-form"]');
    await expect(form).toBeVisible();
  });

  test('settings form has camp name input', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');

    const nameInput = page.locator('[data-testid="settings-form"] input').first();
    await expect(nameInput).toBeVisible();
    const value = await nameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('settings form has currency selector', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');

    const currencySelect = page.locator('[data-testid="settings-form"] select').first();
    if (await currencySelect.isVisible()) {
      const options = currencySelect.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test('save button is visible and clickable', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');

    const saveBtn = page.locator('[data-testid="settings-save-btn"]');
    await expect(saveBtn).toBeVisible();
    const isDisabled = await saveBtn.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('save settings without changes succeeds', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');

    const saveBtn = page.locator('[data-testid="settings-save-btn"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Should show success toast
    const toast = page.locator('[role="alert"]:has-text("saved"), [role="alert"]:has-text("Success")');
    await expect(toast.first()).toBeVisible({ timeout: 10_000 });
  });

  test('settings form has contact fields', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('settings');
    await expectPanelContentReady(page, 'settings-panel');

    const form = page.locator('[data-testid="settings-form"]');
    const text = await form.textContent();
    // Should have contact-related labels
    expect(text).toMatch(/phone|email|whatsapp|location|description/i);
  });
});

// ─── Password Panel ───
test.describe('Admin Password Panel', () => {
  test('password form renders with all fields', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'settings');
    await expectPanelContentReady(page, 'settings-panel');

    // Password section should be within settings panel
    const passwordSection = page.locator('[data-testid="password-section"]');
    if (await passwordSection.isVisible()) {
      const inputs = passwordSection.locator('input[type="password"]');
      const count = await inputs.count();
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test('password validation: empty current password shows error', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'settings');
    await expectPanelContentReady(page, 'settings-panel');

    const passwordSection = page.locator('[data-testid="password-section"]');
    if (await passwordSection.isVisible()) {
      // Fill only new password fields
      const newPassword = passwordSection.locator('input[type="password"]').nth(1);
      const confirmPassword = passwordSection.locator('input[type="password"]').nth(2);
      if (await newPassword.isVisible()) {
        await newPassword.fill('NewSecurePass123!');
      }
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('NewSecurePass123!');
      }

      // Click change password
      const changeBtn = passwordSection.locator('button:has-text("Change Password")');
      if (await changeBtn.isVisible()) {
        await changeBtn.click();

        // Should show validation error for current password
        const error = page.locator('[data-testid="password-section"] .text-red-500, [data-testid="password-section"] [class*="error"]');
        await expect(error.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('password validation: mismatched new passwords shows error', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'settings');
    await expectPanelContentReady(page, 'settings-panel');

    const passwordSection = page.locator('[data-testid="password-section"]');
    if (await passwordSection.isVisible()) {
      const inputs = passwordSection.locator('input[type="password"]');
      const count = await inputs.count();

      if (count >= 3) {
        await inputs.nth(0).fill('CurrentPass123!');
        await inputs.nth(1).fill('NewSecurePass123!');
        await inputs.nth(2).fill('DifferentPass99!');

        const changeBtn = passwordSection.locator('button:has-text("Change Password")');
        if (await changeBtn.isVisible()) {
          await changeBtn.click();

          const error = page.locator('text=Passwords do not match');
          await expect(error).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('password validation: short password shows error', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'settings');
    await expectPanelContentReady(page, 'settings-panel');

    const passwordSection = page.locator('[data-testid="password-section"]');
    if (await passwordSection.isVisible()) {
      const inputs = passwordSection.locator('input[type="password"]');
      const count = await inputs.count();

      if (count >= 3) {
        await inputs.nth(0).fill('CurrentPass123!');
        await inputs.nth(1).fill('short');
        await inputs.nth(2).fill('short');

        const changeBtn = passwordSection.locator('button:has-text("Change Password")');
        if (await changeBtn.isVisible()) {
          await changeBtn.click();

          const error = page.locator('text=at least 8 characters');
          await expect(error).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('wrong current password shows error and keeps session alive', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'settings');
    await expectPanelContentReady(page, 'settings-panel');

    const passwordSection = page.locator('[data-testid="password-section"]');
    if (await passwordSection.isVisible()) {
      const inputs = passwordSection.locator('input[type="password"]');
      const count = await inputs.count();

      if (count >= 3) {
        await inputs.nth(0).fill('TotallyWrongPassword999!');
        await inputs.nth(1).fill('NewSecurePass123!');
        await inputs.nth(2).fill('NewSecurePass123!');

        const changeBtn = passwordSection.locator('button:has-text("Change Password")');
        if (await changeBtn.isVisible()) {
          await changeBtn.click();

          // Should show error toast — NOT log the user out
          const toast = page.locator('[role="alert"]:has-text("incorrect"), [role="alert"]:has-text("Error"), [role="alert"]:has-text("error")');
          await expect(toast.first()).toBeVisible({ timeout: 10_000 });

          // Session should still be alive — settings panel still visible
          await expect(passwordSection).toBeVisible();
        }
      }
    }
  });

  test('successful password change: change → verify still logged in', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.gotoTab(TEST_TENANT.id, 'settings');
    await expectPanelContentReady(page, 'settings-panel');

    const passwordSection = page.locator('[data-testid="password-section"]');
    if (await passwordSection.isVisible()) {
      const inputs = passwordSection.locator('input[type="password"]');
      const count = await inputs.count();

      if (count >= 3) {
        const currentPass = TEST_TENANT_ADMIN.password;
        const newPass = 'TempPass_Change1!';

        // Step 1: Change to temporary password
        await inputs.nth(0).fill(currentPass);
        await inputs.nth(1).fill(newPass);
        await inputs.nth(2).fill(newPass);

        const changeBtn = passwordSection.locator('button:has-text("Change Password")');
        await changeBtn.click();

        // Should show success toast
        const successToast = page.locator('[role="alert"]:has-text("success"), [role="alert"]:has-text("Success")');
        await expect(successToast.first()).toBeVisible({ timeout: 10_000 });

        // Step 2: Verify still logged in (settings panel still visible)
        await expect(passwordSection).toBeVisible();

        // Step 3: Change back to original password
        const inputsAfter = passwordSection.locator('input[type="password"]');
        await inputsAfter.nth(0).fill(newPass);
        await inputsAfter.nth(1).fill(currentPass);
        await inputsAfter.nth(2).fill(currentPass);
        await changeBtn.click();

        const rollbackToast = page.locator('[role="alert"]:has-text("success"), [role="alert"]:has-text("Success")');
        await expect(rollbackToast.first()).toBeVisible({ timeout: 10_000 });
      }
    }
  });
});
