import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Type-aware per-project operation inventory (unified architecture migration) — project_items.
 *
 * Backed by the project_items table from migration 0086:
 *   - project_items(id TEXT PK, tenant_id TEXT, project_id TEXT, item_type,
 *     name, description, base_price, quantity, meta_data, status, created_at,
 *     updated_at).
 *
 * Mounting (index.js): admin-only scope behind /api/projects/items:
 *   const projectItemsAdminScope = resolveScope();
 *   app.use('/api/projects/items', projectItemsAdminScope);
 *   app.use('/api/projects/items/*', projectItemsAdminScope);
 *   app.route('/api/projects/items', projectItemsRoutes);
 *
 * Access model (self-enforced so the router is safe under ANY mount):
 *   - Every route requires an authenticated admin scope user with a tenant
 *     context (401 otherwise); LIST is tenant-scoped.
 *   - item_type discriminates the project's typed inventory: vehicle /
 *     product / menu_item / service / custom — mirroring the frontend
 *     operation-manifest naming for the non-camp project types.
 *   - MUTATIONS enforce that the owning project exists (not soft-deleted) AND
 *     belongs to the caller's effective tenant — creating an item under a
 *     foreign project is rejected with a 400.
 *   - This is an internal admin feature: there is no public surface.
 */

// ─── Constants ──────────────────────────────────────────────────
export const ITEM_TYPES = ['vehicle', 'product', 'menu_item', 'service', 'custom'];

// ─── Zod Schema ────────────────────────────────────────────────
export const projectItemPostSchema = z.object({
  project_id: z.string({ required_error: 'projectId is required' }).min(1, 'projectId is required'),
  item_type: z.enum(ITEM_TYPES).default('product'),
  name: z.string({ required_error: 'name is required' }).min(1, 'name is required'),
  description: z.string().nullable().optional(),
  base_price: z.number().optional(),
  quantity: z.number().int().optional(),
  meta_data: z.any().optional(),
  status: z.string().min(1).default('active'),
}).strip(); // match sibling routers: strip unknown fields

export const projectItemUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  base_price: z.number().optional(),
  quantity: z.number().int().optional(),
  meta_data: z.any().optional(),
  status: z.string().min(1).optional(),
  item_type: z.enum(ITEM_TYPES).optional(),
}).strip().refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

/** Mutable fields allowed for a PUT — drive the dynamic SET clause. */
const UPDATE_FIELD_COLUMNS = [
  ['name', 'name'],
  ['description', 'description'],
  ['base_price', 'base_price'],
  ['quantity', 'quantity'],
  ['meta_data', 'meta_data'],
  ['status', 'status'],
  ['item_type', 'item_type'],
];

// ─── Helpers ───────────────────────────────────────────────────
const ITEMS_SELECT = `
  SELECT
    pi.id, pi.tenant_id, pi.item_type, pi.name, pi.description,
    pi.base_price, pi.quantity, pi.meta_data, pi.status, pi.created_at, pi.updated_at,
    p.id AS p_id, p.name AS p_name, p.slug AS p_slug, p.project_type AS p_project_type
  FROM project_items pi
  LEFT JOIN projects p ON p.id = pi.project_id
`;

/** id shape matches the sibling generators ('camp_'/'pl_' + uuid slice). */
function newItemId() {
  return 'pi_' + crypto.randomUUID().slice(0, 12);
}

/** Fold a joined row into the wire shape `{ id, itemType, name, …, project }`. */
function toItemWire(row) {
  return {
    id: row.id,
    itemType: row.item_type,
    name: row.name,
    description: row.description,
    basePrice: row.base_price,
    quantity: row.quantity,
    metaData: row.meta_data === null || row.meta_data === undefined ? null : row.meta_data,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    project: row.p_id
      ? { id: row.p_id, name: row.p_name, slug: row.p_slug, projectType: row.p_project_type }
      : null,
  };
}

/** Store meta_data as a JSON string when an object/array is provided. */
function encodeMeta(meta_data) {
  if (meta_data === undefined || meta_data === null) return null;
  return typeof meta_data === 'string' ? meta_data : JSON.stringify(meta_data);
}

/**
 * Tenant gate for mutations. Returns `true` or a ready-to-return Response.
 */
function assertWriteAccess(c) {
  const scope = getScope(c);
  if (!scope.user) {
    return errorResponse('Unauthorized: missing tenant context', 401);
  }
  if (!scope.tenantId) {
    return errorResponse('Tenant context required', 401);
  }
  return true;
}

/**
 * Load a project (soft-delete aware) with its owning tenant and display
 * fields. Returns the row or null.
 */
async function loadProject(DB, projectId) {
  const { results } = await DB.prepare(
    'SELECT id, tenant_id, name, slug, project_type FROM projects WHERE id = ? AND deleted_at IS NULL'
  ).bind(projectId).all();
  return results[0] || null;
}

/** Re-select a joined item row by id (single row). */
async function loadItem(DB, itemId) {
  const { results } = await DB.prepare(
    `${ITEMS_SELECT} WHERE pi.id = ?`
  ).bind(itemId).all();
  return results?.[0] || null;
}

// ─── Router ────────────────────────────────────────────────────
export const projectItemsRoutes = new Hono();

// List the tenant's items, optionally filtered to a project / item type / status.
projectItemsRoutes.get('/', async (c) => {
  try {
    const scope = getScope(c);
    if (!scope.tenantId) {
      return errorResponse('Unauthorized: missing tenant context', 401);
    }
    const tenantId = scope.tenantId;
    const projectId = c.req.query('projectId');
    const itemType = c.req.query('itemType');
    const status = c.req.query('status');

    let sql = `${ITEMS_SELECT} WHERE pi.tenant_id = ?`;
    const args = [tenantId];
    if (projectId) {
      sql += ' AND pi.project_id = ?';
      args.push(projectId);
    }
    if (itemType) {
      sql += ' AND pi.item_type = ?';
      args.push(itemType);
    }
    if (status) {
      sql += ' AND pi.status = ?';
      args.push(status);
    }
    sql += ' ORDER BY pi.created_at, pi.name, pi.id';

    const { results } = await c.env.DB.prepare(sql).bind(...args).all();
    return jsonResponse(results.map(toItemWire));
  } catch (_e) {
    return errorResponse('Failed to load project items');
  }
});

// Create an item under a same-tenant project.
projectItemsRoutes.post('/', async (c) => {
  try {
    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;
    const tenantId = getScope(c).tenantId;

    const parsed = projectItemPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { project_id, item_type, name, description, base_price, quantity, meta_data, status } = parsed.data;

    const project = await loadProject(c.env.DB, project_id);
    if (!project) return errorResponse('Project not found', 404);
    if (project.tenant_id !== tenantId) {
      return errorResponse('Project must belong to your tenant', 400);
    }

    const id = newItemId();
    const encoded = encodeMeta(meta_data);

    await c.env.DB.prepare(
      'INSERT INTO project_items (id, tenant_id, project_id, item_type, name, description, base_price, quantity, meta_data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, tenantId, project_id, item_type, name, description, base_price ?? 0, quantity ?? 1, encoded, status).run();

    // Re-select to return the fully-joined item row (project + metaData).
    const created = await loadItem(c.env.DB, id);
    return jsonResponse(created ? toItemWire(created) : { success: true, id }, 201);
  } catch (_e) {
    return errorResponse('Failed to create project item');
  }
});

// Update mutable fields on an item belonging to the caller's tenant.
projectItemsRoutes.put('/:id', async (c) => {
  try {
    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;
    const tenantId = getScope(c).tenantId;
    const id = c.req.param('id');

    const parsed = projectItemUpdateSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }

    const { results } = await c.env.DB.prepare(
      'SELECT id FROM project_items WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).all();
    if (results.length === 0) {
      return errorResponse('Project item not found', 404);
    }

    const sets = [];
    const args = [];
    for (const [column] of UPDATE_FIELD_COLUMNS) {
      const value = parsed.data[column];
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      args.push(column === 'meta_data' ? encodeMeta(value) : value);
    }
    sets.push(`updated_at = datetime('now')`);

    await c.env.DB.prepare(
      `UPDATE project_items SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
    ).bind(...args, id, tenantId).run();

    const updated = await loadItem(c.env.DB, id);
    return jsonResponse(updated ? toItemWire(updated) : { success: true, id });
  } catch (_e) {
    return errorResponse('Failed to update project item');
  }
});

// Delete an item belonging to the caller's tenant.
projectItemsRoutes.delete('/:id', async (c) => {
  try {
    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;
    const tenantId = getScope(c).tenantId;

    const result = await c.env.DB.prepare(
      'DELETE FROM project_items WHERE id = ? AND tenant_id = ?'
    ).bind(c.req.param('id'), tenantId).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Project item not found', 404);
    }
    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to delete project item');
  }
});

projectItemsRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default projectItemsRoutes;