import { test, expect } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import {
  SUPER_ADMIN,
  TEST_TENANT,
  TEST_TENANT_ADMIN,
  TEST_CAMPS,
} from '../../fixtures/test-data';
import { expectPanelReady, expectPanelContentReady } from '../../fixtures/admin';
import { apiRequest, superAdminLogin, tenantAdminLogin } from '../../utils/api-helpers';

/**
 * Tenant-project isolation (T3).
 *
 * Proves the tenant boundary around projects (camps) and their relationships
 * (project links + project items):
 *
 *  - Super admin drills into ANY tenant from the Tenant Directory and sees
 *    exactly that tenant's projects in the embedded CampsPanel (marketplace
 *    host, `setTenantScope` override on the api client).
 *  - Marketplace-scoped GET /api/camps (no x-tenant-id) returns ONE active
 *    project per tenant (GROUP BY tenant_id) — a super-admin-wide directory.
 *  - A tenant admin's GET /api/camps is strictly scoped to their own tenant.
 *  - Project links and items are strictly scoped per tenant: cross-tenant link
 *    creation is rejected with 400, and list endpoints never leak rows.
 *  - The UI (camps tab / drill-down) reflects the same boundary.
 *
 * Every test creates UNIQUE tenant + project ids (Date.now() + random suffix),
 * so reruns/retries and parallel workers never collide. The suite's global
 * setup guarantees the acacia seed tenant (TEST_TENANT + TEST_CAMPS) exists.
 */

/** Fresh, unique tenant account per test invocation (retry/parallel safe). */
function makeIsolationTenant(tag: string) {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const id = `iso-${tag}-${stamp}`;
  return {
    id,
    subdomain: id,
    name: `Isolation Tenant ${id}`,
    adminEmail: `${id}@test.com`,
    adminPassword: 'IsolatedPass123!',
    adminFirstName: 'Isolation',
    adminLastName: 'Admin',
  };
}

type IsolationTenant = ReturnType<typeof makeIsolationTenant>;

/** POST /api/tenants (super admin) — hard-fails so setup problems surface loudly. */
async function createIsolationTenant(tenant: IsolationTenant): Promise<void> {
  const token = await superAdminLogin();
  const res = await apiRequest(
    'POST',
    '/api/tenants',
    {
      id: tenant.id,
      subdomain: tenant.subdomain,
      name: tenant.name,
      adminEmail: tenant.adminEmail,
      adminPassword: tenant.adminPassword,
      adminFirstName: tenant.adminFirstName,
      adminLastName: tenant.adminLastName,
    },
    { Authorization: `Bearer ${token}` },
  );
  const text = await res.text();
  expect(res.status, `create tenant ${tenant.id}: ${res.status} ${text}`).toBe(200);
}

/** Login as the tenant admin (tenantId in body is required — camelCase-only schema). */
async function newTenantAdminToken(tenant: IsolationTenant): Promise<string> {
  const res = await apiRequest('POST', '/api/auth/login', {
    email: tenant.adminEmail,
    password: tenant.adminPassword,
    tenantId: tenant.id,
  });
  const text = await res.text();
  expect(res.status, `login ${tenant.adminEmail}: ${res.status} ${text}`).toBe(200);
  const data = JSON.parse(text) as { token?: string };
  expect(data.token).toBeTruthy();
  return data.token as string;
}

/** POST /api/camps as the given tenant admin. Unique override ids per test. */
async function createIsolationCamp(
  tenant: IsolationTenant,
  token: string,
  opts: { id: string; name: string },
): Promise<void> {
  const res = await apiRequest(
    'POST',
    '/api/camps',
    {
      id: opts.id,
      name: opts.name,
      location: 'Isolation Test Location',
      capacity: 10,
    },
    { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id },
  );
  const text = await res.text();
  expect(res.status, `create camp ${opts.id} under ${tenant.id}: ${res.status} ${text}`).toBe(200);
}

function acaciaSeedIds(): string[] {
  return TEST_CAMPS.map((c) => c.id);
}

// ──────────────────────────────────────────────────────────────────────────
// Part 1 — Super admin drill-down UI: marketplace-wide control of projects.
// ──────────────────────────────────────────────────────────────────────────
test.describe('Super admin project drill-down (marketplace-wide control)', () => {
  test('drilling into a tenant shows exactly that tenant\'s projects', async ({ page }) => {
    const tenant = makeIsolationTenant('drill');
    await createIsolationTenant(tenant);
    const token = await newTenantAdminToken(tenant);
    const campA = `${tenant.id}-proj-a`;
    const campB = `${tenant.id}-proj-b`;
    await createIsolationCamp(tenant, token, { id: campA, name: 'Isolation Camp Alpha' });
    await createIsolationCamp(tenant, token, { id: campB, name: 'Isolation Camp Beta' });

    const admin = new AdminDashboardPage(page);
    await admin.goto(); // /admin?tenant=marketplace
    await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
    await expectPanelReady(page);

    await admin.clickTab('super_tenants');
    await expectPanelContentReady(page, 'super-tenants-panel');

    // Locate the freshly created tenant's card and open its drill-down.
    const card = page
      .locator('[data-testid="tenants-table"] > div', { hasText: tenant.name })
      .first();
    await expect(card, 'new tenant card in Tenant Directory').toBeVisible();
    await card.locator('[data-testid="manage-tenant-btn"]').click();

    await expect(page.locator('[data-testid="tenant-drilldown"]')).toBeVisible();
    await expect(page.locator('[data-testid="drilldown-tenant-type-badge"]')).toHaveText('Camp');

    // Default view is 'camp' → CampsPanel with the tenant's projects.
    await expectPanelContentReady(page, 'camps-panel');
    const table = page.locator('[data-testid="data-table"]');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Isolation Camp Alpha');
    await expect(table).toContainText('Isolation Camp Beta');
    await expect(page.locator('[data-testid="data-table-row"]')).toHaveCount(2);

    // The boundary: the acacia seed projects never appear inside this tenant.
    await expect(table).not.toContainText('Acacia Camp');
    await expect(table).not.toContainText("Michael's House");

    // Back clears the drill-down (and the tenant scope override).
    await page.locator('[data-testid="drilldown-back-btn"]').click();
    await expect(page.locator('[data-testid="super-tenants-panel"]')).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Part 2 — Marketplace directory: one active project per tenant.
// ──────────────────────────────────────────────────────────────────────────
test.describe('Marketplace project directory (super-admin-wide view)', () => {
  test('marketplace GET /api/camps includes the acacia seed tenant and a fresh tenant', async () => {
    const tenant = makeIsolationTenant('dir');
    await createIsolationTenant(tenant);
    const token = await newTenantAdminToken(tenant);
    await createIsolationCamp(tenant, token, {
      id: `${tenant.id}-dir-a`,
      name: 'Isolation Directory Camp',
    });

    // No x-tenant-id header + no tenant JWT claim ⇒ marketplace scope.
    const res = await apiRequest('GET', '/api/camps');
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);

    // GROUP BY tenant_id ⇒ one row for acacia regardless of which camp won.
    const acacia = rows.filter(
      (r) => r.tenantId === TEST_TENANT.id || r.tenantName === TEST_TENANT.name,
    );
    expect(acacia.length).toBeGreaterThanOrEqual(1);
    expect(acaciaSeedIds().some((id) => acacia.some((r) => r.id === id))).toBe(true);

    // The freshly created tenant's project is part of the directory too.
    const own = rows.filter((r) => r.tenantId === tenant.id);
    expect(own.length).toBeGreaterThanOrEqual(1);
    expect(own.some((r) => r.id === `${tenant.id}-dir-a` || r.name === 'Isolation Directory Camp')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Part 3 — Camps API isolation: a tenant admin only sees their own projects.
// ──────────────────────────────────────────────────────────────────────────
test.describe('Camps API isolation per tenant', () => {
  test('tenant admin camps list is strictly scoped to their tenant', async () => {
    const tenant = makeIsolationTenant('camps');
    await createIsolationTenant(tenant);
    const token = await newTenantAdminToken(tenant);
    const campId = `${tenant.id}-solo`;
    await createIsolationCamp(tenant, token, { id: campId, name: 'Isolation Solo Camp' });

    // New tenant admin: exactly their own project, none of acacia's.
    const ownRes = await apiRequest('GET', '/api/camps', undefined, {
      'x-tenant-id': tenant.id,
      Authorization: `Bearer ${token}`,
    });
    expect(ownRes.status).toBe(200);
    const ownRows = (await ownRes.json()) as Array<Record<string, unknown>>;
    expect(ownRows.length).toBe(1);
    expect(ownRows[0].id).toBe(campId);
    expect(acaciaSeedIds().some((id) => ownRows.some((r) => r.id === id))).toBe(false);

    // Acacia admin: acacia projects present, the new tenant's absent.
    const acaciaToken = await tenantAdminLogin();
    const acaciaRes = await apiRequest('GET', '/api/camps', undefined, {
      'x-tenant-id': TEST_TENANT.id,
      Authorization: `Bearer ${acaciaToken}`,
    });
    expect(acaciaRes.status).toBe(200);
    const acaciaRows = (await acaciaRes.json()) as Array<Record<string, unknown>>;
    expect(acaciaRows.length).toBeGreaterThanOrEqual(acaciaSeedIds().length);
    expect(acaciaSeedIds().every((id) => acaciaRows.some((r) => r.id === id))).toBe(true);
    expect(acaciaRows.some((r) => r.id === campId)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Part 4 — Project links & items API isolation + cross-tenant link rejection.
// ──────────────────────────────────────────────────────────────────────────
test.describe('Project links & items API isolation per tenant', () => {
  test('links and items are scoped per tenant; cross-tenant links are rejected', async () => {
    const tenant = makeIsolationTenant('rli');
    await createIsolationTenant(tenant);
    const token = await newTenantAdminToken(tenant);
    const projA = `${tenant.id}-l-a`;
    const projB = `${tenant.id}-l-b`;
    await createIsolationCamp(tenant, token, { id: projA, name: 'Isolation Links A' });
    await createIsolationCamp(tenant, token, { id: projB, name: 'Isolation Links B' });

    // Create a project item under the new tenant.
    const itemRes = await apiRequest(
      'POST',
      '/api/projects/items',
      {
        projectId: projA,
        itemType: 'product',
        name: 'Isolation Test Item',
        description: 'created by the isolation spec',
        basePrice: 25,
        quantity: 3,
      },
      { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id },
    );
    const itemText = await itemRes.text();
    expect(itemRes.status, `create item: ${itemRes.status} ${itemText}`).toBe(201);
    const item = JSON.parse(itemText) as { id: string };
    expect(item.id).toBeTruthy();

    // Create a link between two of the tenant's own projects.
    const linkRes = await apiRequest(
      'POST',
      '/api/projects/links',
      { projectIdA: projA, projectIdB: projB, linkType: 'connection' },
      { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id },
    );
    const linkText = await linkRes.text();
    expect(linkRes.status, `create link: ${linkRes.status} ${linkText}`).toBe(201);
    const link = JSON.parse(linkText) as { id: string };
    expect(link.id).toBeTruthy();

    try {
      // The owning tenant sees both.
      const ownItemsRes = await apiRequest('GET', '/api/projects/items', undefined, {
        'x-tenant-id': tenant.id,
        Authorization: `Bearer ${token}`,
      });
      expect(ownItemsRes.status).toBe(200);
      const ownItems = (await ownItemsRes.json()) as Array<{ id: string }>;
      expect(ownItems.some((r) => r.id === item.id)).toBe(true);

      const ownLinksRes = await apiRequest('GET', '/api/projects/links', undefined, {
        'x-tenant-id': tenant.id,
        Authorization: `Bearer ${token}`,
      });
      expect(ownLinksRes.status).toBe(200);
      const ownLinks = (await ownLinksRes.json()) as Array<{
        id: string;
        a?: { id?: string };
        b?: { id?: string };
      }>;
      const found = ownLinks.find((r) => r.id === link.id);
      expect(found).toBeTruthy();
      expect([found?.a?.id, found?.b?.id]).toEqual(expect.arrayContaining([projA, projB]));

      // A second tenant (acacia) never sees them.
      const acaciaToken = await tenantAdminLogin();
      const acaciaItemsRes = await apiRequest('GET', '/api/projects/items', undefined, {
        'x-tenant-id': TEST_TENANT.id,
        Authorization: `Bearer ${acaciaToken}`,
      });
      expect(acaciaItemsRes.status).toBe(200);
      const acaciaItems = (await acaciaItemsRes.json()) as Array<{ id: string }>;
      expect(acaciaItems.some((r) => r.id === item.id)).toBe(false);

      const acaciaLinksRes = await apiRequest('GET', '/api/projects/links', undefined, {
        'x-tenant-id': TEST_TENANT.id,
        Authorization: `Bearer ${acaciaToken}`,
      });
      expect(acaciaLinksRes.status).toBe(200);
      const acaciaLinks = (await acaciaLinksRes.json()) as Array<{ id: string }>;
      expect(acaciaLinks.some((r) => r.id === link.id)).toBe(false);

      // Cross-tenant link ESTABLISH is rejected with a 400.
      const badRes = await apiRequest(
        'POST',
        '/api/projects/links',
        { projectIdA: TEST_CAMPS[0].id, projectIdB: projA, linkType: 'connection' },
        { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id },
      );
      expect(badRes.status).toBe(400);
    } finally {
      // Best-effort cleanup of the rows created by this test.
      try {
        await apiRequest('DELETE', `/api/projects/links/${link.id}`, undefined, {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenant.id,
        });
        await apiRequest('DELETE', `/api/projects/items/${item.id}`, undefined, {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenant.id,
        });
        await apiRequest('DELETE', `/api/camps/${projA}`, undefined, {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenant.id,
        });
        await apiRequest('DELETE', `/api/camps/${projB}`, undefined, {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenant.id,
        });
      } catch {
        /* best-effort */
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Part 5 — Camps visibility in the admin UI (per-tenant boundary).
// ──────────────────────────────────────────────────────────────────────────
test.describe('Camps visibility in the admin UI per tenant', () => {
  test('acacia admin camps tab hides another tenant\'s project', async ({ page }) => {
    const tenant = makeIsolationTenant('uihide');
    await createIsolationTenant(tenant);
    const token = await newTenantAdminToken(tenant);
    await createIsolationCamp(tenant, token, {
      id: `${tenant.id}-hide`,
      name: 'Isolation Hidden Project',
    });

    const admin = new AdminDashboardPage(page);
    await admin.goto(TEST_TENANT.id);
    await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
    await expectPanelReady(page);

    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    const table = page.locator('[data-testid="data-table"]');
    await expect(table).toBeVisible();
    // Positive control: acacia's own seeded project is visible.
    await expect(table).toContainText('Acacia Camp');
    // Negative control: the isolation tenant's project never appears.
    await expect(table).not.toContainText('Isolation Hidden Project');
  });

  test('fresh tenant admin camps tab shows only their own project', async ({ page }) => {
    const tenant = makeIsolationTenant('uiown');
    await createIsolationTenant(tenant);
    const token = await newTenantAdminToken(tenant);
    await createIsolationCamp(tenant, token, {
      id: `${tenant.id}-own`,
      name: 'Isolation Owned Project',
    });

    const admin = new AdminDashboardPage(page);
    await admin.goto(tenant.id); // /admin?tenant=<new tenant>
    await admin.login(tenant.adminEmail, tenant.adminPassword);
    await expectPanelReady(page);

    await admin.clickTab('camps');
    await expectPanelContentReady(page, 'camps-panel');

    const table = page.locator('[data-testid="data-table"]');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Isolation Owned Project');
    await expect(table).not.toContainText('Acacia Camp');
    await expect(table).not.toContainText("Michael's House");
  });
});