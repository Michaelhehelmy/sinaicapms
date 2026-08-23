import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { getScope } from '../middleware/resolveScope.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Strict calendar-date check: rejects 2026-13-01, 2026-02-30, etc.
function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Price overrides sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/price-overrides', resolveScope());
 *   app.use('/api/price-overrides/*', resolveScope());
 *   app.route('/api/price-overrides', priceOverridesRoutes);
 */
const priceOverridesRoutes = new Hono();

// GET /api/price-overrides?productId=&from=&to= — tenant-scoped list.
priceOverridesRoutes.get('/', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;

  const productId = c.req.query('productId');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!productId) return errorResponse('productId is required', 400);
  if ((from && !isValidDateString(from)) || (to && !isValidDateString(to))) {
    return errorResponse('from/to must be valid YYYY-MM-DD dates', 400);
  }

  let query = `SELECT po.id, po.product_id, po.date, po.price, po.updated_at
               FROM price_overrides po
               JOIN pos_products p ON p.id = po.product_id
               WHERE p.tenant_id = ? AND po.product_id = ?`;
  const binds = [tenantId, productId];
  if (from) {
    query += ' AND po.date >= ?';
    binds.push(from);
  }
  if (to) {
    query += ' AND po.date <= ?';
    binds.push(to);
  }
  query += ' ORDER BY po.date ASC';

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse({ overrides: results });
});

// PUT /api/price-overrides — bulk upsert { productId, overrides: [{ date, price }] }.
// price === null (or omitted) deletes that date instead of writing it.
priceOverridesRoutes.put('/', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const body = toSnake(await c.req.json());
    const productId = body.product_id;
    const overrides = body.overrides;

    if (!productId) return errorResponse('productId is required', 400);
    if (!Array.isArray(overrides)) return errorResponse('overrides must be an array', 400);

    const product = await env.DB.prepare(
      'SELECT id FROM pos_products WHERE id = ? AND tenant_id = ?'
    ).bind(productId, tenantId).first();
    if (!product) return errorResponse('Product not found or not owned by this tenant', 404);

    for (const entry of overrides) {
      const date = entry.date;
      const price = entry.price;
      if (!isValidDateString(date)) {
        return errorResponse(`Invalid date "${date}": expected YYYY-MM-DD`, 400);
      }
      if (price === null || price === undefined) {
        await env.DB.prepare(
          'DELETE FROM price_overrides WHERE product_id = ? AND date = ?'
        ).bind(productId, date).run();
        continue;
      }
      if (!Number.isInteger(price) || price < 0) {
        return errorResponse(`Invalid price for ${date}: must be a non-negative integer (or null to delete)`, 400);
      }
      await env.DB.prepare(
        `INSERT INTO price_overrides (product_id, date, price, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(product_id, date) DO UPDATE SET
           price = excluded.price,
           updated_at = datetime('now')`
      ).bind(productId, date, price).run();
    }

    return jsonResponse({ success: true, productId, count: overrides.length });
  } catch (e) {
    return errorResponse('Failed to save price overrides');
  }
});

// DELETE /api/price-overrides?productId=&date= — remove a single override.
priceOverridesRoutes.delete('/', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;

  const productId = c.req.query('productId');
  const date = c.req.query('date');

  if (!productId || !date) return errorResponse('productId and date are required', 400);
  if (!isValidDateString(date)) return errorResponse('date must be a valid YYYY-MM-DD date', 400);

  const product = await env.DB.prepare(
    'SELECT id FROM pos_products WHERE id = ? AND tenant_id = ?'
  ).bind(productId, tenantId).first();
  if (!product) return errorResponse('Product not found or not owned by this tenant', 404);

  await env.DB.prepare(
    'DELETE FROM price_overrides WHERE product_id = ? AND date = ?'
  ).bind(productId, date).run();

  return jsonResponse({ success: true });
});

priceOverridesRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default priceOverridesRoutes;
