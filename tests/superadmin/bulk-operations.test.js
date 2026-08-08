import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

const ORDER_STATE_CONFIRMED = 2;

describe('Super Admin & Tenant Bulk Operations', () => {
  let superAdminToken;
  let tenant1Id, tenant2Id;
  const subdomain1 = `bulk-t1-${Date.now()}`;
  const subdomain2 = `bulk-t2-${Date.now()}`;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenant1Id = await createTestTenant(subdomain1, subdomain1, 'Bulk Tenant 1');
    tenant2Id = await createTestTenant(subdomain2, subdomain2, 'Bulk Tenant 2');
  });

  afterAll(async () => {
    // Clean up if not already deleted by bulk delete test
    const cleanUp = async (id) => {
      try {
        await deleteTestTenant(id, superAdminToken);
      } catch (e) { /* cleanup OK to fail if already deleted */ }
    };
    if (tenant1Id) await cleanUp(tenant1Id);
    if (tenant2Id) await cleanUp(tenant2Id);
  });

  it('BULK-01: Bulk suspend tenants', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/tenants/bulk/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({ ids: [tenant1Id, tenant2Id] })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.suspended).toContain(tenant1Id);
    expect(data.suspended).toContain(tenant2Id);

    // Verify database statuses
    const check1 = await fetch(`${API_BASE_URL}/api/tenants/${tenant1Id}`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const t1 = await check1.json();
    expect(t1.status).toBe('suspended');
  });

  it('BULK-02: Bulk activate tenants', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/tenants/bulk/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({ ids: [tenant1Id, tenant2Id] })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.activated).toContain(tenant1Id);
    expect(data.activated).toContain(tenant2Id);

    // Verify database statuses
    const check1 = await fetch(`${API_BASE_URL}/api/tenants/${tenant1Id}`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const t1 = await check1.json();
    expect(t1.status).toBe('active');
  });

  it('BULK-03: Bulk delete tenants', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/tenants/bulk/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({ ids: [tenant1Id, tenant2Id] })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deleted).toContain(tenant1Id);
    expect(data.deleted).toContain(tenant2Id);

    // Verify database shows 404 for tenant details
    const check1 = await fetch(`${API_BASE_URL}/api/tenants/${tenant1Id}`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(check1.status).toBe(404);
    
    // Clear references so afterAll doesn't try to delete again
    tenant1Id = null;
    tenant2Id = null;
  });

  it('BULK-04: Bulk delete orders', async () => {
    // 1. Set up a new active tenant
    const resTenantSub = `bulk-res-${Date.now()}`;
    const tId = await createTestTenant(resTenantSub, resTenantSub, 'Bulk Reservation Camp');
    const adminEmail = `admin@${resTenantSub}.com`;
    const adminPassword = 'Password123';
    await createTenantAdmin(tId, adminEmail, adminPassword, superAdminToken);
    const tenantToken = await tenantAdminLogin(tId, adminEmail, adminPassword);

    // 2. Create camp
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tId
      },
      body: JSON.stringify({
        name: 'Camp Bulk',
        location: 'Red Sea',
        start_date: '2026-08-01',
        end_date: '2026-08-30',
        capacity: 50
      })
    });
    const camp = await campRes.json();
    const campId = camp.id;

    // 3. Create room type (product) and room
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tId
      },
      body: JSON.stringify({
        campIds: [campId],
        name: 'Deluxe Suite',
        capacity: 4,
        base_price: 150,
        description: 'AC, Wifi'
      })
    });
    const rt = await rtRes.json();

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tId
      },
      body: JSON.stringify({
        camp_id: campId,
        product_id: rt.id,
        name: 'RoomB1',
        status: 'available',
        floor: 1
      })
    });
    const room = await roomRes.json();

    // 4. Create two orders in this room
    const createRes = async (checkIn, checkOut) => {
      const r = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tId
        },
        body: JSON.stringify({
          camp_id: campId,
          room_id: room.id,
          guest_name: 'Bulk Guest',
          guest_email: 'bguest@gmail.com',
          check_in_date: checkIn,
          check_out_date: checkOut,
          number_of_people: 2,
          order_state_id: ORDER_STATE_CONFIRMED,
          notes: 'Test'
        })
      });
      const resJson = await r.json();
      return resJson;
    };

    const res1 = await createRes('2026-08-02', '2026-08-05');
    const res2 = await createRes('2026-08-10', '2026-08-15');

    // 5. Bulk delete the orders
    const bulkDelRes = await fetch(`${API_BASE_URL}/api/orders/bulk-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tId
      },
      body: JSON.stringify({ ids: [res1.id, res2.id] })
    });
    expect(bulkDelRes.status).toBe(200);
    const delData = await bulkDelRes.json();
    expect(delData.success).toBe(true);
    expect(delData.deleted).toContain(res1.id);
    expect(delData.deleted).toContain(res2.id);

    // 6. Verify orders are deleted from the database
    const getRes1 = await fetch(`${API_BASE_URL}/api/orders/${res1.id}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tId
      }
    });
    expect(getRes1.status).toBe(404);

    // Cleanup tenant
    await deleteTestTenant(tId, superAdminToken);
  });
});
