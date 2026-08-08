import { jsonResponse, cachedJsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { z } from 'zod';

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

export async function handleOrdersRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  // P-L1 fix: Removed PRAGMA foreign_keys = ON (D1 doesn't support PRAGMA)

  if (method === 'GET' && path.length === 3 && path[2] === 'calculate-price') {
    const roomId = url.searchParams.get('roomId');
    const checkInStr = url.searchParams.get('checkIn');
    const checkOutStr = url.searchParams.get('checkOut');

    if (!roomId || !checkInStr || !checkOutStr) {
      return jsonResponse({ total_price: 0 });
    }

    const totalPrice = await calculatePriceOnServer(env, tenantId, roomId, checkInStr, checkOutStr);
    return jsonResponse({ total_price: totalPrice });
  }

  // Public order status lookup by reference code (no auth required)
  if (method === 'GET' && path.length === 4 && path[2] === 'status') {
    const ref = path[3];
    try {
      const order = await env.DB.prepare(
        `SELECT o.id, o.reference, o.guest_name, o.check_in_date, o.check_out_date,
                o.total_amount, o.amount_paid, o.payment_status, o.payment_method,
                os.name as state_name, r.name as room_name
         FROM orders o
         LEFT JOIN order_state os ON o.order_state_id = os.id
         LEFT JOIN rooms_new r ON o.room_id = r.id
         WHERE o.tenant_id = ? AND o.reference = ?`
      ).bind(tenantId, ref).first();

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
  }

  if (method === 'POST' && path.length === 3 && path[2] === 'bulk-delete') {
    try {
      const { ids } = toSnake(await request.json());
      if (!Array.isArray(ids) || ids.length === 0) return errorResponse('Order IDs array is required', 400);

      const placeholders = ids.map(() => '?').join(',');

      const { results: orderList } = await env.DB.prepare(
        `SELECT room_id FROM orders WHERE tenant_id = ? AND id IN (${placeholders})`
      ).bind(tenantId, ...ids).all();

      await env.DB.prepare(`DELETE FROM orders WHERE tenant_id = ? AND id IN (${placeholders})`).bind(tenantId, ...ids).run();

      // P-H3 fix: Batch room status updates instead of per-order loop
      const roomIds = [...new Set(orderList.map(o => o.room_id).filter(Boolean))];
      if (roomIds.length > 0) {
        const roomPh = roomIds.map(() => '?').join(',');
        const orderPh = ids.map(() => '?').join(',');
        // Update rooms to available only if they have no remaining orders
        await env.DB.prepare(
          `UPDATE rooms_new SET status = 'available', updated_at = datetime('now')
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
  }

  // T5: PATCH /orders/:id/status — status-only partial update (dedicated route)
  if (method === 'PATCH' && path.length === 4 && path[3] === 'status') {
    try {
      const ordId = path[2];
      const parsed = orderStatusSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { status } = parsed.data;

      // S-H2 style: tenant-scoped existence check
      const existing = await env.DB.prepare(
        "SELECT id FROM orders WHERE tenant_id = ? AND id = ?"
      ).bind(tenantId, ordId).first();
      if (!existing) return errorResponse('Order not found', 404);

      const state = await env.DB.prepare(
        "SELECT id, paid FROM order_state WHERE id = ?"
      ).bind(status).first();
      if (!state) return errorResponse('Invalid order status', 400);

      await env.DB.prepare(
        "UPDATE orders SET order_state_id = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?"
      ).bind(status, tenantId, ordId).run();

      if (state.paid) {
        await env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
      }

      return jsonResponse({ success: true, id: ordId, status });
    } catch (e) {
      return errorResponse('Failed to update order status');
    }
  }

  if (method === 'GET') {
    if (path.length === 2) {
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

      const { results: countResults } = await env.DB.prepare(countQuery).bind(...countBindings).all();
      const total = countResults[0]?.total || 0;

      dataQuery += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
      dataBindings.push(pageSize, offset);
      const { results } = await env.DB.prepare(dataQuery).bind(...dataBindings).all();
      return jsonResponse(paginationEnvelope(results, total, page, pageSize));
    } else {
      const { results } = await env.DB.prepare(
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
      ).bind(tenantId, path[2]).all();
      if (results.length === 0) return errorResponse('Order not found', 404);
      return jsonResponse(results[0]);
    }
  } else if (method === 'POST') {
    try {
      const parsed = orderPostSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const data = parsed.data;
      const { id, camp_id, room_id, guest_name, guest_email, guest_phone, number_of_people, check_in_date, check_out_date, total_amount, amount_paid, payment_method, payment_status, order_state_id, notes } = data;

      const validationError = await validateOrder(env, tenantId, null, data);
      if (validationError) return errorResponse(validationError, 400);

      const ordId = id || 'ord_' + crypto.randomUUID().slice(0, 12); // L1 fix
      const reference = generateReference();
      const customerId = await findOrCreateCustomer(env, tenantId, guest_name, guest_email, guest_phone);

      await env.DB.prepare(
        `INSERT INTO orders (id, tenant_id, camp_id, room_id, customer_id, order_state_id, check_in_date, check_out_date, number_of_people, total_amount, amount_paid, payment_method, payment_status, reference, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(ordId, tenantId, camp_id, room_id, customerId, order_state_id || 'pending', check_in_date, check_out_date, number_of_people || 1, total_amount || 0, amount_paid || 0, payment_method || null, payment_status || null, reference, notes || null).run();

      if (order_state_id) {
        const { results: osResult } = await env.DB.prepare(
          "SELECT paid FROM order_state WHERE id = ?"
        ).bind(order_state_id).all();
        if (osResult.length > 0 && osResult[0].paid) {
          await env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
        }
      }

      // T5a: push a live `new-booking` event to the tenant's admin dashboards.
      broadcastNewBooking(env, tenantId, { id: ordId, camp_id, check_in_date, check_out_date });

      return jsonResponse({ id: ordId, reference, success: true, customer_id: customerId });
    } catch (e) {
      return errorResponse('Failed to create order');
    }
  } else if (method === 'PUT') {
    try {
      const ordId = path[2];
      const parsed = orderPutSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const data = parsed.data;
      const { camp_id, room_id, guest_name, guest_email, guest_phone, number_of_people, check_in_date, check_out_date, total_amount, amount_paid, payment_method, payment_status, order_state_id, notes } = data;

      const validationError = await validateOrder(env, tenantId, ordId, data);
      if (validationError) return errorResponse(validationError, 400);

      // S-H2 fix: Add tenant_id scoping to old order lookup
      const { results: oldResult } = await env.DB.prepare(
        "SELECT room_id, customer_id FROM orders WHERE tenant_id = ? AND id = ?"
      ).bind(tenantId, ordId).all();
      const oldOrder = oldResult[0];
      const oldRoomId = oldOrder ? oldOrder.room_id : null;
      const oldCustomerId = oldOrder ? oldOrder.customer_id : null;

      const newCustomerId = await updateOrCreateCustomer(env, tenantId, oldCustomerId, guest_name, guest_email, guest_phone);

      await env.DB.prepare(
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
        const { results: osRes } = await env.DB.prepare(
          "SELECT paid FROM order_state WHERE id = ?"
        ).bind(order_state_id).all();
        if (osRes.length > 0 && osRes[0].paid) {
          await env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(ordId).run();
        }
      }

      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to update order');
    }
  } else if (method === 'DELETE') {
    try {
      const ordId = path[2];

      const { results: ordResult } = await env.DB.prepare("SELECT room_id FROM orders WHERE tenant_id = ? AND id = ?").bind(tenantId, ordId).all();
      const order = ordResult[0];

      if (order) {
        const { results: others } = await env.DB.prepare("SELECT id FROM orders WHERE tenant_id = ? AND id != ? AND room_id = ? AND order_state_id != 'cancelled'").bind(tenantId, ordId, order.room_id).all();
        if (others.length === 0) {
          // Only set available if no other active orders exist (exclude cancelled)
          await env.DB.prepare("UPDATE rooms_new SET status = 'available', updated_at = datetime('now') WHERE id = ?").bind(order.room_id).run();
        }
      }

      await env.DB.prepare("DELETE FROM orders WHERE tenant_id = ? AND id = ?").bind(tenantId, ordId).run();
      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to delete order');
    }
  }
  return errorResponse('Method not allowed', 405);
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
    "SELECT r.max_guests, p.selling_price AS base_price FROM rooms_new r JOIN pos_products p ON r.product_id = p.id JOIN camps c ON r.camp_id = c.id WHERE r.id = ? AND c.tenant_id = ?"
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

  return null;
}

async function calculatePriceOnServer(env, tenantId, roomId, checkInDate, checkOutDate) {
  // S-H1 fix: Add tenant_id scoping to room and product lookups
  const { results: roomResult } = await env.DB.prepare(
    "SELECT r.product_id FROM rooms_new r JOIN camps c ON r.camp_id = c.id WHERE r.id = ? AND c.tenant_id = ?"
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

export async function handleAvailability(request, env, tenantId) {
  const url = new URL(request.url);
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
      WHERE rn.camp_id IN (SELECT id FROM camps WHERE tenant_id = ?)
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

    const { results } = await env.DB.prepare(query).bind(...bindArgs).all();

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
}
