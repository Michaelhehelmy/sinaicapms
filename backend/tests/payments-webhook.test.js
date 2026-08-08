import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStripeWebhook } from '../src/api/payments.js';

function makeWebhookRequest(body, headers = {}) {
  return {
    headers: {
      get: (name) => headers[name.toLowerCase()] || null,
    },
    json: () => Promise.resolve(body),
  };
}

function makeFailingJsonRequest(headers = {}) {
  return {
    headers: {
      get: (name) => headers[name.toLowerCase()] || null,
    },
    json: () => Promise.reject(new Error('Invalid JSON')),
  };
}

function buildMockEnv(overrides = {}) {
  const bindChain = {
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({}),
  };
  const bindFn = vi.fn(() => bindChain);
  const prepareFn = vi.fn(() => ({ bind: bindFn }));

  return {
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_123',
    ENVIRONMENT: 'test',
    DB: {
      prepare: prepareFn,
    },
    ...overrides,
  };
}

describe('handleStripeWebhook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 503 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const env = buildMockEnv({ STRIPE_WEBHOOK_SECRET: undefined });
    const req = makeWebhookRequest(
      { type: 'payment_intent.succeeded' },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain('Webhook not configured');
  });

  it('returns 401 when x-webhook-secret header is missing', async () => {
    const env = buildMockEnv();
    const req = makeWebhookRequest({ type: 'payment_intent.succeeded' }, {});

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain('Invalid webhook secret');
  });

  it('returns 401 when x-webhook-secret header is wrong', async () => {
    const env = buildMockEnv();
    const req = makeWebhookRequest(
      { type: 'payment_intent.succeeded' },
      { 'x-webhook-secret': 'wrong_secret' }
    );

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain('Invalid webhook secret');
  });

  it('returns 200 and updates order on valid payment_intent.succeeded with existing order', async () => {
    const env = buildMockEnv();
    const bindChain = {
      all: vi.fn().mockResolvedValue({ results: [{ id: 'order_1', tenant_id: 't1' }] }),
      run: vi.fn().mockResolvedValue({}),
    };
    env.DB.prepare = vi.fn(() => ({ bind: vi.fn(() => bindChain) }));

    const req = makeWebhookRequest(
      {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            metadata: { orderId: 'order_1' },
          },
        },
      },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });

    expect(env.DB.prepare).toHaveBeenCalledTimes(2);
    expect(env.DB.prepare).toHaveBeenCalledWith(
      "SELECT id, tenant_id FROM orders WHERE id = ?"
    );
    expect(env.DB.prepare).toHaveBeenCalledWith(
      "UPDATE orders SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
    );
  });

  it('returns 200 when order does not exist (webhook still succeeds)', async () => {
    const env = buildMockEnv();

    const req = makeWebhookRequest(
      {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            metadata: { orderId: 'nonexistent_order' },
          },
        },
      },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });
  });

  it('returns 200 for unknown event types without DB calls', async () => {
    const env = buildMockEnv();

    const req = makeWebhookRequest(
      { type: 'charge.refunded', data: { object: {} } },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('returns 200 when orderId is missing from metadata (no DB calls)', async () => {
    const env = buildMockEnv();

    const req = makeWebhookRequest(
      {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            metadata: {},
          },
        },
      },
      { 'x-webhook-secret': 'whsec_test_secret_123' }
    );

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('returns 500 when request.json() throws (malformed payload)', async () => {
    const env = buildMockEnv();
    const req = makeFailingJsonRequest({ 'x-webhook-secret': 'whsec_test_secret_123' });

    const res = await handleStripeWebhook(req, env);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain('Webhook processing failed');
  });
});
