/**
 * Super Admin — Financials cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/financials in index.js):
 *   GET /overview  — aggregated financial stats across all tenants
 *   GET /invoices  — paginated cross-tenant invoice listing
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  try {
    const [totalAccounts, totalInvoices, revenueAgg, paymentAgg, overdueCount, tenantBreakdown] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE is_active = 1').first(),
      db.prepare('SELECT COUNT(*) as cnt FROM invoices').first(),
      db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status IN ('sent', 'paid')").first(),
      db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'").first(),
      db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE status = 'overdue'").first(),
      db.prepare(`
        SELECT t.id as tenant_id, t.name as tenant_name,
               COUNT(DISTINCT i.id) as invoice_count,
               COALESCE(SUM(i.total_amount), 0) as total_revenue,
               COALESCE(SUM(p.amount), 0) as total_collected
        FROM tenants t
        LEFT JOIN invoices i ON i.tenant_id = t.id
        LEFT JOIN payments p ON p.tenant_id = t.id AND p.status = 'completed'
        GROUP BY t.id, t.name
        ORDER BY total_revenue DESC
      `).all(),
    ]);

    return jsonResponse({
      totalAccounts: totalAccounts?.cnt || 0,
      totalInvoices: totalInvoices?.cnt || 0,
      totalRevenue: revenueAgg?.total || 0,
      totalCollected: paymentAgg?.total || 0,
      overdueCount: overdueCount?.cnt || 0,
      tenantBreakdown: tenantBreakdown?.results || [],
    });
  } catch (e) {
    console.error('[ADMIN FINANCIALS OVERVIEW]', e.message);
    return errorResponse('Failed to load financials overview', 500);
  }
});

router.get('/invoices', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const tenantId = url.searchParams.get('tenantId');

  try {
    let where = 'WHERE 1=1';
    const binds = [];
    if (status) { where += ' AND i.status = ?'; binds.push(status); }
    if (type) { where += ' AND i.type = ?'; binds.push(type); }
    if (tenantId) { where += ' AND i.tenant_id = ?'; binds.push(tenantId); }

    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM invoices i ${where}`).bind(...binds).first();
    const total = countRow?.cnt || 0;

    const { results } = await db.prepare(`
      SELECT i.*, t.name as tenant_name
      FROM invoices i
      LEFT JOIN tenants t ON t.id = i.tenant_id
      ${where}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all();

    return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
  } catch (e) {
    console.error('[ADMIN FINANCIALS INVOICES]', e.message);
    return errorResponse('Failed to load invoices', 500);
  }
});

export default router;
