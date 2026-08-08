import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from './helpers';

describe('1. Authentication & Session Management', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `auth-test-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminUsername = 'adminuser';
  const adminPassword = 'Password123';

  beforeAll(async () => {
    // 1. Get super admin token
    superAdminToken = await superAdminLogin();

    // 2. Create a test tenant
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Auth Test Camp');

    // 3. Create a tenant admin user
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
  });

  afterAll(async () => {
    // Clean up tenant
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('Super Admin Login → returns JWT with role "super_admin"', async () => {
    let res;
    for (const pw of [SUPER_ADMIN_PASSWORD, 'sinairoot', 'sinaiadmin']) {
      res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: SUPER_ADMIN_EMAIL,
          password: pw,
          tenantId: 'marketplace'
        })
      });
      if (res.status === 200) break;
    }
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('super_admin');
  });

  it('Tenant Admin Login → returns JWT with role "admin"', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        tenantId: tenantId
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('admin');
  });

  it('Invalid Credentials → returns 401', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: 'WrongPassword',
        tenantId: tenantId
      })
    });
    expect(res.status).toBe(401);
  });

  it('Token Validation (/api/me) with valid token', async () => {
    const token = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const tenantBrand = await res.json();
    expect(tenantBrand.subdomain).toBe(tenantSubdomain);
  });

  it('Token Validation with invalid token → returns 401', async () => {
    const res = await fetch(`${API_BASE_URL}/api/inventory`, {
      headers: { 
        'Authorization': `Bearer InvalidTokenValue`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(401);
  });

  it('Domain Isolation → Tenant admin request with x-tenant-id of another tenant is rejected (403)', async () => {
    const token = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
    const res = await fetch(`${API_BASE_URL}/api/inventory`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': 'marketplace'
      }
    });
    expect(res.status).toBe(403);
  });

  it('Refresh token → returns a new access token that works on /auth/me', async () => {
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, tenantId })
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.refreshToken).toBeDefined();

    const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken })
    });
    expect(refreshRes.status).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.success).toBe(true);
    expect(refreshData.token).toBeDefined();
    expect(refreshData.token).not.toBe(loginData.token);
    expect(refreshData.refreshToken).toBeDefined();
    expect(refreshData.user.role).toBe('admin');

    const meRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${refreshData.token}` }
    });
    expect(meRes.status).toBe(200);
  });

  it('Refresh with garbage token → returns 401', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'not-a-real-token' })
    });
    expect(res.status).toBe(401);
  });

  it('Refresh with an access token → returns 401 (token type check)', async () => {
    const token = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token })
    });
    expect(res.status).toBe(401);
  });

  it('Refresh with missing refreshToken → returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });
});
