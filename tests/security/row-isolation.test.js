import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant
} from '../helpers';

describe('Row-Level Tenant Isolation — Cross-Tenant Data Leakage', () => {
  let superAdminToken;
  let tenantA, tenantB;
  let tokenA, tokenB;
  let campIdA, campIdB;
  let productIdA, productIdB;
  let roomIdA, roomIdB;
  let ratePlanIdA, ratePlanIdB;
  let mealIdA, mealIdB;
  let planIdA, planIdB;
  let orderIdA;
  let categoryIdA;

  const ts = Date.now();
  const subA = `row-iso-a-${ts}`;
  const subB = `row-iso-b-${ts}`;
  const emailA = `admin@${subA}.com`;
  const emailB = `admin@${subB}.com`;
  const pw = 'Password123';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();

    // Tenant A setup
    tenantA = await createTestTenant(subA, subA, 'Row Iso Tenant A');
    await createTenantAdmin(tenantA, emailA, pw, superAdminToken);
    tokenA = await tenantAdminLogin(tenantA, emailA, pw);

    // Tenant B setup
    tenantB = await createTestTenant(subB, subB, 'Row Iso Tenant B');
    await createTenantAdmin(tenantB, emailB, pw, superAdminToken);
    tokenB = await tenantAdminLogin(tenantB, emailB, pw);

    // Create camp in Tenant A
    let res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Camp Alpha', location: 'North Sinai' })
    });
    let data = await res.json();
    campIdA = data.id;

    // Create camp in Tenant B
    res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Camp Beta', location: 'South Sinai' })
    });
    data = await res.json();
    campIdB = data.id;

    // Create product in Tenant A
    res = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Deluxe Tent', type: 'room', selling_price: 150, campIds: [campIdA] })
    });
    data = await res.json();
    productIdA = data.id;

    // Create product in Tenant B
    res = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Standard Hut', type: 'room', selling_price: 100, campIds: [campIdB] })
    });
    data = await res.json();
    productIdB = data.id;

    // Create room in Tenant A
    res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Room A1', camp_id: campIdA, product_id: productIdA, capacity: 2 })
    });
    data = await res.json();
    roomIdA = data.id;

    // Create room in Tenant B
    res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Room B1', camp_id: campIdB, product_id: productIdB, capacity: 4 })
    });
    data = await res.json();
    roomIdB = data.id;

    // Create rate plan in Tenant A
    res = await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Plan A', product_id: productIdA, price: 200, camp_id: campIdA })
    });
    data = await res.json();
    ratePlanIdA = data.id;

    // Create rate plan in Tenant B
    res = await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Plan B', product_id: productIdB, price: 120, camp_id: campIdB })
    });
    data = await res.json();
    ratePlanIdB = data.id;

    // Create meal in Tenant A
    res = await fetch(`${API_BASE_URL}/api/meals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Grilled Fish', price: 25, camp_id: campIdA })
    });
    data = await res.json();
    mealIdA = data.id;

    // Create meal in Tenant B
    res = await fetch(`${API_BASE_URL}/api/meals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Pasta Dish', price: 18, camp_id: campIdB })
    });
    data = await res.json();
    mealIdB = data.id;

    // Create plan in Tenant A
    res = await fetch(`${API_BASE_URL}/api/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Morning Hike', camp_id: campIdA, date: '2026-08-01', time: '08:00', capacity: 20 })
    });
    data = await res.json();
    planIdA = data.id;

    // Create plan in Tenant B
    res = await fetch(`${API_BASE_URL}/api/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Evening Trek', camp_id: campIdB, date: '2026-08-02', time: '17:00', capacity: 15 })
    });
    data = await res.json();
    planIdB = data.id;

    // Create order in Tenant A
    res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({
        room_id: roomIdA,
        guest_name: 'John Doe',
        guest_email: 'john@test.com',
        guest_phone: '+1234567890',
        check_in_date: '2026-08-10',
        check_out_date: '2026-08-12',
        num_guests: 2,
        total_amount: 400
      })
    });
    data = await res.json();
    orderIdA = data.id;

    // Create category in Tenant A
    res = await fetch(`${API_BASE_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA },
      body: JSON.stringify({ name: 'Activities', tenant_id: tenantA })
    });
    data = await res.json();
    categoryIdA = data.id;
  });

  afterAll(async () => {
    if (tenantA && superAdminToken) await deleteTestTenant(tenantA, superAdminToken);
    if (tenantB && superAdminToken) await deleteTestTenant(tenantB, superAdminToken);
  });

  // ───── Camp Isolation ─────

  it('Camps → Tenant B list does not contain Tenant A camp', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.map(c => c.name);
    expect(names).not.toContain('Camp Alpha');
    expect(names).toContain('Camp Beta');
  });

  it('Camps → Tenant B cannot read Tenant A camp by ID (404 or empty)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps/${campIdA}`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 200]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.name).not.toBe('Camp Alpha');
    }
  });

  it('Camps → Tenant B cannot update Tenant A camp', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps/${campIdA}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Hijacked Camp' })
    });
    expect([404, 403]).toContain(res.status);
  });

  it('Camps → Tenant B cannot delete Tenant A camp', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps/${campIdA}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 403]).toContain(res.status);
  });

  // ───── Product Isolation ─────

  it('Products → Tenant B list does not contain Tenant A product', async () => {
    const res = await fetch(`${API_BASE_URL}/api/products`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.map(p => p.name);
    expect(names).not.toContain('Deluxe Tent');
    expect(names).toContain('Standard Hut');
  });

  it('Products → Tenant B cannot read Tenant A product by ID', async () => {
    const res = await fetch(`${API_BASE_URL}/api/products/${productIdA}`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 200]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.name).not.toBe('Deluxe Tent');
    }
  });

  // ───── Room Isolation ─────

  it('Rooms → Tenant B list does not contain Tenant A room', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.map(r => r.name);
    expect(names).not.toContain('Room A1');
    expect(names).toContain('Room B1');
  });

  it('Rooms → Tenant B cannot access Tenant A room by ID', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomIdA}`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 200]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.name).not.toBe('Room A1');
    }
  });

  // ───── Rate Plan Isolation ─────

  it('RatePlans → Tenant B list does not contain Tenant A rate plan', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rateplans`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.map(r => r.name);
    expect(names).not.toContain('Plan A');
    expect(names).toContain('Plan B');
  });

  // ───── Meal Isolation ─────

  it('Meals → Tenant B list does not contain Tenant A meal', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meals`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.map(m => m.name);
    expect(names).not.toContain('Grilled Fish');
    expect(names).toContain('Pasta Dish');
  });

  it('Meals → Tenant B cannot delete Tenant A meal', async () => {
    const res = await fetch(`${API_BASE_URL}/api/meals/${mealIdA}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 403]).toContain(res.status);
  });

  // ───── Plan Isolation ─────

  it('Plans → Tenant B list does not contain Tenant A plan', async () => {
    const res = await fetch(`${API_BASE_URL}/api/plans`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.map(p => p.name);
    expect(names).not.toContain('Morning Hike');
    expect(names).toContain('Evening Trek');
  });

  // ───── Order Isolation ─────

  it('Orders → Tenant B list does not contain Tenant A order', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.data || []);
    const guestNames = list.map(o => o.guest_name);
    expect(guestNames).not.toContain('John Doe');
  });

  it('Orders → Tenant B cannot update Tenant A order status', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders/${orderIdA}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ order_state_id: 3 })
    });
    expect([404, 403]).toContain(res.status);
  });

  // ───── Category Isolation ─────

  it('Categories → Tenant B cannot delete Tenant A category', async () => {
    const res = await fetch(`${API_BASE_URL}/api/categories/${categoryIdA}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 403]).toContain(res.status);
  });

  // ───── Availability Cross-Tenant Check ─────

  it('Availability → Tenant B rooms not returned for Tenant A room query', async () => {
    const res = await fetch(
      `${API_BASE_URL}/api/availability?check_in=2026-08-10&check_out=2026-08-12&room_id=${roomIdB}`,
      { headers: { 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA } }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    const roomIds = (data.rooms || data || []).map(r => r.room_id || r.id);
    expect(roomIds).not.toContain(roomIdA);
  });

  // ───── Reports Cross-Tenant Check ─────

  it('Reports → Tenant B revenue does not include Tenant A orders', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue?days=30`, {
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const total = data.summary?.total_revenue || data.total_revenue || 0;
    expect(total).toBeLessThan(400);
  });

  // ───── Cross-Tenant Mutation via Direct ID ─────

  it('Camp update → Tenant B cannot modify Tenant A camp via direct PUT with known ID', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps/${campIdA}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB },
      body: JSON.stringify({ name: 'Renamed by Tenant B' })
    });
    expect([404, 403]).toContain(res.status);

    // Verify original name intact
    const verify = await fetch(`${API_BASE_URL}/api/camps/${campIdA}`, {
      headers: { 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA }
    });
    const data = await verify.json();
    expect(data.name).toBe('Camp Alpha');
  });

  it('Room delete → Tenant B cannot delete Tenant A room via direct DELETE', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomIdA}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}`, 'x-tenant-id': tenantB }
    });
    expect([404, 403]).toContain(res.status);

    // Verify room still exists
    const verify = await fetch(`${API_BASE_URL}/api/rooms`, {
      headers: { 'Authorization': `Bearer ${tokenA}`, 'x-tenant-id': tenantA }
    });
    const data = await verify.json();
    const names = data.map(r => r.name);
    expect(names).toContain('Room A1');
  });

  // ───── Super Admin Bypass ─────

  it('Super admin → can read both Tenant A and Tenant B camps', async () => {
    const resA = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}`, 'x-tenant-id': tenantA }
    });
    const resB = await fetch(`${API_BASE_URL}/api/camps`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}`, 'x-tenant-id': tenantB }
    });
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const dataA = await resA.json();
    const dataB = await resB.json();
    expect(dataA.some(c => c.name === 'Camp Alpha')).toBe(true);
    expect(dataB.some(c => c.name === 'Camp Beta')).toBe(true);
  });
});
