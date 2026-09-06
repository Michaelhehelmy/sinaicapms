import { test, expect } from '../../fixtures/coverage-fixture';
import { apiRequest, tenantAdminLogin } from '../../utils/api-helpers';
import { TEST_TENANT, TEST_CAMPS, TEST_PRODUCTS } from '../../fixtures/test-data';

// Booking lifecycle state machine (frozen backend — mirrors orders.js):
//
//   pending    → confirmed | cancelled
//   confirmed  → checked_in | cancelled
//   checked_in → checked_out | cancelled
//   checked_out / cancelled → (terminal)
//
// Illegal transitions → 409 { error: "Illegal status transition: 'X' → 'Y'" }
// Unknown status value → 400 'Invalid order status'
// Unknown order id     → 404 'Order not found'
//
// The whole describe is serial: each test mutates the shared order created in
// beforeAll (create → confirm → check-in → check-out → delete), mirroring a
// real booking lifecycle end to end. A dedicated room per run keeps the
// availability guard free of collisions (same pattern as public-booking-order).

const TIMESTAMP = Date.now();
const TENANT_ID = TEST_TENANT.id;
const ROOM_NAME = `Lifecycle Room ${TIMESTAMP}`;

test.describe.serial('Booking lifecycle state machine', () => {
  let tenantToken: string;
  let orderId = '';
  let roomId = '';

  function tenantHeaders() {
    return { Authorization: `Bearer ${tenantToken}`, 'x-tenant-id': String(TENANT_ID) };
  }

  test.beforeAll(async () => {
    tenantToken = await tenantAdminLogin();

    const roomRes = await apiRequest(
      'POST',
      '/api/rooms',
      {
        camp_id: TEST_CAMPS[0].id,
        product_id: TEST_PRODUCTS[0].id,
        name: ROOM_NAME,
        floor: 1,
      },
      tenantHeaders(),
    );
    expect(roomRes.status).toBe(200);
    roomId = (await roomRes.json()).id;
    expect(roomId).toBeTruthy();

    const orderRes = await apiRequest(
      'POST',
      '/api/orders',
      {
        camp_id: TEST_CAMPS[0].id,
        room_id: roomId,
        guest_name: `Lifecycle Guest ${TIMESTAMP}`,
        guest_email: `lifecycle-${TIMESTAMP}@test.com`,
        guest_phone: '+20100100100',
        check_in_date: '2027-09-01',
        check_out_date: '2027-09-03',
        total_amount: 200,
      },
      tenantHeaders(),
    );
    expect(orderRes.status).toBe(200);
    orderId = (await orderRes.json()).id;
    expect(orderId).toBeTruthy();
  });

  test('order is created with a pending booking state', async () => {
    const res = await apiRequest('GET', `/api/orders/${orderId}`, undefined, tenantHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    // The GET row is camelCased by jsonResponse (verified live: orderStateId
    // is the state slug, stateName the display name). Prefer the display name,
    // but tolerate either spelling.
    const state = String(
      data.stateName ?? data.orderStateId ?? data.order_state_id ?? data.state_name ?? '',
    ).toLowerCase();
    expect(state).toContain('pend');
  });

  test('pending → confirmed transition succeeds', async () => {
    const res = await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status: 'confirmed' }, tenantHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('confirmed');
  });

  test('confirmed → checked_in transition succeeds', async () => {
    const res = await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status: 'checked_in' }, tenantHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('checked_in');
  });

  test('checked_in → checked_out transition succeeds', async () => {
    const res = await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status: 'checked_out' }, tenantHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('checked_out');
  });

  test('illegal transition from a terminal state → 409', async () => {
    const res = await apiRequest(
      'PATCH',
      `/api/orders/${orderId}/status`,
      { status: 'checked_in' },
      tenantHeaders(),
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('Illegal status transition');
  });

  test('unknown status value → 400 Invalid order status', async () => {
    const res = await apiRequest(
      'PATCH',
      `/api/orders/${orderId}/status`,
      { status: 'not-a-real-state' },
      tenantHeaders(),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid order status');
  });

  test('unknown order id → 404 Order not found', async () => {
    const res = await apiRequest(
      'PATCH',
      '/api/orders/ord_does_not_exist/status',
      { status: 'confirmed' },
      tenantHeaders(),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Order not found');
  });

  test('delete removes the order', async () => {
    const del = await apiRequest('DELETE', `/api/orders/${orderId}`, undefined, tenantHeaders());
    expect(del.status).toBe(200);

    const get = await apiRequest('GET', `/api/orders/${orderId}`, undefined, tenantHeaders());
    expect(get.status).toBe(404);
  });
});