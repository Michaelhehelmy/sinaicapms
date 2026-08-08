import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from './helpers';

const ORDER_STATE_CONFIRMED = 2;
const ORDER_STATE_PENDING = 1;

describe('Search, Filter & Pagination', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `sfp-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  let camp1Id, camp2Id, camp3Id;
  let roomId;
  let res1Id;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'SFP Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    // Create 3 camps for pagination testing
    const createCamp = async (name) => {
      const res = await fetch(`${API_BASE_URL}/api/camps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({ name, location: 'Red Sea' })
      });
      const data = await res.json();
      return data.id;
    };
    camp1Id = await createCamp('Camp Alpha');
    camp2Id = await createCamp('Camp Beta');
    camp3Id = await createCamp('Camp Gamma');

    // Create room type (product) and rooms (one on floor 1, one on floor 2)
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        campIds: [camp1Id],
        name: 'SFP Type Suite',
        capacity: 2,
        base_price: 100
      })
    });
    const rt = await rtRes.json();

    const createRoom = async (roomName, floor) => {
      const res = await fetch(`${API_BASE_URL}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          camp_id: camp1Id,
          product_id: rt.id,
          name: roomName,
          floor: floor,
          status: 'available'
        })
      });
      return await res.json();
    };
    const room1 = await createRoom('Room101', 1);
    await createRoom('Room201', 2);
    roomId = room1.id;

    // Create an order (confirmed)
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: camp1Id,
        room_id: roomId,
        guest_name: 'SFP Guest',
        guest_email: 'sfp@gmail.com',
        check_in_date: '2026-09-01',
        check_out_date: '2026-09-05',
        number_of_people: 1,
        order_state_id: ORDER_STATE_CONFIRMED
      })
    });
    const resData = await res.json();
    res1Id = resData.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('SFP-01: Tenants search query filtering', async () => {
    // Search for the tenant name
    const res = await fetch(`${API_BASE_URL}/api/tenants?search=SFP`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const tenantObj = list.find(t => t.id === tenantId);
    expect(tenantObj).toBeDefined();
  });

  it('SFP-02: Tenants status filtering', async () => {
    // Query active tenants
    const res = await fetch(`${API_BASE_URL}/api/tenants?status=active`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const tenantObj = list.find(t => t.id === tenantId);
    expect(tenantObj).toBeDefined();
    expect(tenantObj.status).toBe('active');
  });

  it('SFP-03: Orders status filtering', async () => {
    // Query confirmed orders
    const res = await fetch(`${API_BASE_URL}/api/orders?order_state_id=${ORDER_STATE_CONFIRMED}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const resObj = list.find(r => r.id === res1Id);
    expect(resObj).toBeDefined();
    expect(resObj.order_state_id).toBe(ORDER_STATE_CONFIRMED);

    // Query pending orders (should not contain this one)
    const resPending = await fetch(`${API_BASE_URL}/api/orders?order_state_id=${ORDER_STATE_PENDING}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(resPending.status).toBe(200);
    const listPending = await resPending.json();
    expect(listPending.find(r => r.id === res1Id)).toBeUndefined();
  });

  it('SFP-04: Rooms floor level filtering', async () => {
    // Query floor 1
    const res = await fetch(`${API_BASE_URL}/api/rooms?floor=1`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Room101');
    expect(list[0].floor).toBe(1);
  });

  it('SFP-05/06: Camps pagination limit & offset', async () => {
    // Limit: 2, Offset: 0
    const res1 = await fetch(`${API_BASE_URL}/api/camps?limit=2&offset=0`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res1.status).toBe(200);
    const page1 = await res1.json();
    expect(page1.length).toBe(2);

    // Limit: 2, Offset: 2 (should return the remaining 1 camp)
    const res2 = await fetch(`${API_BASE_URL}/api/camps?limit=2&offset=2`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res2.status).toBe(200);
    const page2 = await res2.json();
    expect(page2.length).toBe(1);
  });
});
