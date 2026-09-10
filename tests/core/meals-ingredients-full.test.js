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
let mealCategoryId = null;
// Unique per-run email — admins.email is globally UNIQUE; a fixed email
// collides with leftover rows when a crashed run skips its afterAll cleanup.
const testId = `meal-test-${Date.now()}`;
const adminEmail = `admin@${testId}.com`;

beforeAll(async () => {
  const superToken = await superAdminLogin();
  testTenantId = await createTestTenant(testId, testId, 'Meal Test Tenant');
  await createTenantAdmin(testTenantId, adminEmail, 'Password123!', superToken);
  adminToken = await tenantAdminLogin(testTenantId, adminEmail, 'Password123!');

  // meals.meal_category_id is NOT NULL (FK to meal_categories) — create a category first.
  const catRes = await fetch(`${API}/api/meal-categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
    body: JSON.stringify({ name: 'Main' }),
  });
  const catData = await catRes.json();
  expect(catData.id).toBeTruthy();
  mealCategoryId = catData.id;
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
        body: JSON.stringify({ name: 'Burger', meal_category_id: mealCategoryId, price: 12.5 }),
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
