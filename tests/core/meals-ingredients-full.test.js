import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers.js';
import { beforeAll, afterAll } from 'vitest';

const API = API_BASE_URL;

let adminToken = null;
let testTenantId = null;

beforeAll(async () => {
  const superToken = await superAdminLogin();
  const id = `meal-test-${Date.now()}`;
  testTenantId = await createTestTenant(id, id, 'Meal Test Tenant');
  await createTenantAdmin(testTenantId, 'admin@meals.com', 'Password123!', superToken);
  adminToken = await tenantAdminLogin(testTenantId, 'admin@meals.com', 'Password123!');
});

afterAll(async () => {
  if (testTenantId) {
    const superToken = await superAdminLogin();
    await deleteTestTenant(testTenantId, superToken);
  }
});

describe('Meals API', () => {
  describe('POST /api/meals', () => {
    it('creates a meal', async () => {
      const res = await fetch(`${API}/api/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ name: 'Burger', meal_category_id: 1, price: 12.5 }),
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.id).toBeTruthy();
    });

    it('rejects meal without name', async () => {
      const res = await fetch(`${API}/api/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ price: 10 }),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/meals', () => {
    it('returns list of meals', async () => {
      const res = await fetch(`${API}/api/meals`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      const meal = data.find(m => m.name === 'Burger');
      expect(meal).toBeTruthy();
      expect(meal.type).toBe('menu');
      expect(meal.price).toBe(12.5);
    });
  });

  describe('PUT /api/meals/:id', () => {
    it('updates meal fields', async () => {
      const list = await fetch(`${API}/api/meals`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
      });
      const meals = await list.json();
      const meal = meals.find(m => m.name === 'Burger');
      expect(meal).toBeTruthy();

      const res = await fetch(`${API}/api/meals/${meal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ name: 'Burger Deluxe', price: 15.0 }),
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('DELETE /api/meals/:id', () => {
    it('soft-deletes a meal', async () => {
      const list = await fetch(`${API}/api/meals`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
      });
      const meals = await list.json();
      const meal = meals.find(m => m.name === 'Burger Deluxe');
      expect(meal).toBeTruthy();

      const res = await fetch(`${API}/api/meals/${meal.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify deleted
      const check = await fetch(`${API}/api/meals`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
      });
      const remaining = await check.json();
      expect(remaining.find(m => m.id === meal.id)).toBeFalsy();
    });
  });
});
