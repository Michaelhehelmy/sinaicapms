import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Cross-project connections (unified architecture migration) — project_links.
 *
 * Backed by the project_links table from migration 0085:
 *   - project_links(id TEXT PK DEFAULT hex(randomblob(16)), tenant_id TEXT,
 *     project_id_a TEXT, project_id_b TEXT, link_type, meta_data, created_at,
 *     created_by), UNIQUE(project_id_a, project_id_b, link_type).
 *
 * Mounting (index.js): admin-only scope behind /api/projects/links:
 *   const projectLinksAdminScope = resolveScope();
 *   app.use('/api/projects/links', projectLinksAdminScope);
 *   app.use('/api/projects/links/*', projectLinksAdminScope);
 *   app.route('/api/projects/links', projectLinksRoutes);
 *
 * Access model (self-enforced so the router is safe under ANY mount):
 *   - Every route requires an authenticated admin scope user with a tenant
 *     context (401 otherwise); LIST is tenant-scoped.
 *   - MUTATIONS enforce that both linked projects exist (not soft-deleted) AND
 *     belong to the caller's effective tenant — building a link across tenants
 *     is rejected with a 400.
 *   - This is an internal admin feature: there is no public surface.
 */

// ─── Zod Schema ────────────────────────────────────────────────
export const projectLinkPostSchema = z.object({
  project_id_a: z.string({ required_error: 'projectIdA is required' }).min(1, 'projectIdA is required'),
  project_id_b: z.string({ required_error: 'projectIdB is required' }).min(1, 'projectIdB is required'),
  link_type: z.string().min(1).default('connection'),
  meta_data: z.any().optional(),
}).strip(); // S-M1 fix: strip unknown fields

// ─── Helpers ───────────────────────────────────────────────────
const LINKS_SELECT = `
  SELECT
    pl.id, pl.tenant_id, pl.link_type, pl.meta_data, pl.created_at,
    pa.id AS a_id, pa.name AS a_name, pa.slug AS a_slug, pa.project_type AS a_project_type,
    pb.id AS b_id, pb.name AS b_name, pb.slug AS b_slug, pb.project_type AS b_project_type
  FROM project_links pl
  LEFT JOIN projects pa ON pa.id = pl.project_id_a
  LEFT JOIN projects pb ON pb.id = pl.project_id_b
`;

/** id shape matches the sibling generators ('camp_'/'tag_' + uuid slice). */
function newLinkId() {
  return 'pl_' + crypto.randomUUID().slice(0, 12);
}

/** Fold a joined row into the wire shape `{ id, linkType, metaData, a, b }`. */
function toLinkWire(row) {
  return {
    id: row.id,
    linkType: row.link_type,
    metaData: row.meta_data === null || row.meta_data === undefined ? null : row.meta_data,
    a: { id: row.a_id, name: row.a_name, slug: row.a_slug, projectType: row.a_project_type },
    b: { id: row.b_id, name: row.b_name, slug: row.b_slug, projectType: row.b_project_type },
  };
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

// ─── Router ────────────────────────────────────────────────────
export const projectLinksRoutes = new Hono();

// List links for the tenant, optionally filtered to those touching a project.
projectLinksRoutes.get('/', async (c) => {
  try {
    const scope = getScope(c);
    if (!scope.tenantId) {
      return errorResponse('Unauthorized: missing tenant context', 401);
    }
    const tenantId = scope.tenantId;
    const projectId = c.req.query('projectId');

    let sql = `${LINKS_SELECT} WHERE pl.tenant_id = ?`;
    const args = [tenantId];
    if (projectId) {
      sql += ' AND (pl.project_id_a = ? OR pl.project_id_b = ?)';
      args.push(projectId, projectId);
    }
    sql += ' ORDER BY pl.created_at, pl.id';

    const { results } = await c.env.DB.prepare(sql).bind(...args).all();
    return jsonResponse(results.map(toLinkWire));
  } catch (_e) {
    return errorResponse('Failed to load project links');
  }
});

// Create a same-tenant link between two distinct projects.
projectLinksRoutes.post('/', async (c) => {
  try {
    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;
    const tenantId = getScope(c).tenantId;

    const parsed = projectLinkPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { project_id_a, project_id_b, link_type, meta_data } = parsed.data;

    if (project_id_a === project_id_b) {
      return errorResponse('A project cannot be linked to itself', 400);
    }

    const [a, b] = await Promise.all([
      loadProject(c.env.DB, project_id_a),
      loadProject(c.env.DB, project_id_b),
    ]);
    if (!a) return errorResponse('Project not found', 404);
    if (!b) return errorResponse('Project not found', 404);
    if (a.tenant_id !== tenantId || b.tenant_id !== tenantId) {
      return errorResponse('Both projects must belong to your tenant', 400);
    }

    const id = newLinkId();
    const encoded =
      meta_data === undefined || meta_data === null
        ? null
        : typeof meta_data === 'string'
          ? meta_data
          : JSON.stringify(meta_data);

    await c.env.DB.prepare(
      'INSERT INTO project_links (id, tenant_id, project_id_a, project_id_b, link_type, meta_data, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, tenantId, project_id_a, project_id_b, link_type, encoded, getScope(c).user?.id || null).run();

    // Re-select to return the fully-joined link row (a/b + metaData).
    const { results } = await c.env.DB.prepare(
      `${LINKS_SELECT} WHERE pl.id = ?`
    ).bind(id).all();
    const created = results?.[0];
    return jsonResponse(created ? toLinkWire(created) : { success: true, id }, 201);
  } catch (_e) {
    return errorResponse('Failed to create project link');
  }
});

// Delete a link belonging to the caller's tenant.
projectLinksRoutes.delete('/:id', async (c) => {
  try {
    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;
    const tenantId = getScope(c).tenantId;

    const result = await c.env.DB.prepare(
      'DELETE FROM project_links WHERE id = ? AND tenant_id = ?'
    ).bind(c.req.param('id'), tenantId).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Project link not found', 404);
    }
    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to delete project link');
  }
});

projectLinksRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default projectLinksRoutes;
