/**
 * payments.js — Mock-Stripe payment handlers (DISABLED).
 *
 * ⚠️  NON-AUTHORITATIVE: These handlers are OFF by default (PM_ENABLED !== 'true').
 *     Orders must be paid ONLY via:
 *       (a) An authenticated admin order_state transition to a paid state
 *           (existing orders.js logic).
 *       (b) The HMAC-verified Paymob webhook (paymob-webhook.js, T4).
 *
 *     The mock confirm path here must stay disabled unless a real payment
 *     provider is wired behind PM_ENABLED. Do NOT enable in production.
 */

import { jsonResponse, errorResponse } from '../utils/response';
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
 * Mock Stripe webhook handler. In production, verify the Stripe signature.
 * Requires x-webhook-secret header matching STRIPE_WEBHOOK_SECRET env var.
 */
export async function handleStripeWebhook(request, env) {
  try {
    // Verify webhook secret
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return errorResponse('Webhook not configured', 503);
    }
    const providedSecret = request.headers.get('x-webhook-secret');
    if (!providedSecret || providedSecret !== webhookSecret) {
      return errorResponse('Invalid webhook secret', 401);
    }

    const event = await request.json();
    if (env.ENVIRONMENT !== 'production') {
      console.log(`[STRIPE WEBHOOK] Received event type: ${event?.type || 'unknown'}`);
    }

    if (event?.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data?.object;
      if (paymentIntent?.metadata?.orderId) {
        const orderId = paymentIntent.metadata.orderId;
        // Scope update to a valid tenant-owned order to prevent cross-tenant modification
        const { results: orderCheck } = await env.DB.prepare(
          "SELECT id, tenant_id FROM orders WHERE id = ?"
        ).bind(orderId).all();
        if (orderCheck.length > 0) {
          await env.DB.prepare(
            "UPDATE orders SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
          ).bind(orderId, orderCheck[0].tenant_id).run();
        }
      }
    }

    return jsonResponse({ received: true });
  } catch (e) {
    return errorResponse('Webhook processing failed', 500);
  }
}
