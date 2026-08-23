import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const mealCategoryPostSchema = z.object({
  name: z.string().min(1, 'Meal category name is required'),
  position: z.number().optional(),
}).strip();

export const mealCategoryPutSchema = z.object({
  name: z.string().optional(),
  position: z.number().optional(),
}).strip();

/**
 * Meal categories sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/meal-categories', resolveScope());
 *   app.use('/api/meal-categories/*', resolveScope());
 *   app.route('/api/meal-categories', mealCategoriesRoutes);
 */
const mealCategoriesRoutes = new Hono();

// P-L1 fix: Removed PRAGMA foreign_keys = ON

// GET /api/meal-categories
mealCategoriesRoutes.get('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const { results } = await c.env.DB.prepare(
      `SELECT mc.id, mc.tenant_id, mc.position, mc.created_at, mcl.name
       FROM meal_categories mc
       LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
       WHERE mc.tenant_id = ?
       ORDER BY mc.position ASC, mc.id ASC`
    ).bind(tenantId).all();
    return jsonResponse(results);
  } catch (e) {
    return errorResponse('Failed to load meal categories');
  }
});

// GET /api/meal-categories/:id
mealCategoriesRoutes.get('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const { results } = await c.env.DB.prepare(
      `SELECT mc.id, mc.tenant_id, mc.position, mc.created_at, mcl.name
       FROM meal_categories mc
       LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
       WHERE mc.id = ? AND mc.tenant_id = ?`
    ).bind(c.req.param('id'), tenantId).all();
    if (results.length === 0) return errorResponse('Meal category not found', 404);
    return jsonResponse(results[0]);
  } catch (e) {
    return errorResponse('Failed to load meal category');
  }
});

// POST /api/meal-categories
mealCategoriesRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = mealCategoryPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, position } = parsed.data;

    const id = 'mcat_' + crypto.randomUUID().slice(0, 12); // L1 fix: UUID
    await c.env.DB.prepare(
      "INSERT INTO meal_categories (id, tenant_id, position, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).bind(id, tenantId, position || 0).run();

    await c.env.DB.prepare(
      "INSERT INTO meal_categories_lang (meal_category_id, lang, name) VALUES (?, 'en', ?)"
    ).bind(id, name).run();

    return jsonResponse({ id, success: true });
  } catch (e) {
    return errorResponse('Failed to create meal category');
  }
});

// PUT /api/meal-categories/:id
mealCategoriesRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const catId = c.req.param('id');

    // M2 fix: Verify category belongs to this tenant before mutating
    const { results: ownershipCheck } = await c.env.DB.prepare(
      "SELECT id FROM meal_categories WHERE id = ? AND tenant_id = ?"
    ).bind(catId, tenantId).all();
    if (ownershipCheck.length === 0) return errorResponse('Meal category not found', 404);

    const parsed = mealCategoryPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, position } = parsed.data;

    await c.env.DB.prepare(
      "UPDATE meal_categories SET position = COALESCE(?, position), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
    ).bind(position !== undefined ? position : null, catId, tenantId).run();

    // P-M3 fix: Use UPSERT instead of SELECT + conditional INSERT/UPDATE
    if (name !== undefined) {
      await c.env.DB.prepare(
        `INSERT INTO meal_categories_lang (meal_category_id, lang, name)
         VALUES (?, 'en', ?)
         ON CONFLICT(meal_category_id, lang) DO UPDATE SET name = excluded.name`
      ).bind(catId, name).run();
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update meal category');
  }
});

// DELETE /api/meal-categories/:id
mealCategoriesRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const catId = c.req.param('id');

    // M2 fix: Verify category belongs to this tenant before deleting
    const { results: ownershipCheck } = await c.env.DB.prepare(
      "SELECT id FROM meal_categories WHERE id = ? AND tenant_id = ?"
    ).bind(catId, tenantId).all();
    if (ownershipCheck.length === 0) return errorResponse('Meal category not found', 404);

    await c.env.DB.prepare("DELETE FROM meal_categories_lang WHERE meal_category_id = ?").bind(catId).run();
    await c.env.DB.prepare("DELETE FROM meal_categories WHERE id = ? AND tenant_id = ?").bind(catId, tenantId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete meal category');
  }
});

mealCategoriesRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default mealCategoriesRoutes;
