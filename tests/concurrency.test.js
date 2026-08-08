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

describe('Concurrent Operations', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `concur-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;

  let campId;
  let roomId;
  let productId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Concurrency Test Camp');
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
      body: JSON.stringify({
        name: 'Concurrency Camp',
        location: 'Sinai Desert',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        capacity: 100
      })
    });
    const camp = await campRes.json();
    campId = camp.id;

    // 2. Create room type (product) and room
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        campIds: [campId],
        name: 'Concurrency Suite',
        capacity: 2,
        base_price: 120
      })
    });
    const rt = await rtRes.json();

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        product_id: rt.id,
        name: 'RoomC101',
        floor: 1,
        status: 'available'
      })
    });
    const room = await roomRes.json();
    roomId = room.id;

    // 3. Create product with stock: 3
    const prodRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        sku: `SKU-CON-${Date.now()}`,
        name: 'Energy Drink',
        price: 5.0,
        cost_price: 2.0,
        stock_quantity: 3,
        reorder_level: 1,
        barcode: `BAR-CON-${Date.now()}`,
        tax_rate: 5
      })
    });
    const prod = await prodRes.json();
    productId = prod.data.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('CON-01: Two concurrent order requests for the same room and dates', async () => {
    // Send two order requests concurrently for room C101 on the same dates
    const resPayload = {
      camp_id: campId,
      room_id: roomId,
      guest_name: 'Concurrent Guest',
      guest_email: 'cguest@gmail.com',
      check_in_date: '2026-09-10',
      check_out_date: '2026-09-15',
      number_of_people: 1,
      order_state_id: ORDER_STATE_CONFIRMED
    };

    const sendRequest = () => fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify(resPayload)
    });

    const [response1, response2] = await Promise.all([sendRequest(), sendRequest()]);

    const statuses = [response1.status, response2.status];
    expect(statuses).toContain(200); // One succeeds
    expect(statuses).toContain(400); // One is rejected
  });

  it('CON-02: Concurrent updates to same camp', async () => {
    const sendUpdate = (name) => fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        name,
        location: 'Sinai Desert',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        capacity: 100
      })
    });

    const [res1, res2] = await Promise.all([
      sendUpdate('Camp Concur Update A'),
      sendUpdate('Camp Concur Update B')
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Verify camp name is one of the two updates
    const getCamp = await fetch(`${API_BASE_URL}/api/camps/${campId}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    const campObj = await getCamp.json();
    expect(['Camp Concur Update A', 'Camp Concur Update B']).toContain(campObj.name);
  });
});
