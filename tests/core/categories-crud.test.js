import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Categories CRUD', () => {
  let superAdminToken, tenantId, tenantToken;
  const ts = Date.now();
  const subdomain = `core-cat-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';
  let categoryId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Categories');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('POST /api/categories creates a category with name', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Test Category' })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    categoryId = data.id;
  });

  it('GET /api/categories returns array of categories', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const found = data.find(c => c.id === categoryId);
    expect(found).toBeDefined();
  });

  it('GET /api/categories/:id returns single category', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories/${categoryId}`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe(categoryId);
  });

  it('PUT /api/categories/:id updates category name', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Updated Category' })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('DELETE /api/categories/:id removes category', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories/${categoryId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('POST /api/categories without name returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/categories/:id with invalid id returns 404', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories/nonexistent_id`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(404);
  });
});
