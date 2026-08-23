import { API_BASE, SUPER_ADMIN, TEST_TENANT, TEST_TENANT_ADMIN, TEST_POS_USER, TEST_PRODUCT, TEST_CUSTOMER, TEST_CAMPS, TEST_PRODUCTS, TEST_RATE_PLAN, TEST_MEAL_CATEGORIES, TEST_MEALS } from '../fixtures/test-data';

let superAdminToken = '';
let tenantAdminToken = '';

export async function apiRequest(method: string, path: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function superAdminLogin(): Promise<string> {
  const res = await apiRequest('POST', '/api/auth/login', {
    email: SUPER_ADMIN.email,
    password: SUPER_ADMIN.password,
  });
  const data = await res.json();
  superAdminToken = data.token;
  return superAdminToken;
}

export async function createTestTenant(): Promise<string> {
  const token = superAdminToken || await superAdminLogin();
  const res = await apiRequest('POST', '/api/tenants', {
    id: TEST_TENANT.id,
    subdomain: TEST_TENANT.subdomain,
    name: TEST_TENANT.name,
    // POST /api/tenants validates `adminPassword` (min 1) — without it the
    // route returns 400 "adminPassword Required" and the tenant is never
    // created. The handler auto-provisions the tenant admin from these fields.
    adminEmail: TEST_TENANT_ADMIN.email,
    adminPassword: TEST_TENANT_ADMIN.password,
    adminFirstName: 'E2E',
    adminLastName: 'Admin',
  }, { Authorization: `Bearer ${token}` });
  // Idempotent: 4xx (subdomain already taken — the tenant is seeded by
  // migration 0004, or a previous run created it) means the row already
  // exists, which is fine. Any other failure is surfaced loudly.
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    throw new Error(`createTestTenant failed: ${res.status} ${await res.text()}`);
  }
  return TEST_TENANT.id;
}

export async function createTestTenantAdmin(): Promise<void> {
  const token = superAdminToken || await superAdminLogin();
  const res = await apiRequest('POST', '/api/admin/admins', {
    email: TEST_TENANT_ADMIN.email,
    password: TEST_TENANT_ADMIN.password,
    tenantId: TEST_TENANT.id,
    role: 'admin',
  }, { Authorization: `Bearer ${token}` });
  // Idempotent: 409 (email already exists) means the admin is already there.
  // Any other non-2xx response THROWS so global-setup reports it loudly —
  // a silent failure here leaves tenantAdminToken undefined and every
  // authed follow-up (seedTestData, createTestPosUser) broken.
  if (res.status === 409) {
    console.log('  ℹ️  Tenant admin already exists (409) — nothing to do');
    return;
  }
  if (!res.ok) {
    throw new Error(`createTestTenantAdmin failed: ${res.status} ${await res.text()}`);
  }
}

export async function tenantAdminLogin(): Promise<string> {
  // `tenantId` is required for tenant admins — without it the auth route only
  // matches super admins (tenant_id IS NULL) and login returns 401, leaving
  // the token undefined and every authed follow-up (GET/DELETE /api/leads)
  // silently broken. The UI login form passes it from the tenant host header;
  // the API helper must pass it explicitly.
  const res = await apiRequest('POST', '/api/auth/login', {
    email: TEST_TENANT_ADMIN.email,
    password: TEST_TENANT_ADMIN.password,
    tenantId: TEST_TENANT.id,
  });
  if (!res.ok) {
    throw new Error(`tenantAdminLogin failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  tenantAdminToken = data.token;
  return tenantAdminToken;
}

export async function seedTestData(): Promise<void> {
  const token = tenantAdminToken || await tenantAdminLogin();
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': TEST_TENANT.id };

  for (const camp of TEST_CAMPS) {
    await apiRequest('POST', '/api/camps', camp, headers);
  }

  for (const p of TEST_PRODUCTS) {
    await apiRequest('POST', '/api/products', p, headers);
  }

  await apiRequest('POST', '/api/rateplans', TEST_RATE_PLAN, headers);

  await seedMealData(token, TEST_TENANT.id);
}

/**
 * Seed meal categories and meals so the menu page renders TenantMenu.
 * Without meals, MenuPage.astro shows "Menu not available yet" and the
 * TenantMenu React island (data-testid="tenant-nav") never mounts.
 *
 * Idempotent: deletes existing categories/meals before creating fresh ones
 * so repeated global-setup runs don't accumulate duplicates.
 */
async function seedMealData(token: string, tenantId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };

  // --- Clean up existing data first (idempotent seeding) ---
  try {
    const existingCats = await apiRequest('GET', '/api/meal-categories', undefined, headers);
    if (existingCats.ok) {
      const cats = (await existingCats.json()) as Array<{ id: string }>;
      for (const cat of cats) {
        await apiRequest('DELETE', `/api/meal-categories/${cat.id}`, undefined, headers);
      }
    }
    const existingMeals = await apiRequest('GET', '/api/meals', undefined, headers);
    if (existingMeals.ok) {
      const meals = (await existingMeals.json()) as Array<{ id: string }>;
      for (const meal of meals) {
        await apiRequest('DELETE', `/api/meals/${meal.id}`, undefined, headers);
      }
    }
  } catch { /* best-effort cleanup; proceed with seeding either way */ }

  // Create meal categories and capture their auto-generated IDs
  const catIds: string[] = [];
  for (const cat of TEST_MEAL_CATEGORIES) {
    const res = await apiRequest('POST', '/api/meal-categories', cat, headers);
    if (res.ok) {
      const data = (await res.json()) as { id: string };
      if (data?.id) catIds.push(data.id);
    }
  }

  // Create meals, linking each to a category
  for (const meal of TEST_MEALS) {
    const catId = catIds[meal.catIndex] || catIds[0] || null;
    await apiRequest('POST', '/api/meals', {
      name: meal.name,
      price: meal.price,
      description: meal.description,
      meal_category_id: catId,
    }, headers);
  }
}

/**
 * Recreate the E2E POS cashier that migration 0051 removed from seed data.
 *
 * Creates the user via POST /api/pos-users using the tenant admin's JWT
 * (role `admin`, scoped to TEST_TENANT through the login tenantId and the
 * `x-tenant-id` header). The handler auto-provisions the tenant's POS
 * organization/store/tenant_org_mapping when the tenant has none, so this
 * works even against a fresh DB where 0051 deleted the old seed org/mapping.
 *
 * Body values mirror TEST_POS_USER (identifier → username, password), with the
 * fixed email/first/last names the POS fixtures expect. Idempotent: a 409
 * (email/username already exists — e.g. reruns against an already-seeded DB)
 * is treated as OK; any other non-2xx response throws so global-setup reports
 * it loudly.
 *
 * NOTE: `POST /api/pos-users` enforces a minimum 8-char password, so the
 * TEST_POS_USER.password default is 'pass1234' (8+ chars). Override with
 * `POS_PASSWORD` if you change it — the login specs read the same env var,
 * keeping create + login consistent.
 */
export async function createTestPosUser(): Promise<void> {
  const token = tenantAdminToken || await tenantAdminLogin();
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': TEST_TENANT.id };

  const res = await apiRequest('POST', '/api/pos-users', {
    email: 'cashier@test.com',
    username: TEST_POS_USER.identifier,
    password: TEST_POS_USER.password,
    firstName: 'Cashier',
    lastName: 'Test',
    role: 'cashier',
  }, headers);

  if (res.status === 409) {
    console.log('  ℹ️  POS cashier already exists (409) — nothing to do');
    return;
  }
  if (!res.ok) {
    throw new Error(`createTestPosUser failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteTestTenant(): Promise<void> {
  const token = superAdminToken || await superAdminLogin();
  await apiRequest('DELETE', `/api/admin/tenants/${TEST_TENANT.id}`, undefined, {
    Authorization: `Bearer ${token}`,
  });
}

export function getSuperAdminToken(): string { return superAdminToken; }
export function getTenantAdminToken(): string { return tenantAdminToken; }
