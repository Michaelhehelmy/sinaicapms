import { jsonResponse, errorResponse } from '../utils/response';
import { requireAuth } from '../middleware/requireAuth.js';

const superAdminGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

/**
 * Handle /api/admin/performance/* routes.
 * All endpoints require super_admin auth.
 */
export async function handleAdminPerformanceRoute(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  const auth = await superAdminGate(request, env);
  if (auth instanceof Response) return auth;

  // GET /api/admin/performance — All tenants with performance metrics
  if (method === 'GET' && path.length === 3 && path[3] === undefined) {
    try {
      // Batch query: tenants + orders + rooms + employees + leads
      const tenantsStmt = env.DB.prepare(`
        SELECT t.id, t.name, t.status
        FROM tenants t
        WHERE t.id != 'marketplace'
        ORDER BY t.name ASC
      `);

      const revenueStmt = env.DB.prepare(`
        SELECT t.id,
               COALESCE(SUM(o.total_amount), 0) AS revenue,
               COUNT(o.id) AS bookings
        FROM tenants t
        LEFT JOIN orders o ON o.tenant_id = t.id AND o.order_state_id != 'cancelled'
        WHERE t.id != 'marketplace'
        GROUP BY t.id
      `);

      const occupancyStmt = env.DB.prepare(`
        SELECT p.tenant_id,
               COUNT(r.id) AS total_rooms,
               SUM(CASE WHEN r.status = 'occupied' THEN 1 ELSE 0 END) AS occupied_rooms
        FROM projects p
        LEFT JOIN rooms_new r ON r.camp_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.tenant_id
      `);

      const employeesStmt = env.DB.prepare(`
        SELECT tenant_id, COUNT(*) AS count
        FROM pos_users
        WHERE is_active = 1
        GROUP BY tenant_id
      `);

      const leadsStmt = env.DB.prepare(`
        SELECT tenant_id, COUNT(*) AS count
        FROM leads
        GROUP BY tenant_id
      `);

      const inventoryStmt = env.DB.prepare(`
        SELECT tenant_id,
               COALESCE(SUM(selling_price * stock_quantity), 0) AS value
        FROM pos_products
        WHERE is_active = 1
        GROUP BY tenant_id
      `);

      const batchResults = await env.DB.batch([
        tenantsStmt,
        revenueStmt,
        occupancyStmt,
        employeesStmt,
        leadsStmt,
        inventoryStmt,
      ]);

      const tenants = batchResults[0].results || [];
      const revenueMap = {};
      (batchResults[1].results || []).forEach((r) => {
        revenueMap[r.id] = { revenue: r.revenue, bookings: r.bookings };
      });
      const occupancyMap = {};
      (batchResults[2].results || []).forEach((r) => {
        occupancyMap[r.tenant_id] = {
          totalRooms: r.total_rooms,
          occupiedRooms: r.occupied_rooms,
          occupancy: r.total_rooms > 0 ? Math.round((r.occupied_rooms / r.total_rooms) * 100) : 0,
        };
      });
      const employeesMap = {};
      (batchResults[3].results || []).forEach((r) => {
        employeesMap[r.tenant_id] = r.count;
      });
      const leadsMap = {};
      (batchResults[4].results || []).forEach((r) => {
        leadsMap[r.tenant_id] = r.count;
      });
      const inventoryMap = {};
      (batchResults[5].results || []).forEach((r) => {
        inventoryMap[r.tenant_id] = r.value;
      });

      const tenantMetrics = tenants.map((t) => {
        const rev = revenueMap[t.id] || { revenue: 0, bookings: 0 };
        const occ = occupancyMap[t.id] || { totalRooms: 0, occupiedRooms: 0, occupancy: 0 };
        return {
          id: t.id,
          name: t.name,
          metrics: {
            revenue: rev.revenue,
            bookings: rev.bookings,
            occupancy: occ.occupancy,
            employeeCount: employeesMap[t.id] || 0,
            inventoryValue: inventoryMap[t.id] || 0,
            leads: leadsMap[t.id] || 0,
            growthRate: 0, // Would require historical comparison
          },
          trends: {
            revenue: 'flat',
            bookings: 'flat',
          },
        };
      });

      // Build rankings
      const sortByRevenue = [...tenantMetrics]
        .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
        .slice(0, 5)
        .map(({ id, name, metrics }) => ({ tenantId: id, name, revenue: metrics.revenue }));

      const sortByOccupancy = [...tenantMetrics]
        .filter((t) => t.metrics.occupancy > 0)
        .sort((a, b) => b.metrics.occupancy - a.metrics.occupancy)
        .slice(0, 5)
        .map(({ id, name, metrics }) => ({ tenantId: id, name, occupancy: metrics.occupancy }));

      const sortByGrowth = [...tenantMetrics]
        .sort((a, b) => b.metrics.growthRate - a.metrics.growthRate)
        .slice(0, 5)
        .map(({ id, name, metrics }) => ({ tenantId: id, name, growthRate: metrics.growthRate }));

      return jsonResponse({
        tenants: tenantMetrics,
        rankings: {
          revenue: sortByRevenue,
          occupancy: sortByOccupancy,
          growth: sortByGrowth,
        },
      });
    } catch (e) {
      return errorResponse('Failed to fetch performance data');
    }
  }

  // GET /api/admin/performance/export — CSV export
  if (method === 'GET' && path.length === 4 && path[3] === 'export') {
    try {
      const tenantsStmt = env.DB.prepare(`
        SELECT t.id, t.name
        FROM tenants t WHERE t.id != 'marketplace' ORDER BY t.name ASC
      `);

      const revenueStmt = env.DB.prepare(`
        SELECT tenant_id,
               COALESCE(SUM(total_amount), 0) AS revenue,
               COUNT(id) AS bookings
        FROM orders WHERE order_state_id != 'cancelled'
        GROUP BY tenant_id
      `);

      const occupancyStmt = env.DB.prepare(`
        SELECT p.tenant_id,
               COUNT(r.id) AS total_rooms,
               SUM(CASE WHEN r.status = 'occupied' THEN 1 ELSE 0 END) AS occupied_rooms
        FROM projects p
        LEFT JOIN rooms_new r ON r.camp_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.tenant_id
      `);

      const batchResults = await env.DB.batch([tenantsStmt, revenueStmt, occupancyStmt]);
      const tenants = batchResults[0].results || [];

      const revMap = {};
      (batchResults[1].results || []).forEach((r) => { revMap[r.tenant_id] = r; });
      const occMap = {};
      (batchResults[2].results || []).forEach((r) => { occMap[r.tenant_id] = r; });

      const headers = ['Tenant ID', 'Tenant Name', 'Revenue', 'Bookings', 'Total Rooms', 'Occupied Rooms', 'Occupancy %'];
      const rows = tenants.map((t) => {
        const rev = revMap[t.id] || { revenue: 0, bookings: 0 };
        const occ = occMap[t.id] || { total_rooms: 0, occupied_rooms: 0 };
        const occPct = occ.total_rooms > 0 ? Math.round((occ.occupied_rooms / occ.total_rooms) * 100) : 0;
        return [t.id, t.name, rev.revenue, rev.bookings, occ.total_rooms, occ.occupied_rooms, occPct].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="tenant_performance.csv"',
        },
      });
    } catch (e) {
      return errorResponse('Failed to export performance data');
    }
  }

  return errorResponse('Admin performance endpoint not found', 404);
}
