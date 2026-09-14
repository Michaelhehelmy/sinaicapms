import { describe, it, expect, vi } from 'vitest';
import { handleStripeWebhook } from '../src/api/payments.js';

/**
 * handleStripeWebhook is RETIRED. It must never mutate an order and always
 * answer 501 pointing at the HMAC-verified Paymob webhook
 * (POST /api/public/paymob/webhook). These tests pin that contract.
 */
describe('handleStripeWebhook (retired)', () => {
  function makeRequest(body, headers = {}) {
    return {
      headers: {
        get: (name) => headers[name.toLowerCase()] || null,
      },
      json: () => Promise.resolve(body),
    };
  }

  function buildMockEnv(overrides = {}) {
    return {
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_123',
      ENVIRONMENT: 'test',
      DB: {
        prepare: vi.fn(() => ({ bind: vi.fn(() => ({ all: async () => ({ results: [] }), run: async () => ({}) })) })),
      },
      ...overrides,
    };
  }

  it('returns 501 with a clear retirement message', async () => {
    const req = makeRequest(
      { type: 'payment_intent.succeeded', data: { object: { metadata: { orderId: 'order_1' } } } },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, buildMockEnv());
    const body = await res.json();

    expect(res.status).toBe(501);
    expect(body.success).toBe(false);
    expect(body.error).toContain('retired');
    expect(body.error).toContain('/api/public/paymob/webhook');
  });

  it('returns 501 even when the webhook secret is configured', async () => {
    const req = makeRequest(
      { type: 'payment_intent.succeeded' },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, buildMockEnv());
    expect(res.status).toBe(501);
  });

  it('never touches the orders table', async () => {
    const env = buildMockEnv();
    const req = makeRequest(
      { type: 'payment_intent.succeeded', data: { object: { metadata: { orderId: 'order_1' } } } },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    await handleStripeWebhook(req, env);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
});