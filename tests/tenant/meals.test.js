import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('12. Tenant Admin - Meals & Ingredient Consumption Sync', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `meals-sync-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let mealId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Meals Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('POST /api/meals → creates a meal', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Sinai Fried Rice',
        meal_category_id: null,
        price: 15.0,
        description: 'Traditional fried rice dish'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    mealId = data.id;
  });

  it('GET /api/meals → lists meals', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meals`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const meals = await res.json();
    const meal = meals.find(m => m.id === mealId);
    expect(meal).toBeDefined();
    expect(meal.name).toBe('Sinai Fried Rice');
  });

  it('PUT /api/meals/:id → updates a meal', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meals/${mealId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Sinai Fried Rice Deluxe',
        price: 18.0
      })
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/meals`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const meals = await getRes.json();
    const meal = meals.find(m => m.id === mealId);
    expect(meal.name).toBe('Sinai Fried Rice Deluxe');
  });

  it('DELETE /api/meals/:id → deletes a meal', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meals/${mealId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/meals`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const meals = await getRes.json();
    const meal = meals.find(m => m.id === mealId);
    expect(meal).toBeUndefined();
  });
});
