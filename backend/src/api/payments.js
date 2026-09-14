/**
 * payments.js — Retired mock-Stripe payment handlers.
 *
 * ⚠️  NON-AUTHORITATIVE — intentionally retired.
 *     Orders are paid ONLY via:
 *       (a) An authenticated admin order_state transition to a paid state
 *           (existing orders.js logic).
 *       (b) The HMAC-verified Paymob webhook (paymob-webhook.js, T4).
 *
 *     The old mock Stripe webhook was silent-but-dangerous: it would mark an
 *     order paid based on a shared header secret (no cryptographic signature
 *     verification) and could be fired by any caller who knew the secret.
 *     It never ran in production (STRIPE_WEBHOOK_SECRET is not configured),
 *     but keeping a payment-mutating mock reachable at runtime is a footgun.
 *
 *     handleStripeWebhook is kept mounted at POST /api/payments/webhook (it is
 *     still advertised in routes/registry.js) but now replies 501 so any
 *     stale integration surfaces a truthful error instead of silently
 *     succeeding or failing closed with a confusing 503/401.
 */

import { errorResponse } from '../utils/response';
import { z } from 'zod';

export const paymentIntentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().optional(),
}).strip();

export const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, 'Payment intent ID is required'),
  orderId: z.string().min(1, 'Order ID is required'),
}).strip();

/**
 * POST /api/payments/webhook
 * Retired mock-Stripe webhook endpoint.
 *
 * Always 501. Real callbacks arrive at POST /api/public/paymob/webhook and are
 * verified with the Paymob HMAC signature (see paymob-webhook.js). No order
 * is ever mutated here.
 */
export async function handleStripeWebhook() {
  return errorResponse(
    'Stripe webhooks are retired — payment callbacks go to POST /api/public/paymob/webhook (HMAC verified)',
    501
  );
}