/**
 * Unit tests for paymentConfig.js and createPaymobIntention (paymob.js).
 *
 * paymentConfig — exercises every branch in loadPaymentConfig:
 *   • DB returns no row / table missing → env fallback
 *   • DB row with valid JSON blob → blob wins
 *   • DB row with invalid JSON → graceful fallback
 *   • integrationIds: string, array, empty, absent, mixed-valid
 *   • marketplaceFeePct: number from blob vs default 0
 *   • PM_ENABLED env fallback when blob.enabled absent
 *
 * createPaymobIntention — covers the full function body (lines 31-64):
 *   • Verifies URL, headers, and POST body shape
 *   • Verifies success path returns { clientSecret, id }
 *   • Verifies error path throws with Paymob message
 *   • Verifies error path with missing message/detail
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { loadPaymentConfig } from '../../src/services/paymentConfig.js';
import { createPaymobIntention } from '../../src/services/paymob.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDb({ row = null, throwOnPrepare = false } = {}) {
  return {
    prepare: vi.fn(() => {
      if (throwOnPrepare) throw new Error('D1 not available');
      return {
        first: vi.fn(async () => row),
      };
    }),
  };
}

function env(overrides = {}) {
  return {
    PM_ENABLED: 'true',
    PM_SECRET_KEY: 'sk_env',
    PM_HMAC_SECRET: 'hmac_env',
    PM_BASE_URL: 'https://pay.env',
    PM_PUBLIC_KEY: 'pk_env',
    PM_CURRENCY: 'USD',
    PM_INTEGRATION_IDS: '100,200',
    ...overrides,
  };
}

// ── paymentConfig tests ──────────────────────────────────────────────────────

describe('loadPaymentConfig', () => {
  it('uses env vars when no DB row exists', async () => {
    const cfg = await loadPaymentConfig({ DB: makeDb(), ...env() });
    expect(cfg.enabled).toBe(true);
    expect(cfg.secretKey).toBe('sk_env');
    expect(cfg.hmacSecret).toBe('hmac_env');
    expect(cfg.baseUrl).toBe('https://pay.env');
    expect(cfg.publicKey).toBe('pk_env');
    expect(cfg.currency).toBe('USD');
    expect(cfg.integrationIds).toEqual([100, 200]);
    expect(cfg.marketplaceFeePct).toBe(0);
  });

  it('returns defaults when DB and env both absent', async () => {
    const cfg = await loadPaymentConfig({ DB: makeDb(), PM_ENABLED: undefined });
    expect(cfg.enabled).toBe(false);
    expect(cfg.secretKey).toBe('');
    expect(cfg.hmacSecret).toBe('');
    expect(cfg.baseUrl).toBe('https://accept.paymob.com');
    expect(cfg.publicKey).toBe('');
    expect(cfg.currency).toBe('EGP');
    expect(cfg.integrationIds).toEqual([]);
    expect(cfg.marketplaceFeePct).toBe(0);
  });

  it('blob values win over env vars', async () => {
    const paymentBlob = {
      enabled: false,
      secretKey: 'sk_blob',
      hmacSecret: 'hmac_blob',
      baseUrl: 'https://blob.pay',
      publicKey: 'pk_blob',
      currency: 'SAR',
      integrationIds: [300, 400],
      marketplaceFeePct: 5,
    };
    const row = { payment: JSON.stringify(paymentBlob) };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }), ...env() });
    expect(cfg.enabled).toBe(false);
    expect(cfg.secretKey).toBe('sk_blob');
    expect(cfg.hmacSecret).toBe('hmac_blob');
    expect(cfg.baseUrl).toBe('https://blob.pay');
    expect(cfg.publicKey).toBe('pk_blob');
    expect(cfg.currency).toBe('SAR');
    expect(cfg.integrationIds).toEqual([300, 400]);
    expect(cfg.marketplaceFeePct).toBe(5);
  });

  it('handles invalid JSON in payment column gracefully', async () => {
    const row = { payment: 'NOT-JSON{{{' };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }), ...env() });
    // Blob parse fails → blob stays {} → env values used
    expect(cfg.secretKey).toBe('sk_env');
    expect(cfg.integrationIds).toEqual([100, 200]);
  });

  it('handles null payment column gracefully', async () => {
    const row = { payment: null };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }), ...env() });
    expect(cfg.secretKey).toBe('sk_env');
  });

  it('integrationIds parsed from comma-separated string', async () => {
    const cfg = await loadPaymentConfig({
      DB: makeDb(),
      PM_INTEGRATION_IDS: '55,66,77',
    });
    expect(cfg.integrationIds).toEqual([55, 66, 77]);
  });

  it('integrationIds parsed from array in blob', async () => {
    const row = { payment: JSON.stringify({ integrationIds: [88, 99] }) };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }) });
    expect(cfg.integrationIds).toEqual([88, 99]);
  });

  it('integrationIds filters NaN values from string', async () => {
    // Number('') === 0 (not NaN), Number('abc') === NaN (filtered)
    const cfg = await loadPaymentConfig({
      DB: makeDb(),
      PM_INTEGRATION_IDS: 'abc,123,,456',
    });
    expect(cfg.integrationIds).toEqual([123, 0, 456]);
  });

  it('integrationIds filters NaN values from array', async () => {
    // Number('bad') === NaN (filtered), Number(null) === 0 (passes)
    const row = { payment: JSON.stringify({ integrationIds: ['bad', 10, null, 20] }) };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }) });
    expect(cfg.integrationIds).toEqual([10, 0, 20]);
  });

  it('integrationIds defaults to [] when env var is undefined and no blob', async () => {
    const cfg = await loadPaymentConfig({
      DB: makeDb(),
      PM_INTEGRATION_IDS: undefined,
    });
    expect(cfg.integrationIds).toEqual([]);
  });

  it('marketplaceFeePct defaults to 0 when blob has no such key', async () => {
    const row = { payment: JSON.stringify({ enabled: true }) };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }) });
    expect(cfg.marketplaceFeePct).toBe(0);
  });

  it('DB prepare throwing (table missing) still returns config from env', async () => {
    const cfg = await loadPaymentConfig({
      DB: makeDb({ throwOnPrepare: true }),
      ...env(),
    });
    expect(cfg.secretKey).toBe('sk_env');
  });

  it('row exists but payment key missing → blob stays {}', async () => {
    const row = { id: 1, payment: undefined };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }), ...env() });
    expect(cfg.secretKey).toBe('sk_env');
  });

  it('PM_ENABLED=false makes enabled false when blob has no enabled key', async () => {
    const cfg = await loadPaymentConfig({ DB: makeDb(), PM_ENABLED: 'false' });
    expect(cfg.enabled).toBe(false);
  });

  it('blob.enabled = true overrides env PM_ENABLED=false', async () => {
    const row = { payment: JSON.stringify({ enabled: true }) };
    const cfg = await loadPaymentConfig({ DB: makeDb({ row }), PM_ENABLED: 'false' });
    expect(cfg.enabled).toBe(true);
  });
});

// ── createPaymobIntention tests ──────────────────────────────────────────────

describe('createPaymobIntention', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(responseData, { ok = true, status = 200 } = {}) {
    globalThis.fetch = vi.fn(async (_url, _opts) => ({
      ok,
      status,
      json: async () => responseData,
    }));
  }

  const baseOpts = {
    secretKey: 'sk_test_123',
    baseUrl: 'https://accept.paymob.com/api',
    amountCents: 5000,
    currency: 'EGP',
    orderRef: 'ORD-001',
    paymentMethods: [1, 2, 3],
    billingData: { name: 'Test', email: 't@t.com' },
    notificationUrl: 'https://example.com/notify',
    redirectionUrl: 'https://example.com/redirect',
  };

  it('sends correct URL, headers, and body', async () => {
    mockFetch({ client_secret: 'cs_abc', id: 999 });
    await createPaymobIntention(baseOpts);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://accept.paymob.com/api/v1/intention/');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({
      Authorization: 'Token sk_test_123',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(opts.body);
    expect(body.amount).toBe(5000);
    expect(body.currency).toBe('EGP');
    expect(body.payment_methods).toEqual([1, 2, 3]);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Order ORD-001');
    expect(body.items[0].description).toContain('ORD-001');
    expect(body.billing_data).toEqual({ name: 'Test', email: 't@t.com' });
    expect(body.notification_url).toBe('https://example.com/notify');
    expect(body.redirection_url).toBe('https://example.com/redirect');
  });

  it('returns clientSecret and id on success', async () => {
    mockFetch({ client_secret: 'cs_xyz', id: 42 });
    const result = await createPaymobIntention(baseOpts);
    expect(result).toEqual({ clientSecret: 'cs_xyz', id: 42 });
  });

  it('uses default currency EGP when omitted', async () => {
    mockFetch({ client_secret: 'cs', id: 1 });
    const opts = { ...baseOpts };
    delete opts.currency;
    await createPaymobIntention(opts);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.currency).toBe('EGP');
  });

  it('throws with Paymob error message on non-2xx', async () => {
    mockFetch({ message: 'Invalid amount' }, { ok: false, status: 400 });
    await expect(createPaymobIntention(baseOpts)).rejects.toThrow('Paymob error: Invalid amount');
  });

  it('throws with detail field when message absent', async () => {
    mockFetch({ detail: 'Insufficient funds' }, { ok: false, status: 402 });
    await expect(createPaymobIntention(baseOpts)).rejects.toThrow('Paymob error: Insufficient funds');
  });

  it('throws with status code when no message/detail', async () => {
    mockFetch({ error: 'bad' }, { ok: false, status: 500 });
    await expect(createPaymobIntention(baseOpts)).rejects.toThrow(
      'Paymob error: Paymob intention API returned 500',
    );
  });
});
