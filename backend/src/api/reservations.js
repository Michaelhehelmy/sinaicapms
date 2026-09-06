/**
 * Public marketplace reservation → order + Paymob payment intention.
 *
 * Mounted at `/api/public/reservations` (T5 wires the mount in index.js).
 * No auth required — the guest resolves the tenant via host/x-tenant-id.
 *
 * Flow:
 *  1. Validate input + resolve tenant
 *  2. Server-side authoritative pricing (room + meal plans)
 *  3. Race-safe guarded INSERT (same pattern as orders.js)
 *  4. Call Paymob intention API → return client_secret for Unified Checkout
 *  5. On Paymob failure → keep order, return WhatsApp fallback signal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse, toSnake } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';
import { createPaymobIntention } from '../services/paymob.js';
import { loadPaymentConfig } from '../services/paymentConfig.js';

// ── Schema ──────────────────────────────────────────────────────────────────

// T7 (M1): the wire contract is the OpenAPI-registered camelCase shape
// (backend/src/routes/registry.js → PublicReservationRequest). The old schema
// here accepted a DIFFERENT shape — client-priced generic line items
// ({ type, name, quantity, unit_price }) plus a camp_id the frontend never
// sends — which (a) let callers set their own order total and (b) rejected the
// real UI payload. Line items are now meal-plan ONLY: { productId, quantity },
// and every price is resolved server-side from pos_products.

export const publicReservationSchema = z.object({
  room_id: z.string().min(1, 'Room ID is required'),
  check_in_date: z.string().min(1, 'Check-in date is required'),
  check_out_date: z.string().min(1, 'Check-out date is required'),
  number_of_people: z.number().int().min(1).optional(),
  guest_name: z.string().min(1, 'Guest name is required'),
  guest_phone: z.string().optional(),
  guest_email: z.string().email().optional(),
  // Meal-plan line items. Client sends prices for nothing — server prices from
  // pos_products (tenant-scoped below); any extra key (e.g. unit_price) is
  // stripped by .strip() and never affects the total.
  items: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().int().min(1),
  })).optional(),
  // Legacy alias handled identically to `items`.
  meal_plans: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().int().min(1),
  })).optional(),
}).strict();

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateReference() {
  // T25: crypto instead of Math.random — collision-resistant order refs
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let rand = '';
  for (let i = 0; i < bytes.length; i++) rand += chars[bytes[i] % chars.length];
  return `ORD-${rand}`;
}

async function findOrCreateCustomer(env, tenantId, guestName, guestEmail, guestPhone) {
  if (!guestName) return null;

  let firstName = guestName;
  let lastName = '';
  const spaceIdx = guestName.indexOf(' ');
  if (spaceIdx !== -1) {
    firstName = guestName.substring(0, spaceIdx);
    lastName = guestName.substring(spaceIdx + 1);
  }

  if (guestEmail) {
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM customers WHERE tenant_id = ? AND email = ?'
    ).bind(tenantId, guestEmail).all();
    if (existing.length > 0) {
      const custId = existing[0].id;
      await env.DB.prepare(
        "UPDATE customers SET first_name = COALESCE(NULLIF(?,''), first_name), last_name = COALESCE(NULLIF(?,''), last_name), phone = COALESCE(NULLIF(?,''), phone) WHERE id = ?"
      ).bind(firstName, lastName, guestPhone, custId).run();
      return custId;
    }
  }

  if (guestPhone) {
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM customers WHERE tenant_id = ? AND phone = ?'
    ).bind(tenantId, guestPhone).all();
    if (existing.length > 0) {
      const custId = existing[0].id;
      await env.DB.prepare(
        "UPDATE customers SET first_name = COALESCE(NULLIF(?,''), first_name), last_name = COALESCE(NULLIF(?,''), last_name), email = COALESCE(NULLIF(?,''), email) WHERE id = ?"
      ).bind(firstName, lastName, guestEmail, custId).run();
      return custId;
    }
  }

  const cid = 'cust_' + crypto.randomUUID().slice(0, 12);
  await env.DB.prepare(
    "INSERT INTO customers (id, tenant_id, first_name, last_name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).bind(cid, tenantId, firstName, lastName, guestEmail || null, guestPhone || null).run();
  return cid;
}

async function calculatePriceOnServer(env, tenantId, roomId, checkInDate, checkOutDate) {
  const { results: roomResult } = await env.DB.prepare(
    'SELECT r.product_id FROM rooms_new r JOIN projects c ON r.camp_id = c.id WHERE r.id = ? AND c.tenant_id = ?'
  ).bind(roomId, tenantId).all();
  if (roomResult.length === 0) return 0;
  const productId = roomResult[0].product_id;

  const { results: prodResult } = await env.DB.prepare(
    'SELECT selling_price AS base_price FROM pos_products WHERE id = ? AND tenant_id = ?'
  ).bind(productId, tenantId).all();
  if (prodResult.length === 0) return 0;
  const basePrice = parseFloat(prodResult[0].base_price || 0);

  const { results: rates } = await env.DB.prepare(
    'SELECT price_per_night, start_date, end_date, season FROM rate_plans_new WHERE tenant_id = ? AND product_id = ? ORDER BY season DESC, price_per_night DESC'
  ).bind(tenantId, productId).all();

  const { results: overrides } = await env.DB.prepare(
    'SELECT date, price FROM price_overrides WHERE product_id = ? AND date BETWEEN ? AND ?'
  ).bind(productId, checkInDate, checkOutDate).all();
  const overrideMap = new Map();
  for (const o of overrides) {
    const oday = new Date(o.date);
    oday.setHours(0, 0, 0, 0);
    overrideMap.set(oday.getTime(), parseFloat(o.price));
  }

  let currentDate = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  let totalPrice = 0;

  while (currentDate < checkOut) {
    const day = new Date(currentDate);
    day.setHours(0, 0, 0, 0);

    const matchingRate = rates.find(rp => {
      if (rp.start_date && rp.end_date) {
        const start = new Date(rp.start_date);
        const end = new Date(rp.end_date);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (day < start || day > end) return false;
      }
      if (rp.season && rp.season !== 'all') {
        const month = day.getMonth() + 1;
        if (rp.season === 'summer' && (month < 6 || month > 8)) return false;
        if (rp.season === 'winter' && month !== 12 && month !== 1 && month !== 2) return false;
      }
      return true;
    });

    const overridePrice = overrideMap.get(day.getTime());
    if (overridePrice !== undefined) {
      totalPrice += overridePrice;
    } else {
      totalPrice += matchingRate ? parseFloat(matchingRate.price_per_night) : basePrice;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return totalPrice;
}

// ── Route ───────────────────────────────────────────────────────────────────

const reservationsRoutes = new Hono();

reservationsRoutes.post('/', async (c) => {
  try {
    // 1. Validate input
    const parsed = publicReservationSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) return validationError(parsed);
    const data = parsed.data;
    const {
      room_id, check_in_date, check_out_date,
      number_of_people, guest_name, guest_phone, guest_email,
      items, meal_plans,
    } = data;

    // 2. Resolve tenant (public scope — host / x-tenant-id header)
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Tenant not found', 404);

    // 3. Verify room belongs to this tenant (camp id is implied by the room)
    const room = await c.env.DB.prepare(
      `SELECT r.id, r.max_guests, r.camp_id
       FROM rooms_new r
       JOIN projects camp ON r.camp_id = camp.id
       WHERE r.id = ? AND camp.tenant_id = ?`
    ).bind(room_id, tenantId).first();
    if (!room) return errorResponse('Room not found', 404);

    // 4. Basic validation
    if (number_of_people && room.max_guests && number_of_people > room.max_guests) {
      return errorResponse(`Room maximum capacity is ${room.max_guests} guests`, 400);
    }

    const checkIn = new Date(check_in_date);
    const checkOut = new Date(check_out_date);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return errorResponse('Invalid check-in or check-out date', 400);
    }
    if (checkIn >= checkOut) {
      return errorResponse('Check-out date must be after check-in date', 400);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkIn < today) {
      return errorResponse('Check-in date cannot be in the past', 400);
    }

    // 5. Check existing bookings for this room (advisory — guarded INSERT below is authoritative)
    const { results: overlapping } = await c.env.DB.prepare(
      `SELECT id FROM orders
       WHERE tenant_id = ? AND room_id = ?
         AND (check_in_date < ? AND check_out_date > ?)
         AND order_state_id != 'cancelled'`
    ).bind(tenantId, room_id, check_out_date, check_in_date).all();
    if (overlapping.length > 0) {
      return errorResponse('Room is not available for the selected dates', 409);
    }

    // 6. Server-side authoritative pricing — only DB-sourced prices exist here.
    //    The room price is derived from rate_plans_new / price_overrides /
    //    pos_products.selling_price; meal plans are priced from pos_products
    //    (tenant-scoped) below. Client payloads carry no prices at all.
    const roomPrice = await calculatePriceOnServer(c.env, tenantId, room_id, check_in_date, check_out_date);
    let effectiveTotal = roomPrice;

    // `items` and `meal_plans` carry the same { product_id, quantity } shape.
    const mealPlanList = Array.isArray(items) && items.length > 0 ? items : (meal_plans || []);
    let mealPlanTotal = 0;
    if (mealPlanList.length > 0) {
      const productIds = mealPlanList.map(mp => mp.product_id);
      const placeholders = productIds.map(() => '?').join(',');
      const { results: products } = await c.env.DB.prepare(
        `SELECT id, selling_price FROM pos_products
         WHERE id IN (${placeholders}) AND tenant_id = ? AND is_active = 1`
      ).bind(...productIds, tenantId).all();
      const productMap = new Map(products.map(p => [p.id, p]));
      for (const mp of mealPlanList) {
        const product = productMap.get(mp.product_id);
        if (!product) continue;
        mealPlanTotal += parseFloat(product.selling_price || 0) * mp.quantity;
      }
      effectiveTotal += mealPlanTotal;
    }

    // 7. Find or create customer
    const customerId = await findOrCreateCustomer(c.env, tenantId, guest_name, guest_email, guest_phone);

    // 8. Race-safe guarded INSERT
    const ordId = 'ord_' + crypto.randomUUID().slice(0, 12);
    const reference = generateReference();

    const insertStmt = c.env.DB.prepare(
      `INSERT INTO orders
         (id, tenant_id, camp_id, room_id, customer_id, order_state_id,
          check_in_date, check_out_date, number_of_people, total_amount,
          amount_paid, payment_method, payment_status, reference,
          created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, 'online', 'awaiting_payment', ?,
              datetime('now'), datetime('now')
       WHERE NOT EXISTS (
         SELECT 1 FROM orders
         WHERE tenant_id = ? AND room_id = ?
           AND (check_in_date < ? AND check_out_date > ?)
           AND order_state_id != 'cancelled'
       )`
    ).bind(
      ordId, tenantId, room.camp_id, room_id, customerId,
      check_in_date, check_out_date, number_of_people || 1,
      effectiveTotal, reference,
      tenantId, room_id, check_out_date, check_in_date
    );

    const [insertResult] = await c.env.DB.batch([insertStmt]);
    if (!insertResult?.meta || insertResult.meta.changes === 0) {
      return errorResponse('Room no longer available', 409);
    }

    // 9. Persist line items AFTER guarded INSERT (second batch — a lost-race 409 must not leave orphaned items).
    //    Meal-plan items only — see step 6; client payloads carry no priced line items.
    if (mealPlanList.length > 0) {
      const productIds = mealPlanList.map(mp => mp.product_id);
      const placeholders = productIds.map(() => '?').join(',');
      const { results: products } = await c.env.DB.prepare(
        `SELECT id, name, selling_price FROM pos_products
         WHERE id IN (${placeholders}) AND tenant_id = ? AND is_active = 1`
      ).bind(...productIds, tenantId).all();
      const productMap = new Map(products.map(p => [p.id, p]));

      const { results: orgMapping } = await c.env.DB.prepare(
        'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
      ).bind(tenantId).all();
      const organizationId = orgMapping.length > 0 ? orgMapping[0].organization_id : null;

      const itemStmts = [];
      const posStmts = [];

      for (const mp of mealPlanList) {
        const product = productMap.get(mp.product_id);
        if (!product) continue;
        const unitPrice = parseFloat(product.selling_price || 0);
        const lineTotal = unitPrice * mp.quantity;

        itemStmts.push(c.env.DB.prepare(
          `INSERT INTO order_items
             (id, order_id, type, reference_id, name, quantity, unit_price, total_price, created_at)
           VALUES (?, ?, 'meal_plan', ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          'oi_' + crypto.randomUUID().slice(0, 12), ordId, mp.product_id,
          product.name, mp.quantity, unitPrice, lineTotal
        ));

        if (organizationId) {
          posStmts.push(c.env.DB.prepare(
            `INSERT INTO pos_transactions
               (id, tenant_id, organization_id, store_id, order_number, cashier_id,
                status, subtotal, tax_amount, tax_rate, total_amount,
                paid_amount, payment_method, payment_status, notes,
                kitchen_status, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?, 'completed', ?, 0, 0, ?, ?, 'booking', 'completed', ?, 'confirmed', datetime('now'), datetime('now'))`
          ).bind(
            'pot_' + crypto.randomUUID().slice(0, 12), tenantId, organizationId,
            'MP-' + reference, 'system', lineTotal, lineTotal,
            `Meal plan for booking ${reference}: ${product.name}`
          ));
        }
      }

      if (mealPlanTotal > 0) {
        itemStmts.push(c.env.DB.prepare(
          'UPDATE orders SET total_amount = total_amount + ? WHERE id = ?'
        ).bind(mealPlanTotal, ordId));
      }

      if (itemStmts.length > 0) await c.env.DB.batch(itemStmts);
      if (posStmts.length > 0) await c.env.DB.batch(posStmts);
    }

    // 10. Paymob intention
    const pm = await loadPaymentConfig(c.env);

    if (!pm.enabled || !pm.secretKey || !pm.baseUrl) {
      return jsonResponse({
        order_id: ordId,
        reference,
        total_amount: effectiveTotal,
        currency: 'EGP',
        paymob_enabled: false,
        paymob_intention: null,
        payment_methods: null,
        public_key: null,
        fallback_whats_app: true,
      });
    }

    let pmIntention;
    try {
      const requestUrl = new URL(c.req.url);
      const origin = requestUrl.origin;

      pmIntention = await createPaymobIntention({
        secretKey: pm.secretKey,
        baseUrl: pm.baseUrl,
        amountCents: Math.round(effectiveTotal * 100),
        currency: pm.currency,
        orderRef: reference,
        paymentMethods: pm.integrationIds,
        billingData: {
          first_name: guest_name.split(' ')[0] || guest_name,
          last_name: guest_name.split(' ').slice(1).join(' ') || 'Guest',
          phone_number: guest_phone || '',
          email: guest_email || 'guest@sinaicamps.com',
          apartment: 'N/A',
          floor: 'N/A',
          street: 'N/A',
          building: 'N/A',
          city: 'N/A',
          country: 'EG',
          state: 'N/A',
        },
        notificationUrl: `${origin}/api/payments/webhook`,
        redirectionUrl: `${origin}/booking/${reference}/confirmation`,
      });
    } catch (e) {
      // Paymob failure: keep the order, mark payment failed, return WhatsApp fallback
      await c.env.DB.prepare(
        "UPDATE orders SET payment_status = 'payment_failed', updated_at = datetime('now') WHERE id = ?"
      ).bind(ordId).run();

      return jsonResponse({
        order_id: ordId,
        reference,
        total_amount: effectiveTotal,
        currency: 'EGP',
        paymob_enabled: false,
        paymob_intention: null,
        payment_methods: null,
        public_key: null,
        fallback_whats_app: true,
      });
    }

    // 11. Persist Paymob intention ID on the order
    await c.env.DB.prepare(
      'UPDATE orders SET payment_intent_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(String(pmIntention.id), ordId).run();

    return jsonResponse({
      order_id: ordId,
      reference,
      total_amount: effectiveTotal,
      currency: 'EGP',
      paymob_enabled: true,
      paymob_intention: { clientSecret: pmIntention.clientSecret, id: pmIntention.id },
      payment_methods: pm.integrationIds.length > 0 ? pm.integrationIds : null,
      public_key: pm.publicKey || null,
      fallback_whats_app: true,
    });
  } catch (e) {
    return errorResponse('Failed to create reservation');
  }
});

reservationsRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default reservationsRoutes;
