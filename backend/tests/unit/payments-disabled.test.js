/**
 * Unit tests for backend/src/api/payments.js disabled-state guard (G8 fix).
 *
 * Guards the security invariant that the mock Stripe payment handlers are
 * OFF by default: when env.PM_ENABLED !== 'true' they must return 503 and
 * NEVER mark an order paid. Also guards that the enabled path still works:
 * with PM_ENABLED='true', handleConfirmPayment DOES mark a matching tenant's
 * order paid (so the non-disabled path is not broken by the guard).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  handleCreatePaymentIntent,
  handleConfirmPayment,
} from '../../src/api/payments.js';

function makeRequest(body) {
  return {
    json: () => Promise.resolve(body),
  };
}

function createMockEnv(order = null) {
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

describe('handleCreatePaymentIntent (disabled guard)', () => {
  const tenantId = 't1';

  it('returns 503 when PM_ENABLED is not true', async () => {
    const env = createMockEnv();
    delete env.PM_ENABLED;
    const res = await handleCreatePaymentIntent(
      makeRequest({ orderId: 'order_1', amount: 100 }),
      env,
      tenantId,
    );
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe('Payment gateway disabled');
    // No DB access must occur when disabled.
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('returns 503 when PM_ENABLED is a non-true string', async () => {
    const env = createMockEnv();
    env.PM_ENABLED = 'false';
    const res = await handleCreatePaymentIntent(
      makeRequest({ orderId: 'order_1', amount: 100 }),
      env,
      tenantId,
    );
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe('Payment gateway disabled');
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
});

describe('handleConfirmPayment (disabled guard + enabled path)', () => {
  const tenantId = 't1';

  it('returns 503 when PM_ENABLED is not true — order is NOT marked paid', async () => {
    const env = createMockEnv({ id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'pending' });
    delete env.PM_ENABLED;
    const res = await handleConfirmPayment(
      makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }),
      env,
      tenantId,
    );
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe('Payment gateway disabled');
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('with PM_ENABLED=true, marks a matching tenant order paid', async () => {
    const env = createMockEnv({ id: 'order_1', tenant_id: 't1', total_amount: 200, order_state_id: 'confirmed' });
    const res = await handleConfirmPayment(
      makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_1' }),
      env,
      tenantId,
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status).toBe('paid');
    expect(data.orderId).toBe('order_1');
    expect(data.amountPaid).toBe(200);
  });

  it('with PM_ENABLED=true, returns 404 for an order in another tenant', async () => {
    const env = createMockEnv(null); // lookup scoped by tenant returns nothing
    const res = await handleConfirmPayment(
      makeRequest({ paymentIntentId: 'pi_123', orderId: 'order_other' }),
      env,
      'tenant-b',
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Order not found');
  });
});
