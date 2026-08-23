import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Orders — Extras', () => {
  let superAdminToken, tenantId, tenantToken;
  const ts = Date.now();
  const subdomain = `core-ord-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';
  let campId, productId, roomId, orderId, orderId2;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Orders Extras');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

        const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Orders Camp', location: 'Test Valley' })
    });
    const campData = await campRes.json();
    campId = campData.id;
    if (campRes.status !== 200) console.log('campRes failed:', campRes.status, campData);

    const prodRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Standard Room', capacity: 4, base_price: 150, campIds: [campId] })
    });
    const prodData = await prodRes.json();
    productId = prodData.id;
    if (prodRes.status !== 200) console.log('prodRes failed:', prodRes.status, prodData);

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'Room A1', floor: 1 })
    });
    const roomData = await roomRes.json();
    roomId = roomData.id;
    if (roomRes.status !== 200) console.log('roomRes failed:', roomRes.status, roomData);

    const roomRes2 = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'Room A2', floor: 1 })
    });
    const roomData2 = await roomRes2.json();
    const roomId2 = roomData2.id;
    if (roomRes2.status !== 200) console.log('roomRes2 failed:', roomRes2.status, roomData2);

    const orderRes1 = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId, room_id: roomId, guest_name: 'Bulk Tester',
        check_in_date: '2027-01-01', check_out_date: '2027-01-05', total_amount: 600
      })
    });
    const orderData1 = await orderRes1.json();
    orderId = orderData1.id;
    if (orderRes1.status !== 200) console.log('orderRes1 failed:', orderRes1.status, orderData1);

    const orderRes2 = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId, room_id: roomId2, guest_name: 'Bulk Tester Two',
        check_in_date: '2027-01-01', check_out_date: '2027-01-05', total_amount: 600
      })
    });
    const orderData2 = await orderRes2.json();
    orderId2 = orderData2.id;
    if (orderRes2.status !== 200) console.log('orderRes2 failed:', orderRes2.status, orderData2);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('POST /api/orders/bulk-delete deletes multiple orders', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ ids: [orderId, orderId2] })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deleted).toContain(orderId);
    expect(data.deleted).toContain(orderId2);
  });

  it('POST /api/orders/bulk-delete with empty array returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ ids: [] })
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/orders/calculate-price returns total_price for valid room', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/calculate-price?room_id=${roomId}&check_in=2027-02-01&check_out=2027-02-05`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.totalPrice).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/orders/calculate-price with missing params returns 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/calculate-price`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('GET /api/orders/:id returns order with customer details', async () => {
    const createRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId, room_id: roomId, guest_name: 'Detail Customer',
        check_in_date: '2027-03-01', check_out_date: '2027-03-05', total_amount: 400
      })
    });
    const createData = await createRes.json();
    const newOrderId = createData.id;

    const res = await fetch(`${API_BASE_URL}/api/orders/${newOrderId}`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe(newOrderId);
    expect(data.guest_name || data.customer_first_name).toBeDefined();
  });
});
