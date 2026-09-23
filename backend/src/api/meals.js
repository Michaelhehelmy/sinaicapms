import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const mealPostSchema = z.object({
  id: z.string().optional(),
  // P2: project scope is required — every meal belongs to exactly one project.
  // Wire key is camelCase `projectId` (toSnake normalizes before parsing).
  project_id: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Meal name is required'),
  meal_category_id: z.string().optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  description: z.string().optional(),
  image_url: z.string().optional(),
  is_active: z.number().optional(),
}).strip(); // S-M1 fix: strip instead of passthrough

export const bulkMealPostSchema = z.object({
  items: z.array(mealPostSchema).min(1, 'At least one meal is required').max(200, 'Maximum 200 meals per bulk request'),
}).strip();

export const mealPutSchema = z.object({
  // P2: required on PUT as a same-project ownership assertion. The meal's
  // project is immutable after create (moves are out of scope) — a body
  // project that differs from the row's project is a 404, never a move.
  project_id: z.string().min(1, 'Project ID is required'),
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

// P2 helpers: tenant-first project scoping. Every project lookup is gated on
// the request tenant BEFORE any row is returned — a foreign (or missing)
// project is a 404 that leaks nothing, never an empty bypass.
async function loadProject(DB, projectId) {
  const { results } = await DB.prepare(
    'SELECT id, tenant_id, name FROM projects WHERE id = ? AND deleted_at IS NULL'
  ).bind(projectId).all();
  return results[0] || null;
}

function foreignProjectError() {
  return errorResponse('Project must belong to your tenant', 400, [
    { field: 'projectId', message: 'Project must belong to your tenant' },
  ]);
}

// P2: shared SELECT — legacy columns byte-identical, plus additive
// `m.project_id` (wire `projectId`) and `p.name AS project_name`
// (wire `projectName`) for grouping/filtering. No renames, no removals.
const MEALS_SELECT = `SELECT m.id, m.tenant_id, m.project_id, m.meal_category_id, m.price, m.image_url, m.is_active, m.created_at,
            ml.name, ml.description,
            mc.id AS category_id, mcl.name AS category_name,
            p.name AS project_name
     FROM meals m
     LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
     LEFT JOIN meal_categories mc ON mc.id = m.meal_category_id
     LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
     LEFT JOIN projects p ON p.id = m.project_id`;

// GET /api/meals — full menu for this tenant (tenant-wide merged by default;
// ?projectId narrows to one same-tenant project).
mealsRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  const projectId = c.req.query('projectId');
  let sql = `${MEALS_SELECT} WHERE m.tenant_id = ?`;
  const binds = [tenantId];
  if (projectId) {
    const project = await loadProject(c.env.DB, projectId);
    if (!project || project.tenant_id !== tenantId) return errorResponse('Project not found', 404);
    sql += ' AND m.project_id = ?';
    binds.push(projectId);
  }
  const { results: meals } = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(meals);
});

// GET /api/meals/:id — optional ?projectId asserts project match (fail-closed).
mealsRoutes.get('/:id', async (c) => {
  const tenantId = getScope(c).tenantId;
  const projectId = c.req.query('projectId');
  if (projectId) {
    const project = await loadProject(c.env.DB, projectId);
    if (!project || project.tenant_id !== tenantId) return errorResponse('Project not found', 404);
  }
  const meal = await c.env.DB.prepare(
    `${MEALS_SELECT} WHERE m.tenant_id = ? AND m.id = ?`
  ).bind(tenantId, c.req.param('id')).first();
  if (!meal) return errorResponse('Meal not found', 404);
  if (projectId && meal.project_id !== projectId) return errorResponse('Meal not found', 404);
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
    const { id, project_id, name, meal_category_id, price, description, image_url, is_active } = parsed.data;
    const mid = id || 'meal_' + crypto.randomUUID().slice(0, 12);

    // P2: project must exist and belong to the request tenant.
    const project = await loadProject(c.env.DB, project_id);
    if (!project) return errorResponse('Project not found', 404);
    if (project.tenant_id !== tenantId) return foreignProjectError();

    // P2: a meal's category must live in the same project (same tenant implied).
    if (meal_category_id) {
      const { results: catRows } = await c.env.DB.prepare(
        'SELECT id, tenant_id, project_id FROM meal_categories WHERE id = ? AND tenant_id = ?'
      ).bind(meal_category_id, tenantId).all();
      if (catRows.length === 0) return errorResponse('Meal category not found', 404);
      if (catRows[0].project_id !== project_id) {
        return errorResponse('Meal category must belong to the same project', 400, [
          { field: 'mealCategoryId', message: 'Meal category must belong to the same project' },
        ]);
      }
    }

    await c.env.DB.prepare(
      `INSERT INTO meals (id, tenant_id, project_id, meal_category_id, price, image_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      mid, tenantId, project_id, meal_category_id || null, price || 0,
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

// POST /api/meals/bulk — create multiple menu items at once.
mealsRoutes.post('/bulk', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = bulkMealPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { items } = parsed.data;

    const stmts = [];
    const createdIds = [];
    // P2: same project + same-project-category checks as single POST, per item.
    // Project rows are cached per id so a 200-item bulk costs distinct projects only.
    const projectCache = new Map();
    const checkedCategories = new Map();
    for (const item of items) {
      const mid = item.id || 'meal_' + crypto.randomUUID().slice(0, 12);

      if (!projectCache.has(item.project_id)) {
        const project = await loadProject(c.env.DB, item.project_id);
        if (!project) return errorResponse('Project not found', 404);
        if (project.tenant_id !== tenantId) return foreignProjectError();
        projectCache.set(item.project_id, project);
      }

      if (item.meal_category_id) {
        if (!checkedCategories.has(item.meal_category_id)) {
          const { results: catRows } = await c.env.DB.prepare(
            'SELECT id, tenant_id, project_id FROM meal_categories WHERE id = ? AND tenant_id = ?'
          ).bind(item.meal_category_id, tenantId).all();
          if (catRows.length === 0) return errorResponse('Meal category not found', 404);
          checkedCategories.set(item.meal_category_id, catRows[0]);
        }
        if (checkedCategories.get(item.meal_category_id).project_id !== item.project_id) {
          return errorResponse('Meal category must belong to the same project', 400, [
            { field: 'mealCategoryId', message: 'Meal category must belong to the same project' },
          ]);
        }
      }

      createdIds.push(mid);

      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO meals (id, tenant_id, project_id, meal_category_id, price, image_url, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          mid, tenantId, item.project_id, item.meal_category_id || null, item.price || 0,
          item.image_url || null, item.is_active !== undefined ? item.is_active : 1
        )
      );
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO meal_lang (meal_id, lang, name, description)
           VALUES (?, 'en', ?, ?)`
        ).bind(mid, item.name, item.description || null)
      );
    }

    await c.env.DB.batch(stmts);

    return jsonResponse({ ids: createdIds, count: createdIds.length, success: true });
  } catch (e) {
    return errorResponse('Failed to create meals in bulk');
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

    const { project_id, name, meal_category_id, price, description, image_url, is_active } = parsed.data;

    // P2: project must exist and belong to the request tenant (fail-closed).
    const project = await loadProject(c.env.DB, project_id);
    if (!project) return errorResponse('Project not found', 404);
    if (project.tenant_id !== tenantId) return foreignProjectError();

    // M2 fix: Verify meal belongs to this tenant before mutating.
    // P2: project is immutable — the body project must equal the row's project.
    const { results: ownershipCheck } = await c.env.DB.prepare(
      "SELECT id, project_id FROM meals WHERE id = ? AND tenant_id = ?"
    ).bind(mid, tenantId).all();
    if (ownershipCheck.length === 0) return errorResponse('Meal not found', 404);
    if (ownershipCheck[0].project_id !== project_id) return errorResponse('Meal not found', 404);

    // P2: category reassignment must stay in the same project.
    if (meal_category_id !== undefined && meal_category_id !== null) {
      const { results: catRows } = await c.env.DB.prepare(
        'SELECT id, tenant_id, project_id FROM meal_categories WHERE id = ? AND tenant_id = ?'
      ).bind(meal_category_id, tenantId).all();
      if (catRows.length === 0) return errorResponse('Meal category not found', 404);
      if (catRows[0].project_id !== project_id) {
        return errorResponse('Meal category must belong to the same project', 400, [
          { field: 'mealCategoryId', message: 'Meal category must belong to the same project' },
        ]);
      }
    }

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
