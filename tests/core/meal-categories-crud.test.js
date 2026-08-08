import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Meal Categories CRUD', () => {
  let superAdminToken, tenantId, tenantToken;
  const ts = Date.now();
  const subdomain = `core-mcat-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';
  let mealCategoryId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Meal Categories');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('POST /api/meal-categories creates a meal category with name', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Breakfast Items' })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    mealCategoryId = data.id;
  });

  it('GET /api/meal-categories returns array', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const found = data.find(m => m.id === mealCategoryId);
    expect(found).toBeDefined();
  });

  it('GET /api/meal-categories/:id returns single item', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories/${mealCategoryId}`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe(mealCategoryId);
  });

  it('PUT /api/meal-categories/:id updates name', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories/${mealCategoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Updated Meal Category' })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('DELETE /api/meal-categories/:id removes it', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories/${mealCategoryId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('POST /api/meal-categories without name returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/meal-categories/:id with invalid id returns 404', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meal-categories/nonexistent_id`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(404);
  });
});
