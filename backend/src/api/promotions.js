/**
 * Promotions Engine — per-tenant discount CRUD + cart application.
 *
 * Endpoints (mounted at /api/promotions in src/index.js):
 *   GET    /                 list promotions (active-only for public scope;
 *                            ?includeInactive=1 honored for authed admins)
 *   POST   /                 create promotion            (admin)
 *   PUT    /:id              update promotion             (admin, tenant-scoped)
 *   DELETE /:id              delete promotion             (admin, tenant-scoped)
 *   POST   /apply            compute best discounts for a cart (public scope)
 *
 * Discount model (per line item, best promotion wins):
 *   percentage → unit_price × value/100
 *   fixed      → min(value, unit_price)          (capped at the unit price)
 *   bogo       → floor(quantity / 2) × unit_price (every 2nd item free)
 *
 * Eligibility filters evaluated at apply time (UTC):
 *   day_of_week (0=Sun..6=Sat), start_date/end_date window (inclusive),
 *   min_purchase against the pre-discount cart subtotal.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse, toCamel, toSnake } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;

// ── Schemas ────────────────────────────────────────────────────────────────
// Keys are snake_case because request bodies are passed through toSnake()
// first (accepts camelCase or snake_case on the wire).

export const promotionCreateSchema = z.object({
  name: z.string({ message: 'Name is required' }).min(1, 'Name is required').max(200, 'Name too long'),
  type: z.enum(['percentage', 'fixed', 'bogo'], { message: 'Type must be percentage, fixed or bogo' }),
  value: z.number({ message: 'Value must be a number' }).min(0, 'Value cannot be negative').default(0),
  applies_to: z.enum(['all', 'category', 'product'], { message: "appliesTo must be 'all', 'category' or 'product'" }).default('all'),
  applies_to_id: z.string().max(100).nullable().optional(),
  min_purchase: z.number({ message: 'minPurchase must be a number' }).min(0).default(0),
  day_of_week: z.number().int().min(0, 'dayOfWeek must be 0-6 (0=Sunday)').max(6, 'dayOfWeek must be 0-6 (0=Sunday)').nullable().optional(),
  start_date: z.string().regex(DATE_RE, 'start_date must be YYYY-MM-DD').nullable().optional(),
  end_date: z.string().regex(DATE_RE, 'end_date must be YYYY-MM-DD').nullable().optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

export const promotionUpdateSchema = promotionCreateSchema.partial().strip();

export const applySchema = z.object({
  items: z.array(z.object({
    product_id: z.string({ message: 'productId is required' }).min(1, 'productId is required'),
    quantity: z.number({ message: 'quantity must be a number' }).int('quantity must be a whole number')
      .min(1, 'quantity must be at least 1'),
    unit_price: z.number({ message: 'unitPrice must be a number' }).min(0, 'unitPrice cannot be negative'),
  }), { message: 'items must be an array' }).min(1, 'At least one item is required').max(500),
}).strip();

const router = new Hono();

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeActive(isActive) {
  if (isActive === undefined) return undefined;
  return isActive === true || isActive === 1 ? 1 : 0;
}

/** Column allowlist for partial updates (prevents arbitrary SET injection). */
const UPDATE_COLUMNS = {
  name: 'name', type: 'type', value: 'value', applies_to: 'applies_to',
  applies_to_id: 'applies_to_id', min_purchase: 'min_purchase',
  day_of_week: 'day_of_week', start_date: 'start_date', end_date: 'end_date',
};

/** Cross-field rules that Zod alone can't express; same envelope as validationError. */
function businessRuleErrors(data) {
  const errors = [];
  if (data.type === 'percentage' && data.value !== undefined && data.value > 100) {
    errors.push({ field: 'value', message: 'Percentage value cannot exceed 100' });
  }
  if (data.applies_to && data.applies_to !== 'all' && !data.applies_to_id) {
    errors.push({ field: 'appliesToId', message: `appliesToId is required when appliesTo is '${data.applies_to}'` });
  }
  if (data.start_date && data.end_date && data.start_date > data.end_date) {
    errors.push({ field: 'endDate', message: 'end_date must be on or after start_date' });
  }
  return errors;
}

function rowToPromo(row) {
  if (!row) return null;
  return {
    ...toCamel(row),
    is_active: !!row.is_active,
    value: row.value == null ? null : Number(row.value),
    min_purchase: row.min_purchase == null ? null : Number(row.min_purchase),
  };
}

function ruleErrorResponse(data) {
  const errors = businessRuleErrors(data);
  if (errors.length === 0) return null;
  return errorResponse(errors.map((e) => e.message).join('; '), 400, errors);
}

// ── GET / — list promotions ────────────────────────────────────────────────

router.get('/', async (c) => {
  try {
    const { tenantId, user } = getScope(c);
    const includeInactive = c.req.query('includeInactive') === '1';

    // Public visitors only ever see active promotions; authed admins may opt in.
    let sql = 'SELECT * FROM promotions WHERE tenant_id = ?';
    const binds = [tenantId];
    if (!user || !includeInactive) {
      sql += ' AND is_active = 1';
    }
    sql += ' ORDER BY created_at DESC';

    const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
    return jsonResponse(results.map(rowToPromo));
  } catch (err) {
    console.error('GET /promotions failed:', err);
    return errorResponse('Failed to fetch promotions', 500);
  }
});

// ── POST / — create promotion ──────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const { tenantId } = getScope(c);
    let raw;
    try {
      raw = await c.req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const parsed = promotionCreateSchema.safeParse(toSnake(raw));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const data = parsed.data;

    const ruleErr = ruleErrorResponse(data);
    if (ruleErr) return ruleErr;

    const id = `promo_${crypto.randomUUID().slice(0, 12)}`;
    const isActive = normalizeActive(data.is_active) ?? 1;

    await c.env.DB.prepare(
      `INSERT INTO promotions (id, tenant_id, name, type, value, applies_to, applies_to_id,
                               min_purchase, day_of_week, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, tenantId, data.name, data.type,
      data.value ?? 0, data.applies_to ?? 'all', data.applies_to_id ?? null,
      data.min_purchase ?? 0, data.day_of_week ?? null,
      data.start_date ?? null, data.end_date ?? null, isActive,
    ).run();
    return jsonResponse({ id, success: true });
  } catch (err) {
    console.error('POST /promotions failed:', err);
    return errorResponse('Failed to create promotion', 500);
  }
});

// ── PUT /:id — update promotion ────────────────────────────────────────────

router.put('/:id', async (c) => {
  try {
    const { tenantId } = getScope(c);
    const promoId = c.req.param('id');
    let raw;
    try {
      raw = await c.req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const parsed = promotionUpdateSchema.safeParse(toSnake(raw));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const data = parsed.data;

    const ruleErr = ruleErrorResponse(data);
    if (ruleErr) return ruleErr;

    const sets = [];
    const binds = [];
    for (const [key, column] of Object.entries(UPDATE_COLUMNS)) {
      if (data[key] !== undefined) {
        sets.push(`${column} = ?`);
        binds.push(data[key]);
      }
    }
    const isActive = normalizeActive(data.is_active);
    if (isActive !== undefined) {
      sets.push('is_active = ?');
      binds.push(isActive);
    }
    if (sets.length === 0) {
      return errorResponse('No valid fields to update', 400, [{ field: 'body', message: 'No valid fields to update' }]);
    }

    binds.push(promoId, tenantId);
    const result = await c.env.DB.prepare(
      `UPDATE promotions SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
    ).bind(...binds).run();
    if (!result.meta?.changes) {
      return errorResponse('Promotion not found', 404);
    }
    return jsonResponse({ success: true });
  } catch (err) {
    console.error(`PUT /promotions/${c.req.param('id')} failed:`, err);
    return errorResponse('Failed to update promotion', 500);
  }
});

// ── DELETE /:id — delete promotion ─────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const { tenantId } = getScope(c);
    const promoId = c.req.param('id');

    const result = await c.env.DB.prepare(
      'DELETE FROM promotions WHERE id = ? AND tenant_id = ?'
    ).bind(promoId, tenantId).run();
    if (!result.meta?.changes) {
      return errorResponse('Promotion not found', 404);
    }
    return jsonResponse({ success: true });
  } catch (err) {
    console.error(`DELETE /promotions/${c.req.param('id')} failed:`, err);
    return errorResponse('Failed to delete promotion', 500);
  }
});

// ── POST /apply — compute best discounts for a cart ────────────────────────

router.post('/apply', async (c) => {
  try {
    const { tenantId } = getScope(c);
    let raw;
    try {
      raw = await c.req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const parsed = applySchema.safeParse(toSnake(raw));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const items = parsed.data.items;

    // Resolve product categories in one query so category-scoped promos match.
    const productIds = [...new Set(items.map((it) => it.product_id))];
    const placeholders = productIds.map(() => '?').join(',');
    const { results: products } = await c.env.DB.prepare(
      `SELECT id, category_id FROM pos_products WHERE id IN (${placeholders}) AND tenant_id = ?`
    ).bind(...productIds, tenantId).all();
    const categoryByProduct = new Map(products.map((p) => [p.id, p.category_id]));

    const subtotal = round2(items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0));

    // Load active promos and evaluate schedule/min-purchase eligibility (UTC).
    const today = new Date().toISOString().slice(0, 10);
    const dow = new Date().getUTCDay();
    const { results: promoRows } = await c.env.DB.prepare(
      'SELECT * FROM promotions WHERE tenant_id = ? AND is_active = 1'
    ).bind(tenantId).all();

    const eligiblePromos = promoRows.filter((p) => {
      if (p.day_of_week != null && p.day_of_week !== dow) return false;
      if (p.start_date && today < p.start_date) return false;
      if (p.end_date && today > p.end_date) return false;
      if ((p.min_purchase || 0) > subtotal) return false;
      return true;
    });

    const matchesItem = (promo, productId) => {
      if (promo.applies_to === 'product') return promo.applies_to_id === productId;
      if (promo.applies_to === 'category') {
        const categoryId = categoryByProduct.get(productId);
        return categoryId != null && promo.applies_to_id === categoryId;
      }
      return true; // applies_to === 'all'
    };

    const discountFor = (promo, unitPrice, quantity) => {
      if (promo.type === 'percentage') {
        return round2(unitPrice * quantity * ((promo.value || 0) / 100));
      }
      if (promo.type === 'fixed') {
        return round2(Math.min(promo.value || 0, unitPrice) * quantity);
      }
      // bogo: every second unit free
      return round2(Math.floor(quantity / 2) * unitPrice);
    };

    let totalDiscount = 0;
    const outItems = items.map((item) => {
      const lineTotal = round2(item.unit_price * item.quantity);
      let best = null;
      for (const promo of eligiblePromos) {
        if (!matchesItem(promo, item.product_id)) continue;
        const discount = discountFor(promo, item.unit_price, item.quantity);
        if (discount > 0 && (!best || discount > best.discount)) {
          best = { discount, promotionId: promo.id, promotionName: promo.name };
        }
      }
      if (best) totalDiscount += best.discount;
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        final_price: Math.max(0, round2(lineTotal - (best?.discount || 0))),
        discount: best?.discount || 0,
        promotion_id: best?.promotionId || null,
        promotion_name: best?.promotionName || null,
      };
    });

    totalDiscount = round2(totalDiscount);
    return jsonResponse({
      items: outItems,
      subtotal,
      total_discount: totalDiscount,
      total: Math.max(0, round2(subtotal - totalDiscount)),
    });
  } catch (err) {
    console.error('POST /promotions/apply failed:', err);
    return errorResponse('Failed to apply promotions', 500);
  }
});

export default router;
