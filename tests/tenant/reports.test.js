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

    // 3. Create an order that generates revenue
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
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05',
        total_amount: 800,
        order_state_id: 'confirmed'
      })
    });
    const resData = await resRes.json();
    if (!resData.success) console.error('Order creation failed:', resData);

    // 4. Create an expense
    const expRes = await fetch(`${API_BASE_URL}/api/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        category: 'Supplies',
        description: 'Buying gas tanks',
        amount: 200,
        date: '2026-07-10'
      })
    });
    const expData = await expRes.json();
    if (!expData.success) console.error('Expense creation failed:', expData);

    // 5. Create some inventory items with stock levels
    const invRes1 = await fetch(`${API_BASE_URL}/api/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, item_name: 'Sleeping Bag', category: 'Gear', quantity: 15, unit: 'pcs', cost_per_unit: 40 })
    });
    const invData1 = await invRes1.json();
    if (!invData1.success) console.error('Inventory 1 creation failed:', invData1);

    const invRes2 = await fetch(`${API_BASE_URL}/api/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, item_name: 'Camp Stove', category: 'Gear', quantity: 5, unit: 'pcs', cost_per_unit: 100 })
    });
    const invData2 = await invRes2.json();
    if (!invData2.success) console.error('Inventory 2 creation failed:', invData2);
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('REP-01: GET /api/reports/sales returns revenue aggregated by period', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/sales`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBeDefined();
    expect(data.summary.total_revenue).toBeGreaterThanOrEqual(800);
    expect(Array.isArray(data.details)).toBe(true);
  });

  it('REP-02: GET /api/reports/sales?days=30 returns data for last 30 days', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/sales?days=30`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.period_days).toBe(30);
  });

  it('REP-04: GET /api/reports/financial returns P&L summary', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/financial`, {
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_revenue).toBeGreaterThanOrEqual(800);
    expect(data.total_expenses).toBeGreaterThanOrEqual(200);
    expect(data.net_profit).toBe(data.total_revenue - data.total_expenses);
  });

  it('REP-05: GET /api/reports/financial?tenant_id=... (super admin) returns filtered by tenant', async () => {
    const res = await fetch(`${API_BASE_URL}/api/reports/financial?tenant_id=${tenantId}`, {
      headers: {
        'Authorization': `Bearer ${superAdminToken}`
      }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_revenue).toBeGreaterThanOrEqual(800);
    expect(data.total_expenses).toBeGreaterThanOrEqual(200);
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
    expect(data.total_rooms).toBe(1);
    expect(data.occupied_rooms).toBe(1);
    expect(data.occupancy_rate).toBe(100);
  });
});
