import { jsonResponse, errorResponse, toSnake, created } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { logAudit } from './audit.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Restaurant pillar — floor tables CRUD + status lifecycle (migration 0069).
 *
 * Backed by pos_tables:
 *   pos_tables(id TEXT PK, tenant_id TEXT NOT NULL REFERENCES tenants(id)
 *              ON DELETE CASCADE, name TEXT NOT NULL,
 *              capacity INTEGER DEFAULT 2,
 *              status TEXT DEFAULT 'available' CHECK IN
 *                ('available','occupied','reserved','cleaning'),
 *              section TEXT, created_at DATETIME)
 *
 * Mounting (index.js):
 *   app.use('/api/pos-tables', resolveScope());
 *   app.use('/api/pos-tables/*', resolveScope());
 *   app.route('/api/pos-tables', posTablesRoutes);
 *
 * Access model:
 *   - GET /        : any authenticated admin-realm session with tenant context;
 *                    tables are grouped by section for floor-plan rendering.
 *   - Mutations    : admin only (role admin | super_admin — managers/cashiers
 *                    get 403). All writes are hard-scoped to the caller's
 *                    tenant and audit-logged best-effort (never fails the op).
 *
 * Table status lifecycle is driven by two surfaces:
 *   - POST /api/pos/orders flips a referenced table to 'occupied' when a
 *     dine-in order is placed against it.
 *   - PATCH /:id/status lets staff move a table through
 *     available ↔ occupied/reserved/cleaning manually.
 */

// ─── Zod Schemas ───────────────────────────────────────────────
export const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];

export const tablePostSchema = z.object({
  name: z.string({ message: 'Name is required' }).min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  capacity: z.number({ message: 'Capacity must be a number' }).int('Capacity must be an integer').min(1, 'Capacity must be at least 1').max(999, 'Capacity must be at most 999').optional(),
  status: z.enum(TABLE_STATUSES, { message: 'Invalid table status' }).optional(),
  section: z.string({ message: 'Section must be text' }).max(100, 'Section must be 100 characters or less').optional(),
}).strip(); // S-M1 fix: strip unknown fields

export const tablePutSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().min(1).max(999).optional(),
  status: z.enum(TABLE_STATUSES).optional(),
  section: z.string().max(100).optional(),
}).strip();

export const tableStatusSchema = z.object({
  status: z.enum(TABLE_STATUSES, { message: 'Invalid table status' }),
}).strip();

// ─── Helpers ───────────────────────────────────────────────────
/** Table id shape matches sibling generators ('ord_'/'tag_' + uuid slice). */
function newTableId() {
  return 'tbl_' + crypto.randomUUID().slice(0, 12);
}

/**
 * Mutation gate: requires an authenticated scope with tenant context AND an
 * admin-tier role ("admin only" — managers/cashiers are rejected).
 * Returns `true` or a ready-to-return Response.
 */
function assertAdminMutation(c) {
  const scope = getScope(c);
  if (!scope.user) {
    return errorResponse('Unauthorized: missing tenant context', 401);
  }
  if (!scope.tenantId) {
    return errorResponse('Tenant context required', 401);
  }
  if (!['admin', 'super_admin'].includes(scope.user.role)) {
    return errorResponse('Forbidden: admin role required', 403);
  }
  return true;
}

/**
 * Best-effort audit write for table mutations. Never throws — logAudit()
 * already swallows its own errors; the extra catch keeps call sites clean.
 */
function auditTableChange(DB, { tenantId, userId, action, entityId, oldValues, newValues }) {
  Promise.resolve(logAudit(DB, {
    tenantId,
    userId,
    action,
    entityType: 'pos_table',
    entityId,
    oldValues,
    newValues,
  })).catch(() => {});
}

// ─── Router (/api/pos-tables) ──────────────────────────────────
const posTablesRoutes = new Hono();

// GET / — list tables for the tenant, grouped by section.
// Response: { sections: [{ section: string|null, tables: [...] }], total }.
// Named sections come first alphabetically; the null section (unassigned
// tables) renders last so floor plans read top-down.
posTablesRoutes.get('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);

    const { results } = await c.env.DB.prepare(
      `SELECT id, tenant_id, name, capacity, status, section, created_at
       FROM pos_tables
       WHERE tenant_id = ?
       ORDER BY section IS NULL, section, name`
    ).bind(tenantId).all();

    const sectionMap = new Map();
    for (const row of results) {
      const key = row.section ?? null;
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key).push(row);
    }
    const sections = [...sectionMap.entries()].map(([section, tables]) => ({ section, tables }));

    return jsonResponse({ sections, total: results.length });
  } catch (_e) {
    return errorResponse('Failed to fetch tables');
  }
});

// POST / — create a table (admin only).
posTablesRoutes.post('/', async (c) => {
  try {
    const access = assertAdminMutation(c);
    if (access instanceof Response) return access;
    const tenantId = getScope(c).tenantId;

    const parsed = tablePostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, capacity, status, section } = parsed.data;

    const tid = newTableId();
    await c.env.DB.prepare(
      `INSERT INTO pos_tables (id, tenant_id, name, capacity, status, section)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(tid, tenantId, name.trim(), capacity ?? 2, status ?? 'available', section?.trim() || null).run();

    auditTableChange(c.env.DB, {
      tenantId,
      userId: getScope(c).user?.id || 'system',
      action: 'create',
      entityId: tid,
      newValues: { name, capacity: capacity ?? 2, status: status ?? 'available', section: section || null },
    });

    return created(tid);
  } catch (_e) {
    return errorResponse('Failed to create table');
  }
});

// PUT /:id — update a table (admin only). Partial COALESCE update.
posTablesRoutes.put('/:id', async (c) => {
  try {
    const access = assertAdminMutation(c);
    if (access instanceof Response) return access;
    const tenantId = getScope(c).tenantId;
    const tableId = c.req.param('id');

    const parsed = tablePutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, capacity, status, section } = parsed.data;

    const result = await c.env.DB.prepare(
      `UPDATE pos_tables SET
        name = COALESCE(?, name),
        capacity = COALESCE(?, capacity),
        status = COALESCE(?, status),
        section = COALESCE(?, section)
       WHERE tenant_id = ? AND id = ?`
    ).bind(
      name !== undefined ? name.trim() : null,
      capacity !== undefined ? capacity : null,
      status !== undefined ? status : null,
      section !== undefined ? (section.trim() || null) : null,
      tenantId,
      tableId,
    ).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Table not found', 404);
    }

    auditTableChange(c.env.DB, {
      tenantId,
      userId: getScope(c).user?.id || 'system',
      action: 'update',
      entityId: tableId,
      newValues: { ...(name !== undefined && { name }), ...(capacity !== undefined && { capacity }), ...(status !== undefined && { status }), ...(section !== undefined && { section }) },
    });

    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to update table');
  }
});

// PATCH /:id/status — move a table through its service lifecycle (admin only).
// available → occupied (dine-in order) / reserved (ahead of arrival)
//           → cleaning (guests left) → available. No state machine here by
// design: staff may jump directly (e.g. occupied → cleaning); the CHECK
// constraint on the column is the validity boundary.
posTablesRoutes.patch('/:id/status', async (c) => {
  try {
    const access = assertAdminMutation(c);
    if (access instanceof Response) return access;
    const tenantId = getScope(c).tenantId;
    const tableId = c.req.param('id');

    const parsed = tableStatusSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { status } = parsed.data;

    const result = await c.env.DB.prepare(
      `UPDATE pos_tables SET status = ? WHERE tenant_id = ? AND id = ?`
    ).bind(status, tenantId, tableId).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Table not found', 404);
    }

    auditTableChange(c.env.DB, {
      tenantId,
      userId: getScope(c).user?.id || 'system',
      action: 'update',
      entityId: tableId,
      oldValues: undefined, // prior status not loaded — single-statement fast path
      newValues: { status },
    });

    return jsonResponse({ success: true, id: tableId, status });
  } catch (_e) {
    return errorResponse('Failed to update table status');
  }
});

// DELETE /:id — remove a table (admin only). Orders referencing it keep their
// history: orders/pos_transactions.table_id are ON DELETE SET NULL (0069).
posTablesRoutes.delete('/:id', async (c) => {
  try {
    const access = assertAdminMutation(c);
    if (access instanceof Response) return access;
    const tenantId = getScope(c).tenantId;
    const tableId = c.req.param('id');

    const result = await c.env.DB.prepare(
      `DELETE FROM pos_tables WHERE tenant_id = ? AND id = ?`
    ).bind(tenantId, tableId).run();
    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Table not found', 404);
    }

    auditTableChange(c.env.DB, {
      tenantId,
      userId: getScope(c).user?.id || 'system',
      action: 'delete',
      entityId: tableId,
    });

    return jsonResponse({ success: true });
  } catch (_e) {
    return errorResponse('Failed to delete table');
  }
});

posTablesRoutes.patch('/:id/reserve', async (c) => {
  try {
    const access = assertAdminMutation(c);
    if (access instanceof Response) return access;
    const tenantId = getScope(c).tenantId;
    const tableId = c.req.param('id');
    const { reservation_name, reservation_time, reservation_date, party_size } = await c.req.json();
    if (!reservation_name || !reservation_time) return errorResponse('reservation_name and reservation_time are required', 400);
    const result = await c.env.DB.prepare(
      `UPDATE pos_tables SET status = 'reserved', reservation_name = ?, reservation_time = ?, reservation_date = ?, party_size = ?
       WHERE tenant_id = ? AND id = ?`
    ).bind(reservation_name, reservation_time, reservation_date || null, party_size || 0, tenantId, tableId).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse('Table not found', 404);
    return jsonResponse({ success: true, id: tableId, status: 'reserved' });
  } catch (e) {
    return errorResponse('Failed to reserve table');
  }
});

posTablesRoutes.patch('/:id/release', async (c) => {
  try {
    const access = assertAdminMutation(c);
    if (access instanceof Response) return access;
    const tenantId = getScope(c).tenantId;
    const tableId = c.req.param('id');
    const result = await c.env.DB.prepare(
      `UPDATE pos_tables SET status = 'available', reservation_name = NULL, reservation_time = NULL,
       reservation_date = NULL, party_size = 0
       WHERE tenant_id = ? AND id = ? AND status = 'reserved'`
    ).bind(tenantId, tableId).run();
    if ((result?.meta?.changes ?? 0) === 0) return errorResponse('Table not found or not reserved', 404);
    return jsonResponse({ success: true, id: tableId, status: 'available' });
  } catch (e) {
    return errorResponse('Failed to release table');
  }
});

posTablesRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default posTablesRoutes;
