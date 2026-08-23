import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Audit log (unified architecture migration).
 *
 * Backed by audit_log from migration 0058:
 *   audit_log(id TEXT PK, tenant_id TEXT NOT NULL,
 *             user_id TEXT NOT NULL,
 *             action TEXT CHECK IN ('create','update','delete'),
 *             entity_type TEXT CHECK IN ('tenant','project','admin'),
 *             entity_id TEXT NOT NULL,
 *             old_values TEXT JSON, new_values TEXT JSON,
 *             created_at DATETIME DEFAULT CURRENT_TIMESTAMP)
 *
 * Mounting (index.js):
 *   app.use('/api/audit', resolveScope());
 *   app.route('/api/audit', auditRoutes);
 *
 * Usage split:
 *   - logAudit()      : THE internal write path. Other API handlers import and
 *                       await it inline — best-effort by design so a failed
 *                       audit row never breaks the business operation.
 *   - POST /api/audit : HTTP escape hatch for authenticated admins/tools that
 *                       cannot share the module graph. NOT for same-worker
 *                       handlers — call logAudit() directly instead.
 *   - GET /api/audit  : tenant-scoped listing with optional filters.
 */

// ─── Zod Schemas ───────────────────────────────────────────────
export const AUDIT_ACTIONS = ['create', 'update', 'delete'];
export const AUDIT_ENTITY_TYPES = ['tenant', 'project', 'admin'];

export const auditQuerySchema = z.object({
  entity_type: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entity_id: z.string().optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
}).strip();

export const auditPostSchema = z.object({
  tenant_id: z.string().optional(), // defaults to the caller's scope
  user_id: z.string().optional(),   // defaults to scope user id, then 'system'
  action: z.enum(AUDIT_ACTIONS, {
    required_error: 'Action is required',
    invalid_type_error: 'Action must be one of create, update, delete',
  }),
  entity_type: z.enum(AUDIT_ENTITY_TYPES, {
    required_error: 'Entity type is required',
    invalid_type_error: 'Entity type must be one of tenant, project, admin',
  }),
  entity_id: z.string({ required_error: 'Entity id is required' }).min(1, 'Entity id is required'),
  old_values: z.unknown().optional(), // object | string | null — stringified on insert
  new_values: z.unknown().optional(),
}).strip();

// ─── Internal write helper ─────────────────────────────────────
/**
 * Insert one audit entry. BEST-EFFORT: catches its own errors (console.error)
 * and returns the generated id — or null on failure — so callers never need
 * their own try/catch around audit bookkeeping.
 *
 * @param {D1Database} DB
 * @param {{ tenantId: string, userId: string, action: 'create'|'update'|'delete',
 *           entityType: 'tenant'|'project'|'admin', entityId: string,
 *           oldValues?: unknown, newValues?: unknown }} params
 * @returns {Promise<string|null>} generated audit id (null when the write failed)
 */
export async function logAudit(DB, { tenantId, userId, action, entityType, entityId, oldValues, newValues }) {
  try {
    if (!tenantId || !userId || !action || !entityType || !entityId) return null;
    const id = 'audit_' + crypto.randomUUID().slice(0, 12);
    const serialize = (v) => {
      if (v === undefined || v === null) return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    };
    await DB.prepare(
      `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, tenantId, userId, action, entityType, entityId, serialize(oldValues), serialize(newValues)).run();
    return id;
  } catch (e) {
    // Audit trail must never break the caller's operation.
    console.error('logAudit failed:', e?.message || String(e));
    return null;
  }
}

// ─── Router (/api/audit) ───────────────────────────────────────
export const auditRoutes = new Hono();

auditRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);

  const url = new URL(c.req.url);
  const parsed = auditQuerySchema.safeParse({
    entity_type: url.searchParams.get('entity_type') || undefined,
    entity_id: url.searchParams.get('entity_id') || undefined,
    action: url.searchParams.get('action') || undefined,
  });
  if (!parsed.success) {
    return validationError(parsed);
  }

  // T6 envelope ({ data, total, page, pageSize, hasMore }); legacy-style
  // limit/offset are accepted as aliases — explicit offset pins page =
  // floor(offset / pageSize) + 1 so both styles stay coherent.
  let { page, pageSize, offset } = parsePagination(url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '', 10);
  const rawOffset = parseInt(url.searchParams.get('offset') || '', 10);
  if (Number.isFinite(rawLimit) && rawLimit >= 1 && !url.searchParams.get('pageSize')) {
    pageSize = Math.min(rawLimit, 200);
  }
  if (Number.isFinite(rawOffset) && rawOffset >= 0 && !url.searchParams.get('page')) {
    offset = rawOffset;
    page = Math.floor(offset / pageSize) + 1;
  }

  let countQuery = 'SELECT COUNT(*) as total FROM audit_log WHERE tenant_id = ?';
  let dataQuery = 'SELECT * FROM audit_log WHERE tenant_id = ?';
  const bindings = [tenantId];

  const { entity_type, entity_id, action } = parsed.data;
  if (entity_type) {
    countQuery += ' AND entity_type = ?';
    dataQuery += ' AND entity_type = ?';
    bindings.push(entity_type);
  }
  if (entity_id) {
    countQuery += ' AND entity_id = ?';
    dataQuery += ' AND entity_id = ?';
    bindings.push(entity_id);
  }
  if (action) {
    countQuery += ' AND action = ?';
    dataQuery += ' AND action = ?';
    bindings.push(action);
  }

  const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...bindings).all();
  const total = countResults[0]?.total || 0;

  dataQuery += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
  const { results } = await c.env.DB.prepare(dataQuery)
    .bind(...bindings, pageSize, offset).all();

  return jsonResponse(paginationEnvelope(results, total, page, pageSize));
});

// HTTP escape hatch — see module docblock; same-worker code should use logAudit().
auditRoutes.post('/', async (c) => {
  try {
    const scope = getScope(c);
    if (!scope.user) {
      return errorResponse('Unauthorized: missing tenant context', 401);
    }

    const parsed = auditPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }

    // Non-super_admins may only audit their own partition.
    const tenantId = parsed.data.tenant_id || scope.tenantId;
    if (!tenantId) return errorResponse('Tenant context required', 400);
    if (scope.user.role !== 'super_admin' && scope.tenantId !== tenantId) {
      return errorResponse('Forbidden: Access denied to this tenant', 403);
    }

    const id = await logAudit(c.env.DB, {
      tenantId,
      userId: parsed.data.user_id || scope.user.id || 'system',
      action: parsed.data.action,
      entityType: parsed.data.entity_type,
      entityId: parsed.data.entity_id,
      oldValues: parsed.data.old_values,
      newValues: parsed.data.new_values,
    });
    return jsonResponse({ success: true, id });
  } catch (_e) {
    return errorResponse('Failed to create audit entry');
  }
});

auditRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default auditRoutes;
