import { describe, it, expect, beforeAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('Security Extended', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `sec-ext-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Security Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('POST /api/camps with XSS in name does not execute script', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: '<script>alert("xss")</script>',
        location: 'Test'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    const listRes = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const camps = await listRes.json();
    const found = Array.isArray(camps) ? camps.find(c => c.name && c.name.includes('<script>')) : null;
    if (found) {
      expect(found.name).not.toContain('<script>');
    }
  });

  it('SQL injection in query params returns error or empty, not SQL error', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders?status='; DROP TABLE orders; --`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBeLessThanOrEqual(400);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain('sql');
    expect(text.toLowerCase()).not.toContain('syntax error');
  });

  it('Missing auth header returns 401 on protected routes', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: { 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(401);
  });

  it('CORS headers are present on responses', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://sinaicamps.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    const corsHeader = res.headers.get('access-control-allow-origin');
    expect(corsHeader).toBeTruthy();
  });

  it('API returns consistent JSON error format', async () => {
    const res = await fetch(`${API_BASE_URL}/api/nonexistent-endpoint`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
  });
});
