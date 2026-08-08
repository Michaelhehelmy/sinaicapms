import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('2. Super Admin - Tenant Management', () => {
  let superAdminToken;
  let testTenantId;
  const subdomain = `tenant-mgmt-test-${Date.now()}`;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
  });

  afterAll(async () => {
    if (testTenantId && superAdminToken) {
      await deleteTestTenant(testTenantId, superAdminToken);
    }
  });

  it('GET /api/tenants → lists all active tenants', async () => {
    const res = await fetch(`${API_BASE_URL}/api/tenants`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    // There must be at least the marketplace tenant
    expect(data.length).toBeGreaterThan(0);
  });

  it('POST /api/tenants → creates a new tenant', async () => {
    const res = await fetch(`${API_BASE_URL}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: subdomain,
        subdomain: subdomain,
        name: 'Super Tenant Test Camp',
        location: 'Sinaicamps Mgmt Area'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBe(subdomain);
    testTenantId = data.id;
  });

  it('PUT /api/admin/tenants/:id (Super Admin only) → updates tenant details', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/tenants/${testTenantId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Updated Super Tenant Camp Name',
        location: 'Updated Sinai Location'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify details via public profile endpoint
    const checkRes = await fetch(`${API_BASE_URL}/api/tenants/${testTenantId}`);
    expect(checkRes.status).toBe(200);
    const tenant = await checkRes.json();
    expect(tenant.name).toBe('Updated Super Tenant Camp Name');
    expect(tenant.location).toBe('Updated Sinai Location');
  });

  it('DELETE /api/admin/tenants/:id → removes the tenant', async () => {
    const tempSubdomain = `temp-del-${Date.now()}`;
    // Create a temporary tenant first
    const createRes = await fetch(`${API_BASE_URL}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tempSubdomain,
        subdomain: tempSubdomain,
        name: 'Temporary Deletable Camp'
      })
    });
    const createData = await createRes.json();
    const tempId = createData.id;

    // Delete it
    const deleteRes = await fetch(`${API_BASE_URL}/api/admin/tenants/${tempId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);

    // Verify it is gone
    const checkRes = await fetch(`${API_BASE_URL}/api/tenants/${tempId}`);
    expect(checkRes.status).toBe(404);
  });
});
