import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('Staff Activation Lifecycle — Registration → Active → Deactivated', () => {
  let superAdminToken;
  let tenantId;
  let tenantToken;
  let registeredAdminId;

  const ts = Date.now();
  const subdomain = `staff-lifecycle-${ts}`;
  const adminEmail = `lifecycle-admin@${subdomain}.com`;
  const adminPassword = 'Password123';

  // Registered (pending approval) user
  const regEmail = `pending-user-${ts}@test.com`;
  const regPassword = 'SecurePass88';
  const regName = 'Pending User';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Lifecycle Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  // ───── Registration (is_active = 0) ─────

  it('Registration → creates user with is_active = 0 (pending approval)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName,
        email: regEmail,
        password: regPassword,
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('pending');
    expect(data.adminId).toBeDefined();
    registeredAdminId = data.adminId;
  });

  it('Registration → rejects duplicate email in same tenant', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName,
        email: regEmail,
        password: regPassword,
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('already exists');
  });

  it('Registration → rejects short password', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Pass',
        email: `short-${ts}@test.com`,
        password: '1234567',
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('8 characters');
  });

  it('Registration → rejects non-existent tenant', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ghost User',
        email: `ghost-${ts}@test.com`,
        password: 'ValidPass123',
        tenantId: 'nonexistent_tenant_xyz'
      })
    });
    expect(res.status).toBe(404);
  });

  it('Registration → missing required fields returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Email' })
    });
    expect(res.status).toBe(400);
  });

  // ───── Login Blocked for Inactive User ─────

  it('Login → rejected for unactivated registered user (is_active = 0)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regEmail,
        password: regPassword,
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Invalid email or password');
  });

  it('Login → returns same 401 for nonexistent email (no user enumeration)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `doesnotexist-${ts}@test.com`,
        password: 'Whatever123',
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Invalid email or password');
  });

  // ───── Admin Created via Super Admin (is_active = 1) ─────

  it('Super admin → creates admin with is_active = 1 via POST /api/admin/admins', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        email: `supercreated-${ts}@test.com`,
        password: 'AdminPass123',
        tenantId,
        role: 'admin',
        first_name: 'Super',
        last_name: 'Created'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
  });

  it('Super-created admin → can login immediately (is_active = 1)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `supercreated-${ts}@test.com`,
        password: 'AdminPass123',
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('admin');
  });

  // ───── Admin List Shows is_active ─────

  it('Super admin → GET /api/admin/admins returns is_active field for each admin', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/admins`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    const found = data.find(a => a.email === `supercreated-${ts}@test.com`);
    expect(found).toBeDefined();
    expect(found.isActive).toBe(1);
  });

  // ───── Active Admin → Full Access ─────

  it('Active admin → can access /api/me', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${tenantToken}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe(adminEmail);
    expect(data.role).toBe('admin');
  });

  it('Active admin → can read camps', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // ───── Admin Deletion → Login Blocked ─────

  it('Super admin → can delete an admin (not super_admin)', async () => {
    // First create one to delete
    const createRes = await fetch(`${API_BASE_URL}/api/admin/admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        email: `to-delete-${ts}@test.com`,
        password: 'DeleteMe123',
        tenantId,
        role: 'admin'
      })
    });
    const created = await createRes.json();
    expect(createRes.status).toBe(200);

    // Delete it
    const deleteRes = await fetch(`${API_BASE_URL}/api/admin/admins/${created.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(deleteRes.status).toBe(200);
  });

  it('Deleted admin → login fails', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `to-delete-${ts}@test.com`,
        password: 'DeleteMe123',
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(401);
  });

  // ───── Super Admin Protection ─────

  it('Super admin → cannot overwrite super_admin via admin create endpoint', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        email: 'admin@sinaicamps.com',
        password: 'Hacked123',
        tenantId,
        role: 'super_admin'
      })
    });
    expect([403, 200]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.updated).toBeUndefined();
    }
  });

  // ───── Tenant Admin Cannot Access Admin Routes ─────

  it('Tenant admin → cannot access super admin endpoints (403)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/admins`, {
      headers: { 'Authorization': `Bearer ${tenantToken}` }
    });
    expect(res.status).toBe(403);
  });

  // ───── Registration Missing Fields ─────

  it('Registration → missing tenantId returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Tenant',
        email: `notenant-${ts}@test.com`,
        password: 'ValidPass123'
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('tenantId');
  });

  // ───── Login Missing Fields ─────

  it('Login → missing password returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        tenantId: subdomain
      })
    });
    expect(res.status).toBe(400);
  });

  // ───── Cross-Tenant Login Attempt ─────

  it('Login → admin from Tenant A cannot login to Tenant B', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        tenantId: 'nonexistent_tenant_xyz'
      })
    });
    expect(res.status).toBe(401);
  });
});
