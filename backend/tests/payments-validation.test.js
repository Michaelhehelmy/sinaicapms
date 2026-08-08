import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreatePaymentIntent, handleConfirmPayment } from '../src/api/payments';

function createMockEnv(order = null) {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(order),
          run: vi.fn().mockResolvedValue({}),
        })),
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
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), createMockEnv(order), tenantId);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('Cannot confirm payment for a cancelled order');
  });

  it('returns 200 with success on valid request', async () => {
    const order = { id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'pending' };
    const res = await handleConfirmPayment(makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }), createMockEnv(order), tenantId);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.orderId).toBe('order_1');
    expect(data.status).toBe('paid');
    expect(data.amountPaid).toBe(200);
  });

  it('returns 500 on JSON parse error', async () => {
    const badRequest = { json: () => Promise.reject(new Error('Invalid JSON')) };
    const res = await handleConfirmPayment(badRequest, createMockEnv(), tenantId);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to confirm payment');
  });
});
