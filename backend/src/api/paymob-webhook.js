import { jsonResponse, errorResponse } from '../utils/response';
import { verifyPaymobWebhookSignature, extractPaymobTransaction } from '../services/paymob.js';
import { loadPaymentConfig } from '../services/paymentConfig.js';

/**
 * Order state transition for a successfully PAID booking.
 *
 * Reuse the existing paid-state logic from api/orders.js: a freshly-created
 * order starts as `pending` and moves to `confirmed` — the state whose `paid`
 * column is 1 — which is what flips `payment_status` to 'paid'. Both writes
 * are scoped by tenant so a stale/foreign row can never be flipped by another
 * tenant's webhook. The transition is idempotent (re-setting 'confirmed' on a
 * Paymob retry is a cheap no-op UPDATE).
 *
 * @param {object} env
 * @param {object} order - orders row (id, tenant_id, reference)
 */
async function applyPaidStateTransition(env, order) {
  // Move pending → confirmed (the only legal transition into a paid state for
  // a fresh booking; matches LEGAL_TRANSITIONS in api/orders.js). An already
  // confirmed/advanced order is left untouched. The `meta.changes` rowcount
  // tells us whether the transition actually happened so the room side-effect
  // can't fire on a stale re-delivery (Paymob retries).
  const res = await env.DB.prepare(
    "UPDATE orders SET order_state_id = 'confirmed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND order_state_id = 'pending'"
  ).bind(order.id, order.tenant_id).run();
  const transitioned = res?.meta?.changes ? res.meta.changes > 0 : false;

  if (transitioned && order.room_id) {
    // 0067: room lifecycle follows the order lifecycle — confirmed → reserved
    // (same mapping as ROOM_STATUS_BY_ORDER_STATUS in api/orders.js).
    await env.DB.prepare(
      "UPDATE rooms_new SET room_status = 'reserved', updated_at = datetime('now') WHERE id = ?"
    ).bind(order.room_id).run();
  }
}

/**
 * Broadcast a `new-booking` SSE event for a freshly-paid order.
 *
 * Mirrors broadcastNewBooking(env, tenantId, orderData) from api/orders.js so
 * tenant admin dashboards observe the reservation the moment it is paid.
 * Best-effort — must never fail the webhook response.
 *
 * @param {object} env
 * @param {string|number} tenantId
 * @param {object} order - orders row (id, camp_id, check_in_date, check_out_date)
 */
function broadcastNewBooking(env, tenantId, order) {
  if (!env || !env.BROADCASTER) return;
  const payload = {
    type: 'new-booking',
    orderId: order.id,
    campId: order.camp_id,
    checkIn: order.check_in_date,
    checkOut: order.check_out_date,
  };
  try {
    const id = env.BROADCASTER.idFromName(String(tenantId));
    const stub = env.BROADCASTER.get(id);
    Promise.resolve()
      .then(() => stub.fetch('http://broadcaster/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: String(tenantId), event: payload }),
      }))
      .catch(() => {});
  } catch (err) {
    // Broadcast is best-effort — never fail the webhook on a hub error.
  }
}

/**
 * Pull the internal order reference out of a Paymob transaction.
 *
 * The T3 intention route embeds `orderRef:<reference>` in the item description
 * (see createPaymobIntention in services/paymob.js). In the webhook callback
 * the `order` field is a nested object carrying `items[]` — each with the
 * `name`/`description` Paymob echoed back from the intention. We scan those
 * strings and return the first embedded orderRef.
 *
 * @param {object} payloadObj - Parsed webhook body
 * @returns {string|null}
 */
function extractOrderReference(payloadObj) {
  if (!payloadObj || typeof payloadObj !== 'object') return null;
  const order = payloadObj.order;

  const candidates = [];
  if (order && typeof order === 'object') {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      if (it && String(it.description || '')) candidates.push(String(it.description));
      if (it && String(it.name || '')) candidates.push(String(it.name));
    }
    if (order.merchant_order_id) candidates.push(String(order.merchant_order_id));
  } else if (order) {
    candidates.push(String(order));
  }

  for (const text of candidates) {
    const match = text.match(/orderRef:([A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * POST /api/public/paymob/webhook
 *
 * Public HMAC-verified Paymob server-to-server callback. Signature auth is the
 * ONLY authentication — deliberately no resolveScope/auth dependency so Paymob
 * can reach it without a tenant JWT.
 *
 * Flow (fail-closed, replacing the old mock Stripe webhook):
 *   1. Read the RAW body via request.text() — the HMAC must be computed over
 *      the exact bytes Paymob signed (never request.json() twice).
 *   2. 503 if Paymob isn't enabled or `hmacSecret` is not configured
 *      (resolved via loadPaymentConfig from platform_settings or env).
 *   3. Verify the HMAC. Paymob sends the hmac INSIDE the body (`hmac` field),
 *      so it is read from the parsed body, not a request header. 401 on a bad
 *      signature.
 *   4. Resolve the order by `reference`, derive its `tenant_id`, then scope
 *      every downstream write by that tenant_id. Never updates by reference/id
 *      alone — that is what prevents cross-tenant writes.
 *   5. Only on `success === true` / `pending === false`: mark paid, transition
 *      order state, and broadcast the new-booking SSE event.
 *   6. Return 200 `{ received: true }` fast so Paymob stops retrying.
 *
 * @param {Request} request
 * @param {object} env
 */
export async function handlePaymobWebhook(request, env) {
  // 1. Raw body — sign over the exact bytes.
  let rawBody;
  try {
    rawBody = await request.text();
  } catch (e) {
    return errorResponse('Unable to read webhook body', 400);
  }
  if (!rawBody) {
    return errorResponse('Empty webhook body', 400);
  }

  // 2. Fail-closed: not enabled / secret missing.
  const pm = await loadPaymentConfig(env);
  if (!pm.enabled) {
    if (env.ENVIRONMENT !== 'production') {
      console.log('[PAYMOB WEBHOOK] Rejected — webhook not configured');
    }
    return errorResponse('Webhook not configured', 503);
  }
  if (!pm.hmacSecret) {
    if (env.ENVIRONMENT !== 'production') {
      console.log('[PAYMOB WEBHOOK] Rejected — webhook not configured');
    }
    return errorResponse('Webhook not configured', 503);
  }

  // 3. HMAC verification. The service computes the signed canonical string from
  //    the raw body and compares it against the hmac it reads from the parsed
  //    payload (`obj.hmac`) — so hmacHeader is the body's hmac field.
  const parsed = extractPaymobTransaction(rawBody);
  const valid = await verifyPaymobWebhookSignature({
    rawBody,
    hmacHeader: parsed.hmac,
    hmacSecret: pm.hmacSecret,
  });
  if (!valid) {
    if (env.ENVIRONMENT !== 'production') {
      console.log('[PAYMOB WEBHOOK] Rejected — falsified HMAC');
    }
    return errorResponse('Invalid webhook signature', 401);
  }

  // We only act on terminal SUCCESS callbacks.
  if (parsed.success !== true || parsed.pending === true) {
    return jsonResponse({ received: true });
  }

  // 4. Resolve the order by reference and scope writes by its tenant_id.
  try {
    const payloadObj = JSON.parse(rawBody);
    const orderRef = extractOrderReference(payloadObj);

    if (!orderRef) {
      if (env.ENVIRONMENT !== 'production') {
        console.log('[PAYMOB WEBHOOK] No orderRef embedded in transaction — ignoring');
      }
      return jsonResponse({ received: true });
    }

    const order = await env.DB.prepare(
      `SELECT id, tenant_id, camp_id, room_id, reference, total_amount,
              check_in_date, check_out_date, payment_status
       FROM orders WHERE reference = ?`
    ).bind(orderRef).first();

    if (!order) {
      if (env.ENVIRONMENT !== 'production') {
        console.log(`[PAYMOB WEBHOOK] No order found for reference ${orderRef}`);
      }
      return jsonResponse({ received: true });
    }

    const tenantId = order.tenant_id;

    // 5. Money write — scoped by reference AND tenant_id (cross-tenant safe).
    await env.DB.prepare(
      `UPDATE orders SET
         payment_status = 'paid',
         paymob_transaction_id = ?,
         paymob_paid_at = datetime('now'),
         amount_paid = total_amount,
         updated_at = datetime('now')
       WHERE reference = ? AND tenant_id = ?`
    ).bind(parsed.transaction_id, orderRef, tenantId).run();

    // State transition + payment_status flip (existing paid-state logic).
    await applyPaidStateTransition(env, order);

    // Fire the live admin dashboard notification.
    broadcastNewBooking(env, tenantId, order);

    // Marketplace payments ledger row (idempotent — never blocks the ack).
    try {
      const intentionId = payloadObj.intention_id
        || (payloadObj.order && payloadObj.order.intention_id) || null;
      const gross = order.total_amount || 0;
      const fee = Math.round(gross * (pm.marketplaceFeePct / 100) * 100) / 100;
      const net = Math.round((gross - fee) * 100) / 100;

      await env.DB.prepare(
        `INSERT INTO marketplace_payments
           (order_id, tenant_id, order_reference, channel, gross_amount,
            marketplace_fee, net_amount, currency, paymob_transaction_id,
            paymob_intention_id, payment_status, notes)
         SELECT ?, ?, ?, 'marketplace', ?, ?, ?, ?, ?, ?, 'captured', 'Paymob webhook capture'
         WHERE NOT EXISTS (SELECT 1 FROM marketplace_payments WHERE order_reference = ?)`
      ).bind(
        order.id, tenantId, orderRef, gross, fee, net,
        pm.currency || 'EGP', parsed.transaction_id,
        intentionId, orderRef,
      ).run();
    } catch (ledgerErr) {
      console.error('[PAYMOB WEBHOOK] Failed to insert marketplace_payments ledger row', ledgerErr);
    }

    if (env.ENVIRONMENT !== 'production') {
      console.log(`[PAYMOB WEBHOOK] Order ${orderRef} marked paid (txn ${parsed.transaction_id})`);
    }
  } catch (e) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('[PAYMOB WEBHOOK] Processing failed', e.stack || e.message);
    }
    return errorResponse('Webhook processing failed', 500);
  }

  // 6. Fast 200 ack — Paymob aborts retries on 2xx.
  return jsonResponse({ received: true });
}