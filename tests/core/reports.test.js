import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { API_BASE_URL, superAdminLogin, createTestTenant, createTenantAdmin, tenantAdminLogin, deleteTestTenant } from '../helpers';

describe('Core Reports', () => {
  let superAdminToken, tenantId, tenantToken;
  const ts = Date.now();
  const subdomain = `core-rep-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Reports');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Reports Camp', location: 'Mountain Peak' })
    });
    const camp = await campRes.json();
    const campId = camp.id;

    const prodRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Report Room Type', capacity: 2, base_price: 200, campIds: [campId] })
    });
    const prod = await prodRes.json();
    const productId = prod.id;

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'RPT-101', floor: 1, status: 'occupied' })
    });
    const room = await roomRes.json();
    const roomId = room.id;

    await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId, room_id: roomId, guest_name: 'Report Guest',
        number_of_people: 1, check_in_date: '2027-01-01', check_out_date: '2027-01-05',
        total_amount: 800, order_state_id: 'confirmed'
      })
    });
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });

  it('GET /api/reports/occupancy returns total_rooms and occupancy_rate', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/occupancy`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.totalRooms).toBeDefined();
    expect(data.occupancyRate).toBeDefined();
    expect(data.totalRooms).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/reports/revenue returns summary with total_revenue', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.summary).toBeDefined();
    expect(data.summary.total_revenue).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/reports/revenue?days=7 returns period_days=7', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue?days=7`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.period_days).toBe(7);
  });

  it('GET /api/reports/bookings returns by_state and by_camp', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/bookings`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.by_state).toBeDefined();
    expect(data.by_camp).toBeDefined();
    expect(Array.isArray(data.by_state)).toBe(true);
    expect(Array.isArray(data.by_camp)).toBe(true);
  });

  it('GET /api/reports/invalid returns 404', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/invalid`, {
      headers: { 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId }
    });
    expect(res.status).toBe(404);
  });
});
