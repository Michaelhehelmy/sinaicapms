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

// ── Available report templates ──────────────────────────────────────────

const REPORT_TEMPLATES = [
  {
    id: 'revenue_by_tenant',
    name: 'Revenue by Tenant',
    description: 'Revenue breakdown by tenant over a selected time period.',
    category: 'finance',
    parameters: [
      { name: 'period', type: 'select', options: ['daily', 'weekly', 'monthly'] },
    ],
    formats: ['csv', 'pdf'],
  },
  {
    id: 'tenant_performance',
    name: 'Tenant Performance Summary',
    description: 'Performance metrics overview for all active tenants.',
    category: 'analytics',
    parameters: [],
    formats: ['csv', 'pdf'],
  },
  {
    id: 'occupancy_report',
    name: 'Occupancy Report',
    description: 'Room occupancy rates across all tenants and projects.',
    category: 'operations',
    parameters: [
      { name: 'startDate', type: 'date' },
      { name: 'endDate', type: 'date' },
    ],
    formats: ['csv', 'pdf'],
  },
  {
    id: 'employee_headcount',
    name: 'Employee Headcount by Tenant',
    description: 'Employee counts and department breakdown per tenant.',
    category: 'hr',
    parameters: [],
    formats: ['csv'],
  },
  {
    id: 'inventory_value',
    name: 'Inventory Value by Tenant',
    description: 'Current inventory valuation across all tenants.',
    category: 'operations',
    parameters: [],
    formats: ['csv', 'pdf'],
  },
  {
    id: 'crm_pipeline',
    name: 'CRM Pipeline Summary',
    description: 'Leads, opportunities, and conversion metrics.',
    category: 'sales',
    parameters: [
      { name: 'status', type: 'select', options: ['all', 'open', 'won', 'lost'] },
    ],
    formats: ['csv', 'pdf'],
  },
  {
    id: 'system_health',
    name: 'System Health Summary',
    description: 'Platform health metrics — error rates, latency, uptime.',
    category: 'system',
    parameters: [],
    formats: ['csv'],
  },
];

// ── In-memory report job store (ephemeral — lost on worker restart) ─────
// For production, this would be persisted in D1 or KV.
const reportJobs = new Map();
const scheduledReports = new Map();
let jobCounter = 0;

function generateJobId() {
  return `rpt_${++jobCounter}_${Date.now().toString(36)}`;
}

// ── Generate simulated report data ──────────────────────────────────────

async function generateReportData(env, reportId, parameters) {
  switch (reportId) {
    case 'revenue_by_tenant': {
      const { results } = await env.DB.prepare(`
        SELECT t.id, t.name,
               COALESCE(SUM(o.total_amount), 0) AS revenue,
               COUNT(o.id) AS order_count
        FROM tenants t
        LEFT JOIN orders o ON o.tenant_id = t.id AND o.order_state_id != 'cancelled'
        WHERE t.id != 'marketplace'
        GROUP BY t.id, t.name
        ORDER BY revenue DESC
      `).all();
      return { reportId, generatedAt: new Date().toISOString(), data: results };
    }
    case 'tenant_performance': {
      const { results } = await env.DB.prepare(`
        SELECT t.id, t.name,
               COALESCE(SUM(o.total_amount), 0) AS revenue,
               COUNT(o.id) AS bookings
        FROM tenants t
        LEFT JOIN orders o ON o.tenant_id = t.id AND o.order_state_id != 'cancelled'
        WHERE t.id != 'marketplace'
        GROUP BY t.id, t.name
      `).all();
      return { reportId, generatedAt: new Date().toISOString(), data: results };
    }
    case 'occupancy_report': {
      const { results } = await env.DB.prepare(`
        SELECT p.tenant_id, t.name AS tenant_name, p.name AS project_name,
               COUNT(r.id) AS total_rooms,
               SUM(CASE WHEN r.status = 'occupied' THEN 1 ELSE 0 END) AS occupied
        FROM projects p
        LEFT JOIN rooms_new r ON r.camp_id = p.id
        LEFT JOIN tenants t ON t.id = p.tenant_id
        WHERE p.deleted_at IS NULL
        GROUP BY p.tenant_id, t.name, p.name
      `).all();
      return { reportId, generatedAt: new Date().toISOString(), data: results };
    }
    case 'employee_headcount': {
      const { results } = await env.DB.prepare(`
        SELECT t.id, t.name,
               COUNT(pu.id) AS employee_count
        FROM tenants t
        LEFT JOIN pos_users pu ON pu.tenant_id = t.id AND pu.is_active = 1
        WHERE t.id != 'marketplace'
        GROUP BY t.id, t.name
        ORDER BY employee_count DESC
      `).all();
      return { reportId, generatedAt: new Date().toISOString(), data: results };
    }
    case 'inventory_value': {
      const { results } = await env.DB.prepare(`
        SELECT t.id, t.name,
               COALESCE(SUM(pp.selling_price * pp.stock_quantity), 0) AS inventory_value,
               COUNT(pp.id) AS product_count
        FROM tenants t
        LEFT JOIN pos_products pp ON pp.tenant_id = t.id AND pp.is_active = 1
        WHERE t.id != 'marketplace'
        GROUP BY t.id, t.name
        ORDER BY inventory_value DESC
      `).all();
      return { reportId, generatedAt: new Date().toISOString(), data: results };
    }
    case 'crm_pipeline': {
      const { results } = await env.DB.prepare(`
        SELECT t.id, t.name,
               COUNT(CASE WHEN l.status = 'new' THEN 1 END) AS new_leads,
               COUNT(CASE WHEN l.status = 'contacted' THEN 1 END) AS contacted,
               COUNT(CASE WHEN l.status = 'converted' THEN 1 END) AS converted
        FROM tenants t
        LEFT JOIN leads l ON l.tenant_id = t.id
        WHERE t.id != 'marketplace'
        GROUP BY t.id, t.name
      `).all();
      return { reportId, generatedAt: new Date().toISOString(), data: results };
    }
    case 'system_health': {
      return {
        reportId,
        generatedAt: new Date().toISOString(),
        data: {
          workersStatus: 'ok',
          d1LatencyMs: 5,
          kvStatus: 'skipped',
          overallStatus: 'ok',
        },
      };
    }
    default:
      return { reportId, generatedAt: new Date().toISOString(), data: [] };
  }
}

/**
 * Handle /api/admin/reports/* routes.
 * All endpoints require super_admin auth.
 */
export async function handleAdminReportsRoute(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  const auth = await superAdminGate(request, env);
  if (auth instanceof Response) return auth;

  // GET /api/admin/reports — list available report templates (alias for /available)
  if (method === 'GET' && path.length === 3 && path[2] === 'reports') {
    return jsonResponse({ reports: REPORT_TEMPLATES });
  }

  // GET /api/admin/reports/available
  if (method === 'GET' && path.length === 4 && path[3] === 'available') {
    return jsonResponse({ reports: REPORT_TEMPLATES });
  }

  // POST /api/admin/reports/generate
  if (method === 'POST' && path.length === 4 && path[3] === 'generate') {
    try {
      const body = await request.json();
      const { reportId, parameters, format } = body;
      if (!reportId) return errorResponse('reportId is required', 400);

      const template = REPORT_TEMPLATES.find((r) => r.id === reportId);
      if (!template) return errorResponse('Unknown report template', 400);

      const jobId = generateJobId();
      const data = await generateReportData(env, reportId, parameters || {});

      // Simulate async: store result immediately (in production, use a Queue)
      reportJobs.set(jobId, {
        id: jobId,
        reportId,
        status: 'completed',
        format: format || 'csv',
        data,
        createdAt: new Date().toISOString(),
      });

      return jsonResponse({
        jobId,
        status: 'completed',
        downloadUrl: `/api/admin/reports/jobs/${jobId}`,
      });
    } catch (e) {
      return errorResponse('Failed to generate report');
    }
  }

  // GET /api/admin/reports/jobs/:id
  if (method === 'GET' && path.length === 5 && path[3] === 'jobs') {
    const jobId = path[4];
    const job = reportJobs.get(jobId);
    if (!job) return errorResponse('Report job not found', 404);

    if (job.format === 'csv' && job.status === 'completed') {
      // Convert data to CSV
      const rows = job.data?.data || [];
      if (rows.length === 0) {
        return new Response('No data available', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        });
      }
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
      ].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${job.reportId}_${jobId}.csv"`,
        },
      });
    }

    return jsonResponse({
      id: job.id,
      reportId: job.reportId,
      status: job.status,
      createdAt: job.createdAt,
      data: job.data,
    });
  }

  // POST /api/admin/reports/schedule
  if (method === 'POST' && path.length === 4 && path[3] === 'schedule') {
    try {
      const body = await request.json();
      const { reportId, parameters, schedule, recipients } = body;
      if (!reportId) return errorResponse('reportId is required', 400);
      if (!schedule) return errorResponse('schedule is required (daily|weekly|monthly)', 400);

      const template = REPORT_TEMPLATES.find((r) => r.id === reportId);
      if (!template) return errorResponse('Unknown report template', 400);

      const schedId = `sch_${Date.now().toString(36)}`;
      const entry = {
        id: schedId,
        reportId,
        parameters: parameters || {},
        schedule,
        recipients: recipients || [],
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        isActive: true,
      };
      scheduledReports.set(schedId, entry);

      return jsonResponse({ success: true, id: schedId, schedule: entry });
    } catch (e) {
      return errorResponse('Failed to create scheduled report');
    }
  }

  // GET /api/admin/reports/scheduled
  if (method === 'GET' && path.length === 4 && path[3] === 'scheduled') {
    const list = Array.from(scheduledReports.values());
    return jsonResponse({ scheduled: list });
  }

  // DELETE /api/admin/reports/scheduled/:id
  if (method === 'DELETE' && path.length === 5 && path[3] === 'scheduled') {
    const schedId = path[4];
    if (!scheduledReports.has(schedId)) {
      return errorResponse('Scheduled report not found', 404);
    }
    scheduledReports.delete(schedId);
    return jsonResponse({ success: true });
  }

  return errorResponse('Admin reports endpoint not found', 404);
}
