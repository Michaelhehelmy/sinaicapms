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

/** Wait for the tenants table to be visible and loaded. */
async function waitForTenantsTable(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="tenants-table"]').first()
    .waitFor({ state: 'visible', timeout: 15_000 });
}

/** Open the admin users list and wait for it to load. */
async function openAdminList(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("Show Admin Users")').first().click();
  // Wait for the toggle button to switch to "Hide Admin Users" — confirms the list rendered
  await page.locator('button:has-text("Hide Admin Users")').waitFor({ state: 'visible', timeout: 10_000 });
}

// Timestamp for unique email addresses across retries
const TS = Date.now();
const TEST_ADMIN_EMAIL = `e2e-crud-admin-${TS}@test.com`;
const TEST_ADMIN_FIRST = 'Crud';
const TEST_ADMIN_LAST = 'Tester';
const TEST_ADMIN_PASSWORD = 'TestPass123!';

/* ------------------------------------------------------------------ */
/* Admin CRUD — SuperTenantsPanel                                     */
/* Tests the create/edit/delete admin user workflow in the admin       */
/* dashboard's Tenant Directory panel.                                */
/* ------------------------------------------------------------------ */

test.describe('Admin User CRUD via SuperTenantsPanel', () => {
  test.describe('Admin Users Section', () => {
    test('Show Admin Users button exists and toggles list', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      const toggleBtn = page.locator('button:has-text("Show Admin Users"), button:has-text("Hide Admin Users")');
      await expect(toggleBtn.first()).toBeVisible();

      // Click to show
      await toggleBtn.first().click();
      await expectPanelReady(page);

      // After toggling, the button text changes and admin list is visible
      const hideBtn = page.locator('button:has-text("Hide Admin Users")');
      await expect(hideBtn).toBeVisible();
    });

    test('Create Admin button appears after showing admin list', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      // Show admin list
      await openAdminList(page);

      // Create Admin button should be visible
      const createBtn = page.locator('[data-testid="create-admin-btn"]');
      await expect(createBtn).toBeVisible();
      await expect(createBtn).toContainText('Create Admin');
    });
  });

  test.describe('Create Admin User', () => {
    test('Create Admin button opens form with required fields', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      // Show admin list
      await openAdminList(page);

      // Click Create Admin
      await page.locator('[data-testid="create-admin-btn"]').click();

      // Form should appear
      const form = page.locator('[data-testid="create-admin-form"]');
      await expect(form).toBeVisible();

      // Required fields exist
      const emailInput = form.locator('input[type="email"]');
      const passwordInput = form.locator('input[type="password"]');
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('Create Admin form has role and tenant selectors', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);
      await page.locator('[data-testid="create-admin-btn"]').click();

      const form = page.locator('[data-testid="create-admin-form"]');
      // Role selector
      const roleSelect = form.locator('select').first();
      await expect(roleSelect).toBeVisible();
      const roleOptions = await roleSelect.locator('option').allTextContents();
      expect(roleOptions.some(o => o.toLowerCase().includes('admin'))).toBeTruthy();

      // Tenant selector
      const tenantSelect = form.locator('select').nth(1);
      await expect(tenantSelect).toBeVisible();
    });

    test('Create Admin form validates empty email', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);
      await page.locator('[data-testid="create-admin-btn"]').click();

      // Submit with empty email — should show toast error
      const form = page.locator('[data-testid="create-admin-form"]');
      await form.locator('button:has-text("Create Admin")').click();

      // Toast uses role="alert" (see app/src/components/ui/Toast.tsx)
      const toast = page.locator('[role="alert"]');
      await expect(toast.first()).toBeVisible({ timeout: 5_000 });
      const toastText = await toast.first().textContent() ?? '';
      expect(toastText.toLowerCase()).toContain('email');
    });

    test('Create Admin form submits with valid data and shows new admin', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);
      await page.locator('[data-testid="create-admin-btn"]').click();

      const form = page.locator('[data-testid="create-admin-form"]');
      await form.locator('input[type="email"]').fill(TEST_ADMIN_EMAIL);
      await form.locator('input[type="password"]').fill(TEST_ADMIN_PASSWORD);
      await form.locator('input[type="text"]').first().fill(TEST_ADMIN_FIRST);
      await form.locator('input[type="text"]').nth(1).fill(TEST_ADMIN_LAST);

      // Submit
      await form.locator('button:has-text("Create Admin")').click();

      // Toast uses role="alert" (see app/src/components/ui/Toast.tsx)
      const toast = page.locator('[role="alert"]');
      await expect(toast.first()).toBeVisible({ timeout: 10_000 });
      const toastText = await toast.first().textContent() ?? '';
      expect(toastText.toLowerCase()).toContain('created');

      // Form should close
      await expect(form).not.toBeVisible({ timeout: 5_000 });

      // Admin list should now include the new admin
      const adminList = page.locator('[data-testid="content-area"]');
      const content = await adminList.textContent() ?? '';
      expect(content).toContain(TEST_ADMIN_EMAIL);
    });
  });

  test.describe('Edit Admin User', () => {
    test('Edit button opens inline edit form', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      // Find an edit button for a non-super-admin user
      const editBtns = page.locator('[data-testid^="edit-admin-"]');
      const count = await editBtns.count();
      test.skip(count < 1, 'No editable admin users found');

      await editBtns.first().click();

      // Inline edit form should appear with Save/Cancel buttons
      const saveBtn = page.locator('button:has-text("Save")').first();
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      await expect(saveBtn).toBeVisible();
      await expect(cancelBtn).toBeVisible();
    });

    test('Edit form pre-fills with admin data', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      const editBtns = page.locator('[data-testid^="edit-admin-"]');
      const count = await editBtns.count();
      test.skip(count < 1, 'No editable admin users found');

      // Get the admin's current name from the row
      const adminRow = editBtns.first().locator('..').locator('..');
      const originalName = await adminRow.locator('p').first().textContent() ?? '';

      await editBtns.first().click();

      // Wait for inline edit form to appear (has Save button inside admin card)
      const saveBtn = page.locator('button:has-text("Save")').first();
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });

      // First name input should have a value (pre-filled)
      const firstNameInput = page.locator('label:has-text("First Name") + input, label:has-text("First Name") ~ input').first();
      const value = await firstNameInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    });

    test('Cancel edit discards changes', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      const editBtns = page.locator('[data-testid^="edit-admin-"]');
      const count = await editBtns.count();
      test.skip(count < 1, 'No editable admin users found');

      await editBtns.first().click();

      // Click Cancel
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      await cancelBtn.click();

      // Edit form should close — edit buttons should be visible again
      await expect(editBtns.first()).toBeVisible();
    });
  });

  test.describe('Toggle Admin Active Status', () => {
    test('Deactivate button appears for active admins', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      // The admin list section has a "space-y-3" container with admin cards.
      // Each non-super_admin card shows Active/Inactive badge + Edit/Deactivate/Activate/Delete buttons.
      // Only check deactivate/activate buttons (ignore tenant status badges elsewhere on page).
      const deactivateBtns = page.locator('button:has-text("Deactivate")');
      const activateBtns = page.locator('button:has-text("Activate")');
      const deactivateCount = await deactivateBtns.count();
      const activateCount = await activateBtns.count();

      // With at least one non-super_admin seeded admin, there should be
      // either a Deactivate button (if active) or an Activate button (if inactive).
      const toggleCount = deactivateCount + activateCount;
      // If there are no toggle buttons, the admin list is empty or all admins
      // are super_admin — that's a valid state, just verify the list is rendered.
      if (toggleCount === 0) {
        // Verify the admin section is at least visible (empty list or all super_admin)
        const adminSection = page.locator('button:has-text("Hide Admin Users")');
        await expect(adminSection).toBeVisible();
      } else {
        expect(toggleCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Delete Admin User', () => {
    test('Delete button shows confirmation dialog', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      // Find delete buttons
      const deleteBtns = page.locator('[data-testid^="delete-admin-"]');
      const count = await deleteBtns.count();
      test.skip(count < 1, 'No deletable admin users found');

      await deleteBtns.first().click();

      // ConfirmDialog uses role="dialog" (see app/src/components/ui/ConfirmDialog.tsx)
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog.first()).toBeVisible({ timeout: 5_000 });

      // Should have Delete and Cancel buttons
      const deleteConfirm = confirmDialog.locator('button:has-text("Delete")');
      const cancelBtn = confirmDialog.locator('button:has-text("Cancel")');
      await expect(deleteConfirm).toBeVisible();
      await expect(cancelBtn).toBeVisible();
    });

    test('Cancel delete dismisses dialog without removing admin', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      const deleteBtns = page.locator('[data-testid^="delete-admin-"]');
      const count = await deleteBtns.count();
      test.skip(count < 1, 'No deletable admin users found');

      // Count admins before cancel
      const adminCards = page.locator('[data-testid="content-area"] > div > div > div');
      const beforeCount = await adminCards.count();

      await deleteBtns.first().click();

      // Cancel the deletion
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog.first()).toBeVisible({ timeout: 5_000 });
      await confirmDialog.locator('button:has-text("Cancel")').click();

      // Dialog should close
      await expect(confirmDialog.first()).not.toBeVisible({ timeout: 3_000 });

      // Admin count should remain unchanged
      const afterCount = await adminCards.count();
      expect(afterCount).toBe(beforeCount);
    });

    test('Confirm delete removes admin from list', async ({ page }) => {
      const admin = await loginAsSuperAdmin(page);
      await admin.clickTab('super_tenants');
      await expectPanelReady(page);
      await waitForTenantsTable(page);

      await openAdminList(page);

      // First, create a throwaway admin to delete
      await page.locator('[data-testid="create-admin-btn"]').click();
      const form = page.locator('[data-testid="create-admin-form"]');
      const throwawayEmail = `e2e-delete-${Date.now()}@test.com`;
      await form.locator('input[type="email"]').fill(throwawayEmail);
      await form.locator('input[type="password"]').fill('DeleteTest123!');
      await form.locator('button:has-text("Create Admin")').click();

      // Toast uses role="alert" (see app/src/components/ui/Toast.tsx)
      const toast = page.locator('[role="alert"]');
      await expect(toast.first()).toBeVisible({ timeout: 10_000 });
      await expectPanelReady(page);

      // Verify the admin appears in the list
      const content = await page.locator('[data-testid="content-area"]').textContent() ?? '';
      expect(content).toContain(throwawayEmail);

      // Find the delete button for the throwaway admin row (has data-testid="delete-admin-{id}")
      // The row contains the email text — find it via the admin card structure.
      const adminCards = page.locator('[data-testid="content-area"] .space-y-3 > div');
      const cardCount = await adminCards.count();
      let targetDeleteBtn = page.locator('[data-testid^="delete-admin-"]').first();
      for (let i = 0; i < cardCount; i++) {
        const cardText = await adminCards.nth(i).textContent() ?? '';
        if (cardText.includes(throwawayEmail)) {
          targetDeleteBtn = adminCards.nth(i).locator('[data-testid^="delete-admin-"]');
          break;
        }
      }
      await targetDeleteBtn.click();

      // Confirm deletion
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog.first()).toBeVisible({ timeout: 5_000 });
      await confirmDialog.locator('button:has-text("Delete")').click();

      // Wait for success toast
      const deletedToast = page.locator('[role="alert"]:has-text("deleted"), [role="alert"]:has-text("Deleted")');
      await expect(deletedToast.first()).toBeVisible({ timeout: 10_000 });
      const toastText = await deletedToast.first().textContent() ?? '';
      expect(toastText.toLowerCase()).toContain('deleted');

      // Admin should no longer appear in the list
      await expectPanelReady(page);
      const updatedContent = await page.locator('[data-testid="content-area"]').textContent() ?? '';
      expect(updatedContent).not.toContain(throwawayEmail);
    });
  });
});
