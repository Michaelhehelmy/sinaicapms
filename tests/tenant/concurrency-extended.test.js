import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('Concurrency Extended', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `conc-ext-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let productId;
  let roomId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Concurrency Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Conc Camp', location: 'Conc Location' })
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
      body: JSON.stringify({ name: 'Conc Product', capacity: 2, base_price: 100 })
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
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'Room A' })
    });
    const room = await roomRes.json();
    roomId = room.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('Concurrent meal updates do not crash the server', async () => {
    const mealRes = await fetch(`${API_BASE_URL}/api/meals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Concurrent Meal', price: 10 })
    });
    const meal = await mealRes.json();
    const mealId = meal.id;

    const updates = Array.from({ length: 5 }, (_, i) =>
      fetch(`${API_BASE_URL}/api/meals/${mealId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenantToken}`,
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({ name: `Updated Meal ${i}`, price: 10 + i })
      })
    );

    const results = await Promise.allSettled(updates);
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
  });

  it('Booking and immediate cancellation do not leave orphan records', async () => {
    const bookRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Concurrency Guest',
        check_in_date: '2027-06-01',
        check_out_date: '2027-06-03',
        total_amount: 200,
        order_state_id: 'pending'
      })
    });
    const order = await bookRes.json();
    const orderId = order.id;

    const cancelRes = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ order_state_id: 'cancelled' })
    });
    expect(cancelRes.ok).toBe(true);

    const getRes = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.order_state_id).toBe('cancelled');
  });

  it('Double-booking same room on overlapping dates is rejected', async () => {
    const firstRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'First Guest',
        check_in_date: '2027-07-01',
        check_out_date: '2027-07-05',
        total_amount: 400
      })
    });
    expect(firstRes.ok).toBe(true);

    const secondRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Second Guest',
        check_in_date: '2027-07-03',
        check_out_date: '2027-07-07',
        total_amount: 400
      })
    });
    expect(secondRes.status).toBe(400);
    const err = await secondRes.json();
    expect(err.error).toBeDefined();
  });
});
