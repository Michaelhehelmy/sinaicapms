import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('10. Tenant Admin - Plans CRUD', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `plans-crud-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let planId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Plans Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    // Create camp
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Plans Camp', location: 'Location D' })
    });
    const camp = await campRes.json();
    campId = camp.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('POST /api/plans → creates a plan', async () => {
    const res = await fetch(`${API_BASE_URL}/api/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        name: 'Weekly Yoga Session',
        description: 'Sunrise yoga class on the beach',
        date: '2026-07-15',
        time: '06:00:00',
        status: 'pending',
        category: 'Activity'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    planId = data.id;
  });

  it('GET /api/plans → lists plans', async () => {
    const res = await fetch(`${API_BASE_URL}/api/plans`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const plans = await res.json();
    const plan = plans.find(p => p.id === planId);
    expect(plan).toBeDefined();
    expect(plan.name).toBe('Weekly Yoga Session');
  });

  it('PUT /api/plans/:id → updates plan status', async () => {
    const res = await fetch(`${API_BASE_URL}/api/plans/${planId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        name: 'Weekly Yoga Session Updated',
        description: 'Sunset yoga class on the beach',
        date: '2026-07-15',
        time: '18:00:00',
        status: 'completed',
        category: 'Activity'
      })
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/plans`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const plans = await getRes.json();
    const plan = plans.find(p => p.id === planId);
    expect(plan.name).toBe('Weekly Yoga Session Updated');
    expect(plan.status).toBe('completed');
  });

  it('DELETE /api/plans/:id → deletes the plan', async () => {
    const res = await fetch(`${API_BASE_URL}/api/plans/${planId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/plans`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const plans = await getRes.json();
    const plan = plans.find(p => p.id === planId);
    expect(plan).toBeUndefined();
  });
});
