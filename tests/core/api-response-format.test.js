import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('API Response Format', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `format-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Format Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('GET /api/camps returns JSON with data array', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.ok).toBe(true);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('POST /api/auth/login with invalid creds returns JSON error with status', async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad@test.com', password: 'wrong', tenantId: tenantSubdomain })
    });
    expect(res.status).toBe(401);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('GET /api/orders returns paginated response with total', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  it('GET /api/reports/occupancy returns structured JSON', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/occupancy`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('totalRooms');
    expect(data).toHaveProperty('occupancyRate');
    expect(typeof data.totalRooms).toBe('number');
  });

  it('Error responses include status code and message', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/nonexistent_order_123`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const data = await res.json();
    expect(data.error || data.message).toBeDefined();
  });
});
