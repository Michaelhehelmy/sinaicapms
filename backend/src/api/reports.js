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

// ── Top Products: aggregate POS + storefront order items by quantity ─────
// T40-profit-fix: UNION ALL line grain over both item tables. The POS leg is
// verbatim (quantity + quantity*unit_price, voided excluded); the storefront
// leg joins its own header (storefront_order_items carries NO tenant_id —
// scope via so.tenant_id, mirroring order_items→orders) and uses the
// persisted soi.total_price (REMOTE DDL-confirmed col; equals
// quantity*unit_price at checkout). Product space is shared: 0123 retargeted
// storefront_order_items.product_id → pos_products(id), so one products join
// covers both legs. Statuses never overlap (POS voided vs shop pending/… —
// webhook flips payment_status only, never so.status), so the legs are
// disjoint by construction (no double count). Single prepare (wire + output
// aliases unchanged).
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
      `SELECT p.id, p.name, SUM(lines.qty) as total_qty,
              SUM(lines.revenue) as total_revenue,
              COUNT(DISTINCT lines.order_id) as order_count
       FROM (
         SELECT oi.product_id as product_id, oi.quantity as qty,
                (oi.quantity * oi.unit_price) as revenue, oi.order_id as order_id
         FROM pos_transaction_items oi
         JOIN pos_transactions o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
         WHERE oi.tenant_id = ?
           AND o.created_at >= ?
           AND o.status != 'voided'
         UNION ALL
         SELECT soi.product_id as product_id, soi.quantity as qty,
                soi.total_price as revenue, soi.order_id as order_id
         FROM storefront_order_items soi
         JOIN storefront_orders so ON so.id = soi.order_id
         WHERE so.tenant_id = ?
           AND so.created_at >= ?
           AND so.status != 'cancelled'
       ) lines
       JOIN pos_products p ON p.id = lines.product_id AND p.tenant_id = ?
       GROUP BY p.id, p.name
       ORDER BY total_qty DESC
       LIMIT ?`
    ).bind(tenantId, cutoffStr, tenantId, cutoffStr, tenantId, limit).all();

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

// ── Revenue Breakdown: revenue by product type, payment method ──────────
reportsRoutes.get('/revenue-breakdown', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const days = parseInt(c.req.query('days') || '30');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // T40-profit-fix: POS + storefront revenue by product type (UNION ALL line
    // grain — same legs as /top-products above; storefront product space is
    // pos_products per 0123, so one join covers both; legs disjoint by status
    // vocab, no double count). Single prepare, aliases unchanged.
    const { results: byProductType } = await env.DB.prepare(
      `SELECT p.type, SUM(lines.revenue) as revenue, COUNT(DISTINCT lines.order_id) as order_count
       FROM (
         SELECT ti.product_id as product_id,
                (ti.quantity * ti.unit_price) as revenue, ti.order_id as order_id
         FROM pos_transaction_items ti
         JOIN pos_transactions o ON o.id = ti.order_id AND o.tenant_id = ti.tenant_id
         WHERE ti.tenant_id = ? AND o.created_at >= ? AND o.status != 'voided'
         UNION ALL
         SELECT soi.product_id as product_id,
                soi.total_price as revenue, soi.order_id as order_id
         FROM storefront_order_items soi
         JOIN storefront_orders so ON so.id = soi.order_id
         WHERE so.tenant_id = ? AND so.created_at >= ? AND so.status != 'cancelled'
       ) lines
       JOIN pos_products p ON p.id = lines.product_id AND p.tenant_id = ?
       GROUP BY p.type ORDER BY revenue DESC`
    ).bind(tenantId, cutoffStr, tenantId, cutoffStr, tenantId).all();

    // T40-profit-fix: POS + storefront revenue by payment method (UNION ALL
    // header grain). storefront_orders has NO payment_method column
    // (REMOTE DDL-confirmed) — the shop leg projects the literal 'storefront'
    // bucket (Paymob/online channel) so shop revenue is never silently
    // dropped and never mislabeled as a POS method. POS NULL-method semantics
    // preserved verbatim (COALESCE display, raw GROUP BY). Single prepare.
    const { results: byPayment } = await env.DB.prepare(
      `SELECT COALESCE(lines.method, 'unknown') as method, SUM(lines.revenue) as revenue, COUNT(*) as count
       FROM (
         SELECT o.payment_method as method, o.total_amount as revenue
         FROM pos_transactions o
         WHERE o.tenant_id = ? AND o.created_at >= ? AND o.status != 'voided'
         UNION ALL
         SELECT 'storefront' as method, so.total_amount as revenue
         FROM storefront_orders so
         WHERE so.tenant_id = ? AND so.created_at >= ? AND so.status != 'cancelled'
       ) lines
       GROUP BY lines.method ORDER BY revenue DESC`
    ).bind(tenantId, cutoffStr, tenantId, cutoffStr).all();

    // Accommodation revenue — booking channel ONLY (audited, intentionally not
    // unioned): this key means room-stay revenue (orders headers). Storefront
    // lines are product sales attributed per-project via by_product_type above
    // (line grain); folding them in here would mislabel product revenue as
    // accommodation while keeping the wire key. Wire + query unchanged.
    const { results: accommodation } = await env.DB.prepare(
      `SELECT SUM(total_amount) as revenue, COUNT(*) as order_count
       FROM orders WHERE tenant_id = ? AND created_at >= ? AND order_state_id != 'cancelled'`
    ).bind(tenantId, cutoffStr).all();

    return jsonResponse({
      days,
      by_product_type: byProductType,
      by_payment_method: byPayment,
      accommodation: accommodation[0] || { revenue: 0, order_count: 0 },
    });
  } catch (e) {
    return errorResponse('Failed to load revenue breakdown');
  }
});

// ── Customer Metrics: customer statistics ────────────────────────────────
reportsRoutes.get('/customer-metrics', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    const days = parseInt(c.req.query('days') || '30');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Total customers
    const { results: totalRes } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM customers WHERE tenant_id = ?'
    ).bind(tenantId).all();

    // New customers in period
    const { results: newRes } = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM customers WHERE tenant_id = ? AND created_at >= ?"
    ).bind(tenantId, cutoffStr).all();

    // T40-profit-fix: repeat customers across BOTH order tables (UNION ALL
    // header grain). storefront_orders.customer_id is nullable (guest checkout
    // → NULL, excluded in-leg); a customer who booked AND bought online counts
    // once per order, so cross-channel repeats are detected. Status filters
    // match the legacy shape (none — verbatim). Single prepare.
    const { results: repeatRes } = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM (
        SELECT lines.customer_id FROM (
          SELECT o.customer_id as customer_id FROM orders o
          WHERE o.tenant_id = ? AND o.customer_id IS NOT NULL AND o.created_at >= ?
          UNION ALL
          SELECT so.customer_id as customer_id FROM storefront_orders so
          WHERE so.tenant_id = ? AND so.customer_id IS NOT NULL AND so.created_at >= ?
        ) lines
        GROUP BY lines.customer_id HAVING COUNT(*) > 1
      )`
    ).bind(tenantId, cutoffStr, tenantId, cutoffStr).all();

    // T40-profit-fix: average order value across BOTH order tables (UNION ALL
    // header grain). storefront_orders has NO amount_paid column
    // (REMOTE DDL-confirmed — paid-ness lives in payment_status per the union
    // list design) so the shop leg projects NULL; AVG skips NULLs, hence
    // avg_collected stays the booking-channel average by construction while
    // avg_order_value becomes cross-channel. Cancelled excluded on both legs
    // (shop: so.status != 'cancelled' mirror — no-op today, future-proof).
    // Single prepare, aliases unchanged.
    const { results: aovRes } = await env.DB.prepare(
      `SELECT AVG(lines.total_amount) as avg_order_value, AVG(lines.amount_paid) as avg_collected
       FROM (
         SELECT o.total_amount as total_amount, o.amount_paid as amount_paid FROM orders o
         WHERE o.tenant_id = ? AND o.created_at >= ? AND o.order_state_id != 'cancelled'
         UNION ALL
         SELECT so.total_amount as total_amount, NULL as amount_paid FROM storefront_orders so
         WHERE so.tenant_id = ? AND so.created_at >= ? AND so.status != 'cancelled'
       ) lines`
    ).bind(tenantId, cutoffStr, tenantId, cutoffStr).all();

    return jsonResponse({
      days,
      total_customers: totalRes[0]?.count || 0,
      new_customers: newRes[0]?.count || 0,
      repeat_customers: repeatRes[0]?.count || 0,
      avg_order_value: aovRes[0]?.avg_order_value || 0,
      avg_collected: aovRes[0]?.avg_collected || 0,
    });
  } catch (e) {
    return errorResponse('Failed to load customer metrics');
  }
});

// ── Seasonal: monthly comparison for last 12 months ─────────────────────
reportsRoutes.get('/seasonal', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    // Last 12 months of revenue
    const { results: monthly } = await env.DB.prepare(
      `SELECT strftime('%Y-%m', created_at) as month,
              SUM(total_amount) as revenue,
              COUNT(*) as order_count
       FROM orders
       WHERE tenant_id = ? AND created_at >= date('now', '-12 months') AND order_state_id != 'cancelled'
       GROUP BY strftime('%Y-%m', created_at)
       ORDER BY month ASC`
    ).bind(tenantId).all();

    // POS revenue by month
    const { results: posMonthly } = await env.DB.prepare(
      `SELECT strftime('%Y-%m', created_at) as month,
              SUM(total_amount) as revenue,
              COUNT(*) as tx_count
       FROM pos_transactions
       WHERE tenant_id = ? AND created_at >= date('now', '-12 months') AND status != 'voided'
       GROUP BY strftime('%Y-%m', created_at)
       ORDER BY month ASC`
    ).bind(tenantId).all();

    return jsonResponse({
      accommodation_monthly: monthly,
      pos_monthly: posMonthly,
    });
  } catch (e) {
    return errorResponse('Failed to load seasonal data');
  }
});

// ── Profit by Project: per-project P&L split (Phase 5 step 5f + T40 union + B.7 folio) ─
// B.7-folio-attribution: UNION ALL line-grain aggregation over THREE legs —
// booking (order_items), folio (folio_charges), storefront
// (storefront_order_items). The booking leg gains a NOT EXISTS folio exclusion
// (folios.primary_order_id = orders.id, non-voided only) so a stay whose room
// charges were auto-posted to its folio (B.4 check-in) is counted ONCE via the
// folio leg instead of twice (order_items + folio_charges). Voided folios do
// NOT exclude (the stay falls back to the booking leg); voided charges
// (voided_at) and voided-folio charges never enter the folio leg. The
// storefront leg is verbatim (no folio linkage exists on that channel).
// Folio leg scope: fc.tenant_id in-leg (folio_charges carries its own
// tenant_id per 0124); the folios join is tenant-pinned and non-voided.
// Date window over fc.posted_at mirrors the orders convention
// (>= ? AND date() <= ?). ?projectId= narrows ALL THREE legs (indexed
// project_id on each table). NULL-project folio lines join the explicit
// 'Unassigned' bucket via the single outer LEFT JOIN. The tenant total
// aggregates the SAME inner union, so footer-SUM == aggregate by construction.
// Two prepares (wire + output aliases byte-identical).
reportsRoutes.get('/profit', async (c) => {
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
    const projectId = c.req.query('projectId') || c.req.query('project_id');

    const bookingLeg = `SELECT oi.project_id as project_id, oi.total_price as revenue, oi.order_id as order_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.tenant_id = ? AND o.created_at >= ? AND date(o.created_at) <= ? AND o.order_state_id != 'cancelled'${projectId ? ` AND oi.project_id = ?` : ``}
         AND NOT EXISTS (SELECT 1 FROM folios f WHERE f.tenant_id = o.tenant_id AND f.primary_order_id = o.id AND f.status != 'voided')`;
    const folioLeg = `SELECT fc.project_id as project_id, fc.total_price as revenue, fc.folio_id as order_id
       FROM folio_charges fc
       JOIN folios f ON f.id = fc.folio_id AND f.tenant_id = fc.tenant_id
       WHERE fc.tenant_id = ? AND fc.posted_at >= ? AND date(fc.posted_at) <= ? AND fc.voided_at IS NULL AND f.status != 'voided'${projectId ? ` AND fc.project_id = ?` : ``}`;
    const shopLeg = `SELECT soi.project_id as project_id, soi.total_price as revenue, soi.order_id as order_id
       FROM storefront_order_items soi
       JOIN storefront_orders so ON so.id = soi.order_id
       WHERE so.tenant_id = ? AND so.created_at >= ? AND date(so.created_at) <= ? AND so.status != 'cancelled'${projectId ? ` AND soi.project_id = ?` : ``}`;
    const legBinds = projectId ? [tenantId, cutoffStr, endDate, projectId] : [tenantId, cutoffStr, endDate];
    const binds = [...legBinds, ...legBinds, ...legBinds];

    const { results: byProject } = await env.DB.prepare(
      `SELECT lines.project_id as project_id,
              COALESCE(p.name, 'Unassigned') as project_name,
              COALESCE(p.project_type, 'unassigned') as project_type,
              SUM(lines.revenue) as revenue,
              COUNT(*) as line_count,
              COUNT(DISTINCT lines.order_id) as order_count
       FROM (${bookingLeg} UNION ALL ${folioLeg} UNION ALL ${shopLeg}) lines
       LEFT JOIN projects p ON p.id = lines.project_id
       GROUP BY lines.project_id
       ORDER BY revenue DESC`
    ).bind(...binds).all();

    const { results: totalRes } = await env.DB.prepare(
      `SELECT COALESCE(SUM(lines.revenue), 0) as total_revenue,
              COUNT(*) as total_lines,
              COUNT(DISTINCT lines.order_id) as total_orders
       FROM (${bookingLeg} UNION ALL ${folioLeg} UNION ALL ${shopLeg}) lines`
    ).bind(...binds).all();

    return jsonResponse({
      start: cutoffStr,
      end: endDate,
      by_project: byProject,
      total: totalRes[0] || { total_revenue: 0, total_lines: 0, total_orders: 0 },
    });
  } catch (e) {
    return errorResponse('Failed to generate profit report');
  }
});

// Legacy fallthrough: unknown report types keep the exact dispatcher message.
reportsRoutes.all('*', () =>
  errorResponse('Report type not found. Available: occupancy, revenue, bookings, profit, top-products, kitchen-performance, low-stock, revenue-breakdown, customer-metrics, seasonal', 404)
);

export default reportsRoutes;
