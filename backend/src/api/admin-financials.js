/**
 * Super Admin — Financials cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/financials in index.js):
 *   GET /overview          — aggregated financial stats across all tenants
 *   GET /invoices          — paginated cross-tenant invoice listing
 *   GET /public-payments   — paginated marketplace payments ledger
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  try {
    const [totalAccounts, totalInvoices, revenueAgg, paymentAgg, overdueCount, tenantBreakdown, mpAgg, mpBreakdown, outstandingAgg, paidOutAgg] = await Promise.all([
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
      db.prepare("SELECT COALESCE(SUM(gross_amount), 0) as total_gross, COALESCE(SUM(marketplace_fee), 0) as total_fees, COALESCE(SUM(net_amount), 0) as total_net FROM marketplace_payments WHERE payment_status = 'captured'").first(),
      db.prepare(`
        SELECT mp.tenant_id, t.name as tenant_name,
               COUNT(*) as payment_count,
               COALESCE(SUM(mp.gross_amount), 0) as gross,
               COALESCE(SUM(mp.marketplace_fee), 0) as fees,
               COALESCE(SUM(mp.net_amount), 0) as net,
               (SELECT COALESCE(SUM(mp2.net_amount), 0) FROM marketplace_payments mp2 WHERE mp2.tenant_id = mp.tenant_id AND mp2.channel = 'marketplace' AND mp2.payout_id IS NULL AND mp2.payment_status = 'captured') as outstanding,
               (SELECT COALESCE(SUM(mp3.net_amount), 0) FROM marketplace_payments mp3 WHERE mp3.tenant_id = mp.tenant_id AND mp3.payment_status = 'settled') as paid_out
        FROM marketplace_payments mp
        LEFT JOIN tenants t ON t.id = mp.tenant_id
        WHERE mp.payment_status = 'captured'
        GROUP BY mp.tenant_id, t.name
        ORDER BY gross DESC
      `).all(),
      db.prepare("SELECT COALESCE(SUM(net_amount), 0) AS total_outstanding, COUNT(*) AS cnt FROM marketplace_payments WHERE channel = 'marketplace' AND payout_id IS NULL AND payment_status = 'captured'").first(),
      db.prepare("SELECT COALESCE(SUM(net_amount), 0) AS total_paid_out FROM marketplace_payments WHERE payment_status = 'settled'").first(),
    ]);

    return jsonResponse({
      totalAccounts: totalAccounts?.cnt || 0,
      totalInvoices: totalInvoices?.cnt || 0,
      totalRevenue: revenueAgg?.total || 0,
      totalCollected: paymentAgg?.total || 0,
      overdueCount: overdueCount?.cnt || 0,
      tenantBreakdown: tenantBreakdown?.results || [],
      totalGross: mpAgg?.total_gross || 0,
      totalFees: mpAgg?.total_fees || 0,
      totalNet: mpAgg?.total_net || 0,
      marketplaceBreakdown: mpBreakdown?.results || [],
      payoutSummary: {
        totalOutstanding: outstandingAgg?.total_outstanding || 0,
        totalPaidOut: paidOutAgg?.total_paid_out || 0,
      },
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

router.get('/public-payments', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');
  const status = url.searchParams.get('status');
  const channel = url.searchParams.get('channel');

  try {
    let where = 'WHERE 1=1';
    const binds = [];
    if (tenantId) { where += ' AND mp.tenant_id = ?'; binds.push(tenantId); }
    if (status) { where += ' AND mp.payment_status = ?'; binds.push(status); }
    if (channel) { where += ' AND mp.channel = ?'; binds.push(channel); }

    const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM marketplace_payments mp ${where}`).bind(...binds).first();
    const total = countRow?.cnt || 0;

    const { results } = await db.prepare(`
      SELECT mp.*, t.name as tenant_name, o.check_in_date, o.check_out_date, o.customer_id
      FROM marketplace_payments mp
      LEFT JOIN tenants t ON t.id = mp.tenant_id
      LEFT JOIN orders o ON o.id = mp.order_id
      ${where}
      ORDER BY mp.captured_at DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all();

    return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
  } catch (e) {
    console.error('[ADMIN FINANCIALS PUBLIC PAYMENTS]', e.message);
    return errorResponse('Failed to load public payments', 500);
  }
});

export default router;
