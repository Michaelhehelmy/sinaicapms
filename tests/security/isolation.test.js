import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('16. Security & Partition Isolation', () => {
  let superAdminToken;
  let tenantA;
  let tenantB;
  let tokenA;
  let tokenB;
  
  const subdomainA = `tenant-a-${Date.now()}`;
  const adminEmailA = `admin@${subdomainA}.com`;
  const adminPasswordA = 'Password123';

  const subdomainB = `tenant-b-${Date.now()}`;
  const adminEmailB = `admin@${subdomainB}.com`;
  const adminPasswordB = 'Password123';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    
    // Create Tenant A
    tenantA = await createTestTenant(subdomainA, subdomainA, 'Tenant A Camp');
    await createTenantAdmin(tenantA, adminEmailA, adminPasswordA, superAdminToken);
    tokenA = await tenantAdminLogin(tenantA, adminEmailA, adminPasswordA);

    // Create Tenant B
    tenantB = await createTestTenant(subdomainB, subdomainB, 'Tenant B Camp');
    await createTenantAdmin(tenantB, adminEmailB, adminPasswordB, superAdminToken);
    tokenB = await tenantAdminLogin(tenantB, adminEmailB, adminPasswordB);
  });

  afterAll(async () => {
    if (tenantA && superAdminToken) await deleteTestTenant(tenantA, superAdminToken);
    if (tenantB && superAdminToken) await deleteTestTenant(tenantB, superAdminToken);
  });

  it('Tenant Isolation → Tenant A admin token cannot read Tenant B data (403)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'x-tenant-id': tenantB
      }
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Access denied');
  });

  it('Super Admin Only Endpoints → Tenant A admin token cannot call /api/admin/* (403)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/stats`, {
      headers: {
        'Authorization': `Bearer ${tokenA}`
      }
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Super Admin access required');
  });

  it('Super Admin Bypass → Super admin can access Tenant A data if x-tenant-id is provided', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'x-tenant-id': tenantA
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('Missing Tenant Context → Accessing private endpoint with invalid/non-existent tenant ID returns 404', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'x-tenant-id': 'non-existent-tenant-id'
      }
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Tenant not found');
  });

  it('Cross-Tenant Mutation Blocked → Tenant A admin token cannot create a camp for Tenant B (403)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
        'x-tenant-id': tenantB
      },
      body: JSON.stringify({ name: 'Hacked Camp' })
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Access denied');
  });

  it('Empty or Invalid Tokens → Rejects requests with invalid JWT tokens (401)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer malformed-token-xyz`,
        'x-tenant-id': tenantA
      }
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Session expired or invalid signature');
  });
});
