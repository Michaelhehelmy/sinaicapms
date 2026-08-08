import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('5. Tenant Admin - Camps CRUD', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `camp-crud-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Camps Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('POST /api/camps → creates a camp', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Camp Sinai South',
        location: 'South Desert Valley',
        start_date: '2026-10-01',
        end_date: '2026-12-31',
        capacity: 100
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    campId = data.id;
  });

  it('GET /api/camps → lists camps for this tenant', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const camp = data.find(c => c.id === campId);
    expect(camp).toBeDefined();
    expect(camp.name).toBe('Camp Sinai South');
  });

  it('PUT /api/camps/:id → updates camp details', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Camp Sinai South Updated',
        location: 'South Desert Coast',
        start_date: '2026-10-01',
        end_date: '2026-12-31',
        capacity: 150
      })
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const camp = await getRes.json();
    expect(camp.name).toBe('Camp Sinai South Updated');
    expect(camp.capacity).toBe(150);
  });

  it('DELETE /api/camps/:id → deletes the camp', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(getRes.status).toBe(404);
  });
});
