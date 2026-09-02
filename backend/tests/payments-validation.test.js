import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreatePaymentIntent, handleConfirmPayment } from '../src/api/payments';

function createMockEnv(order = null, intent = null) {
  return {
    PM_ENABLED: 'true',
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(order),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        })),
      })),
    },
  };
}

// Mock env that returns a different first() per prepare call, keyed by SQL text.
function createSeqMockEnv(sequence) {
  // sequence: [{sql, first, run}] — matches prepares in order
  const callbacks = sequence.map((s) => ({
    sql: s.sql,
    first: s.first || null,
    run: s.run || null,
  }));
  let callIdx = 0;
  return {
    PM_ENABLED: 'true',
    DB: {
      prepare: vi.fn((sql) => ({
        bind: vi.fn(() => {
          const cur = callbacks[Math.min(callIdx, callbacks.length - 1)];
          callIdx += 1;
          return {
            first: cur.first ? vi.fn().mockResolvedValue(cur.first) : vi.fn().mockResolvedValue(null),
            run: cur.run ? vi.fn().mockResolvedValue(cur.run) : vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          };
        }),
      })),
    },
  };
}

function makeRequest(body) {
  return {
    json: () => Promise.resolve(body),
  };
}

describe('handleCreatePaymentIntent', () => {
  const tenantId = 't1';

  it('returns 503 when PM_ENABLED is not true', async () => {
    const env = createMockEnv();
    delete env.PM_ENABLED;
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 100 }), env, tenantId);
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe('Payment gateway disabled');
  });

  it('returns 400 when orderId is missing', async () => {
    const res = await handleCreatePaymentIntent(makeRequest({ amount: 100 }), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('returns 400 when amount is missing', async () => {
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1' }), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('returns 400 when both orderId and amount are missing', async () => {
    const res = await handleCreatePaymentIntent(makeRequest({}), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('returns 400 when amount is 0 (Zod rejects non-positive)', async () => {
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 0 }), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('returns 400 when amount is negative', async () => {
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: -100 }), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('Amount must be positive');
  });

  it('returns 404 when order is not found', async () => {
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 100 }), createMockEnv(null), tenantId);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Order not found');
  });

  it('returns 400 when order is cancelled', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 100, order_state_id: 'cancelled' };
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 100 }), createMockEnv(order), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('Cannot create payment for a cancelled order');
  });

  it('returns 200 with payment intent on valid request', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 100, order_state_id: 'pending' };
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 100 }), createMockEnv(order), tenantId);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.paymentIntentId).toMatch(/^pi_mock_/);
    expect(data.clientSecret).toBeTruthy();
    expect(data.amount).toBe(100);
    expect(data.currency).toBe('egp');
    expect(data.orderId).toBe('order_1');
  });

  it('returns 200 with custom currency', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 100, order_state_id: 'pending' };
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 100, currency: 'usd' }), createMockEnv(order), tenantId);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.currency).toBe('usd');
  });

  it('generates a client_secret from crypto random (no weak Math.random base36 suffix)', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 100, order_state_id: 'pending' };
    const res = await handleCreatePaymentIntent(makeRequest({ orderId: 'order_1', amount: 100 }), createMockEnv(order), tenantId);
    const data = await res.json();
    expect(res.status).toBe(200);
    const suffix = data.clientSecret.replace(/^pi_mock_[0-9a-f-]+_secret_/, '');
    expect(suffix).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns 500 on JSON parse error', async () => {
    const badRequest = { json: () => Promise.reject(new Error('Invalid JSON')) };
    const res = await handleCreatePaymentIntent(badRequest, createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to create payment intent');
  });
});

describe('handleConfirmPayment', () => {
  const tenantId = 't1';

  it('returns 503 when PM_ENABLED is not true', async () => {
    const env = createMockEnv();
    delete env.PM_ENABLED;
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), env, tenantId);
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe('Payment gateway disabled');
  });

  it('returns 400 when paymentIntentId is missing', async () => {
    const res = await handleConfirmPayment(makeRequest({ orderId: 'order_1' }), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('returns 400 when orderId is missing', async () => {
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123' }), createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('returns 404 when order is not found', async () => {
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), createMockEnv(null), tenantId);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Order not found');
  });

  it('returns 400 when order is cancelled', async () => {
    const order = { id: 'order_1', tenant_id: 't1', order_state_id: 'cancelled' };
    const env = createSeqMockEnv([
      { sql: 'SELECT id', first: { id: 'pi_123', order_id: 'order_1', amount: 200, status: 'created' } },
      { sql: 'SELECT id', first: order },
    ]);
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), env, tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('Cannot confirm payment for a cancelled order');
  });

  it('returns 200 with success on valid request', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'pending' };
    const env = createSeqMockEnv([
      { sql: 'SELECT id', first: { id: 'pi_123', order_id: 'order_1', amount: 200, status: 'created' } },
      { sql: 'SELECT id', first: order },
      { sql: 'UPDATE payment_intents' },
      { sql: 'UPDATE orders' },
    ]);
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), env, tenantId);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.orderId).toBe('order_1');
    expect(data.status).toBe('paid');
    expect(data.amountPaid).toBe(200);
  });

  it('returns 400 when payment intent is not found or already used', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'pending' };
    const env = createSeqMockEnv([
      { sql: 'SELECT id', first: null }, // intent lookup returns nothing
      { sql: 'SELECT id', first: order },
    ]);
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), env, tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('Payment intent not found or already used');
  });

  it('returns 409 and writes NO state when intent order_id does not match the order', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'pending' };
    // Intent belongs to a different order (order_id = 'order_other'); scoped lookup by order_id returns nothing.
    const env = createSeqMockEnv([
      { sql: 'SELECT id', first: null },
      { sql: 'SELECT id', first: order },
    ]);
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), env, tenantId);
    const data = await res.json();
    // Intent not found for this order → 400, not a write
    expect(res.status).toBe(400);
    expect(data.error).toBe('Payment intent not found or already used');
  });

  it('returns 409 and writes NO state when intent amount does not match order total', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'pending' };
    const env = createSeqMockEnv([
      { sql: 'SELECT id', first: { id: 'pi_123', order_id: 'order_1', amount: 999, status: 'created' } },
      { sql: 'SELECT id', first: order },
    ]);
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), env, tenantId);
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toBe('Payment intent amount does not match order total');
    // No UPDATE calls should have been issued (no state written).
    const updateCalls = env.DB.prepare.mock.calls.map((c) => c[0]).filter((s) => s.startsWith('UPDATE'));
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 500 on JSON parse error', async () => {
    const badRequest = { json: () => Promise.reject(new Error('Invalid JSON')) };
    const res = await handleConfirmPayment(badRequest, createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to confirm payment');
  });
});
