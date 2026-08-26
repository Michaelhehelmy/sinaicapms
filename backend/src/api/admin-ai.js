/**
 * Super Admin — AI & Intelligence cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/ai in index.js):
 *   GET /overview     — aggregated AI/automation stats across all tenants
 *   GET /predictions  — paginated cross-tenant prediction listing
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  const [totalPredictions, activeRules, totalLogs, priceRuleCount, tenantBreakdown] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM predictions').first(),
    db.prepare('SELECT COUNT(*) as cnt FROM automation_rules WHERE is_active = 1').first(),
    db.prepare('SELECT COUNT(*) as cnt FROM automation_logs').first(),
    db.prepare('SELECT COUNT(*) as cnt FROM price_rules WHERE is_active = 1').first(),
    db.prepare(`
      SELECT t.id as tenant_id, t.name as tenant_name,
             COUNT(DISTINCT pr.id) as prediction_count,
             COUNT(DISTINCT ar.id) as rule_count
      FROM tenants t
      LEFT JOIN predictions pr ON pr.tenant_id = t.id
      LEFT JOIN automation_rules ar ON ar.tenant_id = t.id
      GROUP BY t.id, t.name
      ORDER BY prediction_count DESC
    `).all(),
  ]);

  return jsonResponse({
    totalPredictions: totalPredictions?.cnt || 0,
    activeAutomationRules: activeRules?.cnt || 0,
    totalAutomationLogs: totalLogs?.cnt || 0,
    activePriceRules: priceRuleCount?.cnt || 0,
    tenantBreakdown: tenantBreakdown?.results || [],
  });
});

router.get('/predictions', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');

  let where = 'WHERE 1=1';
  const binds = [];
  if (tenantId) { where += ' AND pr.tenant_id = ?'; binds.push(tenantId); }

  const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM predictions pr ${where}`).bind(...binds).first();
  const total = countRow?.cnt || 0;

  const { results } = await db.prepare(`
    SELECT pr.*, t.name as tenant_name
    FROM predictions pr
    LEFT JOIN tenants t ON t.id = pr.tenant_id
    ${where}
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
});

export default router;
