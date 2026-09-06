import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// T15 (M8): the hand-rolled `isValidDateString` helper (regex string check +
// calendar round-trip) now lives inside a zod schema, so every date check in
// this module goes through the same safeParse path.
const dateStringSchema = z
  .string()
  .regex(DATE_RE, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Not a real calendar date');

// price === null (or omitted) still means "delete this date" (see PUT below).
const priceOverrideEntrySchema = z.object({
  date: dateStringSchema,
  price: z.number().int().min(0).nullable().optional(),
});

const priceOverridePutSchema = z.object({
  product_id: z.string().min(1, 'productId is required'),
  overrides: z.array(priceOverrideEntrySchema, 'overrides must be an array'),
});

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
  if (from && !dateStringSchema.safeParse(from).success) {
    return errorResponse('from/to must be valid YYYY-MM-DD dates', 400);
  }
  if (to && !dateStringSchema.safeParse(to).success) {
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
    const parsed = priceOverridePutSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { product_id: productId, overrides } = parsed.data;

    const product = await env.DB.prepare(
      'SELECT id FROM pos_products WHERE id = ? AND tenant_id = ?'
    ).bind(productId, tenantId).first();
    if (!product) return errorResponse('Product not found or not owned by this tenant', 404);

    // T13 (M6): validate EVERY entry before writing ANY — then commit the
    // whole batch in one D1 transaction so a mid-failure can never leave
    // partial state. Previously each entry was run individually, so an invalid
    // date/price at index N still left entries 0..N-1 written.
    // Shape + date/price validity now come from zod (T15); only the semantic
    // duplicate check remains hand-rolled here.
    const seen = new Set();
    const statements = [];

    for (const entry of overrides) {
      const dupKey = `${productId}|${entry.date}`;
      if (seen.has(dupKey)) {
        return errorResponse(`Duplicate date "${entry.date}" in overrides batch`, 400);
      }
      seen.add(dupKey);
      if (entry.price === null || entry.price === undefined) {
        statements.push(env.DB.prepare(
          'DELETE FROM price_overrides WHERE product_id = ? AND date = ?'
        ).bind(productId, entry.date));
        continue;
      }
      statements.push(env.DB.prepare(
        `INSERT INTO price_overrides (product_id, date, price, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(product_id, date) DO UPDATE SET
           price = excluded.price,
           updated_at = datetime('now')`
      ).bind(productId, entry.date, entry.price));
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
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
  if (!dateStringSchema.safeParse(date).success) return errorResponse('date must be a valid YYYY-MM-DD date', 400);

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
