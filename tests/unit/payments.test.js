/**
 * Unit tests for payments.js — webhook handler (Stripe retired; Paymob live).
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
  it('returns 501 pointing at the HMAC-verified Paymob webhook (Stripe retired)', async () => {
    const { DB } = createMockDb();
    const req = createMockRequest({ type: 'payment_intent.succeeded' });
    const res = await handleStripeWebhook(req, {
      DB,
      STRIPE_WEBHOOK_SECRET: '',
      ENVIRONMENT: 'test',
    });
    expect(res.status).toBe(501);
    const json = await res.json();
    const text = JSON.stringify(json);
    expect(res.status).toBe(501);
    expect(text).toContain('paymob');
    expect(text).toContain('HMAC');
    expect(text).toContain('retired');
  });
});
