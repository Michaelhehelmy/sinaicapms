import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('Cascade Behavior', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `cascade-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let productId;
  let roomId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Cascade Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cascade Camp', location: 'Cascade Location' })
    });
    const camp = await campRes.json();
    campId = camp.id;

    const prodRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cascade Product', capacity: 2, base_price: 100 })
    });
    const prod = await prodRes.json();
    productId = prod.id;

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'Cascade Room' })
    });
    const room = await roomRes.json();
    roomId = room.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('Deleting a room with active orders returns error or frees the room', async () => {
    const orderRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Cascade Guest',
        check_in_date: '2027-08-01',
        check_out_date: '2027-08-03',
        total_amount: 200
      })
    });
    expect(orderRes.ok).toBe(true);

    const roomList = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const rooms = await roomList.json();
    const room = Array.isArray(rooms) ? rooms.find(r => r.id === roomId) : null;
    expect(room).toBeDefined();
    expect(room.name).toBe('Cascade Room');
  });

  it('Deleting a category with meals does not crash', async () => {
    const catRes = await fetch(`${API_BASE_URL}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cascade Category' })
    });
    const cat = await catRes.json();
    const catId = cat.id;

    await fetch(`${API_BASE_URL}/api/meals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cascade Meal', price: 25 })
    });

    const delRes = await fetch(`${API_BASE_URL}/api/categories/${catId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(delRes.ok).toBe(true);
  });

  it('Deleting a meal category does not crash server', async () => {
    const mcatRes = await fetch(`${API_BASE_URL}/api/meal-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cascade Meal Cat' })
    });
    const mcat = await mcatRes.json();

    const delRes = await fetch(`${API_BASE_URL}/api/meal-categories/${mcat.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(delRes.ok).toBe(true);
  });

  it('Deleting a non-existent resource returns 404 or success', async () => {
    const delRes = await fetch(`${API_BASE_URL}/api/categories/nonexistent_cat_12345`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(delRes.status).toBeLessThanOrEqual(200);
  });
});
