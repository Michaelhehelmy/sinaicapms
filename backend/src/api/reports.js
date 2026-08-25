import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response';
import { getScope } from '../middleware/resolveScope.js';

/**
 * Reports sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/reports', resolveScope());
 *   app.use('/api/reports/*', resolveScope());
 *   app.route('/api/reports', reportsRoutes);
 *
 * Auth/tenant scoping therefore happens BEFORE this router runs; every
 * handler reads the resolved tenantId from the request scope. Byte-compat:
 * non-GET → 405 'Method not allowed'; unknown type → 404 with the legacy
 * available-types message.
 */
const reportsRoutes = new Hono();

// Legacy fallthrough guard: the old dispatcher rejected everything but GET
// before even parsing the report type.
reportsRoutes.use('*', async (c, next) => {
  if (c.req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }
  await next();
});

reportsRoutes.get('/occupancy', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const { results: totalRes } = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM rooms_new WHERE camp_id IN (SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL)"
    ).bind(tenantId).all();

    const { results: occupiedRes } = await env.DB.prepare(
      `SELECT COUNT(DISTINCT o.room_id) as count
       FROM orders o
       JOIN rooms_new r ON r.id = o.room_id
       WHERE r.camp_id IN (SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL)
       AND o.order_state_id IN ('checked_in', 'confirmed')
       AND o.check_in_date <= date('now')
       AND o.check_out_date > date('now')`
    ).bind(tenantId).all();

    const total = totalRes[0].count;
    const occupied = occupiedRes[0].count;
    const occupancy_rate = total > 0 ? (occupied / total) * 100 : 0;

    return jsonResponse({
      total_rooms: total,
      occupied_rooms: occupied,
      occupancy_rate: occupancy_rate
    });
  } catch (e) {
    return errorResponse('Failed to generate occupancy report');
  }
});

reportsRoutes.get('/revenue', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    let cutoffStr;
    const startParam = c.req.query('start');
    const endParam = c.req.query('end');
    if (startParam) {
      cutoffStr = startParam;
    } else {
      const days = parseInt(c.req.query('days') || '30');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      cutoffStr = cutoffDate.toISOString().split('T')[0];
    }
    const endDate = endParam || new Date().toISOString().split('T')[0];

    const { results: dailyRevenue } = await env.DB.prepare(
      `SELECT date(created_at) as date, SUM(total_amount) as total, COUNT(*) as count
       FROM orders
       WHERE tenant_id = ? AND created_at >= ? AND date(created_at) <= ? AND order_state_id != 'cancelled'
       GROUP BY date(created_at)
       ORDER BY date ASC`
    ).bind(tenantId, cutoffStr, endDate).all();

    const { results: summary } = await env.DB.prepare(
      `SELECT COALESCE(SUM(total_amount), 0) as total_revenue,
              COALESCE(SUM(amount_paid), 0) as total_collected,
              COALESCE(SUM(total_amount - amount_paid), 0) as total_outstanding,
              COUNT(*) as total_orders
       FROM orders
       WHERE tenant_id = ? AND created_at >= ? AND date(created_at) <= ? AND order_state_id != 'cancelled'`
    ).bind(tenantId, cutoffStr, endDate).all();

    return jsonResponse({
      start: cutoffStr,
      end: endDate,
      summary: summary[0],
      details: dailyRevenue
    });
  } catch (e) {
    return errorResponse('Failed to generate revenue report');
  }
});

reportsRoutes.get('/bookings', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    let cutoffStr;
    const startParam = c.req.query('start');
    const endParam = c.req.query('end');
    if (startParam) {
      cutoffStr = startParam;
    } else {
      const days = parseInt(c.req.query('days') || '30');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      cutoffStr = cutoffDate.toISOString().split('T')[0];
    }
    const endDate = endParam || new Date().toISOString().split('T')[0];

    const { results: byState } = await env.DB.prepare(
      `SELECT osi.name as state, COUNT(*) as count
       FROM orders o
       JOIN order_state_lang osi ON osi.order_state_id = o.order_state_id AND osi.lang = 'en'
       WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ?
       GROUP BY osi.name`
    ).bind(tenantId, cutoffStr, endDate).all();

    const { results: byCamp } = await env.DB.prepare(
      `SELECT c.name as camp_name, COUNT(*) as count, SUM(o.total_amount) as revenue
       FROM orders o
       JOIN projects c ON c.id = o.camp_id
       WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ?
       GROUP BY c.id`
    ).bind(tenantId, cutoffStr, endDate).all();

    return jsonResponse({
      start: cutoffStr,
      end: endDate,
      by_state: byState,
      by_camp: byCamp
    });
  } catch (e) {
    return errorResponse('Failed to generate bookings report');
  }
});

// ── Top Products: aggregate POS order items by quantity sold ─────────────
reportsRoutes.get('/top-products', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const days = parseInt(c.req.query('days') || '30');
    const limit = parseInt(c.req.query('limit') || '10');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const { results } = await env.DB.prepare(
      `SELECT p.id, p.name, SUM(oi.quantity) as total_qty,
              SUM(oi.quantity * oi.unit_price) as total_revenue,
              COUNT(DISTINCT o.id) as order_count
       FROM pos_order_items oi
       JOIN pos_products p ON p.id = oi.product_id AND p.organization_id = oi.organization_id
       JOIN pos_transactions o ON o.id = oi.transaction_id AND o.tenant_id = oi.organization_id
       WHERE oi.organization_id = ?
         AND o.tenant_id = ?
         AND o.created_at >= ?
         AND o.status != 'voided'
       GROUP BY p.id, p.name
       ORDER BY total_qty DESC
       LIMIT ?`
    ).bind(tenantId, tenantId, cutoffStr, limit).all();

    return jsonResponse({ days, top_products: results });
  } catch (e) {
    return errorResponse('Failed to load top products');
  }
});

// ── Kitchen Performance: aggregate kitchen_status from POS orders ────────
reportsRoutes.get('/kitchen-performance', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const days = parseInt(c.req.query('days') || '7');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const { results: byStatus } = await env.DB.prepare(
      `SELECT COALESCE(kitchen_status, 'pending') as status, COUNT(*) as count
       FROM pos_transactions
       WHERE tenant_id = ?
         AND created_at >= ?
         AND status != 'voided'
         AND type IN ('dine_in', 'takeaway', 'delivery')
       GROUP BY COALESCE(kitchen_status, 'pending')
       ORDER BY count DESC`
    ).bind(tenantId, cutoffStr).all();

    const { results: dailyTrend } = await env.DB.prepare(
      `SELECT date(created_at) as date,
              SUM(CASE WHEN kitchen_status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN kitchen_status = 'ready' THEN 1 ELSE 0 END) as ready,
              SUM(CASE WHEN kitchen_status IN ('pending', 'in_progress') THEN 1 ELSE 0 END) as pending,
              COUNT(*) as total
       FROM pos_transactions
       WHERE tenant_id = ?
         AND created_at >= ?
         AND status != 'voided'
         AND type IN ('dine_in', 'takeaway', 'delivery')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    ).bind(tenantId, cutoffStr).all();

    return jsonResponse({ days, by_status: byStatus, daily_trend: dailyTrend });
  } catch (e) {
    return errorResponse('Failed to load kitchen performance');
  }
});

// ── Low Stock: products at or below min_stock_level ─────────────────────
reportsRoutes.get('/low-stock', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.name, p.stock_quantity, p.min_stock_level, p.unit,
              CASE
                WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
                WHEN p.stock_quantity <= p.min_stock_level THEN 'low'
                ELSE 'ok'
              END as status
       FROM pos_products p
       WHERE p.organization_id = ?
         AND p.is_active = 1
         AND p.deleted_at IS NULL
         AND p.stock_quantity <= p.min_stock_level
       ORDER BY (p.stock_quantity * 1.0 / NULLIF(p.min_stock_level, 0)) ASC`
    ).bind(tenantId).all();

    return jsonResponse({ low_stock: results });
  } catch (e) {
    return errorResponse('Failed to load low-stock inventory');
  }
});

// Legacy fallthrough: unknown report types keep the exact dispatcher message.
reportsRoutes.all('*', () =>
  errorResponse('Report type not found. Available: occupancy, revenue, bookings, top-products, kitchen-performance, low-stock', 404)
);

export default reportsRoutes;
