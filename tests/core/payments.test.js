import { API_BASE_URL, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } from '../helpers.js';

const API = API_BASE_URL;

// Payments require a valid tenant admin token + an order ID
let adminToken = null;
let testTenantId = null;
let testOrderId = null;

async function loginAsSuperAdmin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD, tenantId: 'marketplace' }),
  });
  if (!res.ok) throw new Error(`Super admin login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function createTempTenant(superToken) {
  const id = `pay_test_${Date.now()}`;
  const res = await fetch(`${API}/api/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, subdomain: id, name: 'Pay Test Tenant' }),
  });
  if (!res.ok) throw new Error(`Create tenant failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function loginTenantAdmin(tenantId) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: 'sinaiadmin', tenantId }),
  });
  if (!res.ok) throw new Error(`Tenant login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function createOrder(token, tenantId) {
  // First create a camp + room to reference
  const campId = `camp_${Date.now()}`;
  await fetch(`${API}/api/camps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: campId, name: 'Pay Camp', tenant_id: tenantId }),
  }).catch(() => {});

  const roomId = `room_${Date.now()}`;
  await fetch(`${API}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: roomId, name: '101', camp_id: campId, status: 'available' }),
  }).catch(() => {});

  const orderId = `order_${Date.now()}`;
  const res = await fetch(`${API}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: orderId,
      guest_name: 'Pay Tester',
      guest_email: 'pay@test.com',
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-03',
      room_id: roomId,
      camp_id: campId,
      total_amount: 200,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Create order failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data.id;
}

beforeAll(async () => {
  const superToken = await loginAsSuperAdmin();
  testTenantId = await createTempTenant(superToken);
  adminToken = await loginTenantAdmin(testTenantId);
  testOrderId = await createOrder(adminToken, testTenantId);
});

describe('Payments API', () => {
  describe('POST /api/payments/create-intent', () => {
    it('creates payment intent for valid order', async () => {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ orderId: testOrderId, amount: 200, currency: 'usd' }),
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.paymentIntentId).toMatch(/^pi_mock_/);
      expect(data.clientSecret).toBeTruthy();
      expect(data.amount).toBe(200);
      expect(data.currency).toBe('usd');
      expect(data.orderId).toBe(testOrderId);
    });

    it('rejects missing orderId', async () => {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ amount: 200 }),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects zero or negative amount', async () => {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ orderId: testOrderId, amount: 0 }),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent order', async () => {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ orderId: 'nonexistent_order', amount: 100 }),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/payments/confirm', () => {
    it('confirms payment and updates order', async () => {
      const intentRes = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ orderId: testOrderId, amount: 200 }),
      });
      const { paymentIntentId } = await intentRes.json();

      const res = await fetch(`${API}/api/payments/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ paymentIntentId, orderId: testOrderId }),
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('confirmed');
      expect(data.amountPaid).toBe(200);
    });

    it('rejects missing paymentIntentId', async () => {
      const res = await fetch(`${API}/api/payments/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ orderId: testOrderId }),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('returns 404 for non-existent order', async () => {
      const res = await fetch(`${API}/api/payments/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'x-tenant-id': testTenantId },
        body: JSON.stringify({ paymentIntentId: 'pi_mock_000', orderId: 'nonexistent_order' }),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/payments/webhook', () => {
    it('receives webhook event', async () => {
      const res = await fetch(`${API}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }),
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.received).toBe(true);
    });
  });
});
