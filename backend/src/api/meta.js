import { jsonResponse, cachedJsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Meta CRUD (unified architecture migration) — EAV custom fields.
 *
 * Backed by the meta tables from migration 0058:
 *   - tenant_meta(id INTEGER PK, tenant_id TEXT, meta_key, meta_value, sort_order)
 *   - project_meta(id INTEGER PK, project_id TEXT, meta_key, meta_value, sort_order)
 *     (project_meta.project_id FK → projects(id) after the 0063 rename)
 *
 * Mounting (index.js):
 *   const metaPublicScope = resolveScope({ public: true });
 *   const metaAdminScope  = resolveScope();
 *   app.use('/api/tenants/:tenantId/meta', methodAwareScope);
 *   app.route('/api/tenants/:tenantId/meta', tenantMetaRoutes);
 *
 * Access model (self-enforced so the routers are safe under ANY mount):
 *   - GET    : readable regardless of authentication — rows belong to the entity
 *              explicitly named in the path (same exposure class as /api/camps;
 *              0062 moved public display data like notes/activities here).
 *   - Writes : require an authenticated admin scope user; non-super_admins must
 *              be scoped to the target entity's owning tenant. No session → 401,
 *              foreign tenant → 403 (byte-compat with requireAuth wording).
 */

// ─── Zod Schemas ───────────────────────────────────────────────
export const metaPostSchema = z.object({
  meta_key: z.string({ required_error: 'Meta key is required' }).min(1, 'Meta key is required'),
  meta_value: z.string({ required_error: 'Meta value is required' }).min(1, 'Meta value is required'),
  sort_order: z.number().int().min(0).optional(),
}).strip(); // S-M1 fix: strip unknown fields

export const metaPutSchema = z.object({
  meta_value: z.string().min(1).optional(),
  sort_order: z.number().int().min(0).optional(),
}).strip();

export const metaReorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.number({ required_error: 'Item id is required' }).int(),
      sort_order: z.number({ required_error: 'sort_order is required' }).int().min(0),
    }),
    { required_error: 'items is required' },
  ).min(1, 'At least one item is required'),
}).strip();

// ─── Helpers ───────────────────────────────────────────────────
/** ':id' params target INTEGER AUTOINCREMENT pks — reject anything non-numeric. */
function parseIntId(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && String(n) === String(raw).trim() ? n : null;
}

/**
 * Tenant-match gate. Returns `true` when allowed, otherwise a ready-to-return
 * error Response. Fails safe: no authenticated scope user → 401; authenticated
 * non-super_admin scoped to another tenant → 403.
 */
function assertWriteAccess(c, entityTenantId) {
  const scope = getScope(c);
  if (!scope.user) {
    return errorResponse('Unauthorized: missing tenant context', 401);
  }
  if (scope.user.role !== 'super_admin' && scope.tenantId !== entityTenantId) {
    return errorResponse('Forbidden: Access denied to this tenant', 403);
  }
  return true;
}

/**
 * Load the owning tenant of a project (soft-delete aware — meta on a deleted
 * project stays unreachable). Returns `{ id, tenant_id }` or null.
 */
async function loadProject(DB, projectId) {
  const { results } = await DB.prepare(
    'SELECT id, tenant_id FROM projects WHERE id = ? AND deleted_at IS NULL'
  ).bind(projectId).all();
  return results[0] || null;
}

/**
 * Fold meta rows into a plain `{ [meta_key]: meta_value }` object
 * (duplicate keys: later sort_order/id wins). Rows without a usable
 * meta_key are skipped.
 */
function foldMeta(rows) {
  const out = {};
  for (const row of rows || []) {
    if (row && row.meta_key !== undefined && row.meta_key !== null) {
      out[row.meta_key] = row.meta_value;
    }
  }
  return out;
}

// ─── Router factory ────────────────────────────────────────────
/**
 * Build a meta CRUD router against ONE table.
 *
 * @param {'tenant_meta'|'project_meta'} table
 * @param {'tenant_id'|'project_id'} fkColumn
 * @param {(c, DB) => Promise<{fkValue: string, tenantId: string}|Response>} resolveEntity
 *        Resolves the path-param entity → the FK value to bind and the owning
 *        tenant for the access gate (404 Response when the entity is absent).
 */
function createMetaRoutes(table, fkColumn, resolveEntity) {
  const routes = new Hono();

  /** Shared preamble: resolve entity, then (for writes) enforce the tenant gate. */
  async function guard(c, DB, { requireWrite }) {
    const resolved = await resolveEntity(c, DB);
    if (resolved instanceof Response) return resolved;
    if (requireWrite) {
      const access = assertWriteAccess(c, resolved.tenantId);
      if (access instanceof Response) return access;
    }
    return resolved;
  }

  // Bulk reorder — literal path declared before the parametrized /:id handlers.
  routes.patch('/reorder', async (c) => {
    try {
      const resolved = await guard(c, c.env.DB, { requireWrite: true });
      if (resolved instanceof Response) return resolved;

      const parsed = metaReorderSchema.safeParse(toSnake(await c.req.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }

      // DB.batch executes as ONE implicit transaction (D1) — all-or-nothing.
      const stmts = parsed.data.items.map((item) =>
        c.env.DB.prepare(
          `UPDATE ${table} SET sort_order = ? WHERE ${fkColumn} = ? AND id = ?`
        ).bind(item.sort_order, resolved.fkValue, item.id)
      );
      await c.env.DB.batch(stmts);
      return jsonResponse({ success: true, updated: parsed.data.items.length });
    } catch (_e) {
      return errorResponse('Failed to reorder meta');
    }
  });

  // List all meta for the entity (multi-value friendly ordering).
  routes.get('/', async (c) => {
    const resolved = await guard(c, c.env.DB, { requireWrite: false });
    if (resolved instanceof Response) return resolved;
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM ${table} WHERE ${fkColumn} = ? ORDER BY sort_order, id`
    ).bind(resolved.fkValue).all();
    return cachedJsonResponse(results);
  });

  // Add a meta field. Returns the auto-increment id via meta.last_row_id.
  routes.post('/', async (c) => {
    try {
      const resolved = await guard(c, c.env.DB, { requireWrite: true });
      if (resolved instanceof Response) return resolved;

      const parsed = metaPostSchema.safeParse(toSnake(await c.req.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { meta_key, meta_value, sort_order } = parsed.data;

      const result = await c.env.DB.prepare(
        `INSERT INTO ${table} (${fkColumn}, meta_key, meta_value, sort_order) VALUES (?, ?, ?, ?)`
      ).bind(resolved.fkValue, meta_key, meta_value, sort_order ?? 0).run();
      return jsonResponse({ success: true, id: result?.meta?.last_row_id ?? null });
    } catch (_e) {
      return errorResponse('Failed to create meta');
    }
  });

  // Update one meta field (value and/or sort_order) — COALESCE partial-update idiom.
  routes.put('/:id', async (c) => {
    try {
      const resolved = await guard(c, c.env.DB, { requireWrite: true });
      if (resolved instanceof Response) return resolved;

      const metaId = parseIntId(c.req.param('id'));
      if (metaId === null) {
        return errorResponse('Invalid meta id', 400);
      }

      const parsed = metaPutSchema.safeParse(toSnake(await c.req.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { meta_value, sort_order } = parsed.data;

      const result = await c.env.DB.prepare(
        `UPDATE ${table} SET
          meta_value = COALESCE(?, meta_value),
          sort_order = COALESCE(?, sort_order)
         WHERE ${fkColumn} = ? AND id = ?`
      ).bind(
        meta_value !== undefined ? meta_value : null,
        sort_order !== undefined ? sort_order : null,
        resolved.fkValue,
        metaId,
      ).run();
      if ((result?.meta?.changes ?? 0) === 0) {
        return errorResponse('Meta not found', 404);
      }
      return jsonResponse({ success: true });
    } catch (_e) {
      return errorResponse('Failed to update meta');
    }
  });

  // Delete one meta field.
  routes.delete('/:id', async (c) => {
    try {
      const resolved = await guard(c, c.env.DB, { requireWrite: true });
      if (resolved instanceof Response) return resolved;

      const metaId = parseIntId(c.req.param('id'));
      if (metaId === null) {
        return errorResponse('Invalid meta id', 400);
      }

      const result = await c.env.DB.prepare(
        `DELETE FROM ${table} WHERE ${fkColumn} = ? AND id = ?`
      ).bind(resolved.fkValue, metaId).run();
      if ((result?.meta?.changes ?? 0) === 0) {
        return errorResponse('Meta not found', 404);
      }
      return jsonResponse({ success: true });
    } catch (_e) {
      return errorResponse('Failed to delete meta');
    }
  });

  // All values for ONE meta_key — multi-value fields return every row,
  // ordered by sort_order then id.
  routes.get('/:key', async (c) => {
    const resolved = await guard(c, c.env.DB, { requireWrite: false });
    if (resolved instanceof Response) return resolved;
    const key = c.req.param('key');
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM ${table} WHERE ${fkColumn} = ? AND meta_key = ? ORDER BY sort_order, id`
    ).bind(resolved.fkValue, key).all();
    return cachedJsonResponse(results);
  });

  routes.all('*', () => errorResponse('Method not allowed', 405));
  return routes;
}

// ─── Tenant meta router (/api/tenants/:tenantId/meta) ──────────
export const tenantMetaRoutes = createMetaRoutes('tenant_meta', 'tenant_id',
  async (c, DB) => {
    const tenantId = c.req.param('tenantId');
    if (!tenantId) return errorResponse('Tenant not found', 404);
    // Existence check keeps 404 semantics uniform across both routers.
    const { results } = await DB.prepare(
      'SELECT id FROM tenants WHERE id = ?'
    ).bind(tenantId).all();
    if (results.length === 0) return errorResponse('Tenant not found', 404);
    return { fkValue: tenantId, tenantId };
  }
);

// ─── Project meta router (/api/projects/:projectId/meta) ───────
export const projectMetaRoutes = createMetaRoutes('project_meta', 'project_id',
  async (c, DB) => {
    const projectId = c.req.param('projectId');
    const project = projectId ? await loadProject(DB, projectId) : null;
    if (!project) return errorResponse('Project not found', 404);
    return { fkValue: project.id, tenantId: project.tenant_id };
  }
);

export default { tenantMetaRoutes, projectMetaRoutes };

/**
 * Load a project's full meta map — used by camps.js GET /:id to embed the
 * `meta` object alongside the project row.
 */
export async function loadProjectMeta(DB, projectId) {
  const { results } = await DB.prepare(
    'SELECT meta_key, meta_value FROM project_meta WHERE project_id = ? ORDER BY sort_order, id'
  ).bind(projectId).all();
  return foldMeta(results);
}
