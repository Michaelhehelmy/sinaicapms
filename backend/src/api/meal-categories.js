import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';

export const mealCategoryPostSchema = z.object({
  name: z.string().min(1, 'Meal category name is required'),
  position: z.number().optional(),
}).strip();

export const mealCategoryPutSchema = z.object({
  name: z.string().optional(),
  position: z.number().optional(),
}).strip();

export async function handleMealCategoriesRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  // P-L1 fix: Removed PRAGMA foreign_keys = ON

  if (method === 'GET' && path.length === 2) {
    try {
      const { results } = await env.DB.prepare(
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
  }

  if (method === 'GET' && path.length === 3) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT mc.id, mc.tenant_id, mc.position, mc.created_at, mcl.name
         FROM meal_categories mc
         LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
         WHERE mc.id = ? AND mc.tenant_id = ?`
      ).bind(path[2], tenantId).all();
      if (results.length === 0) return errorResponse('Meal category not found', 404);
      return jsonResponse(results[0]);
    } catch (e) {
      return errorResponse('Failed to load meal category');
    }
  }

  if (method === 'POST' && path.length === 2) {
    try {
      const parsed = mealCategoryPostSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { name, position } = parsed.data;

      const id = 'mcat_' + crypto.randomUUID().slice(0, 12); // L1 fix: UUID
      await env.DB.prepare(
        "INSERT INTO meal_categories (id, tenant_id, position, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(id, tenantId, position || 0).run();

      await env.DB.prepare(
        "INSERT INTO meal_categories_lang (meal_category_id, lang, name) VALUES (?, 'en', ?)"
      ).bind(id, name).run();

      return jsonResponse({ id, success: true });
    } catch (e) {
      return errorResponse('Failed to create meal category');
    }
  }

  if (method === 'PUT' && path.length === 3) {
    try {
      const catId = path[2];

      // M2 fix: Verify category belongs to this tenant before mutating
      const { results: ownershipCheck } = await env.DB.prepare(
        "SELECT id FROM meal_categories WHERE id = ? AND tenant_id = ?"
      ).bind(catId, tenantId).all();
      if (ownershipCheck.length === 0) return errorResponse('Meal category not found', 404);

      const parsed = mealCategoryPutSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { name, position } = parsed.data;

      await env.DB.prepare(
        "UPDATE meal_categories SET position = COALESCE(?, position), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
      ).bind(position !== undefined ? position : null, catId, tenantId).run();

      // P-M3 fix: Use UPSERT instead of SELECT + conditional INSERT/UPDATE
      if (name !== undefined) {
        await env.DB.prepare(
          `INSERT INTO meal_categories_lang (meal_category_id, lang, name)
           VALUES (?, 'en', ?)
           ON CONFLICT(meal_category_id, lang) DO UPDATE SET name = excluded.name`
        ).bind(catId, name).run();
      }

      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to update meal category');
    }
  }

  if (method === 'DELETE' && path.length === 3) {
    try {
      const catId = path[2];

      // M2 fix: Verify category belongs to this tenant before deleting
      const { results: ownershipCheck } = await env.DB.prepare(
        "SELECT id FROM meal_categories WHERE id = ? AND tenant_id = ?"
      ).bind(catId, tenantId).all();
      if (ownershipCheck.length === 0) return errorResponse('Meal category not found', 404);

      await env.DB.prepare("DELETE FROM meal_categories_lang WHERE meal_category_id = ?").bind(catId).run();
      await env.DB.prepare("DELETE FROM meal_categories WHERE id = ? AND tenant_id = ?").bind(catId, tenantId).run();
      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to delete meal category');
    }
  }

  return errorResponse('Method not allowed', 405);
}
