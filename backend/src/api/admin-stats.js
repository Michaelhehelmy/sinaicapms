import { jsonResponse, errorResponse } from '../utils/response';

/**
 * GET /api/admin/stats — Enhanced super-admin platform statistics.
 *
 * Returns aggregate counts plus time-series data, breakdowns, and recent
 * activity.  The handler receives (request, env) like every Paradigm-A
 * dispatcher; auth is enforced by the superAdminGate mounted in index.js.
 */
export async function handleAdminStatsRoute(request, env) {
  const url = new URL(request.url);

  // Date range params (optional — front-end sends startDate/endDate)
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  try {
    // ── Batch 1: simple aggregates (always the same regardless of date range)
    const aggStmt = env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM tenants WHERE id != 'marketplace') AS total_tenants,
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL)  AS total_camps,
        (SELECT COUNT(*) FROM rooms_new)                          AS total_rooms,
        (SELECT COUNT(*) FROM orders)                             AS total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE order_state_id != 'cancelled') AS total_revenue,
        (SELECT COUNT(*) FROM admins)                             AS total_admins
    `);

    // ── Batch 2: tenants by status
    const tenantsByStatusStmt = env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0)    AS active,
        COALESCE(SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END), 0)  AS inactive,
        COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended
      FROM tenants WHERE id != 'marketplace'
    `);

    // ── Batch 3: orders by status
    const ordersByStatusStmt = env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN order_state_id = 'pending' THEN 1 ELSE 0 END), 0)    AS pending,
        COALESCE(SUM(CASE WHEN order_state_id = 'confirmed' THEN 1 ELSE 0 END), 0)  AS confirmed,
        COALESCE(SUM(CASE WHEN order_state_id = 'completed' THEN 1 ELSE 0 END), 0)   AS completed,
        COALESCE(SUM(CASE WHEN order_state_id = 'cancelled' THEN 1 ELSE 0 END), 0)   AS cancelled
      FROM orders
    `);

    // ── Batch 4: last 30 days revenue by day
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const revenueByDayStmt = env.DB.prepare(`
      SELECT DATE(created_at) AS date, COALESCE(SUM(total_amount), 0) AS amount
      FROM orders
      WHERE created_at >= ? AND order_state_id != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).bind(thirtyDaysAgo);

    // ── Batch 5: recent 10 orders with tenant name
    const recentOrdersStmt = env.DB.prepare(`
      SELECT o.id, t.name AS tenant_name, o.total_amount AS amount,
             o.order_state_id AS status, o.created_at
      FROM orders o
      LEFT JOIN tenants t ON t.id = o.tenant_id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // ── Batch 6: top 5 tenants by revenue
    const topTenantsStmt = env.DB.prepare(`
      SELECT t.id, t.name,
             COALESCE(SUM(o.total_amount), 0) AS revenue,
             COUNT(o.id) AS orders
      FROM tenants t
      LEFT JOIN orders o ON o.tenant_id = t.id AND o.order_state_id != 'cancelled'
      WHERE t.id != 'marketplace'
      GROUP BY t.id, t.name
      ORDER BY revenue DESC
      LIMIT 5
    `);

    // Execute all in a single batch for latency
    const batchResults = await env.DB.batch([
      aggStmt,
      tenantsByStatusStmt,
      ordersByStatusStmt,
      revenueByDayStmt,
      recentOrdersStmt,
      topTenantsStmt,
    ]);

    const agg = batchResults[0].results?.[0] || {};
    const tenantsByStatus = batchResults[1].results?.[0] || {};
    const ordersByStatus = batchResults[2].results?.[0] || {};
    const revenueByDay = batchResults[3].results || [];
    const recentOrders = batchResults[4].results || [];
    const topTenants = batchResults[5].results || [];

    // Optional date-range filtering on revenueByDay (client may want a narrower window)
    let filteredRevenue = revenueByDay;
    if (startDate || endDate) {
      filteredRevenue = revenueByDay.filter((r) => {
        if (startDate && r.date < startDate) return false;
        if (endDate && r.date > endDate) return false;
        return true;
      });
    }

    // System health (lightweight — worker health is inherently ok if we got here)
    const systemHealth = {
      workersStatus: 'ok',
      d1Status: 'ok',
      kvStatus: env.KV_CACHE ? 'ok' : 'skipped',
      errorRate: 0,
    };

    return jsonResponse({
      totalTenants: agg.total_tenants || 0,
      totalCamps: agg.total_camps || 0,
      totalRooms: agg.total_rooms || 0,
      totalOrders: agg.total_orders || 0,
      totalRevenue: agg.total_revenue || 0,
      totalAdmins: agg.total_admins || 0,
      revenueByDay: filteredRevenue,
      tenantsByStatus: {
        active: tenantsByStatus.active || 0,
        inactive: tenantsByStatus.inactive || 0,
        suspended: tenantsByStatus.suspended || 0,
      },
      ordersByStatus: {
        pending: ordersByStatus.pending || 0,
        confirmed: ordersByStatus.confirmed || 0,
        completed: ordersByStatus.completed || 0,
        cancelled: ordersByStatus.cancelled || 0,
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        tenantName: o.tenant_name,
        amount: o.amount,
        status: o.status,
        createdAt: o.created_at,
      })),
      topTenants: topTenants.map((t) => ({
        id: t.id,
        name: t.name,
        revenue: t.revenue,
        orders: t.orders,
      })),
      systemHealth,
    });
  } catch (e) {
    return errorResponse('Failed to fetch enhanced admin stats');
  }
}
