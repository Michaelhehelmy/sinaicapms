import { jsonResponse, cachedJsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { getScope } from '../middleware/resolveScope.js';
import { logAudit } from './audit.js';
import { Hono } from 'hono';
import { z } from 'zod';

// 0067: optional line items / add-ons attached to the order at creation.
// Keys are snake_case after toSnake() normalization (clients may send either
// case). When items are present the server recomputes total_amount from them.
export const orderItemSchema = z.object({
  type: z.string().min(1), // e.g. 'addon'; extend freely — DB column is TEXT
  name: z.string().min(1),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
});

export const orderPostSchema = z.object({
  id: z.string().optional(),
  guest_name: z.string().min(1, 'Guest name is required').optional(),
  guest_email: z.string().optional(),
  guest_phone: z.string().optional(),
  camp_id: z.string().min(1, 'Camp ID is required'),
  room_id: z.string().min(1, 'Room ID is required'),
  number_of_people: z.number().min(1).optional(),
  check_in_date: z.string().min(1, 'Check-in date is required'),
  check_out_date: z.string().min(1, 'Check-out date is required'),
  total_amount: z.number().min(0).optional(),
  amount_paid: z.number().min(0).optional(),
  payment_method: z.string().optional(),
  payment_status: z.string().optional(),
  order_state_id: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).optional(),
  meal_plans: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().int().min(1),
  })).optional(),
}).strip(); // S-M1 fix: strip unknown fields instead of passthrough

export const orderPutSchema = z.object({
  guest_name: z.string().min(1).optional(),
  guest_email: z.string().optional(),
  guest_phone: z.string().optional(),
  camp_id: z.string().optional(),
  room_id: z.string().optional(),
  number_of_people: z.number().min(1).optional(),
  check_in_date: z.string().optional(),
  check_out_date: z.string().optional(),
  total_amount: z.number().min(0).optional(),
  amount_paid: z.number().min(0).optional(),
  payment_method: z.string().optional(),
  payment_status: z.string().optional(),
  order_state_id: z.string().optional(),
  notes: z.string().optional(),
}).strip(); // S-M1 fix

// T5: PATCH /orders/:id/status — dedicated status-only partial update
export const orderStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
}).strip();

// T5a: Fire-and-forget SSE broadcast to the tenant's Broadcaster Durable
// Object. Best-effort only — an error here must NEVER fail the order-create
// response. Deferred onto a microtask (this handler has no ctx.waitUntil) and
// the resulting promise's rejection is swallowed.
export function broadcastNewBooking(env, tenantId, orderData) {
  if (!env || !env.BROADCASTER) return;
  const payload = {
    type: 'new-booking',
    orderId: orderData.id,
    campId: orderData.camp_id,
    checkIn: orderData.check_in_date,
    checkOut: orderData.check_out_date,
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
  } catch {
    // Broadcast is best-effort — never fail the order on a hub error.
  }
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
      "SELECT id FROM customers WHERE tenant_id = ? AND email = ?"
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
      "SELECT id FROM customers WHERE tenant_id = ? AND phone = ?"
    ).bind(tenantId, guestPhone).all();
    if (existing.length > 0) {
      const custId = existing[0].id;
      await env.DB.prepare(
        "UPDATE customers SET first_name = COALESCE(NULLIF(?,''), first_name), last_name = COALESCE(NULLIF(?,''), last_name), email = COALESCE(NULLIF(?,''), email) WHERE id = ?"
      ).bind(firstName, lastName, guestEmail, custId).run();
      return custId;
    }
  }

  const cid = 'cust_' + crypto.randomUUID().slice(0, 12); // L1 fix: UUID instead of timestamp
  await env.DB.prepare(
    "INSERT INTO customers (id, tenant_id, first_name, last_name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).bind(cid, tenantId, firstName, lastName, guestEmail || null, guestPhone || null).run();
  return cid;
}

async function updateOrCreateCustomer(env, tenantId, customerId, guestName, guestEmail, guestPhone) {
  let firstName = guestName || '';
  let lastName = '';
  const spaceIdx = firstName.indexOf(' ');
  if (spaceIdx !== -1) {
    const before = firstName.substring(0, spaceIdx);
    lastName = firstName.substring(spaceIdx + 1);
    firstName = before;
  }

  if (customerId) {
    await env.DB.prepare(
      "UPDATE customers SET first_name = COALESCE(NULLIF(?,''), first_name), last_name = COALESCE(NULLIF(?,''), last_name), email = COALESCE(NULLIF(?,''), email), phone = COALESCE(NULLIF(?,''), phone) WHERE id = ?"
    ).bind(firstName, lastName, guestEmail, guestPhone, customerId).run();
    return customerId;
  }

  if (!guestEmail && !guestPhone) return null;

  if (guestEmail) {
    const { results: existing } = await env.DB.prepare(
      "SELECT id FROM customers WHERE tenant_id = ? AND email = ?"
    ).bind(tenantId, guestEmail).all();
    if (existing.length > 0) return existing[0].id;
  }
  if (guestPhone) {
    const { results: existing } = await env.DB.prepare(
      "SELECT id FROM customers WHERE tenant_id = ? AND phone = ?"
    ).bind(tenantId, guestPhone).all();
    if (existing.length > 0) return existing[0].id;
  }

  const cid = 'cust_' + crypto.randomUUID().slice(0, 12); // L1 fix
  await env.DB.prepare(
    "INSERT INTO customers (id, tenant_id, first_name, last_name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).bind(cid, tenantId, firstName, lastName, guestEmail || null, guestPhone || null).run();
  return cid;
}

function generateReference() {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${rand}`;
}

async function validateOrder(env, tenantId, editId, data) {
  const { camp_id, room_id, guest_name, number_of_people, check_in_date, check_out_date } = data;
  if (!camp_id || !room_id || !guest_name) {
    return 'Camp, room, and guest name are required.';
  }
  if (!check_in_date || !check_out_date) {
    return 'Check-in and check-out dates are required.';
  }

  const checkIn = new Date(check_in_date);
  const checkOut = new Date(check_out_date);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return 'Please enter valid check-in and check-out dates.';
  }
  if (checkIn >= checkOut) {
    return 'Check-out date must be after check-in date.';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (checkIn < today) {
    return 'Check-in date cannot be in the past.';
  }

  // S-H3 fix: Add tenant scoping to room capacity check
  const { results: roomInfo } = await env.DB.prepare(
    "SELECT r.max_guests, p.selling_price AS base_price FROM rooms_new r JOIN pos_products p ON r.product_id = p.id JOIN projects c ON r.camp_id = c.id WHERE r.id = ? AND c.tenant_id = ?"
  ).bind(room_id, tenantId).all();
  if (roomInfo.length > 0) {
    const maxCapacity = roomInfo[0].max_guests;
    if (number_of_people > maxCapacity) {
      return `The selected room has a maximum capacity of ${maxCapacity} guests.`;
    }
  } else {
    return 'Selected room not found.';
  }

  let query = "SELECT id FROM orders WHERE tenant_id = ? AND room_id = ? AND (check_in_date < ? AND check_out_date > ?) AND order_state_id != 'cancelled'";
  let bindings = [tenantId, room_id, check_out_date, check_in_date];
  if (editId) {
    query += " AND id != ?";
    bindings.push(editId);
  }
  const { results: overlapping } = await env.DB.prepare(query).bind(...bindings).all();
  if (overlapping.length > 0) {
    return 'This room is already booked for the selected dates.';
  }

  // 0067: project-level min/max stay limits. Runs after the overlap check so
  // a conflicting-booking response keeps its original semantics. min_stay
  // defaults to 1 in the schema, which can never reject here because the
  // check-out > check-in guard above guarantees nights >= 1.
  const { results: projectRows } = await env.DB.prepare(
    "SELECT min_stay, max_stay FROM projects WHERE id = ? AND deleted_at IS NULL"
  ).bind(camp_id).all();

  if (projectRows.length > 0) {
    const project = projectRows[0];
    const nights = Math.ceil((new Date(check_out_date) - new Date(check_in_date)) / (1000 * 60 * 60 * 24));

    if (project.min_stay && nights < project.min_stay) {
      return `Minimum stay is ${project.min_stay} nights. You selected ${nights} nights.`;
    }
    if (project.max_stay && nights > project.max_stay) {
      return `Maximum stay is ${project.max_stay} nights. You selected ${nights} nights.`;
    }
  }

  return null;
}

async function calculatePriceOnServer(env, tenantId, roomId, checkInDate, checkOutDate) {
  // S-H1 fix: Add tenant_id scoping to room and product lookups
  const { results: roomResult } = await env.DB.prepare(
    "SELECT r.product_id FROM rooms_new r JOIN projects c ON r.camp_id = c.id WHERE r.id = ? AND c.tenant_id = ?"
  ).bind(roomId, tenantId).all();
  if (roomResult.length === 0) return 0;
  const productId = roomResult[0].product_id;

  const { results: prodResult } = await env.DB.prepare(
    "SELECT selling_price AS base_price FROM pos_products WHERE id = ? AND tenant_id = ?"
  ).bind(productId, tenantId).all();
  if (prodResult.length === 0) return 0;
  const basePrice = parseFloat(prodResult[0].base_price || 0);

  const { results: rates } = await env.DB.prepare(
    "SELECT price_per_night, start_date, end_date, season FROM rate_plans_new WHERE tenant_id = ? AND product_id = ? ORDER BY season DESC, price_per_night DESC"
  ).bind(tenantId, productId).all();

  // T3a: load per-night price overrides for this product across the stay.
  // Precedence inside the loop: override > rate-plan price > base price.
  const { results: overrides } = await env.DB.prepare(
    "SELECT date, price FROM price_overrides WHERE product_id = ? AND date BETWEEN ? AND ?"
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

const ordersRoutes = new Hono();

// P-L1 fix: Removed PRAGMA foreign_keys = ON (D1 doesn't support PRAGMA)

// Phase 3 contract fix: missing params are a client error (400), not a
// silent { total_price: 0 } success. A room with no seasonal pricing still
// returns total_price 0 below — only MISSING params are rejected here.
ordersRoutes.get('/calculate-price', async (c) => {
  const url = new URL(c.req.url);
  const roomId = url.searchParams.get('roomId');
  const checkInStr = url.searchParams.get('checkIn');
  const checkOutStr = url.searchParams.get('checkOut');

  if (!roomId || !checkInStr || !checkOutStr) {
    return errorResponse('roomId, checkIn, and checkOut are required', 400);
  }

  const totalPrice = await calculatePriceOnServer(c.env, getScope(c).tenantId, roomId, checkInStr, checkOutStr);
  return jsonResponse({ total_price: totalPrice });
});

// Public order status lookup by reference code (no auth required)
ordersRoutes.get('/status/:ref', async (c) => {
  const ref = c.req.param('ref');
  try {
    const order = await c.env.DB.prepare(
      `SELECT o.id, o.reference, o.guest_name, o.check_in_date, o.check_out_date,
              o.total_amount, o.amount_paid, o.payment_status, o.payment_method,
              os.name as state_name, r.name as room_name
       FROM orders o
       LEFT JOIN order_state os ON o.order_state_id = os.id
       LEFT JOIN rooms_new r ON o.room_id = r.id
       WHERE o.tenant_id = ? AND o.reference = ?`
    ).bind(getScope(c).tenantId, ref).first();

    if (!order) return errorResponse('Order not found', 404);

    return jsonResponse({
      reference: order.reference,
      guest_name: order.guest_name,
      check_in_date: order.check_in_date,
      check_out_date: order.check_out_date,
      total_amount: order.total_amount,
      amount_paid: order.amount_paid,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      status: order.state_name,
      room_name: order.room_name,
    });
  } catch (e) {
    return errorResponse('Failed to fetch order status');
  }
});

ordersRoutes.post('/bulk-delete', async (c) => {
  try {
    const { ids } = toSnake(await c.req.json());
    const tenantId = getScope(c).tenantId;
    if (!Array.isArray(ids) || ids.length === 0) return errorResponse('Order IDs array is required', 400);

    const placeholders = ids.map(() => '?').join(',');

    const { results: orderList } = await c.env.DB.prepare(
      `SELECT room_id FROM orders WHERE tenant_id = ? AND id IN (${placeholders})`
    ).bind(tenantId, ...ids).all();

    // Phase 3 cascade: booking read-acks reference the deleted orders.
    await c.env.DB.prepare(
      `DELETE FROM inbox_reads WHERE tenant_id = ? AND ref_type = 'booking' AND ref_id IN (${placeholders})`
    ).bind(tenantId, ...ids).run();

    await c.env.DB.prepare(`DELETE FROM orders WHERE tenant_id = ? AND id IN (${placeholders})`).bind(tenantId, ...ids).run();

    // P-H3 fix: Batch room status updates instead of per-order loop
    const roomIds = [...new Set(orderList.map(o => o.room_id).filter(Boolean))];
    if (roomIds.length > 0) {
      const roomPh = roomIds.map(() => '?').join(',');
      const orderPh = ids.map(() => '?').join(',');
      // Update rooms to available only if they have no remaining orders.
      // 0067: keep BOTH the legacy `status` flag and the operational
      // `room_status` lifecycle column in sync when freeing rooms.
      await c.env.DB.prepare(
        `UPDATE rooms_new SET status = 'available', room_status = 'available', updated_at = datetime('now')
         WHERE id IN (${roomPh})
         AND id NOT IN (
           SELECT DISTINCT room_id FROM orders
           WHERE tenant_id = ? AND room_id IN (${roomPh}) AND id NOT IN (${orderPh})
         )`
      ).bind(...roomIds, tenantId, ...roomIds, ...ids).run();
    }

    return jsonResponse({ success: true, deleted: ids });
  } catch (e) {
    return errorResponse('Failed to delete orders');
  }
});

// T5: PATCH /orders/:id/status — status-only partial update (dedicated route)
// H6 fix: enforce a strict order lifecycle state machine (QloApps-style).
// Any transition not listed here is rejected with 409, and unknown current
// states are treated as terminal so corrupted rows can't be silently moved.
const LEGAL_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out', 'cancelled'],
  checked_out: [],
  cancelled: [],
};

// 0067: room lifecycle driven by the order lifecycle. When an order moves to
// one of these states, its room's operational `room_status` follows:
//   confirmed → reserved, checked_in → occupied, checked_out → cleaning,
//   cancelled → available (guarded — see below).
// States without an entry here (pending) leave the room untouched.
const ROOM_STATUS_BY_ORDER_STATUS = {
  confirmed: 'reserved',
  checked_in: 'occupied',
  checked_out: 'cleaning',
};

ordersRoutes.patch('/:id/status', async (c) => {
  try {
    const ordId = c.req.param('id');
    const tenantId = getScope(c).tenantId;
    const parsed = orderStatusSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { status } = parsed.data;

    // S-H2 style: tenant-scoped existence check (loads current state + room)
    const existing = await c.env.DB.prepare(
      "SELECT id, order_state_id, room_id FROM orders WHERE tenant_id = ? AND id = ?"
    ).bind(tenantId, ordId).first();
    if (!existing) return errorResponse('Order not found', 404);

    const state = await c.env.DB.prepare(
      "SELECT id, paid FROM order_state WHERE id = ?"
    ).bind(status).first();
    if (!state) return errorResponse('Invalid order status', 400);

    // H6 fix: reject illegal lifecycle transitions before writing.
    // NOTE: this check must run AFTER the 404/400 checks above so that
    // "order missing" and "unknown status" keep their original semantics.
    const currentStatus = existing.order_state_id;
    const allowedFrom = currentStatus ? LEGAL_TRANSITIONS[currentStatus] : undefined;
    if (!allowedFrom || !allowedFrom.includes(status)) {
      return errorResponse(
        `Illegal status transition: '${currentStatus ?? 'unknown'}' → '${status}'`,
        409
      );
    }

    // 0067: order transition and its room side-effect commit atomically via
    // one DB.batch (D1 has no conditional abort between statements, but both
    // writes landing or neither is still guaranteed for a single batch unit).
    const stmts = [
      c.env.DB.prepare(
        "UPDATE orders SET order_state_id = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?"
      ).bind(status, tenantId, ordId),
    ];

    const roomStatus = ROOM_STATUS_BY_ORDER_STATUS[status];
    if (roomStatus && existing.room_id) {
      stmts.push(
        c.env.DB.prepare(
          "UPDATE rooms_new SET room_status = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(roomStatus, existing.room_id)
      );
    } else if (status === 'cancelled' && existing.room_id) {
      // Cancelling frees the room — but only when no OTHER active booking
      // still holds it (same guard as the delete paths), and the legacy
      // `status` flag is synced so it can never disagree with room_status.
      stmts.push(
        c.env.DB.prepare(
          `UPDATE rooms_new SET status = 'available', room_status = 'available', updated_at = datetime('now')
           WHERE id = ?
             AND id NOT IN (
               SELECT DISTINCT room_id FROM orders
               WHERE tenant_id = ? AND room_id = ? AND id != ? AND order_state_id != 'cancelled'
             )`
        ).bind(existing.room_id, tenantId, existing.room_id, ordId)
      );
    }

    await c.env.DB.batch(stmts);

    if (state.paid) {
      await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
    }

    return jsonResponse({ success: true, id: ordId, status });
  } catch (e) {
    return errorResponse('Failed to update order status');
  }
});

// ─── PATCH /orders/:id/kitchen-status (0069 Restaurant pillar) ───
// Kitchen fulfillment state machine, SEPARATE from the booking lifecycle
// above. NOTE the spelling: kitchen states use 'canceled' (one L) per the
// 0069 column CHECK — do not confuse with order_state_id's 'cancelled'.
//   pending   → confirmed | canceled
//   confirmed → preparing | canceled
//   preparing → ready     | canceled
//   ready     → served
//   served    → (terminal)
const KITCHEN_TRANSITIONS = {
  pending: ['confirmed', 'canceled'],
  confirmed: ['preparing', 'canceled'],
  preparing: ['ready', 'canceled'],
  ready: ['served'],
  served: [],
};

export const kitchenStatusSchema = z.object({
  // 'canceled' must stay listed even though nothing ever transitions INTO it:
  // canceling a kitchen ticket is a legal client request at any pre-serve step.
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'served', 'canceled'], {
    message: 'Invalid kitchen status',
  }),
}).strip();

ordersRoutes.patch('/:id/kitchen-status', async (c) => {
  try {
    const ordId = c.req.param('id');
    const tenantId = getScope(c).tenantId;
    const parsed = kitchenStatusSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { status } = parsed.data;

    // Tenant-scoped existence check (loads the current kitchen state)
    const existing = await c.env.DB.prepare(
      "SELECT id, kitchen_status FROM orders WHERE tenant_id = ? AND id = ?"
    ).bind(tenantId, ordId).first();
    if (!existing) return errorResponse('Order not found', 404);

    // Reject illegal kitchen transitions before writing. Unknown current
    // states are treated as terminal so corrupted rows can't be silently
    // moved (same policy as PATCH /:id/status).
    const currentStatus = existing.kitchen_status || 'pending';
    const allowedFrom = KITCHEN_TRANSITIONS[currentStatus];
    if (!allowedFrom || !allowedFrom.includes(status)) {
      return errorResponse(
        `Illegal kitchen status transition: '${currentStatus}' → '${status}'`,
        409
      );
    }

    await c.env.DB.prepare(
      "UPDATE orders SET kitchen_status = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?"
    ).bind(status, tenantId, ordId).run();

    // Best-effort audit trail — logAudit swallows its own errors, so a failed
    // audit row can never break the transition response.
    await logAudit(c.env.DB, {
      tenantId,
      userId: getScope(c).user?.id || 'system',
      action: 'update',
      entityType: 'order',
      entityId: ordId,
      oldValues: { kitchen_status: currentStatus },
      newValues: { kitchen_status: status },
    });

    return jsonResponse({ success: true, id: ordId, status });
  } catch (e) {
    return errorResponse('Failed to update kitchen status');
  }
});

ordersRoutes.get('/', async (c) => {
  const url = new URL(c.req.url);
  const tenantId = getScope(c).tenantId;
  const status = url.searchParams.get('status');
  // T6: page/pageSize envelope (clean migration from limit/offset)
  const { page, pageSize, offset } = parsePagination(url);

  let countQuery = "SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?";
  let countBindings = [tenantId];
  // P-M4 fix: Select specific columns instead of SELECT o.*
  let dataQuery = `SELECT o.id, o.tenant_id, o.camp_id, o.room_id, o.customer_id,
    o.order_state_id, o.check_in_date, o.check_out_date,
    o.number_of_people, o.total_amount, o.amount_paid,
    o.payment_status, o.reference, o.created_at,
    c.first_name as customer_first_name, c.last_name as customer_last_name,
    r.name as room_name, osi.name as state_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN rooms_new r ON r.id = o.room_id
    LEFT JOIN order_state_lang osi ON osi.order_state_id = o.order_state_id AND osi.lang = 'en'
    WHERE o.tenant_id = ?`;
  let dataBindings = [tenantId];

  if (status) {
    countQuery += " AND order_state_id = ?";
    countBindings.push(status);
    dataQuery += " AND o.order_state_id = ?";
    dataBindings.push(status);
  }

  const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...countBindings).all();
  const total = countResults[0]?.total || 0;

  dataQuery += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
  dataBindings.push(pageSize, offset);
  const { results } = await c.env.DB.prepare(dataQuery).bind(...dataBindings).all();
  return jsonResponse(paginationEnvelope(results, total, page, pageSize));
});

// 0067: line items / add-ons attached to an order (meals, rentals, extra
// nights…). Tenant-scoped: an unknown or foreign order id is a 404.
ordersRoutes.get('/:id/items', async (c) => {
  try {
    const ordId = c.req.param('id');
    const tenantId = getScope(c).tenantId;

    const { results: existing } = await c.env.DB.prepare(
      "SELECT id FROM orders WHERE tenant_id = ? AND id = ?"
    ).bind(tenantId, ordId).all();
    if (existing.length === 0) return errorResponse('Order not found', 404);

    const { results } = await c.env.DB.prepare(
      "SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC, id ASC"
    ).bind(ordId).all();
    return jsonResponse(results);
  } catch (e) {
    return errorResponse('Failed to fetch order items');
  }
});

ordersRoutes.get('/:id', async (c) => {
  const ordId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.tenant_id, o.camp_id, o.room_id, o.customer_id,
      o.order_state_id, o.check_in_date, o.check_out_date,
      o.number_of_people, o.total_amount, o.amount_paid,
      o.payment_method, o.payment_status, o.reference, o.notes, o.created_at,
      c.first_name as customer_first_name, c.last_name as customer_last_name,
      c.email as customer_email, c.phone as customer_phone,
      r.name as room_name, osi.name as state_name
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN rooms_new r ON r.id = o.room_id
     LEFT JOIN order_state_lang osi ON osi.order_state_id = o.order_state_id AND osi.lang = 'en'
     WHERE o.tenant_id = ? AND o.id = ?`
  ).bind(getScope(c).tenantId, ordId).all();
  if (results.length === 0) return errorResponse('Order not found', 404);
  return jsonResponse(results[0]);
});

ordersRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = orderPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const data = parsed.data;
    const { id, camp_id, room_id, guest_name, guest_email, guest_phone, number_of_people, check_in_date, check_out_date, total_amount, amount_paid, payment_method, payment_status, order_state_id, notes, items, meal_plans } = data;

    const validationError = await validateOrder(c.env, tenantId, null, data);
    if (validationError) return errorResponse(validationError, 400);

    // 0067: when an items array is supplied, the order total is recomputed
    // server-side from the line items (Σ quantity × unit_price) and the
    // client-supplied total_amount is ignored — the backend stays
    // authoritative over pricing. Without items, total_amount passes through.
    const orderItems = Array.isArray(items) ? items : [];
    let effectiveTotal = total_amount || 0;
    if (orderItems.length > 0) {
      effectiveTotal = Math.round(
        orderItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0) * 100
      ) / 100;
    }

    const ordId = id || 'ord_' + crypto.randomUUID().slice(0, 12); // L1 fix
    const reference = generateReference();
    const customerId = await findOrCreateCustomer(c.env, tenantId, guest_name, guest_email, guest_phone);

    // H1 fix: race-safe booking. validateOrder above is only advisory — two
    // concurrent requests can both pass it and double-book the room. The
    // INSERT below re-checks availability *inside* the write itself via
    // `WHERE NOT EXISTS` (mirroring validateOrder's exact overlap predicate),
    // so at most one of the racing requests inserts a row. Executed through
    // DB.batch for a single transactional unit; `meta.changes === 0` means
    // the guard blocked the insert → 409.
    // NOTE: a naive [SELECT COUNT, INSERT] batch would NOT be safe — D1 has no
    // conditional abort between statements, so both statements would commit.
    const insertStmt = c.env.DB.prepare(
      `INSERT INTO orders (id, tenant_id, camp_id, room_id, customer_id, order_state_id, check_in_date, check_out_date, number_of_people, total_amount, amount_paid, payment_method, payment_status, reference, notes, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
       WHERE NOT EXISTS (
         SELECT 1 FROM orders
          WHERE tenant_id = ? AND room_id = ?
            AND (check_in_date < ? AND check_out_date > ?)
            AND order_state_id != 'cancelled'
       )`
    ).bind(
      ordId, tenantId, camp_id, room_id, customerId, order_state_id || 'pending',
      check_in_date, check_out_date, number_of_people || 1,
      effectiveTotal, amount_paid || 0, payment_method || null, payment_status || null,
      reference, notes || null,
      tenantId, room_id, check_out_date, check_in_date
    );
    const [insertResult] = await c.env.DB.batch([insertStmt]);
    if (!insertResult?.meta || insertResult.meta.changes === 0) {
      return errorResponse('Room no longer available', 409);
    }

    // 0067: persist line items only AFTER the guarded order INSERT succeeds —
    // a second DB.batch (not the same one) because D1 has no conditional abort
    // between batch statements: a lost-race 409 must not leave orphaned items.
    if (orderItems.length > 0) {
      const itemStmts = orderItems.map((it) => c.env.DB.prepare(
        `INSERT INTO order_items (id, order_id, type, reference_id, name, quantity, unit_price, total_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        'oi_' + crypto.randomUUID().slice(0, 12), // L1 fix
        ordId,
        it.type,
        null, // reference_id reserved for future product/meal linkage
        it.name,
        it.quantity,
        it.unit_price,
        Math.round(it.quantity * it.unit_price * 100) / 100
      ));
      await c.env.DB.batch(itemStmts);
    }

    // ── Meal plans (0070): create order_items + POS transactions for kitchen ──
    const mealPlanList = meal_plans || [];
    if (mealPlanList.length > 0) {
      const productIds = mealPlanList.map(mp => mp.product_id);
      const placeholders = productIds.map(() => '?').join(',');
      const { results: products } = await c.env.DB.prepare(
        `SELECT id, name, selling_price FROM pos_products WHERE id IN (${placeholders})`
      ).bind(...productIds).all();

      const productMap = new Map(products.map(p => [p.id, p]));

      const { results: orgMapping } = await c.env.DB.prepare(
        'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
      ).bind(tenantId).all();
      const organizationId = orgMapping.length > 0 ? orgMapping[0].organization_id : null;

      const itemStmts = [];
      const posStmts = [];
      let mealPlanTotal = 0;

      for (const mp of mealPlanList) {
        const product = productMap.get(mp.product_id);
        if (!product) continue;
        const unitPrice = parseFloat(product.selling_price || 0);
        const lineTotal = unitPrice * mp.quantity;
        mealPlanTotal += lineTotal;

        itemStmts.push(c.env.DB.prepare(
          `INSERT INTO order_items (id, order_id, type, reference_id, name, quantity, unit_price, total_price, created_at)
           VALUES (?, ?, 'meal_plan', ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          'oi_' + crypto.randomUUID().slice(0, 12), ordId, mp.product_id,
          product.name, mp.quantity, unitPrice, lineTotal
        ));

        if (organizationId) {
          const posOrderId = 'pot_' + crypto.randomUUID().slice(0, 12);
          posStmts.push(c.env.DB.prepare(
            `INSERT INTO pos_transactions
             (id, tenant_id, organization_id, store_id, order_number, cashier_id,
              status, subtotal, tax_amount, tax_rate, total_amount,
              paid_amount, payment_method, payment_status, notes,
              kitchen_status, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?, 'completed', ?, 0, 0, ?, ?, 'booking', 'completed', ?, 'confirmed', datetime('now'), datetime('now'))`
          ).bind(
            posOrderId, tenantId, organizationId,
            'MP-' + reference, 'system', lineTotal, lineTotal,
            `Meal plan for booking ${reference}: ${product.name}`
          ));
        }
      }

      if (mealPlanTotal > 0) {
        itemStmts.push(c.env.DB.prepare(
          `UPDATE orders SET total_amount = total_amount + ? WHERE id = ?`
        ).bind(mealPlanTotal, ordId));
      }

      if (itemStmts.length > 0) await c.env.DB.batch(itemStmts);
      if (posStmts.length > 0) await c.env.DB.batch(posStmts);
    }

    if (order_state_id) {
      const { results: osResult } = await c.env.DB.prepare(
        "SELECT paid FROM order_state WHERE id = ?"
      ).bind(order_state_id).all();
      if (osResult.length > 0 && osResult[0].paid) {
        await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
      }
    }

    // T5a: push a live `new-booking` event to the tenant's admin dashboards.
    broadcastNewBooking(c.env, tenantId, { id: ordId, camp_id, check_in_date, check_out_date });

    return jsonResponse({ id: ordId, reference, success: true, customer_id: customerId });
  } catch (e) {
    return errorResponse('Failed to create order');
  }
});

ordersRoutes.put('/:id', async (c) => {
  try {
    const ordId = c.req.param('id');
    const tenantId = getScope(c).tenantId;
    const parsed = orderPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const data = parsed.data;
    const { camp_id, room_id, guest_name, guest_email, guest_phone, number_of_people, check_in_date, check_out_date, total_amount, amount_paid, payment_method, payment_status, order_state_id, notes } = data;

    const validationError = await validateOrder(c.env, tenantId, ordId, data);
    if (validationError) return errorResponse(validationError, 400);

    // S-H2 fix: Add tenant_id scoping to old order lookup
    const { results: oldResult } = await c.env.DB.prepare(
      "SELECT room_id, customer_id FROM orders WHERE tenant_id = ? AND id = ?"
    ).bind(tenantId, ordId).all();
    const oldOrder = oldResult[0];
    const oldCustomerId = oldOrder ? oldOrder.customer_id : null;

    const newCustomerId = await updateOrCreateCustomer(c.env, tenantId, oldCustomerId, guest_name, guest_email, guest_phone);

    await c.env.DB.prepare(
      `UPDATE orders SET
        camp_id = COALESCE(?, camp_id),
        room_id = COALESCE(?, room_id),
        customer_id = COALESCE(?, customer_id),
        number_of_people = COALESCE(?, number_of_people),
        check_in_date = COALESCE(?, check_in_date),
        check_out_date = COALESCE(?, check_out_date),
        total_amount = COALESCE(?, total_amount),
        amount_paid = COALESCE(?, amount_paid),
        payment_method = COALESCE(?, payment_method),
        payment_status = COALESCE(?, payment_status),
        order_state_id = COALESCE(?, order_state_id),
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`
    ).bind(
      camp_id || null, room_id || null, newCustomerId || null, number_of_people !== undefined ? number_of_people : null,
      check_in_date || null, check_out_date || null, total_amount !== undefined ? total_amount : null, amount_paid !== undefined ? amount_paid : null,
      payment_method !== undefined ? payment_method : null, payment_status !== undefined ? payment_status : null, order_state_id || null, notes !== undefined ? notes : null,
      tenantId, ordId
    ).run();

    if (order_state_id) {
      const { results: osRes } = await c.env.DB.prepare(
        "SELECT paid FROM order_state WHERE id = ?"
      ).bind(order_state_id).all();
      if (osRes.length > 0 && osRes[0].paid) {
        await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
      }
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update order');
  }
});

ordersRoutes.delete('/:id', async (c) => {
  try {
    const ordId = c.req.param('id');
    const tenantId = getScope(c).tenantId;

    const { results: ordResult } = await c.env.DB.prepare("SELECT room_id FROM orders WHERE tenant_id = ? AND id = ?").bind(tenantId, ordId).all();
    const order = ordResult[0];

    if (order) {
      const { results: others } = await c.env.DB.prepare("SELECT id FROM orders WHERE tenant_id = ? AND id != ? AND room_id = ? AND order_state_id != 'cancelled'").bind(tenantId, ordId, order.room_id).all();
      if (others.length === 0) {
        // Only set available if no other active orders exist (exclude cancelled).
        // 0067: keep BOTH the legacy `status` flag and `room_status` in sync.
        await c.env.DB.prepare("UPDATE rooms_new SET status = 'available', room_status = 'available', updated_at = datetime('now') WHERE id = ?").bind(order.room_id).run();
      }
    }

    // Phase 3 cascade: booking read-acks reference the deleted order.
    await c.env.DB.prepare("DELETE FROM inbox_reads WHERE tenant_id = ? AND ref_type = 'booking' AND ref_id = ?").bind(tenantId, ordId).run();
    await c.env.DB.prepare("DELETE FROM orders WHERE tenant_id = ? AND id = ?").bind(tenantId, ordId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete order');
  }
});

ordersRoutes.patch('/:id/checkin', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const orderId = c.req.param('id');
    const { early_checkin, adult_count, child_count, room_id } = await c.req.json();

    const order = await c.env.DB.prepare(
      'SELECT id, room_id, camp_id FROM orders WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, orderId).first();
    if (!order) return errorResponse('Order not found', 404);

    let assignedRoomId = room_id || order.room_id;
    if (!assignedRoomId) {
      const available = await c.env.DB.prepare(
        `SELECT rn.id FROM rooms_new rn
         WHERE rn.camp_id IN (SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL)
         AND rn.status = 'available'
         AND rn.id NOT IN (
           SELECT room_id FROM orders
           WHERE room_id IS NOT NULL
           AND check_in_date < (SELECT check_out_date FROM orders WHERE id = ?)
           AND check_out_date > (SELECT check_in_date FROM orders WHERE id = ?)
           AND order_state_id != 'cancelled'
         )
         LIMIT 1`
      ).bind(tenantId, orderId, orderId).first();
      if (available) assignedRoomId = available.id;
    }

    const updateParts = ['early_checkin = ?', 'adult_count = ?', 'child_count = ?', 'updated_at = datetime(\'now\')'];
    const updateParams = [early_checkin ? 1 : 0, adult_count || 1, child_count || 0];
    if (assignedRoomId) {
      updateParts.push('room_id = ?');
      updateParams.push(assignedRoomId);
    }
    updateParams.push(tenantId, orderId);

    await c.env.DB.prepare(
      `UPDATE orders SET ${updateParts.join(', ')} WHERE tenant_id = ? AND id = ?`
    ).bind(...updateParams).run();

    if (assignedRoomId) {
      await c.env.DB.prepare(
        "UPDATE rooms_new SET status = 'occupied', room_status = 'occupied', updated_at = datetime('now') WHERE id = ?"
      ).bind(assignedRoomId).run();
    }

    return jsonResponse({ success: true, room_id: assignedRoomId });
  } catch (e) {
    return errorResponse('Failed to check in');
  }
});

ordersRoutes.patch('/:id/checkout', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const orderId = c.req.param('id');
    const { late_checkout } = await c.req.json();

    const order = await c.env.DB.prepare(
      'SELECT id, room_id FROM orders WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, orderId).first();
    if (!order) return errorResponse('Order not found', 404);

    let extraCharge = 0;
    if (late_checkout) {
      extraCharge = 25;
      await c.env.DB.prepare(
        'UPDATE orders SET late_checkout = 1, extra_guest_charge = extra_guest_charge + ? WHERE id = ?'
      ).bind(extraCharge, orderId).run();
    }

    if (order.room_id) {
      await c.env.DB.prepare(
        "UPDATE rooms_new SET status = 'available', room_status = 'available', cleaning_status = 'dirty', updated_at = datetime('now') WHERE id = ?"
      ).bind(order.room_id).run();
    }

    return jsonResponse({ success: true, late_checkout: !!late_checkout, extra_charge: extraCharge });
  } catch (e) {
    return errorResponse('Failed to check out');
  }
});

ordersRoutes.patch('/:id/course', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const orderId = c.req.param('id');
    const { item_id, course_number, course_status } = await c.req.json();
    const validStatuses = ['pending', 'served', 'completed'];
    const validCourses = [0, 1, 2, 3]; // 0=none, 1=appetizer, 2=main, 3=dessert
    if (course_status && !validStatuses.includes(course_status)) return errorResponse('Invalid course status', 400);
    if (course_number !== undefined && !validCourses.includes(course_number)) return errorResponse('Invalid course number', 400);
    if (item_id) {
      const updates = [];
      const params = [];
      if (course_number !== undefined) { updates.push('course_number = ?'); params.push(course_number); }
      if (course_status) { updates.push('course_status = ?'); params.push(course_status); }
      if (updates.length === 0) return errorResponse('Nothing to update', 400);
      params.push(item_id, orderId, tenantId);
      await c.env.DB.prepare(
        `UPDATE order_items SET ${updates.join(', ')} WHERE id = ? AND order_id = ? AND tenant_id = ?`
      ).bind(...params).run();
    } else {
      if (course_number === undefined || !course_status) return errorResponse('course_number and course_status required for bulk update', 400);
      await c.env.DB.prepare(
        'UPDATE order_items SET course_status = ? WHERE course_number = ? AND order_id = ? AND tenant_id = ?'
      ).bind(course_status, course_number, orderId, tenantId).run();
    }
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update course status');
  }
});

ordersRoutes.patch('/:id/tip', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const orderId = c.req.param('id');
    const { tip_amount, tip_method } = await c.req.json();
    if (typeof tip_amount !== 'number' || tip_amount < 0) return errorResponse('Invalid tip amount', 400);
    const result = await c.env.DB.prepare(
      'UPDATE orders SET tip_amount = ?, tip_method = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?'
    ).bind(tip_amount, tip_method || null, orderId, tenantId).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse('Order not found', 404);
    return jsonResponse({ success: true, tip_amount, tip_method });
  } catch (e) {
    return errorResponse('Failed to add tip');
  }
});

ordersRoutes.patch('/:id/split', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const orderId = c.req.param('id');
    const { split_count } = await c.req.json();
    if (!split_count || split_count < 1 || split_count > 20) return errorResponse('split_count must be 1-20', 400);
    const order = await c.env.DB.prepare(
      'SELECT id, total_amount, tip_amount FROM orders WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, orderId).first();
    if (!order) return errorResponse('Order not found', 404);
    await c.env.DB.prepare(
      'UPDATE orders SET split_count = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?'
    ).bind(split_count, orderId, tenantId).run();
    const perGroupAmount = Math.round(((order.total_amount + (order.tip_amount || 0)) / split_count) * 100) / 100;
    return jsonResponse({ success: true, split_count, per_group_amount: perGroupAmount });
  } catch (e) {
    return errorResponse('Failed to split bill');
  }
});

ordersRoutes.get('/:id/split-details', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const orderId = c.req.param('id');
    const order = await c.env.DB.prepare(
      'SELECT id, total_amount, tip_amount, tip_method, split_count FROM orders WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, orderId).first();
    if (!order) return errorResponse('Order not found', 404);
    const { results: items } = await c.env.DB.prepare(
      'SELECT id, name, quantity, unit_price, split_group FROM order_items WHERE order_id = ? AND tenant_id = ?'
    ).bind(orderId, tenantId).all();
    const splitCount = order.split_count || 1;
    const perGroupAmount = Math.round(((order.total_amount + (order.tip_amount || 0)) / splitCount) * 100) / 100;
    return jsonResponse({
      order_id: orderId,
      total_amount: order.total_amount,
      tip_amount: order.tip_amount || 0,
      tip_method: order.tip_method,
      split_count: splitCount,
      per_group_amount: perGroupAmount,
      items,
    });
  } catch (e) {
    return errorResponse('Failed to get split details');
  }
});

ordersRoutes.all('*', () => errorResponse('Method not allowed', 405));

/**
 * /api/availability sub-router (Phase 4 T1) — entirely public.
 */
export const availabilityRoutes = new Hono();

availabilityRoutes.get('/', async (c) => {
  const url = new URL(c.req.url);
  const tenantId = getScope(c).tenantId;
  const checkIn = url.searchParams.get('checkIn');
  const checkOut = url.searchParams.get('checkOut');
  const productId = url.searchParams.get('productId');

  if (!checkIn || !checkOut) {
    return errorResponse('checkIn and checkOut parameters are required');
  }

  try {
    // P-H4 fix: Use NOT EXISTS instead of NOT IN for better performance
    let query = `
      SELECT rn.id, rn.name AS room_name, rn.product_id
      FROM rooms_new rn
      WHERE rn.camp_id IN (SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.room_id = rn.id
        AND o.check_in_date < ?
        AND o.check_out_date > ?
        AND o.order_state_id != 'cancelled'
      )
    `;
    let bindArgs = [tenantId, checkOut, checkIn];

    if (productId) {
      query += " AND rn.product_id = ?";
      bindArgs.push(productId);
    }

    const { results } = await c.env.DB.prepare(query).bind(...bindArgs).all();

    const availabilityMap = {};
    results.forEach(r => {
      if (!availabilityMap[r.product_id]) {
        availabilityMap[r.product_id] = {
          product_id: r.product_id,
          available_count: 0,
          rooms: []
        };
      }
      availabilityMap[r.product_id].available_count++;
      availabilityMap[r.product_id].rooms.push({ id: r.id, name: r.room_name });
    });

    if (productId) {
      const pData = availabilityMap[productId] || { product_id: productId, available_count: 0, rooms: [] };
      return cachedJsonResponse({
        available: pData.available_count > 0,
        available_count: pData.available_count,
        rooms: pData.rooms
      }, 60);
    }

    return cachedJsonResponse({
      availability: Object.values(availabilityMap)
    }, 60);
  } catch (e) {
    return errorResponse('Failed to check availability');
  }
});

availabilityRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default ordersRoutes;
