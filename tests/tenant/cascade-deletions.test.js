import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('18. Tenant Admin - Cascade Deletions & Foreign Key Restrictions', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `cascade-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Cascade Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('DELETE /api/camps/:id → cascades to delete rooms, plans, and staff', async () => {
    // 1. Create a camp
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cascading Camp', location: 'Waterfall Valley' })
    });
    const camp = await campRes.json();
    const campId = camp.id;

    // 2. Create product and room
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Waterfall Cabin', capacity: 2, base_price: 150, campIds: [campId] })
    });
    const rt = await rtRes.json();
    const productId = rt.id;

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'C1', floor: 1, status: 'available' })
    });
    const room = await roomRes.json();
    const roomId = room.id;

    // 3. Create plan/activity
    const planRes = await fetch(`${API_BASE_URL}/api/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, name: 'Waterfall Hike', date: '2026-07-20', status: 'pending', category: 'activities' })
    });
    const plan = await planRes.json();
    const planId = plan.id;

    // 4. Create staff
    const staffRes = await fetch(`${API_BASE_URL}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, name: 'Hike Guide Jim', role: 'guide', email: `jim@${tenantId}.com` })
    });
    const staff = await staffRes.json();
    const staffId = staff.id;

    // Verify all created
    expect(campId).toBeDefined();
    expect(roomId).toBeDefined();
    expect(planId).toBeDefined();
    expect(staffId).toBeDefined();

    // Delete the camp
    const delRes = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(delRes.status).toBe(200);

    // Verify camp is deleted
    const getCamp = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(getCamp.status).toBe(404);

    // Verify room is deleted
    const roomsRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const rooms = await roomsRes.json();
    expect(rooms.find(r => r.id === roomId)).toBeUndefined();

    // Verify plan is deleted
    const plansRes = await fetch(`${API_BASE_URL}/api/plans`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const plans = await plansRes.json();
    expect(plans.find(p => p.id === planId)).toBeUndefined();

    // Verify staff is deleted
    const staffListRes = await fetch(`${API_BASE_URL}/api/staff`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const staffList = await staffListRes.json();
    expect(staffList.find(s => s.id === staffId)).toBeUndefined();
  });

  it('DELETE /api/products/:id → is restricted (fails with 400) if rooms are still assigned', async () => {
    // 1. Create a camp
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Restricted Camp', location: 'Restricted Area' })
    });
    const camp = await campRes.json();
    const campId = camp.id;

    // 2. Create product
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Restricted Cabin', capacity: 2, base_price: 150, campIds: [campId] })
    });
    const rt = await rtRes.json();
    const productId = rt.id;

    // 3. Create a room linked to the product
    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'R1', floor: 1, status: 'available' })
    });
    const room = await roomRes.json();
    const roomId = room.id;

    expect(productId).toBeDefined();
    expect(roomId).toBeDefined();

    // 4. Attempt to delete the product (should fail due to linked rooms/rate plans)
    const delRtFail = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(delRtFail.status).toBe(400);
    const failData = await delRtFail.json();
    expect(failData.error).toContain('linked to existing rooms');

    // 5. Delete the room first
    const delRoomRes = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(delRoomRes.status).toBe(200);

    // 6. Delete the product (should succeed now)
    const delRtSucceed = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(delRtSucceed.status).toBe(200);
  });
});
