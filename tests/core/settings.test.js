import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Settings', () => {
  let superAdminToken, tenantId, tenantToken;
  const ts = Date.now();
  const subdomain = `core-set-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Settings');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('GET /api/me returns tenant settings', async () => {
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe(tenantId);
    expect(data.currency).toBeDefined();
  });

  it('PUT /api/me updates currency', async () => {
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ currency: 'USD' })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const getRes = await fetch(`${API_BASE_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const getData = await getRes.json();
    expect(getData.currency).toBe('USD');
  });

  it('PUT /api/me without auth returns 401', async () => {
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
      body: JSON.stringify({ currency: 'EUR' })
    });
    expect(res.status).toBe(401);
  });
});
