import { test, expect } from '../../fixtures/coverage-fixture';
import { apiRequest, tenantAdminLogin, superAdminLogin } from '../../utils/api-helpers';
import { TEST_TENANT } from '../../fixtures/test-data';

// Super-admin payouts contract — offline deterministic surface.
//
// The payouts pipeline is keyed to real PAYMOB marketplace captures
// (payment_status='captured' AND payout_id IS NULL AND channel='marketplace'),
// which cannot exist locally (PM_ENABLED=false → no gateway). So this spec
// pins every deterministic branch of the 5 payout routes:
//   GET  /api/admin/payouts/eligible            → 200 envelope { data: [], total: 0 }
//   POST /api/admin/payouts                     → 400 validation / unknown ids
//   GET  /api/admin/payouts                     → 200 envelope { data: [], total: 0 }
//   GET  /api/admin/payouts/:id                 → 404 'Payout not found'
//   POST /api/admin/payouts/:id/pay             → 404 'Payout not found'
//   POST /api/admin/payouts/:id/cancel          → 404 'Payout not found'
// ...and the super-admin role gate (403 for tenant admins).
//
// The live happy path (create payout against a genuinely captured payment,
// approve/reject flows) is only reachable on deployments with the gateway
// enabled and real marketplace payments present — exercised there, not here.
//
// UI: the super-financials panel (create-payout-btn, payouts-empty state)
// is asserted in specs/admin/super-panel-coverage.spec.ts.

const TENANT_ID = String(TEST_TENANT.id);
// payouts.tenantId is the D1 INTEGER tenant id — the fixture slug
// (TENANT_ID = 'acaciacamp') is NOT numeric, and Number(slug) → NaN →
// JSON null → the route 400s "Expected number, received null" before ever
// reaching the payment lookup. The seeded acaciacamp row is id 1 locally.
const P_NUMERIC_ID = 1;

test.describe('Super-admin payouts API — offline deterministic contract', () => {
  let superToken: string;
  let tenantToken: string;

  test.beforeAll(async () => {
    superToken = await superAdminLogin();
    tenantToken = await tenantAdminLogin();
  });

  const superHeaders = () => ({ Authorization: `Bearer ${superToken}` });
  const tenantHeaders = () => ({
    Authorization: `Bearer ${tenantToken}`,
    'x-tenant-id': TENANT_ID,
  });

  test('tenant admin is denied on the exact admin path with 403', async () => {
    // The super-admin gate mounts ONLY on the exact '/api/admin/payouts' path
    // (no '/*' wildcard) — its own path still 403s tenant admins.
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts',
      { tenantId: P_NUMERIC_ID, paymentIds: ['pay_1'], method: 'cash' },
      tenantHeaders(),
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Super Admin access required');
  });

  test('zero-auth subroute pin — eligible answers without any token (frozen backend)', async () => {
    // FINDING (backend, NOT fixed here): because superAdminAuth lacks the
    // '/*' wildcard, the subroutes below are NOT behind the super-admin gate.
    // A fully anonymous request reaches the handler. Pin the exposed behavior
    // so an unthawed backend rework that adds the wildcard forces this test
    // to flip (it will start 401/403-ing).
    const res = await apiRequest('GET', '/api/admin/payouts/eligible', undefined);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('zero-auth subroute pin — approve answers without any token (frozen backend)', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts/pay_does_not_exist/pay',
      {},
      undefined,
    );
    // Reaches the handler with NO auth — 'Payout not found' 404 (lookup), not
    // a 401. Documenting the exposure; see the exact-path gate test above.
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Payout not found');
  });

  test('eligible list returns an envelope (empty offline, but the shape is pinned)', async () => {
    const res = await apiRequest('GET', '/api/admin/payouts/eligible', undefined, superHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('eligible list accepts the tenantId filter and keeps the envelope shape', async () => {
    const res = await apiRequest(
      'GET',
      `/api/admin/payouts/eligible?tenantId=${TENANT_ID}`,
      undefined,
      superHeaders(),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('create payout rejects unknown payment ids with 400', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts',
      {
        tenantId: P_NUMERIC_ID,
        paymentIds: ['nope-1', 'nope-2'],
        method: 'bank_transfer',
      },
      superHeaders(),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Some payment IDs do not exist');
  });

  test('create payout rejects an empty paymentIds array with 400 validation', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts',
      { tenantId: P_NUMERIC_ID, paymentIds: [], method: 'cash' },
      superHeaders(),
    );
    expect(res.status).toBe(400);
  });

  test('create payout rejects an invalid method with 400 validation', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts',
      { tenantId: P_NUMERIC_ID, paymentIds: ['pay_1'], method: 'gold_bars' },
      superHeaders(),
    );
    expect(res.status).toBe(400);
  });

  test('create payout rejects a missing tenantId with 400 validation', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts',
      { paymentIds: ['pay_1'], method: 'bank_transfer' },
      superHeaders(),
    );
    expect(res.status).toBe(400);
  });

  test('payout list returns an envelope', async () => {
    const res = await apiRequest('GET', '/api/admin/payouts', undefined, superHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET unknown payout → 404 Payout not found', async () => {
    const res = await apiRequest('GET', '/api/admin/payouts/pay_does_not_exist', undefined, superHeaders());
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Payout not found');
  });

  test('approve unknown payout → 404 Payout not found', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts/pay_does_not_exist/pay',
      {},
      superHeaders(),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Payout not found');
  });

  test('cancel unknown payout → 404 Payout not found', async () => {
    const res = await apiRequest(
      'POST',
      '/api/admin/payouts/pay_does_not_exist/cancel',
      {},
      superHeaders(),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Payout not found');
  });
});