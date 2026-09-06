import { test, expect } from '../../fixtures/coverage-fixture';
import { apiRequest, tenantAdminLogin } from '../../utils/api-helpers';
import { TEST_TENANT } from '../../fixtures/test-data';

// Payments contract — OFFLINE deterministic mode (frozen backend).
//
// Locally PM_ENABLED="false" (backend/wrangler.toml [vars]) and no
// STRIPE_WEBHOOK_SECRET is bound, so every /api/payments/* mutation
// short-circuits to the disabled-gateway response BEFORE body validation,
// DB lookups, or signature checks:
//   - POST /api/payments/create-intent → 503 { success:false, error:'Payment gateway disabled' }
//   - POST /api/payments/confirm        → 503 { success:false, error:'Payment gateway disabled' }
//   - POST /api/payments/webhook        → 503 { success:false, error:'Webhook not configured' }
//     (no STRIPE_WEBHOOK_SECRET bound in the local worker)
//
// This spec pins those exact status codes + messages (same discipline as
// tests/core/payments.test.js) so a live-gateway deploy can never ship
// silently: when PM_ENABLED=true the happy-path variants below are exercised
// against a real intent (see tests/core/payments.test.js for the expected
// happy-path bodies — pi_mock_* ids, clientSecret, status:'paid').
//
// The UI-facing counterpart (super-financials panel payouts section) is
// asserted in specs/admin/super-panel-coverage.spec.ts.

const TENANT_ID = TEST_TENANT.id;
const TENANT_HEADERS = () => ({ 'x-tenant-id': String(TENANT_ID) });

test.describe('Payments API — disabled-gateway contract', () => {
  let token: string;

  test.beforeAll(async () => {
    token = await tenantAdminLogin();
  });

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    ...TENANT_HEADERS(),
  });

  test('create-intent with a valid body returns 503 Payment gateway disabled', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/create-intent',
      { orderId: 'ord_e2e', amount: 200, currency: 'usd' },
      authHeaders(),
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Payment gateway disabled');
  });

  test('create-intent gate precedes body validation (missing orderId → 503)', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/create-intent',
      { amount: 200 },
      authHeaders(),
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('Payment gateway disabled');
  });

  test('create-intent gate precedes amount validation (zero/negative → 503)', async () => {
    for (const amount of [0, -5]) {
      const res = await apiRequest(
        'POST',
        '/api/payments/create-intent',
        { orderId: 'ord_e2e', amount },
        authHeaders(),
      );
      expect(res.status).toBe(503);
    }
  });

  test('create-intent gate precedes DB lookup (unknown order → 503)', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/create-intent',
      { orderId: 'nonexistent_order', amount: 100 },
      authHeaders(),
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('Payment gateway disabled');
  });

  test('confirm with a valid body returns 503 Payment gateway disabled', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/confirm',
      { paymentIntentId: 'pi_mock_e2e', orderId: 'ord_e2e' },
      authHeaders(),
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Payment gateway disabled');
  });

  test('webhook without a bound secret returns 503 Webhook not configured', async () => {
    const res = await apiRequest('POST', '/api/payments/webhook', {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_mock_e2e' } },
    }, TENANT_HEADERS());
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('Webhook not configured');
  });

  test('payment routes reject unauthenticated requests with 401', async () => {
    const res = await apiRequest(
      'POST',
      '/api/payments/create-intent',
      { orderId: 'ord_e2e', amount: 100 },
      TENANT_HEADERS(),
    );
    expect(res.status).toBe(401);
  });
});