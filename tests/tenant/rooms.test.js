import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('6. Tenant Admin - Rooms CRUD & Constraints', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `room-crud-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let productId;
  let roomId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Rooms Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    // Create a camp
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Camp A',
        location: 'Zone A'
      })
    });
    const camp = await campRes.json();
    campId = camp.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('POST /api/products → creates a product', async () => {
    const res = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Deluxe Cabin',
        capacity: 4,
        base_price: 120,
        campIds: [campId]
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    productId = data.id;
  });

  it('POST /api/rooms → creates a room assigned to a product', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        product_id: productId,
        name: '101',
        floor: 1,
        status: 'available'
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    roomId = data.id;
  });

  it('POST /api/rooms (Duplicate) → duplicate room name in the same camp is rejected (400)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        product_id: productId,
        name: '101',
        floor: 1,
        status: 'available'
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('already exists');
  });

  it('GET /api/rooms → lists rooms', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const rooms = await res.json();
    const room = rooms.find(r => r.id === roomId);
    expect(room).toBeDefined();
    expect(room.name).toBe('101');
  });

  it('PUT /api/rooms/:id → updates room status', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        product_id: productId,
        name: '101-A',
        floor: 1,
        status: 'maintenance'
      })
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const rooms = await getRes.json();
    const room = rooms.find(r => r.id === roomId);
    expect(room.name).toBe('101-A');
    expect(room.status).toBe('maintenance');
  });

  it('DELETE /api/rooms/:id → deletes the room', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const rooms = await getRes.json();
    const room = rooms.find(r => r.id === roomId);
    expect(room).toBeUndefined();
  });
});
