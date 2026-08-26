/**
 * HR & Payroll Module — employee management, leave tracking, payroll processing, recruitment.
 *
 * Endpoints (mounted at /api/hr in index.js):
 *   GET    /employees                list employees
 *   POST   /employees                create employee
 *   PUT    /employees/:id            update employee
 *   DELETE /employees/:id            soft-delete (set status='terminated')
 *   GET    /leave-types              list leave types
 *   POST   /leave-types              create leave type
 *   GET    /leave-requests           list leave requests
 *   POST   /leave-requests           submit request
 *   PATCH  /leave-requests/:id/approve  approve/reject request
 *   GET    /leave-balances           get balance for employee
 *   POST   /payroll/runs             create payroll run (auto-calculate)
 *   GET    /payroll/runs             list payroll runs
 *   GET    /payroll/runs/:id         get payroll run with lines
 *   POST   /payroll/runs/:id/post    post payroll
 *   GET    /job-posts                list job posts
 *   POST   /job-posts                create job post
 *   POST   /applicants              apply to job
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Schemas ────────────────────────────────────────────────────────────────

const employeeCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  hireDate: z.string().min(1),
  department: z.string().max(100).optional(),
  position: z.string().max(100).optional(),
  managerId: z.string().nullable().optional(),
  salaryType: z.enum(['hourly', 'monthly', 'annual']).optional(),
  salaryAmount: z.number().min(0).optional(),
  currency: z.string().max(3).optional(),
  bankAccount: z.string().max(100).optional(),
  taxId: z.string().max(100).optional(),
}).strip();

const employeeUpdateSchema = employeeCreateSchema.partial().strip();

const leaveTypeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  accrualRate: z.number().min(0).optional(),
  isPaid: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const leaveRequestCreateSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  days: z.number().min(0.5),
  notes: z.string().max(1000).optional(),
}).strip();

const leaveApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected']),
}).strip();

const payrollRunCreateSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
}).strip();

const jobPostCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  department: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
}).strip();

const applicantCreateSchema = z.object({
  jobPostId: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  resumeUrl: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
}).strip();

// ── Employees ──────────────────────────────────────────────────────────────

router.get('/employees', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM employees WHERE tenant_id = ? ORDER BY last_name, first_name'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/employees', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = employeeCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const d = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM employees WHERE tenant_id = ? AND email = ?'
  ).bind(tenantId, d.email).first();
  if (existing) return errorResponse('Employee with this email already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO employees (id, tenant_id, first_name, last_name, email, phone, hire_date, department, position, manager_id, salary_type, salary_amount, currency, bank_account, tax_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId, d.firstName, d.lastName, d.email,
    d.phone || null, d.hireDate,
    d.department || null, d.position || null, d.managerId || null,
    d.salaryType || 'monthly', d.salaryAmount || 0,
    d.currency || 'USD', d.bankAccount || null, d.taxId || null
  ).run();

  return jsonResponse({ id, ...d, status: 'active', success: true }, 201);
});

router.put('/employees/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = employeeUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM employees WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Employee not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.firstName !== undefined) { sets.push('first_name = ?'); binds.push(data.firstName); }
  if (data.lastName !== undefined) { sets.push('last_name = ?'); binds.push(data.lastName); }
  if (data.email !== undefined) { sets.push('email = ?'); binds.push(data.email); }
  if (data.phone !== undefined) { sets.push('phone = ?'); binds.push(data.phone); }
  if (data.hireDate !== undefined) { sets.push('hire_date = ?'); binds.push(data.hireDate); }
  if (data.department !== undefined) { sets.push('department = ?'); binds.push(data.department); }
  if (data.position !== undefined) { sets.push('position = ?'); binds.push(data.position); }
  if (data.managerId !== undefined) { sets.push('manager_id = ?'); binds.push(data.managerId); }
  if (data.salaryType !== undefined) { sets.push('salary_type = ?'); binds.push(data.salaryType); }
  if (data.salaryAmount !== undefined) { sets.push('salary_amount = ?'); binds.push(data.salaryAmount); }
  if (data.currency !== undefined) { sets.push('currency = ?'); binds.push(data.currency); }
  if (data.bankAccount !== undefined) { sets.push('bank_account = ?'); binds.push(data.bankAccount); }
  if (data.taxId !== undefined) { sets.push('tax_id = ?'); binds.push(data.taxId); }
  if (sets.length === 0) return jsonResponse({ success: true });
  sets.push("updated_at = datetime('now')");
  binds.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE employees SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/employees/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM employees WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Employee not found', 404);

  await c.env.DB.prepare(
    "UPDATE employees SET status = 'terminated', termination_date = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Leave Types ────────────────────────────────────────────────────────────

router.get('/leave-types', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM leave_types WHERE tenant_id = ? ORDER BY name'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/leave-types', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = leaveTypeCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { name, accrualRate, isPaid } = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM leave_types WHERE tenant_id = ? AND name = ?'
  ).bind(tenantId, name).first();
  if (existing) return errorResponse('Leave type already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO leave_types (id, tenant_id, name, accrual_rate, is_paid) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, tenantId, name, accrualRate || 0, isPaid !== undefined ? (isPaid ? 1 : 0) : 1).run();

  return jsonResponse({ id, name, accrualRate: accrualRate || 0, isPaid: isPaid !== undefined ? (isPaid ? 1 : 0) : 1, success: true }, 201);
});

// ── Leave Requests ─────────────────────────────────────────────────────────

router.get('/leave-requests', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const employeeId = url.searchParams.get('employeeId');
  const status = url.searchParams.get('status');

  let sql = `SELECT lr.*, e.first_name, e.last_name, lt.name as leave_type_name
    FROM leave_requests lr
    LEFT JOIN employees e ON lr.employee_id = e.id
    LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.tenant_id = ?`;
  const binds = [tenantId];

  if (employeeId) { sql += ' AND lr.employee_id = ?'; binds.push(employeeId); }
  if (status) { sql += ' AND lr.status = ?'; binds.push(status); }
  sql += ' ORDER BY lr.created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

router.post('/leave-requests', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = leaveRequestCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const d = parsed.data;

  const employee = await c.env.DB.prepare(
    'SELECT id FROM employees WHERE id = ? AND tenant_id = ?'
  ).bind(d.employeeId, tenantId).first();
  if (!employee) return errorResponse('Employee not found', 404);

  const leaveType = await c.env.DB.prepare(
    'SELECT id FROM leave_types WHERE id = ? AND tenant_id = ?'
  ).bind(d.leaveTypeId, tenantId).first();
  if (!leaveType) return errorResponse('Leave type not found', 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO leave_requests (id, tenant_id, employee_id, leave_type_id, start_date, end_date, days, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, d.employeeId, d.leaveTypeId, d.startDate, d.endDate, d.days, d.notes || null).run();

  return jsonResponse({ id, ...d, status: 'pending', success: true }, 201);
});

router.patch('/leave-requests/:id/approve', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = leaveApprovalSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const request = await c.env.DB.prepare(
    'SELECT * FROM leave_requests WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!request) return errorResponse('Leave request not found', 404);
  if (request.status !== 'pending') return errorResponse('Leave request is not pending', 400);

  await c.env.DB.prepare(
    "UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ? AND tenant_id = ?"
  ).bind(parsed.data.status, scope.user?.userId || null, id, tenantId).run();

  if (parsed.data.status === 'approved') {
    const year = new Date(request.start_date || request.startDate).getFullYear();
    const balance = await c.env.DB.prepare(
      'SELECT id, used_days, remaining_days FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?'
    ).bind(request.employee_id || request.employeeId, request.leave_type_id || request.leaveTypeId, year).first();

    if (balance) {
      const newUsed = (balance.used_days || balance.usedDays || 0) + request.days;
      const newRemaining = (balance.remaining_days || balance.remainingDays || 0) - request.days;
      await c.env.DB.prepare(
        'UPDATE leave_balances SET used_days = ?, remaining_days = ? WHERE id = ?'
      ).bind(newUsed, Math.max(0, newRemaining), balance.id).run();
    }
  }

  return jsonResponse({ success: true });
});

// ── Leave Balances ─────────────────────────────────────────────────────────

router.get('/leave-balances', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const employeeId = url.searchParams.get('employeeId');
  const year = url.searchParams.get('year') || String(new Date().getFullYear());

  let sql = `SELECT lb.*, lt.name as leave_type_name, e.first_name, e.last_name
    FROM leave_balances lb
    LEFT JOIN leave_types lt ON lb.leave_type_id = lt.id
    LEFT JOIN employees e ON lb.employee_id = e.id
    WHERE lb.tenant_id = ? AND lb.year = ?`;
  const binds = [tenantId, parseInt(year, 10)];

  if (employeeId) { sql += ' AND lb.employee_id = ?'; binds.push(employeeId); }
  sql += ' ORDER BY e.last_name, lt.name';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

// ── Payroll ────────────────────────────────────────────────────────────────

router.post('/payroll/runs', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = payrollRunCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { periodStart, periodEnd } = parsed.data;

  const employees = await c.env.DB.prepare(
    "SELECT * FROM employees WHERE tenant_id = ? AND status = 'active'"
  ).bind(tenantId).all();
  const activeEmployees = employees.results || [];

  if (activeEmployees.length === 0) return errorResponse('No active employees for this period', 400);

  const runId = crypto.randomUUID();
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const lines = [];
  for (const emp of activeEmployees) {
    const grossPay = emp.salary_amount || 0;
    const deductions = Math.round(grossPay * 0.2 * 100) / 100;
    const netPay = Math.round((grossPay - deductions) * 100) / 100;
    totalGross += grossPay;
    totalDeductions += deductions;
    totalNet += netPay;
    lines.push({ employeeId: emp.id, grossPay, deductions, netPay, bankAccount: emp.bank_account || emp.bankAccount || null });
  }

  totalGross = Math.round(totalGross * 100) / 100;
  totalDeductions = Math.round(totalDeductions * 100) / 100;
  totalNet = Math.round(totalNet * 100) / 100;

  await c.env.DB.prepare(
    `INSERT INTO payroll_runs (id, tenant_id, period_start, period_end, run_date, status, total_gross, total_deductions, total_net, created_by)
     VALUES (?, ?, ?, ?, date('now'), 'draft', ?, ?, ?, ?)`
  ).bind(runId, tenantId, periodStart, periodEnd, totalGross, totalDeductions, totalNet, scope.user?.userId || null).run();

  for (const line of lines) {
    const lineId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO payroll_lines (id, payroll_run_id, employee_id, gross_pay, deductions, net_pay, bank_account)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(lineId, runId, line.employeeId, line.grossPay, line.deductions, line.netPay, line.bankAccount).run();
  }

  return jsonResponse({
    id: runId, periodStart, periodEnd,
    totalGross, totalDeductions, totalNet,
    lineCount: lines.length,
    status: 'draft',
    success: true
  }, 201);
});

router.get('/payroll/runs', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM payroll_runs WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.get('/payroll/runs/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const run = await c.env.DB.prepare(
    'SELECT * FROM payroll_runs WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!run) return errorResponse('Payroll run not found', 404);

  const lines = await c.env.DB.prepare(
    `SELECT pl.*, e.first_name, e.last_name, e.email
     FROM payroll_lines pl
     LEFT JOIN employees e ON pl.employee_id = e.id
     WHERE pl.payroll_run_id = ?`
  ).bind(id).all();

  return jsonResponse({ ...run, lines: lines.results || [] });
});

router.post('/payroll/runs/:id/post', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const run = await c.env.DB.prepare(
    'SELECT id, status FROM payroll_runs WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!run) return errorResponse('Payroll run not found', 404);
  if (run.status === 'posted') return errorResponse('Payroll run already posted', 400);
  if (run.status === 'draft') return errorResponse('Payroll run must be completed before posting', 400);

  await c.env.DB.prepare(
    "UPDATE payroll_runs SET status = 'posted' WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  await c.env.DB.prepare(
    "UPDATE payroll_lines SET status = 'paid' WHERE payroll_run_id = ?"
  ).bind(id).run();

  return jsonResponse({ success: true });
});

// ── Job Posts ──────────────────────────────────────────────────────────────

router.get('/job-posts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM job_posts WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/job-posts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = jobPostCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { title, description, department, location } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO job_posts (id, tenant_id, title, description, department, location) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, title, description || null, department || null, location || null).run();

  return jsonResponse({ id, title, department: department || null, location: location || null, status: 'open', success: true }, 201);
});

// ── Applicants ─────────────────────────────────────────────────────────────

router.post('/applicants', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = applicantCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const d = parsed.data;

  const jobPost = await c.env.DB.prepare(
    'SELECT id FROM job_posts WHERE id = ? AND tenant_id = ?'
  ).bind(d.jobPostId, tenantId).first();
  if (!jobPost) return errorResponse('Job post not found', 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO applicants (id, tenant_id, job_post_id, name, email, phone, resume_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, d.jobPostId, d.name, d.email, d.phone || null, d.resumeUrl || null, d.notes || null).run();

  return jsonResponse({ id, ...d, status: 'applied', success: true }, 201);
});

export default router;
