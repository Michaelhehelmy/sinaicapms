import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('Rate Plans & Pricing Engine', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `rateplans-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let productId;
  let roomId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Pricing Test Camp');
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
      body: JSON.stringify({ name: 'Pricing Valley Camp', location: 'Hidden Oasis' })
    });
    const camp = await campRes.json();
    campId = camp.id;

    // Create a product with base price = 100
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Cabin Pro', capacity: 4, base_price: 100, campIds: [campId] })
    });
    const rt = await rtRes.json();
    productId = rt.id;

    // Create a room
    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'P1', floor: 1, status: 'available' })
    });
    const room = await roomRes.json();
    roomId = room.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('RATE-03: Fallback to base price when no rate plan covers a date', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/calculate-price?room_id=${roomId}&check_in=2026-08-01&check_out=2026-08-04`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    // 3 nights * base price $100 = $300
    expect(data.total_price).toBe(300);
  });

  it('RATE-01: Night-by-night pricing – different rates apply on different dates', async () => {
    // Create a rate plan for Aug 1st to Aug 2nd ($150/night)
    const rp1Res = await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ product_id: productId, name: 'Aug Weekend Peak', price_per_night: 150, start_date: '2026-08-01', end_date: '2026-08-02' })
    });
    const rp1 = await rp1Res.json();
    expect(rp1.success).toBe(true);

    const res = await fetch(`${API_BASE_URL}/api/orders/calculate-price?room_id=${roomId}&check_in=2026-08-01&check_out=2026-08-04`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    // Aug 1: rate plan matches ($150)
    // Aug 2: rate plan matches ($150)
    // Aug 3: fallback to base ($100)
    // Total = 150 + 150 + 100 = 400
    expect(data.total_price).toBe(400);

    // Cleanup rate plan
    await fetch(`${API_BASE_URL}/api/rateplans/${rp1.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
  });

  it('RATE-02: Overlapping rate plans – correct plan selected per date', async () => {
    // Create rate plan 1: Aug 1 to Aug 5 ($120/night)
    const rp1 = await (await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ product_id: productId, name: 'Weekly Special', price_per_night: 120, start_date: '2026-08-01', end_date: '2026-08-05' })
    })).json();

    // Create rate plan 2: Aug 2 to Aug 3 ($200/night - higher priority/price matches first due to order by price)
    const rp2 = await (await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ product_id: productId, name: 'Flash Peak', price_per_night: 200, start_date: '2026-08-02', end_date: '2026-08-03' })
    })).json();

    const res = await fetch(`${API_BASE_URL}/api/orders/calculate-price?room_id=${roomId}&check_in=2026-08-01&check_out=2026-08-04`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    // Aug 1: matches Weekly Special ($120)
    // Aug 2: matches Flash Peak ($200)
    // Aug 3: matches Flash Peak ($200)
    // Total = 120 + 200 + 200 = 520
    expect(data.total_price).toBe(520);

    // Cleanup
    await fetch(`${API_BASE_URL}/api/rateplans/${rp1.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId } });
    await fetch(`${API_BASE_URL}/api/rateplans/${rp2.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId } });
  });

  it('RATE-04: Rate plan with season filter – only applies to matching dates', async () => {
    // Create rate plan with summer filter (June-August) for $180
    const rp1 = await (await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ product_id: productId, name: 'Summer Splurge', price_per_night: 180, season: 'summer' })
    })).json();

    // Calculate price in August (Summer)
    const summerRes = await fetch(`${API_BASE_URL}/api/orders/calculate-price?room_id=${roomId}&check_in=2026-08-01&check_out=2026-08-03`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const summerData = await summerRes.json();
    expect(summerData.total_price).toBe(360); // 2 nights * $180

    // Calculate price in October (Not Summer)
    const autumnRes = await fetch(`${API_BASE_URL}/api/orders/calculate-price?room_id=${roomId}&check_in=2026-10-01&check_out=2026-10-03`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const autumnData = await autumnRes.json();
    expect(autumnData.total_price).toBe(200); // 2 nights * base $100 fallback

    // Cleanup
    await fetch(`${API_BASE_URL}/api/rateplans/${rp1.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId } });
  });

  it('RATE-05: Deleting a rate plan used by an active order → is blocked (400)', async () => {
    // 1. Create a rate plan
    const rp = await (await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ product_id: productId, name: 'Aug Reserved Plan', price_per_night: 150, start_date: '2026-08-01', end_date: '2026-08-10' })
    })).json();

    // 2. Create order matching this product (roomId)
    const order = await (await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Stayer',
        number_of_people: 1,
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05',
        total_amount: 600,
        order_state_id: 'confirmed'
      })
    })).json();
    expect(order.success).toBe(true);

    // 3. Attempt to delete rate plan (should fail since order is active for the product)
    const delRes = await fetch(`${API_BASE_URL}/api/rateplans/${rp.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(delRes.status).toBe(400);
    const delData = await delRes.json();
    expect(delData.error).toContain('active orders');

    // 4. Cancel order first
    await fetch(`${API_BASE_URL}/api/orders/${order.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Stayer',
        number_of_people: 1,
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05',
        order_state_id: 'cancelled'
      })
    });

    // 5. Delete rate plan (should succeed now)
    const delResSuccess = await fetch(`${API_BASE_URL}/api/rateplans/${rp.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(delResSuccess.status).toBe(200);
  });
});
