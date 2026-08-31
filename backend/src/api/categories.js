import { Hono } from 'hono';
import { jsonResponse, cachedJsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const categoryPostSchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  parent_id: z.string().optional(),
  active: z.number().optional(),
  position: z.number().optional(),
}).strip();

export const categoryPutSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  parent_id: z.string().optional(),
  active: z.number().optional(),
  position: z.number().optional(),
}).strip();

/**
 * Categories sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/categories', mixedScope);   // GET public, mutations admin
 *   app.use('/api/categories/*', mixedScope);
 *   app.route('/api/categories', categoriesRoutes);
 */
const categoriesRoutes = new Hono();

// GET /api/categories — global (NULL tenant) + this tenant's categories.
categoriesRoutes.get('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    // Scope by tenant_id — global categories (NULL) visible to all, tenant-specific to their tenant
    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.parent_id, c.active, c.position, c.created_at, c.tenant_id,
              cl.name, cl.description, cl.link_rewrite
       FROM categories c
       LEFT JOIN category_lang cl ON cl.category_id = c.id AND cl.lang = 'en'
       WHERE c.tenant_id IS NULL OR c.tenant_id = ?
       ORDER BY c.position ASC, c.id ASC`
    ).bind(tenantId).all();
    return cachedJsonResponse(results, 300);
  } catch (e) {
    return errorResponse('Failed to load categories');
  }
});

// GET /api/categories/:id
categoriesRoutes.get('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.parent_id, c.active, c.position, c.created_at, c.tenant_id,
              cl.name, cl.description, cl.link_rewrite, cl.meta_title, cl.meta_description
       FROM categories c
       LEFT JOIN category_lang cl ON cl.category_id = c.id AND cl.lang = 'en'
       WHERE c.id = ? AND (c.tenant_id IS NULL OR c.tenant_id = ?)`
    ).bind(c.req.param('id'), tenantId).all();
    if (results.length === 0) return errorResponse('Category not found', 404);
    return jsonResponse(results[0]);
  } catch (e) {
    return errorResponse('Failed to load category');
  }
});

// POST /api/categories
categoriesRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = categoryPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, description, parent_id, active, position } = parsed.data;

    const id = 'cat_' + crypto.randomUUID().slice(0, 12);
    // New categories are scoped to the creating tenant
    await c.env.DB.prepare(
      "INSERT INTO categories (id, tenant_id, parent_id, active, position, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).bind(id, tenantId, parent_id || null, active !== undefined ? active : 1, position || 0).run();

    await c.env.DB.prepare(
      "INSERT INTO category_lang (category_id, lang, name, description) VALUES (?, 'en', ?, ?)"
    ).bind(id, name, description || null).run();

    return jsonResponse({ id, success: true });
  } catch (e) {
    return errorResponse('Failed to create category');
  }
});

// PUT /api/categories/:id
categoriesRoutes.put('/:id', async (c) => {
  try {
    const scope = getScope(c);
    const tenantId = scope.tenantId;
    const catId = c.req.param('id');
    const parsed = categoryPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, description, parent_id, active, position } = parsed.data;

    // Verify ownership — only modify own or global categories
    const { results: existing } = await c.env.DB.prepare(
      "SELECT id, tenant_id FROM categories WHERE id = ? AND (tenant_id IS NULL OR tenant_id = ?)"
    ).bind(catId, tenantId).all();
    if (existing.length === 0) return errorResponse('Category not found', 404);

    // H4 fix: global (marketplace-level) categories are shared infrastructure.
    // A tenant admin passing the `(tenant_id IS NULL OR ...)` match above must
    // not be able to mutate or re-parent them. Strict `=== null` on purpose:
    // D1 materializes NULL columns as explicit null, while a row object
    // without the column selected at all is treated as tenant-owned.
    if (existing[0].tenant_id === null && scope.user?.role !== 'super_admin') {
      return errorResponse('Only super admins can edit global categories', 403);
    }

    await c.env.DB.prepare(
      `UPDATE categories SET
        parent_id = COALESCE(?, parent_id),
        active = COALESCE(?, active),
        position = COALESCE(?, position),
        updated_at = datetime('now')
      WHERE id = ? AND (tenant_id IS NULL OR tenant_id = ?)`
    ).bind(parent_id !== undefined ? parent_id : null, active !== undefined ? active : null, position !== undefined ? position : null, catId, tenantId).run();

    if (name !== undefined || description !== undefined) {
      await c.env.DB.prepare(
        `INSERT INTO category_lang (category_id, lang, name, description)
         VALUES (?, 'en', ?, ?)
         ON CONFLICT(category_id, lang) DO UPDATE SET
           name = COALESCE(excluded.name, category_lang.name),
           description = COALESCE(excluded.description, category_lang.description)`
      ).bind(catId, name || null, description || null).run();
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update category');
  }
});

// DELETE /api/categories/:id
categoriesRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const catId = c.req.param('id');

    // Only allow deleting tenant-owned categories, not global ones
    const { results: existing } = await c.env.DB.prepare(
      "SELECT id FROM categories WHERE id = ? AND tenant_id = ?"
    ).bind(catId, tenantId).all();
    if (existing.length === 0) return errorResponse('Category not found or is global (cannot delete)', 404);

    // Check if any products reference this category
    const { results: refs } = await c.env.DB.prepare(
      "SELECT id FROM pos_products WHERE category_id = ? AND tenant_id = ? LIMIT 1"
    ).bind(catId, tenantId).all();
    if (refs.length > 0) return errorResponse('Cannot delete category with linked products', 400);

    await c.env.DB.prepare("DELETE FROM category_lang WHERE category_id = ? AND tenant_id = ?").bind(catId, tenantId).run();
    await c.env.DB.prepare("DELETE FROM categories WHERE id = ? AND tenant_id = ?").bind(catId, tenantId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete category');
  }
});

categoriesRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default categoriesRoutes;
