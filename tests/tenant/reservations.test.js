import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('7. Tenant Admin - Orders & Ledger Sync', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `res-sync-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let productId;
  let roomId;
  let orderId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Orders Sync Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    // 1. Create a camp
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Lakeside Camp', location: 'Lake Area' })
    });
    const camp = await campRes.json();
    campId = camp.id;

    // 2. Create product with capacity 2
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name: 'Standard Cabin',
        capacity: 2,
        base_price: 100,
        campIds: [campId]
      })
    });
    const rt = await rtRes.json();
    productId = rt.id;

    // 3. Create room
    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        product_id: productId,
        name: '202',
        floor: 1,
        status: 'available'
      })
    });
    const room = await roomRes.json();
    roomId = room.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('POST /api/orders → creates order and logs revenue & changes room status to occupied', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'John Doe',
        guest_email: 'john@gmail.com',
        number_of_people: 2,
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05',
        order_state_id: 'confirmed',
        total_amount: 400,
        amount_paid: 200
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    orderId = data.id;

    // Verify room status changed to occupied
    const roomsRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const rooms = await roomsRes.json();
    const room = rooms.find(r => r.id === roomId);
    expect(room.status).toBe('occupied');

    // Verify revenue was logged
    const revRes = await fetch(`${API_BASE_URL}/api/financial/revenue`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(revRes.status).toBe(200);
    const revenue = await revRes.json();
    const revItem = revenue.find(r => r.source_id === orderId);
    expect(revItem).toBeDefined();
    expect(revItem.amount).toBe(400);
  });

  it('POST /api/orders (Over-Capacity) → capacity limit validation checks out', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Over Capacity Party',
        number_of_people: 5, // Cabin max capacity is 2
        check_in_date: '2026-08-10',
        check_out_date: '2026-08-15',
        order_state_id: 'confirmed',
        total_amount: 500
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('maximum capacity');
  });

  it('POST /api/orders (Invalid Dates) → check-out before check-in is rejected', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Invalid Dates Guest',
        number_of_people: 1,
        check_in_date: '2026-08-20',
        check_out_date: '2026-08-18', // checkout before checkin
        order_state_id: 'confirmed',
        total_amount: 300
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Check-out date must be after check-in date');
  });

  it('PUT /api/orders/:id → updating order details syncs the revenue record', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'John Doe',
        number_of_people: 2,
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05',
        order_state_id: 'confirmed',
        total_amount: 450, // Updated from 400
        amount_paid: 250
      })
    });
    expect(res.status).toBe(200);

    // Verify revenue was updated
    const revRes = await fetch(`${API_BASE_URL}/api/financial/revenue`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const revenue = await revRes.json();
    const revItem = revenue.find(r => r.source_id === orderId);
    expect(revItem.amount).toBe(450);
  });

  it('DELETE /api/orders/:id → removes order and revenue & reverts room status', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);

    // Verify room status reverted to available
    const roomsRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const rooms = await roomsRes.json();
    const room = rooms.find(r => r.id === roomId);
    expect(room.status).toBe('available');

    // Verify revenue was deleted
    const revRes = await fetch(`${API_BASE_URL}/api/financial/revenue`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const revenue = await revRes.json();
    const revItem = revenue.find(r => r.source_id === orderId);
    expect(revItem).toBeUndefined();
  });
});
