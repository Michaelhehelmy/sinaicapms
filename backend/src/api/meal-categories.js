import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const mealCategoryPostSchema = z.object({
  // P2: project scope is required — every category belongs to exactly one project.
  // Wire key is camelCase `projectId` (toSnake normalizes before parsing).
  project_id: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Meal category name is required'),
  position: z.number().optional(),
}).strip();

export const mealCategoryPutSchema = z.object({
  // P2: required on PUT as a same-project ownership assertion. The category's
  // project is immutable after create — a differing body project is a 404.
  project_id: z.string().min(1, 'Project ID is required'),
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

// P2 helpers: tenant-first project scoping — a foreign (or missing) project
// is a 404 that leaks nothing, never an empty bypass.
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
// `mc.project_id` (wire `projectId`) and `p.name AS project_name`
// (wire `projectName`). No renames, no removals.
const MEAL_CATEGORIES_SELECT = `SELECT mc.id, mc.tenant_id, mc.project_id, mc.position, mc.created_at, mcl.name,
            p.name AS project_name
       FROM meal_categories mc
       LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
       LEFT JOIN projects p ON p.id = mc.project_id`;

// GET /api/meal-categories — tenant-wide merged by default;
// ?projectId narrows to one same-tenant project.
mealCategoriesRoutes.get('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const projectId = c.req.query('projectId');
    let sql = `${MEAL_CATEGORIES_SELECT} WHERE mc.tenant_id = ?`;
    const binds = [tenantId];
    if (projectId) {
      const project = await loadProject(c.env.DB, projectId);
      if (!project || project.tenant_id !== tenantId) return errorResponse('Project not found', 404);
      sql += ' AND mc.project_id = ?';
      binds.push(projectId);
    }
    sql += ' ORDER BY mc.position ASC, mc.id ASC';
    const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
    return jsonResponse(results);
  } catch (e) {
    return errorResponse('Failed to load meal categories');
  }
});

// GET /api/meal-categories/:id — optional ?projectId asserts project match.
mealCategoriesRoutes.get('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const projectId = c.req.query('projectId');
    if (projectId) {
      const project = await loadProject(c.env.DB, projectId);
      if (!project || project.tenant_id !== tenantId) return errorResponse('Project not found', 404);
    }
    const { results } = await c.env.DB.prepare(
      `${MEAL_CATEGORIES_SELECT} WHERE mc.id = ? AND mc.tenant_id = ?`
    ).bind(c.req.param('id'), tenantId).all();
    if (results.length === 0) return errorResponse('Meal category not found', 404);
    if (projectId && results[0].project_id !== projectId) return errorResponse('Meal category not found', 404);
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
    const { project_id, name, position } = parsed.data;

    // P2: project must exist and belong to the request tenant.
    const project = await loadProject(c.env.DB, project_id);
    if (!project) return errorResponse('Project not found', 404);
    if (project.tenant_id !== tenantId) return foreignProjectError();

    const id = 'mcat_' + crypto.randomUUID().slice(0, 12); // L1 fix: UUID
    await c.env.DB.prepare(
      "INSERT INTO meal_categories (id, tenant_id, project_id, position, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).bind(id, tenantId, project_id, position || 0).run();

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

    // M2 fix: Verify category belongs to this tenant before mutating.
    const { results: ownershipCheck } = await c.env.DB.prepare(
      "SELECT id, project_id FROM meal_categories WHERE id = ? AND tenant_id = ?"
    ).bind(catId, tenantId).all();
    if (ownershipCheck.length === 0) return errorResponse('Meal category not found', 404);

    const parsed = mealCategoryPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { project_id, name, position } = parsed.data;

    // P2: project must exist and belong to the request tenant (fail-closed).
    const project = await loadProject(c.env.DB, project_id);
    if (!project) return errorResponse('Project not found', 404);
    if (project.tenant_id !== tenantId) return foreignProjectError();

    // P2: project is immutable — the body project must equal the row's project.
    if (ownershipCheck[0].project_id !== project_id) return errorResponse('Meal category not found', 404);

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
