import { jsonResponse, errorResponse } from '../utils/response';
import { validationError } from '../utils/errors';
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
 * POST /api/payments/create-intent
 * Creates a mock Stripe PaymentIntent for an order.
 * Body: { orderId: string, amount: number, currency?: string }
 */
export async function handleCreatePaymentIntent(request, env, tenantId) {
  try {
    const parsed = paymentIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { orderId, amount, currency } = parsed.data;

    const order = await env.DB.prepare(
      'SELECT id, tenant_id, total_amount, order_state_id FROM orders WHERE id = ? AND tenant_id = ?'
    ).bind(orderId, tenantId).first();

    if (!order) {
      return errorResponse('Order not found', 404);
    }

    if (order.order_state_id === 'cancelled') {
      return errorResponse('Cannot create payment for a cancelled order', 400);
    }

    const paymentIntentId = 'pi_mock_' + Date.now();
    const clientSecret = paymentIntentId + '_secret_' + Math.random().toString(36).substr(2, 16);

    return jsonResponse({
      success: true,
      paymentIntentId,
      clientSecret,
      amount,
      currency: currency || 'egp',
      orderId,
    });
  } catch (e) {
    return errorResponse('Failed to create payment intent', 500);
  }
}

/**
 * POST /api/payments/confirm
 * Confirms a mock payment and updates the order status.
 * Body: { paymentIntentId: string, orderId: string }
 */
export async function handleConfirmPayment(request, env, tenantId) {
  try {
    const parsed = confirmPaymentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { paymentIntentId, orderId } = parsed.data;

    const order = await env.DB.prepare(
      'SELECT id, tenant_id, total_amount, order_state_id, room_id, check_in_date FROM orders WHERE id = ? AND tenant_id = ?'
    ).bind(orderId, tenantId).first();

    if (!order) {
      return errorResponse('Order not found', 404);
    }

    if (order.order_state_id === 'cancelled') {
      return errorResponse('Cannot confirm payment for a cancelled order', 400);
    }

    await env.DB.prepare(
      "UPDATE orders SET payment_status = 'paid', amount_paid = total_amount, notes = COALESCE(notes, '') || ' | Payment: ' || ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
    ).bind(paymentIntentId, orderId, tenantId).run();

    return jsonResponse({
      success: true,
      orderId,
      status: 'paid',
      amountPaid: order.total_amount,
    });
  } catch (e) {
    return errorResponse('Failed to confirm payment', 500);
  }
}

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
