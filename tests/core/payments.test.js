import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  API_BASE_URL,
  superAdminLogin,
  createTestTenant,
  createTenantAdmin,
  tenantAdminLogin,
  deleteTestTenant,
} from '../helpers';

// Payments contract notes (frozen backend — tests align to it):
//   - POST /api/payments/webhook  (no auth gate; own secret check)
//       503 { success:false, error:'Webhook not configured' } when STRIPE_WEBHOOK_SECRET
//       is not bound (local wrangler has no such secret) or header mismatch → 401.
//   - The mock Stripe create-intent / confirm routes were removed; orders are paid
//     only via order_state transitions or the Paymob flow.
//
// In this test environment no STRIPE_WEBHOOK_SECRET is bound, so every reachable
// path is the deterministic not-configured response. The suite documents that
// behavior and the exact gate message.

describe('Payments API — webhook contract (STRIPE_WEBHOOK_SECRET not bound)', () => {
  let superAdminToken, tenantId, tenantToken, orderId;
  const ts = Date.now();
  const subdomain = `core-pay-${ts}`;
  const adminEmail = `admin@${subdomain}.com`;
  const adminPassword = 'Password123!';

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
    tenantId = await createTestTenant(subdomain, subdomain, 'Core Payments');
    await createTenantAdmin(tenantId, adminEmail, adminPassword, superAdminToken);
    tenantToken = await tenantAdminLogin(tenantId, adminEmail, adminPassword);

    // Minimal booking chain: camp → room-type product → room → order
    const campRes = await fetch(`${API_BASE_URL}/api/camps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'Pay Camp', location: 'Test Valley' })
    });
    const campData = await campRes.json();
    if (campRes.status !== 200) throw new Error(`camp create failed: ${campRes.status} ${JSON.stringify(campData)}`);
    const campId = campData.id;

    const prodRes = await fetch(`${API_BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ camp_id: campId, name: 'Pay Room Type', capacity: 2, base_price: 100 })
    });
    const prodData = await prodRes.json();
    if (prodRes.status !== 200) throw new Error(`product create failed: ${prodRes.status} ${JSON.stringify(prodData)}`);
    const productId = prodData.id;

    const roomRes = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ camp_id: campId, product_id: productId, name: 'Pay Room 101', floor: 1 })
    });
    const roomData = await roomRes.json();
    if (roomRes.status !== 200) throw new Error(`room create failed: ${roomRes.status} ${JSON.stringify(roomData)}`);
    const roomId = roomData.id;

    const orderRes = await fetch(`${API_BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tenantToken}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({
        camp_id: campId,
        room_id: roomId,
        guest_name: 'Pay Tester',
        guest_email: 'pay@test.com',
        guest_phone: '+20100100100',
        check_in_date: '2027-08-01',
        check_out_date: '2027-08-03',
        total_amount: 200
      })
    });
    const orderData = await orderRes.json();
    if (orderRes.status !== 200) throw new Error(`order create failed: ${orderRes.status} ${JSON.stringify(orderData)}`);
    orderId = orderData.id;
  });

  afterAll(async () => {
    if (tenantId && superAdminToken) await deleteTestTenant(tenantId, superAdminToken);
  });


  describe('POST /api/payments/webhook', () => {
    it('returns 503 Webhook not configured (no STRIPE_WEBHOOK_SECRET bound locally)', async () => {
      const res = await fetch(`${API_BASE_URL}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }),
      });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Webhook not configured');
    });
  });
});