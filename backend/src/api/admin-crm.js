/**
 * Super Admin — CRM cross-tenant overview.
 *
 * Endpoints (mounted at /api/admin/crm in index.js):
 *   GET /overview     — aggregated CRM stats across all tenants
 *   GET /contacts     — paginated cross-tenant contact listing
 *   GET /opportunities — paginated cross-tenant opportunity listing
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';

const router = new Hono();

router.get('/overview', async (c) => {
  const db = c.env.DB;

  const [totalContacts, totalLeads, openOpps, totalTickets, tenantBreakdown] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM contacts').first(),
    db.prepare('SELECT COUNT(*) as cnt FROM crm_leads').first(),
    db.prepare("SELECT COUNT(*) as cnt FROM opportunities WHERE stage NOT IN ('won', 'lost', 'closed')").first(),
    db.prepare("SELECT COUNT(*) as cnt FROM tickets WHERE status != 'closed'").first(),
    db.prepare(`
      SELECT t.id as tenant_id, t.name as tenant_name,
             COUNT(DISTINCT c.id) as contact_count,
             COUNT(DISTINCT l.id) as lead_count,
             COUNT(DISTINCT o.id) as opportunity_count
      FROM tenants t
      LEFT JOIN contacts c ON c.tenant_id = t.id
      LEFT JOIN crm_leads l ON l.tenant_id = t.id
      LEFT JOIN opportunities o ON o.tenant_id = t.id
      GROUP BY t.id, t.name
      ORDER BY contact_count DESC
    `).all(),
  ]);

  return jsonResponse({
    totalContacts: totalContacts?.cnt || 0,
    totalLeads: totalLeads?.cnt || 0,
    openOpportunities: openOpps?.cnt || 0,
    openTickets: totalTickets?.cnt || 0,
    tenantBreakdown: tenantBreakdown?.results || [],
  });
});

router.get('/contacts', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');

  let where = 'WHERE 1=1';
  const binds = [];
  if (tenantId) { where += ' AND c.tenant_id = ?'; binds.push(tenantId); }

  const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM contacts c ${where}`).bind(...binds).first();
  const total = countRow?.cnt || 0;

  const { results } = await db.prepare(`
    SELECT c.*, t.name as tenant_name
    FROM contacts c
    LEFT JOIN tenants t ON t.id = c.tenant_id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
});

router.get('/opportunities', async (c) => {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const tenantId = url.searchParams.get('tenantId');

  let where = 'WHERE 1=1';
  const binds = [];
  if (tenantId) { where += ' AND o.tenant_id = ?'; binds.push(tenantId); }

  const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM opportunities o ${where}`).bind(...binds).first();
  const total = countRow?.cnt || 0;

  const { results } = await db.prepare(`
    SELECT o.*, t.name as tenant_name
    FROM opportunities o
    LEFT JOIN tenants t ON t.id = o.tenant_id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  return jsonResponse(paginationEnvelope(results || [], total, page, pageSize));
});

export default router;
