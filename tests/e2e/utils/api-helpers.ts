import { API_BASE, SUPER_ADMIN, TEST_TENANT, TEST_TENANT_ADMIN, TEST_PRODUCT, TEST_CUSTOMER, TEST_CAMPS, TEST_PRODUCTS, TEST_RATE_PLAN } from '../fixtures/test-data';

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
  }, { Authorization: `Bearer ${token}` });
  if (!res.ok) console.warn(`Create tenant: ${res.status}`);
  return TEST_TENANT.id;
}

export async function createTestTenantAdmin(): Promise<void> {
  const token = superAdminToken || await superAdminLogin();
  await apiRequest('POST', '/api/admin/admins', {
    email: TEST_TENANT_ADMIN.email,
    password: TEST_TENANT_ADMIN.password,
    tenantId: TEST_TENANT.id,
    role: 'admin',
  }, { Authorization: `Bearer ${token}` });
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
    throw new Error(`tenantAdminLogin failed: ${res.status()} ${await res.text()}`);
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
}

export async function deleteTestTenant(): Promise<void> {
  const token = superAdminToken || await superAdminLogin();
  await apiRequest('DELETE', `/api/admin/tenants/${TEST_TENANT.id}`, undefined, {
    Authorization: `Bearer ${token}`,
  });
}

export function getSuperAdminToken(): string { return superAdminToken; }
export function getTenantAdminToken(): string { return tenantAdminToken; }
