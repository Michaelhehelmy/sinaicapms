/**
 * Super Admin — HR cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/hr in index.js):
 *   GET /overview    — aggregated HR stats across all tenants
 *   GET /employees   — paginated cross-tenant employee listing
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  try {
    const [totalEmployees, activeEmployees, pendingLeave, totalPayrollRuns, departmentBreakdown] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM employees').first(),
      db.prepare("SELECT COUNT(*) as cnt FROM employees WHERE status = 'active'").first(),
      db.prepare("SELECT COUNT(*) as cnt FROM leave_requests WHERE status = 'pending'").first(),
      db.prepare('SELECT COUNT(*) as cnt FROM payroll_runs').first(),
      db.prepare(`
        SELECT t.id as tenant_id, t.name as tenant_name,
               COUNT(DISTINCT e.id) as employee_count,
               SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active_count
        FROM tenants t
        LEFT JOIN employees e ON e.tenant_id = t.id
        GROUP BY t.id, t.name
        ORDER BY employee_count DESC
      `).all(),
    ]);

    return jsonResponse({
      totalEmployees: totalEmployees?.cnt || 0,
      activeEmployees: activeEmployees?.cnt || 0,
      pendingLeaveRequests: pendingLeave?.cnt || 0,
      totalPayrollRuns: totalPayrollRuns?.cnt || 0,
      tenantBreakdown: departmentBreakdown?.results || [],
    });
  } catch (e) {
    console.error('[ADMIN HR OVERVIEW]', e.message);
    return errorResponse('Failed to load HR overview', 500);
  }
});

router.get('/employees', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');
  const status = url.searchParams.get('status');

  try {
    let where = 'WHERE 1=1';
    const binds = [];
    if (tenantId) { where += ' AND e.tenant_id = ?'; binds.push(tenantId); }
    if (status) { where += ' AND e.status = ?'; binds.push(status); }

    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM employees e ${where}`).bind(...binds).first();
    const total = countRow?.cnt || 0;

    const { results } = await db.prepare(`
      SELECT e.*, t.name as tenant_name
      FROM employees e
      LEFT JOIN tenants t ON t.id = e.tenant_id
      ${where}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all();

    return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
  } catch (e) {
    console.error('[ADMIN HR EMPLOYEES]', e.message);
    return errorResponse('Failed to load employees', 500);
  }
});

export default router;
