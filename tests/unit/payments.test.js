/**
 * Unit tests for payments.js — Stripe payment handlers.
 * Tests: handleCreatePaymentIntent, handleConfirmPayment, handleStripeWebhook
 * Uses mocked DB to test business logic without hitting a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCreatePaymentIntent,
  handleConfirmPayment,
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
  return new Request('http://localhost/api/payments/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── handleCreatePaymentIntent ───────────────────────────────
describe('handleCreatePaymentIntent', () => {
  const tenantId = 'tenant_1';

  it('creates payment intent for valid order', async () => {
    const orderRow = { id: 'ord_1', tenant_id: tenantId, total_amount: 500, order_state_id: 'confirmed' };
    const { DB } = createMockDb(orderRow);
    const req = createMockRequest({ orderId: 'ord_1', amount: 500 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.paymentIntentId).toMatch(/^pi_mock_/);
    expect(data.clientSecret).toContain('_secret_');
    expect(data.amount).toBe(500);
    expect(data.currency).toBe('egp');
    expect(data.orderId).toBe('ord_1');
  });

  it('uses default currency "egp" when not provided', async () => {
    const orderRow = { id: 'ord_2', tenant_id: tenantId, total_amount: 100, order_state_id: 'confirmed' };
    const { DB } = createMockDb(orderRow);
    const req = createMockRequest({ orderId: 'ord_2', amount: 100 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(data.currency).toBe('egp');
  });

  it('uses custom currency when provided', async () => {
    const orderRow = { id: 'ord_3', tenant_id: tenantId, total_amount: 100, order_state_id: 'confirmed' };
    const { DB } = createMockDb(orderRow);
    const req = createMockRequest({ orderId: 'ord_3', amount: 100, currency: 'usd' });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(data.currency).toBe('usd');
  });

  it('rejects missing orderId', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ amount: 500 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Required');
  });

  it('rejects missing amount', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ orderId: 'ord_1' });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Required');
  });

  it('rejects zero amount (falsy check fires first)', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ orderId: 'ord_1', amount: 0 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    // amount: 0 is falsy, so !amount matches the first guard before amount <= 0
    expect(res.status).toBe(400);
    expect(data.error).toContain('positive');
  });

  it('rejects negative amount', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ orderId: 'ord_1', amount: -50 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('positive');
  });

  it('returns 404 for non-existent order', async () => {
    const { DB } = createMockDb(null); // order not found
    const req = createMockRequest({ orderId: 'ord_nonexistent', amount: 500 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain('not found');
  });

  it('rejects payment for cancelled order', async () => {
    const orderRow = { id: 'ord_cancel', tenant_id: tenantId, total_amount: 200, order_state_id: 'cancelled' };
    const { DB } = createMockDb(orderRow);
    const req = createMockRequest({ orderId: 'ord_cancel', amount: 200 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('cancelled');
  });

  it('returns 500 on database error', async () => {
    const { DB } = createMockDb();
    DB.prepare.mockImplementation(() => { throw new Error('DB failure'); });
    const req = createMockRequest({ orderId: 'ord_1', amount: 500 });

    const res = await handleCreatePaymentIntent(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('Failed');
  });
});

// ─── handleConfirmPayment ────────────────────────────────────
describe('handleConfirmPayment', () => {
  const tenantId = 'tenant_1';

  it('confirms payment and updates order to paid', async () => {
    const orderRow = { id: 'ord_1', tenant_id: tenantId, total_amount: 500, order_state_id: 'confirmed', room_id: 'room_1', check_in_date: '2026-08-01' };
    const { DB } = createMockDb(orderRow);
    const req = createMockRequest({ paymentIntentId: 'pi_mock_123', orderId: 'ord_1' });

    const res = await handleConfirmPayment(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.orderId).toBe('ord_1');
    expect(data.status).toBe('paid');
    expect(data.amountPaid).toBe(500);
  });

  it('rejects missing paymentIntentId', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ orderId: 'ord_1' });

    const res = await handleConfirmPayment(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Required');
  });

  it('rejects missing orderId', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ paymentIntentId: 'pi_mock_123' });

    const res = await handleConfirmPayment(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Required');
  });

  it('returns 404 for non-existent order', async () => {
    const { DB } = createMockDb(null);
    const req = createMockRequest({ paymentIntentId: 'pi_mock_123', orderId: 'ord_nonexistent' });

    const res = await handleConfirmPayment(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(404);
  });

  it('rejects confirmation for cancelled order', async () => {
    const orderRow = { id: 'ord_cancel', tenant_id: tenantId, total_amount: 200, order_state_id: 'cancelled' };
    const { DB } = createMockDb(orderRow);
    const req = createMockRequest({ paymentIntentId: 'pi_mock_123', orderId: 'ord_cancel' });

    const res = await handleConfirmPayment(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('cancelled');
  });

  it('returns 500 on database error', async () => {
    const { DB } = createMockDb();
    DB.prepare.mockImplementation(() => { throw new Error('DB failure'); });
    const req = createMockRequest({ paymentIntentId: 'pi_mock_123', orderId: 'ord_1' });

    const res = await handleConfirmPayment(req, { DB }, tenantId);
    const data = await res.json();

    expect(res.status).toBe(500);
  });
});

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
