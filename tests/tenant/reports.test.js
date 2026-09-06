import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('Reports & Analytics API', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `reports-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let roomId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Reports Test Camp');
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
      body: JSON.stringify({ name: 'Report Camp', location: 'Mountain Peak' })
    });
    const camp = await campRes.json();
    campId = camp.id;
    if (!campId) console.error('Camp creation failed:', camp);

    // 2. Create product and room
    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Summit Room', capacity: 2, base_price: 200, campIds: [campId] })
    });
    const rt = await rtRes.json();
    const productId = rt.id;
    if (!productId) console.error('Product creation failed:', rt);

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'S1', floor: 1, status: 'occupied' })
    });
    const room = await roomRes.json();
    roomId = room.id;
    if (!roomId) console.error('Room creation failed:', room);

    // 3. Create a CURRENT-stay order that generates revenue today (covers both
    //    the revenue window and the occupancy report's "now" logic).
    const today = new Date();
    const checkIn = today.toISOString().split('T')[0];
    const checkOut = new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0];
    const resRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'John Report',
        number_of_people: 1,
        check_in_date: checkIn,
        check_out_date: checkOut,
        total_amount: 800,
        order_state_id: 'confirmed'
      })
    });
    const resData = await resRes.json();
    if (!resData.success) console.error('Order creation failed:', resData);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('REP-01: GET /api/reports/revenue returns revenue aggregated by period', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBeDefined();
    expect(data.summary.totalRevenue).toBeGreaterThanOrEqual(800);
    expect(Array.isArray(data.details)).toBe(true);
  });

  it('REP-02: GET /api/reports/revenue?days=30 returns data for last 30 days', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue?days=30`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary.totalRevenue).toBeGreaterThanOrEqual(800);
  });

  it('REP-04: GET /api/reports/revenue returns revenue summary aggregates', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary.totalRevenue).toBeGreaterThanOrEqual(800);
    expect(data.summary.totalOrders).toBeGreaterThanOrEqual(1);
    expect(data.summary.totalCollected).toBeGreaterThanOrEqual(0);
    expect(data.summary.totalOutstanding).toBeGreaterThanOrEqual(0);
  });

  it('REP-05: GET /api/reports/revenue with explicit start/end window returns filtered data', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/revenue?start=2026-01-01&end=2030-12-31`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.start).toBe('2026-01-01');
    expect(data.end).toBe('2030-12-31');
    expect(data.summary.totalRevenue).toBeGreaterThanOrEqual(800);
  });

  it('REP-06: GET /api/reports/occupancy returns room occupancy %', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/occupancy`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalRooms).toBe(1);
    expect(data.occupiedRooms).toBe(1);
    expect(data.occupancyRate).toBe(100);
  });
});
