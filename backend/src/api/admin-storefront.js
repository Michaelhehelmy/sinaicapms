/**
 * Super Admin — Storefront cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/storefront in index.js):
 *   GET /overview   — aggregated storefront stats across all tenants
 *   GET /products   — paginated cross-tenant product listing
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  try {
    const [totalStoreProducts, activeProducts, totalOrders, totalRevenue, tenantBreakdown] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM pos_products').first(),
      db.prepare('SELECT COUNT(*) as cnt FROM pos_products WHERE is_active = 1').first(),
      db.prepare('SELECT COUNT(*) as cnt FROM pos_transactions').first(),
      db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM pos_transactions WHERE status = 'completed'").first(),
      db.prepare(`
        SELECT t.id as tenant_id, t.name as tenant_name,
               COUNT(DISTINCT pp.id) as product_count,
               SUM(CASE WHEN pp.is_active = 1 THEN 1 ELSE 0 END) as active_count
        FROM tenants t
        LEFT JOIN pos_products pp ON pp.tenant_id = t.id
        GROUP BY t.id, t.name
        ORDER BY product_count DESC
      `).all(),
    ]);

    return jsonResponse({
      totalProducts: totalStoreProducts?.cnt || 0,
      activeProducts: activeProducts?.cnt || 0,
      totalPOSTransactions: totalOrders?.cnt || 0,
      totalPOSRevenue: totalRevenue?.total || 0,
      tenantBreakdown: tenantBreakdown?.results || [],
    });
  } catch (e) {
    console.error('[admin-storefront] overview error:', e.message);
    return jsonResponse({
      totalProducts: 0,
      activeProducts: 0,
      totalPOSTransactions: 0,
      totalPOSRevenue: 0,
      tenantBreakdown: [],
    });
  }
});

router.get('/products', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');

  let where = 'WHERE 1=1';
  const binds = [];
  if (tenantId) { where += ' AND pp.tenant_id = ?'; binds.push(tenantId); }

  const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM pos_products pp ${where}`).bind(...binds).first();
  const total = countRow?.cnt || 0;

  const { results } = await db.prepare(`
    SELECT pp.*, t.name as tenant_name
    FROM pos_products pp
    LEFT JOIN tenants t ON t.id = pp.tenant_id
    ${where}
    ORDER BY pp.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
});

export default router;
