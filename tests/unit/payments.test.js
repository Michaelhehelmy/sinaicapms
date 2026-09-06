/**
 * Unit tests for payments.js — Stripe webhook handler.
 * Tests: handleStripeWebhook
 * Uses mocked DB to test business logic without hitting a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleStripeWebhook,
} from '../../backend/src/api/payments.js';

// ─── Mock DB Helper ──────────────────────────────────────────
function createMockDb(orderRow = null, updateResult = { changes: 1 }, allResults = []) {
  const prepareMock = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(orderRow),
      all: vi.fn().mockResolvedValue({ results: allResults }),
      run: vi.fn().mockResolvedValue(updateResult),
    }),
  });
  return { DB: { prepare: prepareMock }, _prepareMock: prepareMock };
}

function createMockRequest(body, headers = {}) {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── handleStripeWebhook ─────────────────────────────────────
describe('handleStripeWebhook', () => {
  it('returns 503 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ type: 'payment_intent.succeeded' });

    const res = await handleStripeWebhook(req, { DB, ENVIRONMENT: 'test' });
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('not configured');
  });

  it('rejects webhook with invalid secret', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest(
      { type: 'payment_intent.succeeded' },
      { 'x-webhook-secret': 'wrong_secret' }
    );

    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: 'correct_secret',
      ENVIRONMENT: 'test',
    });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain('Invalid');
  });

  it('rejects webhook with missing x-webhook-secret header', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ type: 'payment_intent.succeeded' });

    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: 'some_secret',
      ENVIRONMENT: 'test',
    });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain('Invalid');
  });

  it('accepts valid webhook with payment_intent.succeeded event', async () => {
    const { DB, _prepareMock } = createMockDb(null, { changes: 1 }, [{ id: 'ord_1', tenant_id: 'tenant_1' }]);
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: { orderId: 'ord_1' },
        },
      },
    };
    const req = createMockRequest(event, { 'x-webhook-secret': 'valid_secret' });

    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: 'valid_secret',
      ENVIRONMENT: 'test',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
  });

  it('returns 200 for non-payment_intent events (no-op)', async () => {
    const { DB } = createMockDb();
    const event = { type: 'charge.refunded', data: {} };
    const req = createMockRequest(event, { 'x-webhook-secret': 'valid_secret' });

    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: 'valid_secret',
      ENVIRONMENT: 'test',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
  });

  it('handles event with no metadata gracefully', async () => {
    const { DB } = createMockDb();
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: {} }, // no metadata
    };
    const req = createMockRequest(event, { 'x-webhook-secret': 'valid_secret' });

    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: 'valid_secret',
      ENVIRONMENT: 'test',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
  });

  it('returns 500 on database error during webhook processing', async () => {
    const { DB } = createMockDb();
    DB.prepare.mockImplementation(() => { throw new Error('DB failure'); });
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { orderId: 'ord_1' } } },
    };
    const req = createMockRequest(event, { 'x-webhook-secret': 'valid_secret' });

    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: 'valid_secret',
      ENVIRONMENT: 'test',
    });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('failed');
  });
});
