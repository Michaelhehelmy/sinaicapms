import { test, expect, type Page } from '@playwright/test';
import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { SUPER_ADMIN, TEST_TENANT_ADMIN, TEST_TENANT } from '../../fixtures/test-data';
import { expectPanelContentReady } from '../../fixtures/admin';
import { superAdminLogin, apiRequest } from '../../utils/api-helpers';

/**
 * Regression coverage for two production runtime defects found during
 * T2 (2026-08-10):
 *
 * 1. GET /admin/tenants (and the super-admin variants of GET /api/tenants)
 *    joined tenants 1:N against admins, so a tenant with 2+ admins appeared
 *    once PER ADMIN. Every super panel that mapped those rows with
 *    key={t.id} then hit React's "two children with the same key" warning —
 *    unsupported behavior that, minified in production, corrupts list DOM
 *    (duplicated/omitted children, crashes). Fixed with GROUP BY tenants.id.
 *
 * 2. BookingCalendar called GET /api/price-overrides?from=&to= with no
 *    productId before a room type was selected; the backend 400s on a
 *    missing productId. Fixed by passing enabled: !!activeProductId.
 *
 * To make defect 1 deterministic this spec creates a SECOND admin on the
 * test tenant in beforeAll, then asserts (a) the API returns exactly one row
 * per tenant and (b) the affected admin tabs produce zero console errors.
 */

const SECOND_ADMIN = {
  email: 'second-admin-regression@test.com',
  password: 'TestPass123!',
};

let createdAdminId: string | null = null;

async function removeAdminIfExists(email: string) {
  const token = await superAdminLogin();
  const listRes = await apiRequest('GET', '/api/admin/admins', undefined, {
    Authorization: `Bearer ${token}`,
  });
  if (!listRes.ok) return;
  const body = await listRes.json().catch(() => ({}));
  const list = Array.isArray(body) ? body : body?.data ?? [];
  const found = list.find((a: { email?: string }) => a.email === email);
  if (found?.id) {
    await apiRequest('DELETE', `/api/admin/admins/${found.id}`, undefined, {
      Authorization: `Bearer ${token}`,
    });
  }
}

test.beforeAll(async () => {
  const token = await superAdminLogin();
  // Best-effort cleanup of a stale admin left by an interrupted previous run.
  await removeAdminIfExists(SECOND_ADMIN.email);
  const res = await apiRequest(
    'POST',
    '/api/admin/admins',
    {
      email: SECOND_ADMIN.email,
      password: SECOND_ADMIN.password,
      tenantId: TEST_TENANT.id,
      role: 'admin',
    },
    { Authorization: `Bearer ${token}` },
  );
  const body = await res.json().catch(() => ({}));
  createdAdminId = body?.id ?? null;
  if (!createdAdminId) {
    console.log(`WARN: could not create second admin (${res.status()}) — API-dedup assertion still covers defect 1`);
  }
});

test.afterAll(async () => {
  if (createdAdminId) {
    const token = await superAdminLogin();
    await apiRequest('DELETE', `/api/admin/admins/${createdAdminId}`, undefined, {
      Authorization: `Bearer ${token}`,
    });
  }
});

test('GET /admin/tenants returns exactly one row per tenant (no admin fan-out)', async () => {
  const token = await superAdminLogin();
  const res = await apiRequest('GET', '/api/admin/tenants', undefined, {
    Authorization: `Bearer ${token}`,
  });
  expect(res.ok).toBeTruthy();
  const body = await res.json();
  const list = Array.isArray(body) ? body : body?.data ?? [];
  const ids = list.map((t: { id: string }) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  const acacia = list.filter((t: { id: string }) => t.id === TEST_TENANT.id);
  expect(acacia.length).toBe(1);
});

test('affected admin tabs produce zero console errors with 2 admins on the tenant', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
      errors.push(`[http ${res.status()}] ${res.url()}`);
    }
  });

  const admin = new AdminDashboardPage(page);

  // Super admin: the panels that previously fired duplicate-key warnings.
  // (Super nav = super_dashboard / super_tenants / super_reservations; the
  // calendar/staff panels are tenant-only after the T6 nav separation.)
  await admin.goto('marketplace');
  await page.waitForSelector('[data-testid="login-overlay"]', { state: 'visible', timeout: 20_000 });
  await admin.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
  await expectPanelContentReady(page, undefined, 15_000);
  for (const tab of ['super_tenants', 'super_reservations']) {
    await admin.clickTab(tab);
    await expectPanelContentReady(page, undefined, 15_000);
    await page.waitForTimeout(400);
  }
  expect(errors).toEqual([]);

  // Tenant admin: calendar previously fired the price-overrides 400.
  await admin.clickLogout();
  await page.waitForSelector('[data-testid="login-overlay"]', { state: 'visible', timeout: 20_000 });
  await admin.goto('acaciacamp');
  await page.waitForSelector('[data-testid="login-overlay"]', { state: 'visible', timeout: 20_000 });
  await admin.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
  await expectPanelContentReady(page, undefined, 15_000);
  await admin.clickTab('calendar');
  await expectPanelContentReady(page, undefined, 15_000);
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});
