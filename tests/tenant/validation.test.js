import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  API_BASE_URL, 
  superAdminLogin, 
  createTestTenant, 
  createTenantAdmin, 
  tenantAdminLogin, 
  deleteTestTenant 
} from '../helpers';

describe('Validation & Edge Cases', () => {
  let superAdminToken;
  let tenantId;
  const tenantSubdomain = `validation-${Date.now()}`;
  const adminEmail = `admin@${tenantSubdomain}.com`;
  const adminPassword = 'Password123';
  let tenantToken;
  let campId;
  let productId;
  let roomId;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(tenantSubdomain, tenantSubdomain, 'Validation Test Camp');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    // Create a default camp, product, and room to use in validation checks
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Base Validation Camp', location: 'Desert Oasis' })
    });
    const camp = await campRes.json();
    campId = camp.id;

    const rtRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Standard Tent', capacity: 2, base_price: 100, campIds: [campId] })
    });
    const rt = await rtRes.json();
    productId = rt.id;

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'V1', floor: 1, status: 'available' })
    });
    const room = await roomRes.json();
    roomId = room.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) {
      await deleteTestTenant(tenantId, superAdminToken);
    }
  });

  it('VAL-01: Create camp with startDate >= endDate → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ name: 'Invalid Date Camp', start_date: '2026-07-20', end_date: '2026-07-19' })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('before end date');
  });

  it('VAL-02: Create room with duplicate room name in same camp → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'V1', floor: 1 })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('already exists');
  });

  it('VAL-03: Create order with guests > product capacity → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Over Capacity Guest',
        number_of_people: 5, // Capacity of Standard Tent is 2
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05'
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('maximum capacity of 2');
  });

  it('VAL-06: Create camp with missing name field → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ location: 'Nowhere' })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Name is required');
  });

  it('VAL-07: Create room with missing name → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ camp_id: campId, product_id: productId })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Room name is required');
  });

  it('VAL-08: Create order with missing guestName → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        number_of_people: 1,
        check_in_date: '2026-08-01',
        check_out_date: '2026-08-05'
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('guest name are required');
  });

  it('VAL-09: Create order with checkInDate in the past → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Time Traveler',
        number_of_people: 1,
        check_in_date: '2020-01-01', // Date in the past
        check_out_date: '2020-01-05'
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('cannot be in the past');
  });

  it('VAL-10: Create rate plan with price = 0 or negative → 400 Bad Request', async () => {
    const res = await fetch(`${API_BASE_URL}/api/rateplans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`,
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({ product_id: productId, name: 'Free Stay', price_per_night: 0 })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Price must be positive');
  });

});
