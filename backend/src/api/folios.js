import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';

const CHARGE_SOURCES = ['room', 'restaurant', 'spa', 'shop', 'other'];
const FOLIO_STATUSES = ['open', 'settled', 'voided'];
const SETTLE_METHODS = ['cash', 'card', 'split'];

export const folioCreateSchema = z.object({
  guest_id: z.string().min(1).optional(),
  primary_order_id: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
}).strip();

export const folioChargeSchema = z.object({
  source: z.enum(CHARGE_SOURCES),
  description: z.string().min(1, 'Description is required').max(1000),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().min(0).default(0),
  project_id: z.string().min(1).optional(),
  reference_id: z.string().max(128).optional(),
}).strip();

export const folioSettleSchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  method: z.enum(SETTLE_METHODS),
  amount_cash: z.number().min(0).optional(),
  amount_card: z.number().min(0).optional(),
  approved_by: z.string().max(128).optional(),
  reference: z.string().max(128).optional(),
  notes: z.string().max(2000).optional(),
}).strip();

export const folioVoidSchema = z.object({
  reason: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
}).strip();

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function newId(prefix) {
  return `${prefix}_` + crypto.randomUUID().slice(0, 12);
}

/**
 * Mutation gate for POST /:id/void — admin tier only.
 * Mirrors pos-tables assertAdminMutation (admin | super_admin).
 */
function assertAdminMutation(c) {
  const scope = getScope(c);
  if (!scope.user) {
    return errorResponse('Unauthorized: missing tenant context', 401);
  }
  if (!scope.tenantId) {
    return errorResponse('Tenant context required', 401);
  }
  if (!['admin', 'super_admin'].includes(scope.user.role)) {
    return errorResponse('Forbidden: admin role required', 403);
  }
  return true;
}

/**
 * Guest folio sub-router (B.3 lifecycle).
 *
 * Mounted by index.js as:
 *   app.use('/api/folios', resolveScope());
 *   app.use('/api/folios/*', resolveScope());
 *   app.route('/api/folios', foliosRoutes);
 *
 * Tenant-admin scope like orders (admin realm). Cross-tenant reads/writes
 * return 404 (never 403) via tenant-scoped predicates. Every multi-write
 * commits through a single DB.batch. No row deletes anywhere — voids are
 * status flips / voided_at stamps.
 */
const foliosRoutes = new Hono();

// ── POST /api/folios — open a folio ─────────────────────────────
foliosRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const parsed = folioCreateSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) return validationError(parsed);
    const { guest_id: bodyGuestId, primary_order_id: primaryOrderId, notes } = parsed.data;

    // guest_id derives from the order's customer_id when an order is linked;
    // nullable — a folio may exist with no guest (walk-in / unlinked).
    let guestId = bodyGuestId ?? null;
    if (primaryOrderId) {
      const order = await c.env.DB.prepare(
        'SELECT customer_id FROM orders WHERE tenant_id = ? AND id = ?'
      ).bind(tenantId, primaryOrderId).first();
      if (!order) return errorResponse('Order not found', 404);
      guestId = guestId ?? order.customer_id ?? null;
    }

    const id = newId('folio');
    await c.env.DB.prepare(
      `INSERT INTO folios (id, tenant_id, guest_id, primary_order_id, status, total_amount, notes)
       VALUES (?, ?, ?, ?, 'open', 0, ?)`
    ).bind(id, tenantId, guestId, primaryOrderId || null, notes || null).run();

    return jsonResponse({
      success: true, id, status: 'open', guest_id: guestId,
      primary_order_id: primaryOrderId || null, total_amount: 0,
    }, 201);
  } catch (e) {
    return errorResponse('Failed to create folio', 500);
  }
});

// ── GET /api/folios — list + counts ─────────────────────────────
foliosRoutes.get('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const url = new URL(c.req.url);
    const status = url.searchParams.get('status');
    const guest = url.searchParams.get('guest') || url.searchParams.get('guest_id');
    const date = url.searchParams.get('date');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    if (status && !FOLIO_STATUSES.includes(status)) {
      return errorResponse('Invalid status filter', 400);
    }

    const filters = ['tenant_id = ?'];
    const binds = [tenantId];
    if (status) { filters.push('status = ?'); binds.push(status); }
    if (guest) { filters.push('guest_id = ?'); binds.push(guest); }
    if (date) { filters.push("DATE(opened_at) = DATE(?)"); binds.push(date); }
    const where = `WHERE ${filters.join(' AND ')}`;

    // Tenant-wide status breakdown (independent of list filters).
    const { results: countRows } = await c.env.DB.prepare(
      'SELECT status, COUNT(*) AS count FROM folios WHERE tenant_id = ? GROUP BY status'
    ).bind(tenantId).all();
    const counts = { open: 0, settled: 0, voided: 0, total: 0 };
    for (const r of countRows || []) {
      if (r.status in counts) counts[r.status] = r.count;
      counts.total += r.count;
    }

    const totalRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM folios ${where}`
    ).bind(...binds).first();
    const total = totalRow?.count ?? 0;

    const { results: rows } = await c.env.DB.prepare(
      `SELECT * FROM folios ${where} ORDER BY opened_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all();

    return jsonResponse({ folios: rows || [], counts, total, limit, offset });
  } catch (e) {
    return errorResponse('Failed to list folios', 500);
  }
});

// ── GET /api/folios/:id — folio + charges + settlements ─────────
foliosRoutes.get('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const folioId = c.req.param('id');
    const folio = await c.env.DB.prepare(
      'SELECT * FROM folios WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, folioId).first();
    if (!folio) return errorResponse('Folio not found', 404);

    const { results: charges } = await c.env.DB.prepare(
      'SELECT * FROM folio_charges WHERE tenant_id = ? AND folio_id = ? ORDER BY posted_at ASC, id ASC'
    ).bind(tenantId, folioId).all();
    const { results: settlements } = await c.env.DB.prepare(
      'SELECT * FROM folio_settlements WHERE tenant_id = ? AND folio_id = ? ORDER BY created_at ASC, id ASC'
    ).bind(tenantId, folioId).all();

    return jsonResponse({ folio, charges: charges || [], settlements: settlements || [] });
  } catch (e) {
    return errorResponse('Failed to load folio', 500);
  }
});

// ── POST /api/folios/:id/charges — post a charge ────────────────
foliosRoutes.post('/:id/charges', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const folioId = c.req.param('id');
    const folio = await c.env.DB.prepare(
      'SELECT * FROM folios WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, folioId).first();
    if (!folio) return errorResponse('Folio not found', 404);
    if (folio.status !== 'open') return errorResponse('Folio is not open', 409);

    const parsed = folioChargeSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) return validationError(parsed);
    const { source, description, quantity, unit_price: unitPrice, project_id: projectId, reference_id: referenceId } = parsed.data;
    const totalPrice = round2(quantity * unitPrice);

    const chargeId = newId('chg');
    const insertStmt = c.env.DB.prepare(
      `INSERT INTO folio_charges
         (id, folio_id, tenant_id, project_id, source, reference_id, description, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(chargeId, folioId, tenantId, projectId || null, source, referenceId || null, description, quantity, unitPrice, totalPrice);
    const updateStmt = c.env.DB.prepare(
      'UPDATE folios SET total_amount = total_amount + ? WHERE tenant_id = ? AND id = ?'
    ).bind(totalPrice, tenantId, folioId);
    await c.env.DB.batch([insertStmt, updateStmt]);

    return jsonResponse({
      success: true, id: chargeId, folio_id: folioId,
      source, description, quantity, unit_price: unitPrice, total_price: totalPrice,
      total_amount: round2(Number(folio.total_amount || 0) + totalPrice),
    }, 201);
  } catch (e) {
    return errorResponse('Failed to post charge', 500);
  }
});

// ── DELETE /api/folios/:id/charges/:chargeId — soft void ────────
foliosRoutes.delete('/:id/charges/:chargeId', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const folioId = c.req.param('id');
    const chargeId = c.req.param('chargeId');
    const folio = await c.env.DB.prepare(
      'SELECT * FROM folios WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, folioId).first();
    if (!folio) return errorResponse('Folio not found', 404);
    if (folio.status !== 'open') return errorResponse('Folio is not open', 409);

    const charge = await c.env.DB.prepare(
      'SELECT * FROM folio_charges WHERE tenant_id = ? AND folio_id = ? AND id = ?'
    ).bind(tenantId, folioId, chargeId).first();
    if (!charge) return errorResponse('Charge not found', 404);
    if (charge.voided_at) return errorResponse('Charge already voided', 409);

    const voidedBy = getScope(c).user?.userId || getScope(c).user?.sub || 'system';
    const newTotal = Math.max(0, round2(Number(folio.total_amount || 0) - Number(charge.total_price || 0)));

    const voidStmt = c.env.DB.prepare(
      "UPDATE folio_charges SET voided_at = datetime('now'), voided_by = ? WHERE tenant_id = ? AND folio_id = ? AND id = ?"
    ).bind(voidedBy, tenantId, folioId, chargeId);
    const updateStmt = c.env.DB.prepare(
      'UPDATE folios SET total_amount = ? WHERE tenant_id = ? AND id = ?'
    ).bind(newTotal, tenantId, folioId);
    await c.env.DB.batch([voidStmt, updateStmt]);

    return jsonResponse({ success: true, id: chargeId, folio_id: folioId, total_amount: newTotal });
  } catch (e) {
    return errorResponse('Failed to void charge', 500);
  }
});

// ── POST /api/folios/:id/settle — cash/card/split settlement ────
foliosRoutes.post('/:id/settle', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    const folioId = c.req.param('id');
    const folio = await c.env.DB.prepare(
      'SELECT * FROM folios WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, folioId).first();
    if (!folio) return errorResponse('Folio not found', 404);
    if (folio.status !== 'open') return errorResponse('Folio is not open', 409);

    const parsed = folioSettleSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) return validationError(parsed);
    const { amount, method } = parsed.data;
    let { amount_cash: amountCash, amount_card: amountCard } = parsed.data;

    if (method === 'split') {
      if (typeof amountCash !== 'number' || typeof amountCard !== 'number') {
        return errorResponse('Split settlement requires amount_cash and amount_card', 400);
      }
      if (Math.abs(round2(amountCash + amountCard) - round2(amount)) > 0.01) {
        return errorResponse(
          `Split settlement sum (${round2(amountCash + amountCard).toFixed(2)}) does not match amount (${round2(amount).toFixed(2)})`,
          400
        );
      }
    } else if (method === 'card') {
      amountCash = 0;
      amountCard = amount;
    } else {
      amountCash = amount;
      amountCard = 0;
    }

    const total = Number(folio.total_amount) || 0;
    if (Math.abs(round2(amount) - round2(total)) > 0.01) {
      return errorResponse(
        `Settlement amount (${round2(amount).toFixed(2)}) must equal folio total (${round2(total).toFixed(2)})`,
        400
      );
    }

    const receivedBy = getScope(c).user?.userId || getScope(c).user?.sub || 'system';
    const settlementId = newId('stl');
    const { approved_by: approvedBy, reference, notes } = parsed.data;

    const insertStmt = c.env.DB.prepare(
      `INSERT INTO folio_settlements
         (id, folio_id, tenant_id, amount, method, amount_cash, amount_card, received_by, approved_by, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      settlementId, folioId, tenantId, amount, method, amountCash, amountCard,
      receivedBy, approvedBy || null, reference || null, notes || null
    );
    const updateStmt = c.env.DB.prepare(
      "UPDATE folios SET status = 'settled', closed_at = datetime('now'), settled_by = ?, settle_method = ? WHERE tenant_id = ? AND id = ?"
    ).bind(receivedBy, method, tenantId, folioId);
    await c.env.DB.batch([insertStmt, updateStmt]);

    return jsonResponse({
      success: true,
      settlement: {
        id: settlementId, folio_id: folioId, amount, method,
        amount_cash: amountCash, amount_card: amountCard, received_by: receivedBy,
      },
      folio: { id: folioId, status: 'settled', total_amount: total },
    });
  } catch (e) {
    return errorResponse('Failed to settle folio', 500);
  }
});

// ── POST /api/folios/:id/void — admin-only status flip ──────────
foliosRoutes.post('/:id/void', async (c) => {
  try {
    const gate = assertAdminMutation(c);
    if (gate !== true) return gate;
    const tenantId = getScope(c).tenantId;
    const folioId = c.req.param('id');
    const folio = await c.env.DB.prepare(
      'SELECT * FROM folios WHERE tenant_id = ? AND id = ?'
    ).bind(tenantId, folioId).first();
    if (!folio) return errorResponse('Folio not found', 404);
    if (folio.status !== 'open') return errorResponse('Folio is not open', 409);

    // No row deletes — status flip only, charges/settlements retained.
    await c.env.DB.prepare(
      "UPDATE folios SET status = 'voided', closed_at = datetime('now') WHERE tenant_id = ? AND id = ?"
    ).bind(tenantId, folioId).run();

    return jsonResponse({ success: true, id: folioId, status: 'voided' });
  } catch (e) {
    return errorResponse('Failed to void folio', 500);
  }
});

foliosRoutes.all('*', () => errorResponse('Endpoint not found', 404));

export default foliosRoutes;
