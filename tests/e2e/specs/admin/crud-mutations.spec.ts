import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN, TEST_TENANT_ADMIN, TEST_TENANT, API_BASE } from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';

const TIMESTAMP = Date.now();
const ROOM_NAME = `E2E Room ${TIMESTAMP}`;
const ROOM_NAME_EDITED = `E2E Room Edited ${TIMESTAMP}`;
const MEAL_NAME = `E2E Meal ${TIMESTAMP}`;
const MEAL_NAME_EDITED = `E2E Meal Edited ${TIMESTAMP}`;
const RATE_PLAN_NAME = `E2E Plan ${TIMESTAMP}`;
const RATE_PLAN_NAME_EDITED = `E2E Plan Edited ${TIMESTAMP}`;

let createdRoomId: string | null = null;
let createdMealId: string | null = null;
let createdRatePlanId: string | null = null;

async function loginAsTenantAdmin(page: import('@playwright/test').Page) {
  const admin = new AdminDashboardPage(page);
  await admin.goto(TEST_TENANT.id);
  await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
  await expectPanelReady(page);
  return admin;
}

async function waitForToast(page: import('@playwright/test').Page, text: string, timeout = 8000) {
  const toast = page.locator(`[role="alert"]:has-text("${text}")`);
  await expect(toast).toBeVisible({ timeout });
}

async function dismissAllToasts(page: import('@playwright/test').Page) {
  const toasts = page.locator('[role="alert"]');
  const count = await toasts.count();
  for (let i = 0; i < count; i++) {
    const dismissBtn = toasts.nth(i).locator('button[aria-label="Dismiss notification"]');
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click().catch(() => {});
    }
  }
}

test.describe('Admin CRUD Mutations — Rooms', () => {
  test('create a new room and verify it appears in the list', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    const addBtn = page.locator('[data-testid="add-room-btn"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-content"]').getByText('Product Type').waitFor();
    const productSelect = page.locator('[data-testid="modal-content"] select').first();
    const options = productSelect.locator('option');
    const optionCount = await options.count();
    if (optionCount > 1) {
      await productSelect.selectOption({ index: 1 });
    }

    const nameInput = page.locator('[data-testid="modal-content"] input[placeholder="e.g. Room 101"]');
    await nameInput.fill(ROOM_NAME);

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'Room created').catch(() =>
      waitForToast(page, 'saved')
    );

    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await expectPanelContentReady(page, 'rooms-panel');
    const row = page.locator('[data-testid="data-table-row"]:has-text("' + ROOM_NAME + '")');
    await expect(row).toBeVisible({ timeout: 8000 });
  });

  test('edit an existing room and verify changes persist', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    const roomRow = page.locator('[data-testid="data-table-row"]:has-text("' + ROOM_NAME + '")');
    if ((await roomRow.count()) === 0) {
      test.skip();
      return;
    }

    const editBtn = roomRow.locator('button:has-text("Edit")');
    await editBtn.click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input[placeholder="e.g. Room 101"]');
    await nameInput.clear();
    await nameInput.fill(ROOM_NAME_EDITED);

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'Room updated').catch(() =>
      waitForToast(page, 'updated')
    );

    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await expectPanelContentReady(page, 'rooms-panel');
    const editedRow = page.locator('[data-testid="data-table-row"]:has-text("' + ROOM_NAME_EDITED + '")');
    await expect(editedRow).toBeVisible({ timeout: 8000 });
  });

  test('delete a room via confirmation dialog', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    const roomRow = page.locator('[data-testid="data-table-row"]:has-text("' + ROOM_NAME_EDITED + '")');
    if ((await roomRow.count()) === 0) {
      test.skip();
      return;
    }

    const deleteBtn = roomRow.locator('button:has-text("Delete")');
    await deleteBtn.click();

    const confirmDialog = page.locator('[role="dialog"]:has-text("Delete Room")');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.locator('button:has-text("Delete")').last().click();

    await waitForToast(page, 'deleted').catch(() =>
      waitForToast(page, 'removed')
    );

    await expectPanelContentReady(page, 'rooms-panel');
    const deletedRow = page.locator('[data-testid="data-table-row"]:has-text("' + ROOM_NAME_EDITED + '")');
    await expect(deletedRow).toHaveCount(0, { timeout: 8000 });
  });
});

test.describe('Admin CRUD Mutations — Meals', () => {
  test('create a new meal and verify it appears in the list', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    const addBtn = page.locator('[data-testid="add-meal-btn"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input[placeholder="Meal name"]');
    await nameInput.fill(MEAL_NAME);

    const categorySelect = page.locator('[data-testid="modal-content"] select').first();
    const catOptions = categorySelect.locator('option');
    const catCount = await catOptions.count();
    if (catCount > 1) {
      await categorySelect.selectOption({ index: 1 });
    }

    const priceInput = page.locator('[data-testid="modal-content"] input[type="number"]').first();
    await priceInput.fill('25');

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'Meal created').catch(() =>
      waitForToast(page, 'saved')
    );

    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await expectPanelContentReady(page, 'meals-panel');
    const row = page.locator('[data-testid="data-table-row"]:has-text("' + MEAL_NAME + '")');
    await expect(row).toBeVisible({ timeout: 8000 });
  });

  test('edit meal details and verify changes', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    const mealRow = page.locator('[data-testid="data-table-row"]:has-text("' + MEAL_NAME + '")');
    if ((await mealRow.count()) === 0) {
      test.skip();
      return;
    }

    const editBtn = mealRow.locator('button:has-text("Edit")');
    await editBtn.click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input[placeholder="Meal name"]');
    await nameInput.clear();
    await nameInput.fill(MEAL_NAME_EDITED);

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'Meal updated').catch(() =>
      waitForToast(page, 'updated')
    );

    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await expectPanelContentReady(page, 'meals-panel');
    const editedRow = page.locator('[data-testid="data-table-row"]:has-text("' + MEAL_NAME_EDITED + '")');
    await expect(editedRow).toBeVisible({ timeout: 8000 });
  });

  test('delete a meal via confirmation dialog', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    const mealRow = page.locator('[data-testid="data-table-row"]:has-text("' + MEAL_NAME_EDITED + '")');
    if ((await mealRow.count()) === 0) {
      test.skip();
      return;
    }

    const deleteBtn = mealRow.locator('button:has-text("Delete")');
    await deleteBtn.click();

    const confirmDialog = page.locator('[role="dialog"]:has-text("Delete Meal")');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.locator('button:has-text("Delete")').last().click();

    await waitForToast(page, 'deleted').catch(() =>
      waitForToast(page, 'removed')
    );

    await expectPanelContentReady(page, 'meals-panel');
    const deletedRow = page.locator('[data-testid="data-table-row"]:has-text("' + MEAL_NAME_EDITED + '")');
    await expect(deletedRow).toHaveCount(0, { timeout: 8000 });
  });
});

test.describe('Admin CRUD Mutations — Rate Plans', () => {
  test('create a new rate plan and verify it appears', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    const addBtn = page.locator('[data-testid="add-rateplan-btn"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input').first();
    await nameInput.fill(RATE_PLAN_NAME);

    const priceInput = page.locator('[data-testid="modal-content"] input[type="number"]').first();
    await priceInput.clear();
    await priceInput.fill('95');

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'Plan created').catch(() =>
      waitForToast(page, 'saved')
    );

    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await expectPanelContentReady(page, 'rate-plans-panel');
    const row = page.locator('[data-testid="data-table-row"]:has-text("' + RATE_PLAN_NAME + '")');
    await expect(row).toBeVisible({ timeout: 8000 });
  });

  test('edit rate plan pricing and verify changes', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    const planRow = page.locator('[data-testid="data-table-row"]:has-text("' + RATE_PLAN_NAME + '")');
    if ((await planRow.count()) === 0) {
      test.skip();
      return;
    }

    const editBtn = planRow.locator('button:has-text("Edit")');
    await editBtn.click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input').first();
    await nameInput.clear();
    await nameInput.fill(RATE_PLAN_NAME_EDITED);

    const priceInput = page.locator('[data-testid="modal-content"] input[type="number"]').first();
    await priceInput.clear();
    await priceInput.fill('120');

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'Plan updated').catch(() =>
      waitForToast(page, 'updated')
    );

    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await expectPanelContentReady(page, 'rate-plans-panel');
    const editedRow = page.locator('[data-testid="data-table-row"]:has-text("' + RATE_PLAN_NAME_EDITED + '")');
    await expect(editedRow).toBeVisible({ timeout: 8000 });
  });

  test('delete a rate plan via confirmation dialog', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    const planRow = page.locator('[data-testid="data-table-row"]:has-text("' + RATE_PLAN_NAME_EDITED + '")');
    if ((await planRow.count()) === 0) {
      test.skip();
      return;
    }

    const deleteBtn = planRow.locator('button:has-text("Delete")');
    await deleteBtn.click();

    const confirmDialog = page.locator('[role="dialog"]:has-text("Delete Rate Plan")');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.locator('button:has-text("Delete")').last().click();

    await waitForToast(page, 'deleted').catch(() =>
      waitForToast(page, 'Deleted')
    );

    await expectPanelContentReady(page, 'rate-plans-panel');
    const deletedRow = page.locator('[data-testid="data-table-row"]:has-text("' + RATE_PLAN_NAME_EDITED + '")');
    await expect(deletedRow).toHaveCount(0, { timeout: 8000 });
  });
});

test.describe('Admin CRUD Mutations — Form Validation', () => {
  test('room create rejects empty required fields', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    await page.locator('[data-testid="add-room-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'required').catch(() =>
      waitForToast(page, 'required')
    );

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible();
    await page.locator('[data-testid="modal-cancel"]').click();
    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 3000 });
  });

  test('meal create rejects empty name', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    await page.locator('[data-testid="add-meal-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'required').catch(() =>
      waitForToast(page, 'required')
    );

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible();
    await page.locator('[data-testid="modal-cancel"]').click();
    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 3000 });
  });

  test('rate plan create rejects empty name', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    await page.locator('[data-testid="add-rateplan-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-save"]').click();

    await waitForToast(page, 'required').catch(() =>
      waitForToast(page, 'required')
    );

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible();
    await page.locator('[data-testid="modal-cancel"]').click();
    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 3000 });
  });
});

test.describe('Admin CRUD Mutations — Cancel Discards', () => {
  test('cancel on room form closes modal without saving', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    await page.locator('[data-testid="add-room-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input[placeholder="e.g. Room 101"]');
    await nameInput.fill('Should Not Save');

    await page.locator('[data-testid="modal-cancel"]').click();
    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 3000 });

    const row = page.locator('[data-testid="data-table-row"]:has-text("Should Not Save")');
    await expect(row).toHaveCount(0);
  });

  test('cancel on meal form closes modal without saving', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    await page.locator('[data-testid="add-meal-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input[placeholder="Meal name"]');
    await nameInput.fill('Should Not Save');

    await page.locator('[data-testid="modal-cancel"]').click();
    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 3000 });

    const row = page.locator('[data-testid="data-table-row"]:has-text("Should Not Save")');
    await expect(row).toHaveCount(0);
  });

  test('cancel on rate plan form closes modal without saving', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    await page.locator('[data-testid="add-rateplan-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('[data-testid="modal-content"] input').first();
    await nameInput.fill('Should Not Save');

    await page.locator('[data-testid="modal-cancel"]').click();
    await page.locator('[data-testid="modal-overlay"]').waitFor({ state: 'hidden', timeout: 3000 });

    const row = page.locator('[data-testid="data-table-row"]:has-text("Should Not Save")');
    await expect(row).toHaveCount(0);
  });
});

test.describe('Admin CRUD Mutations — Success Toast Notifications', () => {
  test('room creation shows success toast', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    const uniqueName = `Toast Room ${Date.now()}`;
    await page.locator('[data-testid="add-room-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    const productSelect = page.locator('[data-testid="modal-content"] select').first();
    const optionCount = await productSelect.locator('option').count();
    if (optionCount > 1) {
      await productSelect.selectOption({ index: 1 });
    }

    await page.locator('[data-testid="modal-content"] input[placeholder="e.g. Room 101"]').fill(uniqueName);
    await page.locator('[data-testid="modal-save"]').click();

    const toast = page.locator('[role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 8000 });
    const toastText = await toast.first().textContent();
    expect(toastText?.toLowerCase()).toMatch(/created|saved|success/);
  });

  test('meal creation shows success toast', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    const uniqueName = `Toast Meal ${Date.now()}`;
    await page.locator('[data-testid="add-meal-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-content"] input[placeholder="Meal name"]').fill(uniqueName);
    const categorySelect = page.locator('[data-testid="modal-content"] select').first();
    if ((await categorySelect.locator('option').count()) > 1) {
      await categorySelect.selectOption({ index: 1 });
    }
    await page.locator('[data-testid="modal-save"]').click();

    const toast = page.locator('[role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 8000 });
    const toastText = await toast.first().textContent();
    expect(toastText?.toLowerCase()).toMatch(/created|saved|success/);
  });

  test('rate plan creation shows success toast', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    const uniqueName = `Toast Plan ${Date.now()}`;
    await page.locator('[data-testid="add-rateplan-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-content"] input').first().fill(uniqueName);
    await page.locator('[data-testid="modal-save"]').click();

    const toast = page.locator('[role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 8000 });
    const toastText = await toast.first().textContent();
    expect(toastText?.toLowerCase()).toMatch(/created|saved|success/);
  });
});

test.describe('Admin CRUD Mutations — Error Handling', () => {
  test('room form validation error shows warning toast', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    await page.locator('[data-testid="add-room-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-save"]').click();

    const toast = page.locator('[role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
    const toastText = await toast.first().textContent();
    expect(toastText?.toLowerCase()).toMatch(/required|warning|error/);
  });

  test('meal form validation error shows warning toast', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('meals');
    await expectPanelContentReady(page, 'meals-panel');

    await page.locator('[data-testid="add-meal-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-save"]').click();

    const toast = page.locator('[role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
    const toastText = await toast.first().textContent();
    expect(toastText?.toLowerCase()).toMatch(/required|warning|error/);
  });

  test('rate plan form validation error shows warning toast', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rateplans');
    await expectPanelContentReady(page, 'rate-plans-panel');

    await page.locator('[data-testid="add-rateplan-btn"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="modal-save"]').click();

    const toast = page.locator('[role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
    const toastText = await toast.first().textContent();
    expect(toastText?.toLowerCase()).toMatch(/required|warning|error/);
  });
});
