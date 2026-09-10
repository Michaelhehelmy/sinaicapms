import { test, expect } from '../../fixtures/coverage-fixture';
import { apiRequest, tenantAdminLogin } from '../../utils/api-helpers';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { TEST_TENANT, TEST_TENANT_ADMIN, TEST_PRODUCTS, TEST_POS_USER } from '../../fixtures/test-data';
import { expectPanelContentReady } from '../../fixtures/admin';

// Low-stock + reorder journey (frozen backend, 0042/0074 semantics):
//
//   pos_products.stock_quantity <= min_stock_level (DEFAULT 10) → status 'low'
//   stock_quantity <= 0                                        → status 'out'
//   POST /api/inventory/adjustments { product_id, adjustment } → 201 { new_stock }
//   GET  /api/inventory/low-stock        → pagination envelope of low/out items
//   GET  /api/inventory/reorder-suggestions → { suggestions }
//
// Strategy: drive the seeded e2e-rt-1 rental product below its min level via
// the adjustments API, prove it surfaces in the low-stock API + the admin
// LowStockPanel, then restock and prove it leaves both. Stock is read fresh
// at the start so the test is robust to parallel-spec top-ups (seedTestData
// adds +100 per run) — the adjustment is always depleting to exactly 1.
//
// Serial: the second half (restock) depends on the first half (deplete).

const TENANT_ID = TEST_TENANT.id;
const TARGET_PRODUCT_ID = TEST_PRODUCTS[0].id; // e2e-rt-1 "Standard Tent"

test.describe.serial('Low-stock journey — deplete → alert → restock → clear', () => {
  let tenantToken: string;
  let posToken: string;

  function tenantHeaders() {
    return { Authorization: `Bearer ${tenantToken}`, 'x-tenant-id': String(TENANT_ID) };
  }
  function posHeaders() {
    return { Authorization: `Bearer ${posToken}` };
  }

  test.beforeAll(async () => {
    tenantToken = await tenantAdminLogin();

    const loginRes = await apiRequest('POST', '/api/auth/pos-login', {
      identifier: TEST_POS_USER.identifier,
      password: TEST_POS_USER.password,
    });
    expect(loginRes.status).toBe(200);
    posToken = (await loginRes.json()).token;
    expect(posToken).toBeTruthy();
  });

  async function currentStock(): Promise<number> {
    const res = await apiRequest('GET', '/api/pos/products', undefined, posHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    const products = Array.isArray(data) ? data : data.products ?? data.data ?? [];
    const target = products.find((p: { id?: string }) => p.id === TARGET_PRODUCT_ID);
    expect(target, `seeded product ${TARGET_PRODUCT_ID} missing from POS catalog`).toBeTruthy();
    // POS catalog is a bare camelCase array — stock_quantity → stockQuantity.
    return Number(target.stockQuantity ?? target.stock_quantity ?? 0);
  }

  test('reorder-suggestions endpoint returns the contract shape', async () => {
    const res = await apiRequest('GET', '/api/inventory/reorder-suggestions', undefined, tenantHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.suggestions)).toBe(true);
  });

  test('depleting stock below min level surfaces it in the low-stock API', async () => {
    const stock = await currentStock();
    // Drain to exactly 1 → strictly below min (10) → status 'low'.
    const adjustment = -(stock - 1);

    const adjRes = await apiRequest(
      'POST',
      '/api/inventory/adjustments',
      { product_id: TARGET_PRODUCT_ID, adjustment, reason: 'e2e low-stock journey' },
      tenantHeaders(),
    );
    expect(adjRes.status).toBe(201);
    const adj = await adjRes.json();
    expect(adj.success).toBe(true);
    expect(adj.newStock ?? adj.new_stock).toBe(1);

    const lowRes = await apiRequest('GET', '/api/inventory/low-stock', undefined, tenantHeaders());
    expect(lowRes.status).toBe(200);
    const low = await lowRes.json();
    const items = Array.isArray(low.items) ? low.items : low.data ?? [];
    const target = items.find((i: { id?: string }) => i.id === TARGET_PRODUCT_ID);
    expect(target, `${TARGET_PRODUCT_ID} missing from low-stock list after depletion`).toBeTruthy();
    expect(target.stockQuantity).toBe(1);
    expect(['low', 'out']).toContain(target.status);
  });

  test('admin LowStockPanel reflects the alert for the seeded product', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    for (let attempt = 0; attempt < 3; attempt++) {
      await admin.gotoTab(TENANT_ID, 'low-stock');
      if (await admin.isLoginOverlayVisible()) {
        await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
      }
      try {
        await expectPanelContentReady(page, 'low-stock-panel');
        // Assert on the seeded product's row by ID — other same-name products
        // (e.g. an orphaned "Standard Tent" from an older run) must not cause a
        // false positive here or in the "clears after restock" test.
        await expect(page.locator('[data-testid="low-stock-panel"] [data-row-id="' + TARGET_PRODUCT_ID + '"]')).toHaveCount(1, { timeout: 10_000 });
        return;
      } catch {
        if (attempt === 2) throw new Error(`Low-stock panel failed to show ${TARGET_PRODUCT_ID} row after ${attempt + 1} attempts`);
      }
    }
  });

  test('adjustment that would drive stock negative is rejected with 400', async () => {
    const res = await apiRequest(
      'POST',
      '/api/inventory/adjustments',
      { product_id: TARGET_PRODUCT_ID, adjustment: -999_999 },
      tenantHeaders(),
    );
    expect(res.status).toBe(400);
  });

  test('restocking removes the product from the low-stock API', async () => {
    const restockRes = await apiRequest(
      'POST',
      '/api/inventory/adjustments',
      { product_id: TARGET_PRODUCT_ID, adjustment: 150, reason: 'e2e low-stock restock' },
      tenantHeaders(),
    );
    expect(restockRes.status).toBe(201);
    expect(((await restockRes.json()).newStock ?? (await restockRes.json()).new_stock)).toBeGreaterThan(10);

    const lowRes = await apiRequest('GET', '/api/inventory/low-stock', undefined, tenantHeaders());
    expect(lowRes.status).toBe(200);
    const low = await lowRes.json();
    const items = Array.isArray(low.items) ? low.items : low.data ?? [];
    const target = items.find((i: { id?: string }) => i.id === TARGET_PRODUCT_ID);
    expect(target, `${TARGET_PRODUCT_ID} still listed after restock`).toBeUndefined();
  });

  test('panel clears the alert after restocking', async ({ page }) => {
    const admin = new AdminDashboardPage(page);
    for (let attempt = 0; attempt < 3; attempt++) {
      await admin.gotoTab(TENANT_ID, 'low-stock');
      if (await admin.isLoginOverlayVisible()) {
        await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
      }
      try {
        await expectPanelContentReady(page, 'low-stock-panel');
        // The panel may be EMPTY (no low-stock-list element) or populated with
        // OTHER low items (crud-mutations' freshly created products ship with
        // stock 0 < min 10, and an orphaned same-name "Standard Tent" from an
        // older run may legitimately remain) — the robust check is that the
        // seeded product's ROW (by ID) is gone, covering all those states.
        await expect(page.locator('[data-testid="low-stock-panel"] [data-row-id="' + TARGET_PRODUCT_ID + '"]')).toHaveCount(0, { timeout: 10_000 });
        return;
      } catch {
        if (attempt === 2) throw new Error(`Low-stock panel still shows ${TARGET_PRODUCT_ID} after ${attempt + 1} attempts`);
      }
    }
  });
});