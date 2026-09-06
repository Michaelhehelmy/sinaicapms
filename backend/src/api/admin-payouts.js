/**
 * Super Admin — Marketplace payout management.
 *
 * Endpoints (mounted at /api/admin/payouts in index.js):
 *   GET  /eligible       — payments eligible for payout (captured + no batch + marketplace)
 *   POST /                — create a payout from selected payments
 *   GET  /                — paginated payout list
 *   GET  /:id             — payout detail with items
 *   POST /:id/pay         — mark pending payout as paid (settle ledger rows)
 *   POST /:id/cancel      — cancel pending payout (clear payout_id on ledger rows)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

const createPayoutBody = z.object({
  tenantId: z.number(),
  paymentIds: z.array(z.string()).min(1),
  method: z.enum(['bank_transfer', 'cash', 'paymob', 'other']),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
}).strip();

// ── GET /eligible ────────────────────────────────────────────────────────────

router.get('/eligible', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get('tenantId');
  const limit = parseInt(url.searchParams.get('limit') || '200', 10);

  try {
    let where = "WHERE mp.payment_status = 'captured' AND mp.payout_id IS NULL AND mp.channel = 'marketplace'";
    const binds = [];
    if (tenantId) {
      where += ' AND mp.tenant_id = ?';
      binds.push(tenantId);
    }

    const { results } = await db.prepare(`
      SELECT mp.*, t.name as tenant_name
      FROM marketplace_payments mp
      LEFT JOIN tenants t ON t.id = mp.tenant_id
      ${where}
      ORDER BY mp.captured_at DESC
      LIMIT ?
    `).bind(...binds, limit).all();

    const agg = await db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(mp.net_amount), 0) as total_net
      FROM marketplace_payments mp
      ${where}
    `).bind(...binds).first();

    return jsonResponse({
      data: results || [],
      total: agg?.total || 0,
      totalNet: agg?.total_net || 0,
      // T16 (M7): complete the shared envelope. `limit` (default 200) caps the
      // eligible window, so the page is the single batch; totalNet is a
      // documented extra field on top of the standard shape.
      page: 1,
      pageSize: results?.length || 0,
      hasMore: false,
    });
  } catch (e) {
    console.error('[ADMIN PAYOUTS ELIGIBLE]', e.message);
    return errorResponse('Failed to load eligible payments', 500);
  }
});

// ── POST / (create payout) ──────────────────────────────────────────────────

router.post('/', async (c) => {
  const db = c.env.DB;

  try {
    const raw = await c.req.json();
    const parsed = createPayoutBody.safeParse(raw);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const { tenantId, paymentIds, method, reference, notes } = parsed.data;

    // Validate all IDs in one query
    const placeholders = paymentIds.map(() => '?').join(',');
    const { results: payments } = await db.prepare(`
      SELECT id, tenant_id, net_amount, currency, payment_status, payout_id, channel
      FROM marketplace_payments
      WHERE id IN (${placeholders})
    `).bind(...paymentIds).all();

    if (!payments || payments.length !== paymentIds.length) {
      const foundIds = new Set((payments || []).map(p => p.id));
      const invalidIds = paymentIds.filter(id => !foundIds.has(id));
      return errorResponse('Some payment IDs do not exist', 400, [{ field: 'paymentIds', message: 'invalid IDs', invalidIds }]);
    }

    if (payments.some(p => p.tenant_id !== tenantId)) {
      return errorResponse('Some payments belong to a different tenant', 400);
    }
    if (payments.some(p => p.payment_status !== 'captured')) {
      return errorResponse('Some payments are not in captured status', 400);
    }
    if (payments.some(p => p.payout_id !== null)) {
      return errorResponse('Some payments are already assigned to a payout', 400);
    }
    if (payments.some(p => p.channel !== 'marketplace')) {
      return errorResponse('Some payments are not marketplace channel', 400);
    }

    const totalAmount = payments.reduce((sum, p) => sum + p.net_amount, 0);
    const currency = payments[0].currency;
    const createdBy = c.env.user?.id ?? null;
    const payoutId = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO marketplace_payouts (id, tenant_id, amount, currency, method, status, reference, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).bind(payoutId, tenantId, totalAmount, currency, method, reference ?? null, notes ?? null, createdBy, now).run();

    await Promise.all(paymentIds.map(pid =>
      db.prepare('UPDATE marketplace_payments SET payout_id = ? WHERE id = ?').bind(payoutId, pid).run()
    ));

    const payout = {
      id: payoutId, tenant_id: tenantId, amount: totalAmount, currency,
      method, status: 'pending', reference: reference ?? null, notes: notes ?? null,
      created_by: createdBy, created_at: now, paid_at: null, cancelled_at: null,
    };

    return jsonResponse({ payout, items: payments }, 201);
  } catch (e) {
    console.error('[ADMIN PAYOUTS CREATE]', e.message);
    return errorResponse('Failed to create payout', 500);
  }
});

// ── GET / (paginated list) ───────────────────────────────────────────────────

router.get('/', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');
  const status = url.searchParams.get('status');

  try {
    let where = 'WHERE 1=1';
    const binds = [];
    if (tenantId) { where += ' AND p.tenant_id = ?'; binds.push(tenantId); }
    if (status) { where += ' AND p.status = ?'; binds.push(status); }

    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM marketplace_payouts p ${where}`).bind(...binds).first();
    const total = countRow?.cnt || 0;

    const { results } = await db.prepare(`
      SELECT p.*, t.name as tenant_name,
        (SELECT COUNT(*) FROM marketplace_payments mp WHERE mp.payout_id = p.id) as item_count
      FROM marketplace_payouts p
      LEFT JOIN tenants t ON t.id = p.tenant_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all();

    return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
  } catch (e) {
    console.error('[ADMIN PAYOUTS LIST]', e.message);
    return errorResponse('Failed to load payouts', 500);
  }
});

// ── GET /:id (detail) ───────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const db = c.env.DB;

  try {
    const id = c.req.param('id');
    const payout = await db.prepare('SELECT * FROM marketplace_payouts WHERE id = ?').bind(id).first();

    if (!payout) {
      return errorResponse('Payout not found', 404);
    }

    const { results: items } = await db.prepare(`
      SELECT mp.*, t.name as tenant_name, o.check_in_date, o.check_out_date
      FROM marketplace_payments mp
      LEFT JOIN tenants t ON t.id = mp.tenant_id
      LEFT JOIN orders o ON o.id = mp.order_id
      WHERE mp.payout_id = ?
      ORDER BY mp.captured_at DESC
    `).bind(id).all();

    return jsonResponse({ payout, items: items || [] });
  } catch (e) {
    console.error('[ADMIN PAYOUTS DETAIL]', e.message);
    return errorResponse('Failed to load payout', 500);
  }
});

// ── POST /:id/pay ───────────────────────────────────────────────────────────

router.post('/:id/pay', async (c) => {
  const db = c.env.DB;

  try {
    const id = c.req.param('id');
    const payout = await db.prepare('SELECT * FROM marketplace_payouts WHERE id = ?').bind(id).first();

    if (!payout) {
      return errorResponse('Payout not found', 404);
    }
    if (payout.status !== 'pending') {
      return errorResponse('Payout has already been settled or cancelled', 409);
    }

    const now = new Date().toISOString();
    const { results: items } = await db.prepare('SELECT * FROM marketplace_payments WHERE payout_id = ?').bind(id).all();

    // Single atomic batch: the guarded payout UPDATE is the concurrency lock
    // (AND status='pending' → changes 0 when a concurrent pay/cancel already
    // transitioned). All payment-settle UPDATEs commit with the payout update;
    // D1 batch always returns one result per statement, so changes 0 on the
    // first result means we lost the race → 409.
    const batchResults = await db.batch([
      db.prepare("UPDATE marketplace_payouts SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'").bind(now, id),
      ...(items || []).map(p =>
        db.prepare("UPDATE marketplace_payments SET payment_status = 'settled', settled_at = ? WHERE id = ?").bind(now, p.id)
      ),
    ]);

    if ((batchResults?.[0]?.meta?.changes ?? 1) !== 1) {
      return errorResponse('Payout has already been settled or cancelled', 409);
    }

    const settledItems = (items || []).map(p => ({ ...p, payment_status: 'settled', settled_at: now }));

    return jsonResponse({ payout: { ...payout, status: 'paid', paid_at: now }, items: settledItems });
  } catch (e) {
    console.error('[ADMIN PAYOUTS PAY]', e.message);
    return errorResponse('Failed to mark payout as paid', 500);
  }
});

// ── POST /:id/cancel ────────────────────────────────────────────────────────

router.post('/:id/cancel', async (c) => {
  const db = c.env.DB;

  try {
    const id = c.req.param('id');
    const payout = await db.prepare('SELECT * FROM marketplace_payouts WHERE id = ?').bind(id).first();

    if (!payout) {
      return errorResponse('Payout not found', 404);
    }
    if (payout.status !== 'pending') {
      return errorResponse('Only pending payouts can be cancelled', 409);
    }

    const now = new Date().toISOString();
    const { results: items } = await db.prepare('SELECT id FROM marketplace_payments WHERE payout_id = ?').bind(id).all();

    // Guarded UPDATE (AND status='pending') in the same atomic batch as the
    // payout_id clears — a concurrent pay/cancel wins by flipping status first,
    // so this batch's first UPDATE hits 0 rows → 409 instead of double-cancel.
    const batchResults = await db.batch([
      db.prepare("UPDATE marketplace_payouts SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'pending'").bind(now, id),
      ...(items || []).map(p =>
        db.prepare('UPDATE marketplace_payments SET payout_id = NULL WHERE id = ?').bind(p.id)
      ),
    ]);

    if ((batchResults?.[0]?.meta?.changes ?? 1) !== 1) {
      return errorResponse('Only pending payouts can be cancelled', 409);
    }

    return jsonResponse({ payout: { ...payout, status: 'cancelled', cancelled_at: now } });
  } catch (e) {
    console.error('[ADMIN PAYOUTS CANCEL]', e.message);
    return errorResponse('Failed to cancel payout', 500);
  }
});

export default router;
