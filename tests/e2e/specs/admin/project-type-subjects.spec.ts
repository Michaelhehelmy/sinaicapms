/**
 * Project Type → Subjects E2E — type-aware child inventory + cross-project links.
 *
 * Proves the type-aware subjects feature (unified architecture, C3):
 *   1. A tenant whose PRIMARY project (camps[0]) is `transportation` renders
 *      ProjectItemsPanel (vehicle subjects / "Vehicles") in the inventory tab
 *      instead of the legacy RoomsPanel.
 *   2. A vehicle item can be created through the type-scoped form (no Item Type
 *      select — itemType is fixed by the active project's primary operation).
 *   3. The tenant's two projects connect through the links UI, and each
 *      project's edit modal shows the OTHER side (either-side GET).
 *
 * SETUP DEVIATION (must report): the brief's step 2 wanted the primary
 * `transportation` project created through the UI "Add Project" form — but
 * that button only renders ONCE campList.length > 0 (CampsPanel), and a fresh
 * tenant's only affordance is the EmptyState "Create Project" → ListingWizard,
 * which has NO project-type selector (always camp). Since AdminApp keys
 * `activeCamp` to `camps[0]`, the primary transportation project is created via
 * API FIRST (test 1); everything else flows through the UI exactly as the brief
 * describes (camps table row, type-aware vehicle panel + item, second camp
 * project via the Project Type create form, links UI on both sides).
 *
 * Retry-safety: unique subdomain/id/email/names per invocation — generated
 * INSIDE a test body (Date.now() + random), never at module level.
 */
import { test, expect, type Page } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';
import { apiRequest, superAdminLogin } from '../../utils/api-helpers';

/** Shared state captured across the serial tests (each test gets a fresh Page). */
const ctx: {
  tenantId: string;
  subdomain: string;
  adminEmail: string;
  adminPassword: string;
  superToken: string;
  adminToken: string;
  transportName: string;
  campName: string;
  itemName: string;
} = {
  tenantId: '',
  subdomain: '',
  adminEmail: '',
  adminPassword: '',
  superToken: '',
  adminToken: '',
  transportName: '',
  campName: '',
  itemName: '',
};

async function loginAsTenantAdmin(page: Page): Promise<AdminDashboardPage> {
  const admin = new AdminDashboardPage(page);
  await admin.goto(ctx.tenantId);
  await admin.login(ctx.adminEmail, ctx.adminPassword);
  await expectPanelReady(page);
  return admin;
}

test.describe.serial('Project type subjects: transportation primary project', () => {
  test('1 setup — create unique transportation tenant + admin + primary transportation project via API', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    ctx.tenantId = `t2-pt-${suffix}`;
    ctx.subdomain = `t2pt${suffix}`;
    ctx.adminEmail = `admin-${suffix}@test.com`;
    ctx.adminPassword = 'Passw0rd!';
    ctx.transportName = `Transport Co ${suffix}`;
    ctx.campName = `Park Camp ${suffix}`;
    ctx.itemName = `Bus ${suffix}`;

    ctx.superToken = await superAdminLogin();

    // Tenant + admin (auto-provisioned by POST /api/tenants).
    const tenantRes = await apiRequest(
      'POST',
      '/api/tenants',
      {
        id: ctx.tenantId,
        name: `T2 Type-Aware ${suffix}`,
        subdomain: ctx.subdomain,
        type: 'transportation',
        adminEmail: ctx.adminEmail,
        adminPassword: ctx.adminPassword,
        adminFirstName: 'Type',
        adminLastName: 'Admin',
      },
      { Authorization: `Bearer ${ctx.superToken}` },
    );
    const tenantText = await tenantRes.text();
    expect(
      tenantRes.ok,
      `create tenant failed: ${tenantRes.status} ${tenantText}`,
    ).toBeTruthy();

    // Tenant-admin token (tenantId is required for non-super admins).
    const loginRes = await apiRequest('POST', '/api/auth/login', {
      email: ctx.adminEmail,
      password: ctx.adminPassword,
      tenantId: ctx.tenantId,
    });
    const loginText = await loginRes.text();
    expect(
      loginRes.ok,
      `tenant admin login failed: ${loginRes.status} ${loginText}`,
    ).toBeTruthy();
    const loginData = JSON.parse(loginText) as { token: string };
    ctx.adminToken = loginData.token;

    // PRIMARY project — transportation (camps[0], drives the type-aware panel).
    // UI-first is impossible on an empty tenant (Add Project needs ≥1 project;
    // the wizard is camp-only) — so this goes through the API once.
    const headers = {
      Authorization: `Bearer ${ctx.adminToken}`,
      'x-tenant-id': ctx.tenantId,
    };
    const campRes = await apiRequest(
      'POST',
      '/api/camps',
      {
        name: ctx.transportName,
        location: 'Cairo, Egypt',
        projectType: 'transportation',
      },
      headers,
    );
    const campText = await campRes.text();
    expect(
      campRes.ok,
      `create transportation project failed: ${campRes.status} ${campText}`,
    ).toBeTruthy();
  });

  test('2 UI — transportation project row renders in the camps table', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    const row = page.locator('[data-testid="data-table-row"]', {
      hasText: ctx.transportName,
    });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Cairo');
    // Row is editable (Edit button lives in the row actions cell).
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
  });

  test('3 UI — inventory tab renders ProjectItemsPanel (vehicles), not RoomsPanel; create a vehicle item', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms'); // stable nav id, relabeled per project type
    await expectPanelContentReady(page, 'project-items-panel');

    // Type-aware subject: transportation → Vehicles → ProjectItemsPanel.
    await expect(page.locator('[data-testid="project-items-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="rooms-panel"]')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="project-items-panel"] h2'),
    ).toContainText('Vehicles');
    await expect(page.locator('[data-testid="add-item-btn"]')).toContainText('Add Vehicle');

    // Create a vehicle item. itemType is fixed ('vehicle') so no type select.
    await page.locator('[data-testid="add-item-btn"]').click();
    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Add New Item');
    await modal.getByPlaceholder('Item name').fill(ctx.itemName);
    await modal.getByPlaceholder('0.00').fill('250');
    await modal.getByRole('spinbutton', { name: 'Quantity' }).fill('3');
    // Fill the optional Description field so the save sends a non-empty
    // description (an empty description is sent as `undefined`, which the
    // backend D1 INSERT cannot bind).
    await modal.getByPlaceholder('Short description (optional)').fill('Shuttle bus for daily transfers');
    await page.locator('[data-testid="modal-save"]').click();

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
    const table = page.locator('[data-testid="project-items-table"]');
    await expect(table).toBeVisible();
    const itemRow = table.locator('[data-testid="data-table-row"]', {
      hasText: ctx.itemName,
    });
    await expect(itemRow).toBeVisible();
    await expect(itemRow).toContainText('Vehicle');
    await expect(itemRow).toContainText('$250.00');
  });

  test('4 UI — add a SECOND project (Project Type camp) via the Add Project form', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    // add-project-button only renders once ≥1 project exists (created in test 1).
    const addBtn = page.locator('[data-testid="add-project-button"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toBeVisible();
    // Create form exposes the Project Type selector (camp is the default).
    await expect(page.getByLabel('Project Type')).toHaveValue('camp');

    await modal.getByPlaceholder('Project name').fill(ctx.campName);
    await modal
      .getByPlaceholder('Paste Google Maps link or type address')
      .fill('Nuweiba, Egypt');
    await page.locator('[data-testid="modal-save"]').click();

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
    // Back on the camps table with BOTH projects.
    await expectPanelContentReady(page, 'camps-panel');
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.transportName }),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.campName }),
    ).toBeVisible();
  });

  test('5 UI — connect transportation <-> camp via the links UI; either side lists both', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    // Open the TRANSPORTATION project's edit modal.
    const transportRow = page.locator('[data-testid="data-table-row"]', {
      hasText: ctx.transportName,
    });
    await transportRow.getByRole('button', { name: 'Edit' }).click();
    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toContainText('Edit Project');

    // Connections appear in EDIT mode only (not during create).
    const connections = page.locator('[data-testid="project-connections"]');
    await expect(connections).toBeVisible();
    await expect(page.locator('[data-testid="connections-empty"]')).toBeVisible();

    // Link transport → camp ("serves"). Options are labeled by project name.
    await page
      .locator('[data-testid="link-project-select"]')
      .selectOption({ label: ctx.campName });
    await page.locator('[data-testid="link-type-select"]').selectOption('serves');
    await page.locator('[data-testid="add-link-button"]').click();

    const list = page.locator('[data-testid="connections-list"]');
    await expect(list).toBeVisible();
    await expect(list.locator('li', { hasText: ctx.campName })).toBeVisible();
    await expect(list.locator('li', { hasText: ctx.campName })).toContainText(
      'serves',
    );
    await expect(page.locator('[data-testid="connections-empty"]')).toHaveCount(0);

    // Close without saving — meta fields are untouched, the link is already live.
    await page.locator('[data-testid="modal-cancel"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();

    // Open the CAMP project's edit modal: the transportation project must
    // appear in ITS connections list (either-side GET).
    const campRow = page.locator('[data-testid="data-table-row"]', {
      hasText: ctx.campName,
    });
    await campRow.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('[data-testid="modal-content"]')).toContainText(
      'Edit Project',
    );
    await expect(page.locator('[data-testid="connections-list"]')).toBeVisible();
    const fromCamp = page.locator(
      '[data-testid="connections-list"] li',
      { hasText: ctx.transportName },
    );
    await expect(fromCamp).toBeVisible();
    await expect(fromCamp).toContainText('transportation');

    await page.locator('[data-testid="modal-cancel"]').click();
  });

  // Best-effort cleanup so re-runs stay idempotent: remove the tenant's items,
  // links, then the tenant itself. Each step is isolated under try/catch — a
  // cleanup failure must never fail the run.
  test.afterAll(async () => {
    if (!ctx.tenantId || !ctx.adminToken || !ctx.superToken) return;
    const headers = {
      Authorization: `Bearer ${ctx.adminToken}`,
      'x-tenant-id': ctx.tenantId,
    };

    try {
      const items = await apiRequest('GET', '/api/projects/items', undefined, headers);
      if (items.ok) {
        const rows = (await items.json()) as Array<{ id: string }>;
        for (const row of rows) {
          await apiRequest('DELETE', `/api/projects/items/${row.id}`, undefined, headers);
        }
      }
    } catch {
      /* best-effort */
    }

    try {
      const links = await apiRequest('GET', '/api/projects/links', undefined, headers);
      if (links.ok) {
        const rows = (await links.json()) as Array<{ id: string }>;
        for (const row of rows) {
          await apiRequest('DELETE', `/api/projects/links/${row.id}`, undefined, headers);
        }
      }
    } catch {
      /* best-effort */
    }

    try {
      await apiRequest('DELETE', `/api/admin/tenants/${ctx.tenantId}`, undefined, {
        Authorization: `Bearer ${ctx.superToken}`,
      });
    } catch {
      /* best-effort */
    }
  });
});