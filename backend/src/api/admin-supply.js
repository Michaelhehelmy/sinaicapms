/**
 * Super Admin — Supply Chain cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/supply in index.js):
 *   GET /overview         — aggregated supply chain stats across all tenants
 *   GET /purchase-orders  — paginated cross-tenant PO listing
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  try {
    const [totalWarehouses, totalProducts, pendingPOs, lowStockItems, tenantBreakdown] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM warehouses').first(),
      db.prepare('SELECT COUNT(*) as cnt FROM pos_products WHERE is_active = 1').first(),
      db.prepare("SELECT COUNT(*) as cnt FROM purchase_orders WHERE status IN ('draft', 'pending', 'ordered')").first(),
      db.prepare('SELECT COUNT(*) as cnt FROM stock_quant WHERE quantity <= reorder_point AND reorder_point > 0').first(),
      db.prepare(`
        SELECT t.id as tenant_id, t.name as tenant_name,
               COUNT(DISTINCT w.id) as warehouse_count,
               COUNT(DISTINCT pp.id) as product_count
        FROM tenants t
        LEFT JOIN warehouses w ON w.tenant_id = t.id
        LEFT JOIN pos_products pp ON pp.tenant_id = t.id AND pp.is_active = 1
        GROUP BY t.id, t.name
        ORDER BY product_count DESC
      `).all(),
    ]);

    return jsonResponse({
      totalWarehouses: totalWarehouses?.cnt || 0,
      totalProducts: totalProducts?.cnt || 0,
      pendingPurchaseOrders: pendingPOs?.cnt || 0,
      lowStockItems: lowStockItems?.cnt || 0,
      tenantBreakdown: tenantBreakdown?.results || [],
    });
  } catch (e) {
    console.error('[admin-supply] overview error:', e.message);
    return jsonResponse({
      totalWarehouses: 0,
      totalProducts: 0,
      pendingPurchaseOrders: 0,
      lowStockItems: 0,
      tenantBreakdown: [],
    });
  }
});

router.get('/purchase-orders', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');
  const status = url.searchParams.get('status');

  let where = 'WHERE 1=1';
  const binds = [];
  if (tenantId) { where += ' AND po.tenant_id = ?'; binds.push(tenantId); }
  if (status) { where += ' AND po.status = ?'; binds.push(status); }

  const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM purchase_orders po ${where}`).bind(...binds).first();
  const total = countRow?.cnt || 0;

  const { results } = await db.prepare(`
    SELECT po.*, t.name as tenant_name
    FROM purchase_orders po
    LEFT JOIN tenants t ON t.id = po.tenant_id
    ${where}
    ORDER BY po.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
});

export default router;
