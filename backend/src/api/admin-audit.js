import { jsonResponse, errorResponse } from '../utils/response';
import { requireAuth } from '../middleware/requireAuth.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Cross-tenant Audit Log (Super Admin only).
 *
 * Unlike the tenant-scoped /api/audit routes, this endpoint lets a super admin
 * view audit entries across ALL tenants with rich filtering.
 *
 * Mounting (index.js):
 *   app.use('/api/admin/audit', superAdminGate);
 *   app.route('/api/admin/audit', adminAuditRoutes);
 */

const superAdminGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

const auditQuerySchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  entityType: z.enum(['tenant', 'project', 'admin']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).strip();

// ─── Router ────────────────────────────────────────────────────
export const adminAuditRoutes = new Hono();

// GET /api/admin/audit — cross-tenant audit log with filters
adminAuditRoutes.get('/', async (c) => {
  const auth = await superAdminGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(c.req.url);
    const parsed = auditQuerySchema.safeParse({
      tenantId: url.searchParams.get('tenantId') || url.searchParams.get('tenant_id') || undefined,
      userId: url.searchParams.get('userId') || url.searchParams.get('user_id') || undefined,
      action: url.searchParams.get('action') || undefined,
      entityType: url.searchParams.get('entityType') || url.searchParams.get('entity_type') || undefined,
      startDate: url.searchParams.get('startDate') || url.searchParams.get('start_date') || undefined,
      endDate: url.searchParams.get('endDate') || url.searchParams.get('end_date') || undefined,
    });
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Invalid query parameters' }, 400);
    }

    let { page, pageSize, offset } = parsePagination(url);

    let countQuery = `SELECT COUNT(*) as total FROM audit_log al`;
    let dataQuery = `
      SELECT al.*, t.name as tenant_name, a.email as user_email
      FROM audit_log al
      LEFT JOIN tenants t ON al.tenant_id = t.id
      LEFT JOIN admins a ON al.user_id = a.id
    `;
    const conditions = [];
    const bindings = [];

    const { tenantId, userId, action, entityType, startDate, endDate } = parsed.data;

    if (tenantId) {
      conditions.push('al.tenant_id = ?');
      bindings.push(tenantId);
    }
    if (userId) {
      conditions.push('al.user_id = ?');
      bindings.push(userId);
    }
    if (action) {
      conditions.push('al.action = ?');
      bindings.push(action);
    }
    if (entityType) {
      conditions.push('al.entity_type = ?');
      bindings.push(entityType);
    }
    if (startDate) {
      conditions.push('al.created_at >= ?');
      bindings.push(startDate);
    }
    if (endDate) {
      conditions.push('al.created_at <= ?');
      bindings.push(endDate);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    countQuery += whereClause;
    dataQuery += whereClause;

    const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...bindings).all();
    const total = countResults[0]?.total || 0;

    dataQuery += ' ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?';
    const { results } = await c.env.DB.prepare(dataQuery)
      .bind(...bindings, pageSize, offset).all();

    return jsonResponse(paginationEnvelope(results, total, page, pageSize));
  } catch (e) {
    return errorResponse('Failed to fetch audit logs');
  }
});

// GET /api/admin/audit/export — CSV export of audit logs
adminAuditRoutes.get('/export', async (c) => {
  const auth = await superAdminGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(c.req.url);
    const parsed = auditQuerySchema.safeParse({
      tenantId: url.searchParams.get('tenantId') || url.searchParams.get('tenant_id') || undefined,
      userId: url.searchParams.get('userId') || url.searchParams.get('user_id') || undefined,
      action: url.searchParams.get('action') || undefined,
      entityType: url.searchParams.get('entityType') || url.searchParams.get('entity_type') || undefined,
      startDate: url.searchParams.get('startDate') || url.searchParams.get('start_date') || undefined,
      endDate: url.searchParams.get('endDate') || url.searchParams.get('end_date') || undefined,
    });
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Invalid query parameters' }, 400);
    }

    let query = `
      SELECT al.*, t.name as tenant_name, a.email as user_email
      FROM audit_log al
      LEFT JOIN tenants t ON al.tenant_id = t.id
      LEFT JOIN admins a ON al.user_id = a.id
    `;
    const conditions = [];
    const bindings = [];

    const { tenantId, userId, action, entityType, startDate, endDate } = parsed.data;

    if (tenantId) { conditions.push('al.tenant_id = ?'); bindings.push(tenantId); }
    if (userId) { conditions.push('al.user_id = ?'); bindings.push(userId); }
    if (action) { conditions.push('al.action = ?'); bindings.push(action); }
    if (entityType) { conditions.push('al.entity_type = ?'); bindings.push(entityType); }
    if (startDate) { conditions.push('al.created_at >= ?'); bindings.push(startDate); }
    if (endDate) { conditions.push('al.created_at <= ?'); bindings.push(endDate); }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    query += whereClause + ' ORDER BY al.created_at DESC LIMIT 10000';

    const { results } = await c.env.DB.prepare(query).bind(...bindings).all();

    // Build CSV
    const headers = ['ID', 'Tenant ID', 'Tenant Name', 'User ID', 'User Email', 'Action', 'Entity Type', 'Entity ID', 'Old Values', 'New Values', 'Created At'];
    const csvRows = [headers.join(',')];

    for (const row of results) {
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      csvRows.push([
        esc(row.id), esc(row.tenant_id), esc(row.tenant_name), esc(row.user_id),
        esc(row.user_email), esc(row.action), esc(row.entity_type), esc(row.entity_id),
        esc(row.old_values), esc(row.new_values), esc(row.created_at),
      ].join(','));
    }

    const csvContent = csvRows.join('\n');
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse('Failed to export audit logs');
  }
});

adminAuditRoutes.all('*', () => jsonResponse({ error: 'Method not allowed' }, 405));

export default adminAuditRoutes;
