import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('4. Super Admin - Alerts', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `alert-test-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Alert Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('Suspended Tenant Alert → changing tenant status to suspended is detected', async () => {
    // 1. Suspend the test tenant
    const res = await fetch(`${API_BASE_URL}/api/admin/tenants/${tenantId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        status: 'suspended'
      })
    });
    expect(res.status).toBe(200);

    // 2. Fetch all tenants (as super admin, with full fields)
    const listRes = await fetch(`${API_BASE_URL}/api/tenants`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(listRes.status).toBe(200);
    const tenants = await listRes.json();
    const targetTenant = tenants.find(t => t.id === tenantId);
    expect(targetTenant).toBeDefined();
    expect(targetTenant.status).toBe('suspended');
  });
});
