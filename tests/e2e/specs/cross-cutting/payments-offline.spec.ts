import { test, expect } from '../../fixtures/coverage-fixture';
import { apiRequest, tenantAdminLogin } from '../../utils/api-helpers';
import { TEST_TENANT } from '../../fixtures/test-data';

// Payments contract — OFFLINE deterministic mode (frozen backend).
//
// Locally PM_ENABLED="false" (backend/wrangler.toml [vars]) and no
// STRIPE_WEBHOOK_SECRET is bound, so the ONLY payment surfaces that exist are
// the two server-to-server webhooks — both fail closed:
//   - POST /api/payments/webhook        → 503 { success:false, error:'Webhook not configured' }
//     (no STRIPE_WEBHOOK_SECRET bound in the local worker; gate precedes body parse)
//   - POST /api/public/paymob/webhook   → 400 'Empty webhook body' (raw body read first)
//                                        → 503 'Webhook not configured' (PM_ENABLED=false)
//
// The legacy mock-Stripe storefront routes were REMOVED (they do not 503 —
// they no longer exist): POST /api/payments/create-intent and
// POST /api/payments/confirm fall through to Hono's /api/* catch-all:
//   - POST /api/payments/create-intent → 404 { success:false, error:'API endpoint not found' }
//   - POST /api/payments/confirm        → 404 { success:false, error:'API endpoint not found' }
//
// This spec pins that offline contract so a live-gateway deploy can never ship
// silently: a 503 on a removed route would mean a mock gateway handler was
// re-enabled, and a missing 503 on the webhooks would mean an unconfigured
// gateway is accepting callbacks. The happy-path variants (real intent,
// signed Paymob callback) live in tests/core/payments.test.js.
//
// The UI-facing counterpart (super-financials panel payouts section) is
// asserted in specs/cross-cutting/payout-panel.spec.ts.

const TENANT_ID = TEST_TENANT.id;
const TENANT_HEADERS = () => ({ 'x-tenant-id': String(TENANT_ID) });

test.describe('Payments API — offline contract (frozen backend)', () => {
  let token: string;

  test.beforeAll(async () => {
    token = await tenantAdminLogin();
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    ...TENANT_HEADERS(),
  });

  test('create-intent (removed route) returns 404 API endpoint not found', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/create-intent',
      { orderId: 'ord_e2e', amount: 200, currency: 'usd' },
      authHeaders(),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('API endpoint not found');
  });

  test('create-intent 404 is auth- and validation-independent (route is gone)', async () => {
    // No auth gate, no body validation — the /api/* catch-all answers every
    // shape of request with the same 404 (valid body, invalid body, no auth,
    // no body at all).
    const cases: Array<{ body?: Record<string, unknown>; headers: Record<string, string> }> = [
      { body: { amount: 200 }, headers: authHeaders() },
      { body: { orderId: 'nonexistent_order', amount: -5 }, headers: authHeaders() },
      { body: { orderId: 'ord_e2e', amount: 100 }, headers: TENANT_HEADERS() },
      { headers: TENANT_HEADERS() },
    ];
    for (const c of cases) {
      const res = await apiRequest('POST', '/api/payments/create-intent', c.body, c.headers);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('API endpoint not found');
    }
  });

  test('confirm (removed route) returns 404 API endpoint not found', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/confirm',
      { paymentIntentId: 'pi_mock_e2e', orderId: 'ord_e2e' },
      authHeaders(),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('API endpoint not found');
  });

  test('unknown /api/payments/* paths fall through to the 404 catch-all', async () => {
    const res = await apiRequest('POST', '/api/payments/future-method', { amount: 100 }, authHeaders());
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('API endpoint not found');
  });

  test('stripe webhook without a bound secret returns 503 Webhook not configured', async () => {
    const res = await apiRequest('POST', '/api/payments/webhook', {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_mock_e2e' } },
    }, TENANT_HEADERS());
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Webhook not configured');
  });

  test('paymob webhook with the gateway disabled returns 503 Webhook not configured', async () => {
    // PM_ENABLED=false locally. The handler reads the raw body BEFORE the
    // disabled-gate check, so the request needs a non-empty body to reach
    // the 503.
    const res = await apiRequest('POST', '/api/public/paymob/webhook', {
      type: 'transaction.processed',
      success: true,
      pending: false,
      order: { items: [{ description: 'orderRef:ord_e2e' }] },
    });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Webhook not configured');
  });

  test('paymob webhook rejects an empty body with 400 before the disabled-gate response', async () => {
    const res = await apiRequest('POST', '/api/public/paymob/webhook', undefined, {
      'Content-Type': 'application/json',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Empty webhook body');
  });
});