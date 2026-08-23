import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const mealPostSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Meal name is required'),
  meal_category_id: z.string().optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  description: z.string().optional(),
  image_url: z.string().optional(),
  is_active: z.number().optional(),
}).strip(); // S-M1 fix: strip instead of passthrough

export const mealPutSchema = z.object({
  name: z.string().min(1).optional(),
  meal_category_id: z.string().optional(),
  price: z.number().min(0).optional(),
  description: z.string().optional(),
  image_url: z.string().optional(),
  is_active: z.number().optional(),
}).strip(); // S-M1 fix

/**
 * Meals sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/meals', mixedScope);   // GET public, mutations admin
 *   app.use('/api/meals/*', mixedScope);
 *   app.route('/api/meals', mealsRoutes);
 */
const mealsRoutes = new Hono();

// GET /api/meals — full menu for this tenant.
mealsRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  const { results: meals } = await c.env.DB.prepare(
    `SELECT m.id, m.tenant_id, m.meal_category_id, m.price, m.image_url, m.is_active, m.created_at,
            ml.name, ml.description,
            mc.id AS category_id, mcl.name AS category_name
     FROM meals m
     LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
     LEFT JOIN meal_categories mc ON mc.id = m.meal_category_id
     LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
     WHERE m.tenant_id = ?`
  ).bind(tenantId).all();
  return jsonResponse(meals);
});

// GET /api/meals/:id
mealsRoutes.get('/:id', async (c) => {
  const tenantId = getScope(c).tenantId;
  const meal = await c.env.DB.prepare(
    `SELECT m.id, m.tenant_id, m.meal_category_id, m.price, m.image_url, m.is_active, m.created_at,
            ml.name, ml.description,
            mc.id AS category_id, mcl.name AS category_name
     FROM meals m
     LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
     LEFT JOIN meal_categories mc ON mc.id = m.meal_category_id
     LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
     WHERE m.tenant_id = ? AND m.id = ?`
  ).bind(tenantId, c.req.param('id')).first();
  if (!meal) return errorResponse('Meal not found', 404);
  return jsonResponse(meal);
});

// POST /api/meals
mealsRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = mealPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { id, name, meal_category_id, price, description, image_url, is_active } = parsed.data;
    const mid = id || 'meal_' + crypto.randomUUID().slice(0, 12);

    await c.env.DB.prepare(
      `INSERT INTO meals (id, tenant_id, meal_category_id, price, image_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      mid, tenantId, meal_category_id || null, price || 0,
      image_url || null, is_active !== undefined ? is_active : 1
    ).run();

    await c.env.DB.prepare(
      `INSERT INTO meal_lang (meal_id, lang, name, description)
       VALUES (?, 'en', ?, ?)`
    ).bind(mid, name, description || null).run();

    return jsonResponse({ id: mid, success: true });
  } catch (e) {
    return errorResponse('Failed to create meal');
  }
});

// PUT /api/meals/:id
mealsRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const mid = c.req.param('id');
    const parsed = mealPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }

    // M2 fix: Verify meal belongs to this tenant before mutating
    const { results: ownershipCheck } = await c.env.DB.prepare(
      "SELECT id FROM meals WHERE id = ? AND tenant_id = ?"
    ).bind(mid, tenantId).all();
    if (ownershipCheck.length === 0) return errorResponse('Meal not found', 404);

    const { name, meal_category_id, price, description, image_url, is_active } = parsed.data;

    await c.env.DB.prepare(
      `UPDATE meals SET
        meal_category_id = COALESCE(?, meal_category_id),
        price = COALESCE(?, price),
        image_url = COALESCE(?, image_url),
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`
    ).bind(
      meal_category_id !== undefined ? meal_category_id : null,
      price !== undefined ? price : null,
      image_url !== undefined ? image_url : null,
      is_active !== undefined ? is_active : null,
      tenantId, mid
    ).run();

    // P-M1 fix: Use UPSERT instead of SELECT + conditional INSERT/UPDATE
    if (name !== undefined || description !== undefined) {
      await c.env.DB.prepare(
        `INSERT INTO meal_lang (meal_id, lang, name, description)
         VALUES (?, 'en', ?, ?)
         ON CONFLICT(meal_id, lang) DO UPDATE SET
           name = COALESCE(excluded.name, meal_lang.name),
           description = COALESCE(excluded.description, meal_lang.description)`
      ).bind(mid, name || null, description || null).run();
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update meal');
  }
});

// DELETE /api/meals/:id
mealsRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const mid = c.req.param('id');

    // M2 fix: Verify meal belongs to this tenant before deleting
    const { results: ownershipCheck } = await c.env.DB.prepare(
      "SELECT id FROM meals WHERE id = ? AND tenant_id = ?"
    ).bind(mid, tenantId).all();
    if (ownershipCheck.length === 0) return errorResponse('Meal not found', 404);

    // Phase 3 cascade: schedules must go before the meal row (no FK ON DELETE).
    await c.env.DB.prepare(
      "DELETE FROM meal_schedules WHERE meal_id = ?"
    ).bind(mid).run();

    await c.env.DB.prepare(
      "DELETE FROM meal_lang WHERE meal_id = ?"
    ).bind(mid).run();

    await c.env.DB.prepare(
      "DELETE FROM meals WHERE tenant_id = ? AND id = ?"
    ).bind(tenantId, mid).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete meal');
  }
});

mealsRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default mealsRoutes;
