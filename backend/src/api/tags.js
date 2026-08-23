import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { slugify } from '../utils/slug';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Tags CRUD + project-tag associations (unified architecture migration).
 *
 * Backed by the taxonomy tables from migration 0058:
 *   - tags(id TEXT PK, tenant_id TEXT NOT NULL, name, slug, UNIQUE(tenant_id, slug))
 *   - project_tags(project_id TEXT, tag_id TEXT, PK(project_id, tag_id))
 *     (both FKs → projects(id)/tags(id) ON DELETE CASCADE after 0063)
 *
 * Mounting (index.js):
 *   app.use('/api/tags', resolveScope());
 *   app.route('/api/tags', tagsRoutes);
 *   app.use('/api/projects/:projectId/tags', resolveScope());
 *   app.route('/api/projects/:projectId/tags', projectTagsRoutes);
 *
 * Access model (self-enforced, mirrors meta.js):
 *   - GET    : readable without authentication (public browsing/filtering).
 *   - Writes : authenticated admin scope required; non-super_admins hard-scoped
 *              to their own tenant; project writes additionally require the
 *              target project to exist (not soft-deleted) and belong to them.
 */

// ─── Zod Schemas ───────────────────────────────────────────────
export const tagPostSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).min(1, 'Name is required'),
  // Optional explicit slug override; auto-generated from name when omitted.
  slug: z.string().optional(),
}).strip(); // S-M1 fix: strip unknown fields

export const tagPutSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
}).strip();

export const projectTagsPostSchema = z.object({
  tag_ids: z.array(z.string()).optional(),
  tag_names: z.array(z.string()).optional(),
}).strip().refine(
  (data) =>
    (Array.isArray(data.tag_ids) && data.tag_ids.length > 0) ||
    (Array.isArray(data.tag_names) && data.tag_names.length > 0),
  { message: 'Either tag_ids or tag_names is required' },
);

// ─── Helpers ───────────────────────────────────────────────────
/** Tag id shape matches sibling generators ('camp_'/'prod_' + uuid slice). */
function newTagId() {
  return 'tag_' + crypto.randomUUID().slice(0, 12); // L1 fix
}

/**
 * Tenant gate for tag mutations. Returns `true` or a ready-to-return Response.
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

/** Super admins may operate on any tenant via scope; others are pinned to theirs. */
function effectiveTenantId(c) {
  const scope = getScope(c);
  return scope.tenantId;
}

/**
 * Load a project for association endpoints — soft-delete aware. Returns
 * `{ id, tenant_id }` or null.
 */
async function loadProject(DB, projectId) {
  const { results } = await DB.prepare(
    'SELECT id, tenant_id FROM projects WHERE id = ? AND deleted_at IS NULL'
  ).bind(projectId).all();
  return results[0] || null;
}

/**
 * Project access resolution: entity must exist and belong to the caller's
 * tenant (super_admin bypass). Returns `{ project }` or an error Response.
 */
async function resolveProjectAccess(c, DB) {
  const projectId = c.req.param('projectId');
  const project = projectId ? await loadProject(DB, projectId) : null;
  if (!project) return errorResponse('Project not found', 404);

  const scope = getScope(c);
  if (scope.user && scope.user.role !== 'super_admin' && scope.tenantId !== project.tenant_id) {
    return errorResponse('Forbidden: Access denied to this tenant', 403);
  }
  return { project };
}

/**
 * Find-or-create tenant tags from display names. Returns the resolved tag ids
 * (existing + newly created), deduplicated by slug.
 */
async function findOrCreateTagsByName(DB, tenantId, names) {
  const ids = [];
  const toCreate = []; // { slug, name }
  const seenSlugs = new Set();

  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const { results } = await DB.prepare(
      'SELECT id FROM tags WHERE tenant_id = ? AND slug = ?'
    ).bind(tenantId, slug).all();
    if (results.length > 0) {
      ids.push(results[0].id);
    } else {
      toCreate.push({ slug, name });
    }
  }

  if (toCreate.length > 0) {
    // Batch insert — P-H2 fix; UNIQUE(tenant_id, slug) makes re-races no-ops.
    const createdIds = toCreate.map(() => newTagId());
    await DB.batch(toCreate.map((tag, i) =>
      DB.prepare('INSERT OR IGNORE INTO tags (id, tenant_id, name, slug) VALUES (?, ?, ?, ?)')
        .bind(createdIds[i], tenantId, tag.name, tag.slug)
    ));
    for (let i = 0; i < toCreate.length; i++) ids.push(createdIds[i]);
  }

  return [...new Set(ids)];
}

// ─── Tags router (/api/tags) ───────────────────────────────────
export const tagsRoutes = new Hono();

tagsRoutes.get('/', async (c) => {
  const tenantId = effectiveTenantId(c);
  if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM tags WHERE tenant_id = ? ORDER BY name'
  ).bind(tenantId).all();
  return jsonResponse(results);
});

tagsRoutes.post('/', async (c) => {
  try {
    const access = assertWriteAccess(c);
    if (access instanceof Response) return access;
    const tenantId = effectiveTenantId(c);

    const parsed = tagPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    let { name, slug } = parsed.data;
    slug = slugify(slug || name);
    if (!slug) {
      return errorResponse('Name must contain alphanumeric characters', 400);
    }

    // UNIQUE(tenant_id, slug) guard with a clean 409 before the constraint throws.
    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM tags WHERE tenant_id = ? AND slug = ?'
    ).bind(tenantId, slug).all();
    if (existing.length > 0) {
      return errorResponse('Tag already exists', 409);
    }

    const tid = newTagId();
    await c.env.DB.prepare(
      'INSERT INTO tags (id, tenant_id, name, slug) VALUES (?, ?, ?, ?)'
    ).bind(tid, tenantId, name, slug).run();
    return jsonResponse({ id: tid, success: true });
  } catch (_e) {
    return errorResponse('Failed to create tag');
  }
});

tagsRoutes.put('/:id', async (c) => {
  try {
    const access = assertWriteAccess(c);
    if (access instanceof Response) return access;
    const tenantId = effectiveTenantId(c);

    const parsed = tagPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    let { name, slug } = parsed.data;
    if (name !== undefined && slug === undefined) {
      slug = slugify(name); // keep slug in lockstep unless explicitly overridden
    }
    if (slug !== undefined) {
      slug = slugify(slug);
      if (!slug) {
        return errorResponse('Slug must contain alphanumeric characters', 400);
      }
    }

    if (slug !== undefined) {
      // Slug collision check excluding the row being renamed.
      const { results: clash } = await c.env.DB.prepare(
        'SELECT id FROM tags WHERE tenant_id = ? AND slug = ? AND id != ?'
      ).bind(tenantId, slug, c.req.param('id')).all();
      if (clash.length > 0) {
        return errorResponse('Tag already exists', 409);
      }
    }

    const result = await c.env.DB.prepare(
      `UPDATE tags SET
        name = COALESCE(?, name),
        slug = COALESCE(?, slug)
       WHERE tenant_id = ? AND id = ?`
    ).bind(
      name !== undefined ? name : null,
      slug !== undefined ? slug : null,
      tenantId,
      c.req.param('id'),
    ).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Tag not found', 404);
    }
    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to update tag');
  }
});

tagsRoutes.delete('/:id', async (c) => {
  try {
    const access = assertWriteAccess(c);
    if (access instanceof Response) return access;
    const tenantId = effectiveTenantId(c);

    const tagId = c.req.param('id');
    // Junction rows first, then the tag — one atomic batch (D1 transaction).
    const stmts = [
      c.env.DB.prepare('DELETE FROM project_tags WHERE tag_id = ?').bind(tagId),
      c.env.DB.prepare('DELETE FROM tags WHERE tenant_id = ? AND id = ?').bind(tenantId, tagId),
    ];
    const results = await c.env.DB.batch(stmts);
    if ((results?.[1]?.meta?.changes ?? 0) === 0) {
      return errorResponse('Tag not found', 404);
    }
    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to delete tag');
  }
});

tagsRoutes.all('*', () => errorResponse('Method not allowed', 405));

// ─── Project tags router (/api/projects/:projectId/tags) ───────
export const projectTagsRoutes = new Hono();

projectTagsRoutes.get('/', async (c) => {
  const resolved = await resolveProjectAccess(c, c.env.DB);
  if (resolved instanceof Response) return resolved;

  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.tenant_id, t.name, t.slug
     FROM tags t
     INNER JOIN project_tags pt ON pt.tag_id = t.id
     WHERE pt.project_id = ?
     ORDER BY t.name`
  ).bind(resolved.project.id).all();
  return jsonResponse(results);
});

projectTagsRoutes.post('/', async (c) => {
  try {
    const resolved = await resolveProjectAccess(c, c.env.DB);
    if (resolved instanceof Response) return resolved;

    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;
    const tenantId = effectiveTenantId(c);

    const parsed = projectTagsPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { tag_ids, tag_names } = parsed.data;

    let requestedIds = Array.isArray(tag_ids) ? [...tag_ids] : [];

    // tag_names → find-or-create first, then merge with explicit tag_ids.
    if (Array.isArray(tag_names) && tag_names.length > 0) {
      const byName = await findOrCreateTagsByName(c.env.DB, tenantId, tag_names);
      requestedIds = requestedIds.concat(byName);
    }
    const uniqueIds = [...new Set(requestedIds.filter((id) => typeof id === 'string' && id))];
    if (uniqueIds.length === 0) {
      return errorResponse('No valid tags provided', 400);
    }

    // Ownership filter: a foreign/unknown tag_id must never attach to the project.
    const placeholders = uniqueIds.map(() => '?').join(',');
    const { results: owned } = await c.env.DB.prepare(
      `SELECT id FROM tags WHERE tenant_id = ? AND id IN (${placeholders})`
    ).bind(tenantId, ...uniqueIds).all();
    const ownedIds = owned.map((r) => r.id);
    if (ownedIds.length === 0) {
      return errorResponse('No valid tags provided', 400);
    }

    const ownedPlaceholders = ownedIds.map(() => '?').join(',');
    const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO project_tags (project_id, tag_id)
       SELECT ?, id FROM tags WHERE tenant_id = ? AND id IN (${ownedPlaceholders})`
    ).bind(resolved.project.id, tenantId, ...ownedIds).run();
    return jsonResponse({
      success: true,
      added: result?.meta?.changes ?? 0,
      tag_ids: ownedIds,
    });
  } catch (_e) {
    return errorResponse('Failed to add tags to project');
  }
});

projectTagsRoutes.delete('/:tagId', async (c) => {
  try {
    const resolved = await resolveProjectAccess(c, c.env.DB);
    if (resolved instanceof Response) return resolved;

    const writeAccess = assertWriteAccess(c);
    if (writeAccess instanceof Response) return writeAccess;

    const result = await c.env.DB.prepare(
      'DELETE FROM project_tags WHERE project_id = ? AND tag_id = ?'
    ).bind(resolved.project.id, c.req.param('tagId')).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Tag not attached to this project', 404);
    }
    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to remove tag from project');
  }
});

projectTagsRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default tagsRoutes;
