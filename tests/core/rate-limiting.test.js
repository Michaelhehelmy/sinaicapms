import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Rate Limiting — Auth Endpoints', () => {
  let superAdminToken, tenantId;
  const ts = Date.now();
  const subdomain = `core-rl-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Rate Limiting');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('POST /api/auth/login with correct credentials returns 200', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, tenantId })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
  });

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'WrongPassword99!', tenantId })
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/auth/login with missing fields returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail })
    });
    expect(res.status).toBe(400);
  });
});
