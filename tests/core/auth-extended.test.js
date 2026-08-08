import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Auth — Extended', () => {
  let superAdminToken, tenantId, tenantToken;
  const ts = Date.now();
  const subdomain = `core-auth-ext-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Auth Extended');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('POST /api/auth/logout returns success', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}` }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('GET /api/auth/me returns user data with valid token', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${tenantToken}` }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.email).toBe(adminEmail);
    expect(data.role).toBeDefined();
  });

  it('GET /api/auth/me returns 401 without token', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me returns 401 with invalid token', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': 'Bearer invalidtoken123' }
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/forgot-password returns success even if email does not exist', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@doesnotexist.com', tenantId })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('POST /api/auth/change-password with valid current password succeeds', async () => {
    const newPass = 'NewCore1!';
    const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}` },
      body: JSON.stringify({ currentPassword: adminPassword, newPassword: newPass })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    const token2 = await tenantAdminLogin(tenantId, adminEmail, newPass);
    await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ currentPassword: newPass, newPassword: adminPassword })
    });
  });

  it('POST /api/auth/change-password with wrong current password fails', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}` },
      body: JSON.stringify({ currentPassword: 'WrongPass99!', newPassword: 'SomePass1!' })
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
