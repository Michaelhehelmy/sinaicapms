/**
 * Tenant → Projects Lifecycle E2E — full tenant-bootstrap journey through the
 * admin UI only:
 *
 *   1. Super admin creates a camp tenant through the Tenant Directory UI
 *      (SuperTenantsPanel create form — no API shortcut for the tenant).
 *   2. The new tenant's admin logs in on their own tenant scope and creates
 *      the FIRST project through the ListingWizard (product + rate plan).
 *   3. Adds a room for the wizard-created camp.
 *   4. Adds a SECOND project (transportation) through the "Add Project" form.
 *   5. Connects camp ↔ transportation through the links UI (edit-modals on
 *      either side), then removes the link.
 *   6. Renames the camp (Location is required by the form), then verifies the
 *      Settings and Dashboard tabs render for the tenant admin.
 *
 * SETUP DEVIATIONS (must report):
 *   - Step 2: the brief asked for "Add Project" as the first project's
 *     affordance, but `add-project-button` only renders once campList > 0
 *     (CampsPanel). A fresh tenant's ONLY affordance is the EmptyState
 *     "Create Project" action → ListingWizard, which has NO project-type
 *     selector and always creates a camp (backend defaults project_type to
 *     'camp'). So the first project goes through the wizard; the SECOND
 *     project exercises the Add Project + Project Type selector exactly as
 *     the brief describes.
 *   - Step 6: the wizard creates the camp with an empty `location`, and
 *     CampsPanel.handleSave rejects blank locations ("Project location is
 *     required."). The rename therefore also fills the Location field.
 *
 * Retry-safety: unique subdomain/email/names per invocation — generated
 * INSIDE the test body (Date.now() + random), never at module level, so a
 * retried run never collides with a previous run's resources.
 */
import { test, expect, type Page } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';
import { apiRequest, superAdminLogin } from '../../utils/api-helpers';
import { SUPER_ADMIN } from '../../fixtures/test-data';

/** Shared state captured across the serial tests (each test gets a fresh Page). */
const ctx: {
  tenantId: string;
  subdomain: string;
  tenantName: string;
  adminEmail: string;
  adminPassword: string;
  superToken: string;
  campName: string;
  renamedCampName: string;
  roomName: string;
  transportName: string;
} = {
  tenantId: '',
  subdomain: '',
  tenantName: '',
  adminEmail: '',
  adminPassword: '',
  superToken: '',
  campName: '',
  renamedCampName: '',
  roomName: '',
  transportName: '',
};

async function loginAsTenantAdmin(page: Page): Promise<AdminDashboardPage> {
  const admin = new AdminDashboardPage(page);
  await admin.goto(ctx.tenantId);
  await admin.login(ctx.adminEmail, ctx.adminPassword);
  await expectPanelReady(page);
  return admin;
}

test.describe.serial('Tenant project lifecycle', () => {
  test('1 super admin — create a camp tenant through the UI', async ({ page }) => {
    // Unique resources per run, generated inside the body (retry-safe).
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    ctx.subdomain = `tl${suffix}`;
    ctx.tenantName = `Lifecycle Camp ${suffix}`;
    ctx.adminEmail = `e2e-${suffix}@test.com`;
    ctx.adminPassword = 'TestPass123!';
    ctx.campName = `Shore Camp ${suffix}`;
    ctx.renamedCampName = `Shore Camp Renamed ${suffix}`;
    ctx.roomName = `Sea View Tent ${suffix}`;
    ctx.transportName = `Shore Transfers ${suffix}`;

    ctx.superToken = await superAdminLogin();

    // Log in as the super admin on the marketplace scope.
    const admin = new AdminDashboardPage(page);
    await admin.goto();
    await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
    await expectPanelReady(page);
    await admin.clickTab('super_tenants');
    await expectPanelContentReady(page, 'super-tenants-panel');

    // Open the create-tenant form and fill it manually (form has no field ids
    // or labels, so the inputs are matched by their placeholders).
    const table = page.locator('[data-testid="tenants-table"]');
    await expect(table).toBeVisible();

    await page.locator('[data-testid="create-tenant-btn"]').click();
    const form = page.locator('[data-testid="create-tenant-form"]');
    await expect(form).toBeVisible();

    await form.getByPlaceholder('e.g., Acacia Camp').fill(ctx.tenantName);
    await form.getByPlaceholder('e.g., acaciacamp').fill(ctx.subdomain);
    // Type is the only native select inside the create-tenant form.
    await form.locator('select').selectOption('camp');
    await form.getByPlaceholder('admin@example.com').fill(ctx.adminEmail);
    await form.getByPlaceholder('Min 8 characters').fill(ctx.adminPassword);
    await form.getByPlaceholder('First name').fill('Lifecycle');
    await form.getByPlaceholder('Last name').fill('Admin');
    await form.getByPlaceholder('Google Maps link or address').fill('Nuweiba, South Sinai');
    await form.getByRole('button', { name: 'Create Tenant', exact: true }).click();

    // The tenant card appears with the Camp type badge.
    const card = page.locator('[data-testid="tenants-table"] > div', {
      hasText: ctx.tenantName,
    });
    await expect(card).toBeVisible();
    await expect(card.getByTestId('tenant-type-badge')).toHaveText('Camp');
    await expect(card).toContainText(`${ctx.subdomain}.sinaicamps.com`);

    // Resolve the REAL tenant id (the UI submit lets the backend generate
    // `tenant_<hex>`; it is NOT the subdomain). The admin host is resolved by
    // id|subdomain|custom_domain, so a public GET by subdomain returns it.
    const lookup = await apiRequest('GET', `/api/tenants/${ctx.subdomain}`);
    const lookupText = await lookup.text();
    expect(
      lookup.ok,
      `tenant lookup by subdomain failed: ${lookup.status} ${lookupText}`,
    ).toBeTruthy();
    const tenant = JSON.parse(lookupText) as { id: string };
    ctx.tenantId = tenant.id;
    expect(ctx.tenantId).toMatch(/^tenant_/);
  });

  test('2 tenant admin — first camp project via the ListingWizard', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    // Fresh tenant: NO "Add Project" button (needs ≥1 project) — the only
    // affordance is the EmptyState action that opens the ListingWizard.
    const campsPanel = page.locator('[data-testid="camps-panel"]');
    await expect(campsPanel.locator('[data-testid="add-project-button"]')).toHaveCount(0);
    const createProject = campsPanel.getByRole('button', { name: 'Create Project' });
    await expect(createProject).toBeVisible();
    await createProject.click();

    // Wizard: Details → Amenities → Pricing → Photos (camp-only, no type).
    const wizard = page.locator('[data-testid="listing-wizard"]');
    await expect(wizard).toBeVisible();

    // The Next / Create Listing buttons live in the ModalFooter, a sibling of
    // the <div data-testid="listing-wizard"> body — so they must be scoped to
    // the modal card ([data-testid="modal-content"]) which wraps body + footer.
    const wizardModal = page.locator('[data-testid="modal-content"]');

    await page.getByLabel('Listing Name *').fill(ctx.campName);
    await page.getByLabel('Accommodation Type *').selectOption({ label: 'Tent' });
    await page.getByLabel('Capacity').fill('4');
    await wizardModal.getByRole('button', { name: 'Next' }).click();

    await expect(page.locator('[data-testid="wizard-step-amenities"]')).toBeVisible();
    await wizardModal.getByRole('button', { name: 'Next' }).click();

    await expect(page.locator('[data-testid="wizard-step-pricing"]')).toBeVisible();
    await page.getByLabel('Base Price (per night) *').fill('80');
    await wizardModal.getByRole('button', { name: 'Next' }).click();

    await expect(page.locator('[data-testid="wizard-step-photos"]')).toBeVisible();
    await wizardModal.getByRole('button', { name: 'Create Listing' }).click();

    // Wizard closes; the camps table now shows the wizard-created project and
    // the top-bar badge reflects the tenant admin's active camp.
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
    await expectPanelContentReady(page, 'camps-panel');
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.campName }),
    ).toBeVisible();
    await expect(page.locator('[data-testid="active-camp-badge"]')).toContainText(ctx.campName);
  });

  test('3 tenant admin — add a room to the camp project', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('rooms');
    await expectPanelContentReady(page, 'rooms-panel');

    await page.locator('[data-testid="add-room-btn"]').click();
    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toContainText('Add New Room');

    // The wizard created a product named after the camp with capacity 4:
    // options are labeled "<project> (Cap: N)".
    await page.getByLabel('Product Type *').selectOption({ label: `${ctx.campName} (Cap: 4)` });
    await page.getByLabel('Room Name *').fill(ctx.roomName);
    await page.locator('[data-testid="modal-save"]').click();

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
    const roomRow = page
      .locator('[data-testid="rooms-table"] [data-testid="data-table-row"]')
      .filter({ hasText: ctx.roomName });
    await expect(roomRow).toBeVisible();
  });

  test('4 tenant admin — add a second (transportation) project via Add Project', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    // add-project-button renders now that one project exists.
    const addBtn = page.locator('[data-testid="add-project-button"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toBeVisible();
    // Create form exposes the Project Type selector (camp is the default).
    await expect(page.getByLabel('Project Type')).toHaveValue('camp');
    await page.getByLabel('Project Type').selectOption('transportation');

    await modal.getByPlaceholder('Project name').fill(ctx.transportName);
    await modal
      .getByPlaceholder('Paste Google Maps link or type address')
      .fill('Cairo, Egypt');
    await page.locator('[data-testid="modal-save"]').click();

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
    await expectPanelContentReady(page, 'camps-panel');
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.campName }),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.transportName }),
    ).toBeVisible();
  });

  test('5 tenant admin — link camp ↔ transportation (either side), then remove the link', async ({ page }) => {
    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    // Open the CAMP project's edit modal — the links UI lives in EDIT mode.
    const campRow = page.locator('[data-testid="data-table-row"]', {
      hasText: ctx.campName,
    });
    await campRow.getByRole('button', { name: 'Edit' }).click();
    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toContainText('Edit Project');

    const connections = page.locator('[data-testid="project-connections"]');
    await expect(connections).toBeVisible();
    await expect(page.locator('[data-testid="connections-empty"]')).toBeVisible();

    // Camp → transportation ("supplies"). Options are labeled by project name.
    await page
      .locator('[data-testid="link-project-select"]')
      .selectOption({ label: ctx.transportName });
    await page.locator('[data-testid="link-type-select"]').selectOption('supplies');
    await page.locator('[data-testid="add-link-button"]').click();

    const list = page.locator('[data-testid="connections-list"]');
    await expect(list).toBeVisible();
    const campSideLi = list.locator('li', { hasText: ctx.transportName });
    await expect(campSideLi).toBeVisible();
    await expect(campSideLi).toContainText('supplies');
    await expect(page.locator('[data-testid="connections-empty"]')).toHaveCount(0);

    // Close without saving — the link is already live server-side.
    await page.locator('[data-testid="modal-cancel"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();

    // Open the TRANSPORTATION project: the camp must appear in ITS list too.
    const transportRow = page.locator('[data-testid="data-table-row"]', {
      hasText: ctx.transportName,
    });
    await transportRow.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('[data-testid="modal-content"]')).toContainText('Edit Project');

    const transportSideList = page.locator('[data-testid="connections-list"]');
    await expect(transportSideList).toBeVisible();
    const transportSideLi = transportSideList.locator('li', { hasText: ctx.campName });
    await expect(transportSideLi).toBeVisible();
    await expect(transportSideLi).toContainText('camp');
    await expect(transportSideLi).toContainText('supplies');

    // Remove the link from the transportation side.
    await transportSideLi.locator('[data-testid^="remove-link-"]').click();
    // Target the confirm dialog by its unique accessible name — the broader
    // `[role="dialog"]` + hasText match also hits the still-open "Edit Project"
    // modal (which contains the same "Remove Connection" text in its links UI).
    const confirmDialog = page.getByRole('dialog', { name: 'Remove Connection' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Yes, Remove' }).click();

    await expect(page.locator('[data-testid="connections-empty"]')).toBeVisible();
    await page.locator('[data-testid="modal-cancel"]').click();
    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
  });

  test('6 tenant admin — rename the camp (location required) and verify settings + dashboard', async ({ page }) => {
    // The backend marks GET /camps `Cache-Control: public, max-age=300`, so the
    // browser HTTP cache can serve the PRE-rename body back to the post-save
    // refetch, hiding the rename from the UI. Cache-bust every GET /camps with a
    // unique query param so the refetch always hits the backend fresh.
    let cacheBust = 0;
    await page.route('**/api/v1/camps', (route, request) => {
      const url = request.url();
      if (request.method() === 'GET') {
        const sep = url.includes('?') ? '&' : '?';
        route.continue({ url: `${url}${sep}__cb=${Date.now()}_${cacheBust++}` });
      } else {
        route.continue();
      }
    });

    const admin = await loginAsTenantAdmin(page);
    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    const campRow = page.locator('[data-testid="data-table-row"]', {
      hasText: ctx.campName,
    });
    await campRow.getByRole('button', { name: 'Edit' }).click();
    const modal = page.locator('[data-testid="modal-content"]');
    await expect(modal).toContainText('Edit Project');

    // Edit submit stays disabled until the project meta query resolves.
    const saveBtn = page.locator('[data-testid="modal-save"]');
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });

    // The wizard created the camp WITHOUT a location, and the form rejects
    // empty locations — so the rename also fills Location.
    await page.getByLabel('Name *').fill(ctx.renamedCampName);
    await page.locator('#camp-location').fill('Dahab, South Sinai');
    await saveBtn.click();

    await expect(page.locator('[data-testid="modal-overlay"]')).toBeHidden();
    await expectPanelContentReady(page, 'camps-panel');
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.renamedCampName }),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="data-table-row"]', { hasText: ctx.campName }),
    ).toHaveCount(0);
    await expect(page.getByTestId('active-camp-badge')).toContainText(ctx.renamedCampName);

    // Settings tab loads for the tenant admin (keyword assert).
    await admin.clickTab('settings');
    await expectPanelContentReady(page);
    const settingsPanel = page.locator('[data-testid="settings-panel"]');
    await expect(settingsPanel).toBeVisible();
    await expect(settingsPanel).toContainText(/settings|branding|display name|theme/i);

    // Dashboard tab loads with stat cards.
    await admin.clickTab('dashboard');
    await expectPanelContentReady(page, 'dashboard-panel');
    await expect(page.locator('[data-testid="admin-stat-cards"]')).toBeVisible();
    expect(await page.locator('[data-testid="stat-card"]').count()).toBeGreaterThan(0);
  });

  // Best-effort cleanup so re-runs stay idempotent: remove the tenant's links
  // and rooms, then the tenant itself. Each step is isolated under try/catch —
  // a cleanup failure must never fail the run.
  test.afterAll(async () => {
    if (!ctx.tenantId || !ctx.superToken) return;

    // Tenant-admin token for scoped cleanup (links/rooms), if obtainable.
    let adminToken = '';
    try {
      const loginRes = await apiRequest('POST', '/api/auth/login', {
        email: ctx.adminEmail,
        password: ctx.adminPassword,
        tenantId: ctx.tenantId,
      });
      if (loginRes.ok) {
        const data = (await loginRes.json()) as { token: string };
        adminToken = data.token;
      }
    } catch {
      /* best-effort */
    }

    if (adminToken) {
      const headers = {
        Authorization: `Bearer ${adminToken}`,
        'x-tenant-id': ctx.tenantId,
      };
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
        const rooms = await apiRequest('GET', '/api/rooms', undefined, headers);
        if (rooms.ok) {
          const rows = (await rooms.json()) as Array<{ id: string }>;
          for (const row of rows) {
            await apiRequest('DELETE', `/api/rooms/${row.id}`, undefined, headers);
          }
        }
      } catch {
        /* best-effort */
      }
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