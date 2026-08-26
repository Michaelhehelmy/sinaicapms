/**
 * CRM & Projects Module — contacts, leads, opportunities, tasks, time tracking, tickets, knowledge base.
 *
 * Endpoints (mounted at /api/crm in index.js):
 *   GET    /contacts              list contacts (filters: type, isCustomer, isVendor)
 *   POST   /contacts              create contact
 *   PUT    /contacts/:id          update contact
 *   DELETE /contacts/:id          soft-delete contact
 *   GET    /leads                 list CRM leads
 *   POST   /leads                 create lead from contact
 *   PATCH  /leads/:id/status      update lead status
 *   GET    /opportunities         list opportunities
 *   POST   /opportunities         create opportunity
 *   PATCH  /opportunities/:id/stage  update pipeline stage
 *   GET    /tasks                 list tasks (filter: projectId, assigneeId, status)
 *   POST   /tasks                 create task
 *   PATCH  /tasks/:id/status      update task status
 *   POST   /time-entries          log time on task
 *   GET    /tickets               list helpdesk tickets
 *   POST   /tickets               create ticket
 *   POST   /tickets/:id/comments  add comment
 *   GET    /knowledge-articles    list articles
 *   POST   /knowledge-articles    create article
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Valid status transitions ────────────────────────────────────────────────

const TASK_TRANSITIONS = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['done', 'blocked'],
  blocked: ['todo', 'in_progress'],
  done: ['todo'],
};

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const OPPORTUNITY_STAGES = ['qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

// ── Schemas ────────────────────────────────────────────────────────────────

const contactCreateSchema = z.object({
  type: z.enum(['individual', 'company']).optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  isCustomer: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  isVendor: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  isLead: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  notes: z.string().max(5000).optional().nullable(),
}).strip();

const contactUpdateSchema = contactCreateSchema.partial().strip();

const leadCreateSchema = z.object({
  contactId: z.string().min(1),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().max(200).optional().nullable(),
  assignedTo: z.string().max(200).optional().nullable(),
  value: z.number().min(0).optional(),
  notes: z.string().max(5000).optional().nullable(),
}).strip();

const leadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
}).strip();

const opportunityCreateSchema = z.object({
  leadId: z.string().optional().nullable(),
  name: z.string().min(1).max(200),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  amount: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().max(20).optional().nullable(),
  assignedTo: z.string().max(200).optional().nullable(),
}).strip();

const opportunityStageSchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES),
}).strip();

const taskCreateSchema = z.object({
  projectId: z.string().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigneeId: z.string().max(200).optional().nullable(),
  dueDate: z.string().max(20).optional().nullable(),
}).strip();

const taskStatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']),
}).strip();

const timeEntryCreateSchema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
  hours: z.number().min(0.01),
  date: z.string().min(1),
  description: z.string().max(1000).optional().nullable(),
}).strip();

const ticketCreateSchema = z.object({
  contactId: z.string().optional().nullable(),
  subject: z.string().min(1).max(200),
  description: z.string().max(10000).optional().nullable(),
  status: z.enum(['new', 'open', 'pending', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.string().max(200).optional().nullable(),
}).strip();

const ticketCommentSchema = z.object({
  userId: z.string().min(1),
  content: z.string().min(1).max(10000),
  internal: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const knowledgeArticleCreateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z.string().max(200).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  isPublished: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

// ── Contacts ───────────────────────────────────────────────────────────────

router.get('/contacts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const type = url.searchParams.get('type');
  const isCustomer = url.searchParams.get('isCustomer');
  const isVendor = url.searchParams.get('isVendor');

  let sql = 'SELECT * FROM contacts WHERE tenant_id = ?';
  const binds = [tenantId];

  if (type) { sql += ' AND type = ?'; binds.push(type); }
  if (isCustomer === '1' || isCustomer === 'true') { sql += ' AND is_customer = 1'; }
  if (isVendor === '1' || isVendor === 'true') { sql += ' AND is_vendor = 1'; }
  sql += ' ORDER BY name';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

router.post('/contacts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = contactCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { type, name, email, phone, address, industry, isCustomer, isVendor, isLead, notes } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO contacts (id, tenant_id, type, name, email, phone, address, industry, is_customer, is_vendor, is_lead, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId,
    type || 'individual',
    name,
    email || null,
    phone || null,
    address || null,
    industry || null,
    isCustomer ? 1 : 0,
    isVendor ? 1 : 0,
    isLead ? 1 : 0,
    notes || null
  ).run();

  return jsonResponse({
    id, type: type || 'individual', name, email: email || null, phone: phone || null,
    address: address || null, industry: industry || null,
    isCustomer: isCustomer ? 1 : 0, isVendor: isVendor ? 1 : 0, isLead: isLead ? 1 : 0,
    notes: notes || null, success: true
  }, 201);
});

router.put('/contacts/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = contactUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Contact not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.type !== undefined) { sets.push('type = ?'); binds.push(data.type); }
  if (data.name !== undefined) { sets.push('name = ?'); binds.push(data.name); }
  if (data.email !== undefined) { sets.push('email = ?'); binds.push(data.email); }
  if (data.phone !== undefined) { sets.push('phone = ?'); binds.push(data.phone); }
  if (data.address !== undefined) { sets.push('address = ?'); binds.push(data.address); }
  if (data.industry !== undefined) { sets.push('industry = ?'); binds.push(data.industry); }
  if (data.isCustomer !== undefined) { sets.push('is_customer = ?'); binds.push(data.isCustomer ? 1 : 0); }
  if (data.isVendor !== undefined) { sets.push('is_vendor = ?'); binds.push(data.isVendor ? 1 : 0); }
  if (data.isLead !== undefined) { sets.push('is_lead = ?'); binds.push(data.isLead ? 1 : 0); }
  if (data.notes !== undefined) { sets.push('notes = ?'); binds.push(data.notes); }
  if (sets.length === 0) return jsonResponse({ success: true });
  sets.push("updated_at = datetime('now')");
  binds.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE contacts SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/contacts/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Contact not found', 404);

  await c.env.DB.prepare(
    "UPDATE contacts SET is_customer = 0, is_vendor = 0, is_lead = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Leads ──────────────────────────────────────────────────────────────────

router.get('/leads', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT l.*, c.name as contact_name FROM crm_leads l LEFT JOIN contacts c ON l.contact_id = c.id WHERE l.tenant_id = ? ORDER BY l.created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/leads', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = leadCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { contactId, status, source, assignedTo, value, notes } = parsed.data;

  const contact = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND tenant_id = ?'
  ).bind(contactId, tenantId).first();
  if (!contact) return errorResponse('Contact not found', 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO crm_leads (id, tenant_id, contact_id, status, source, assigned_to, value, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId, contactId,
    status || 'new',
    source || null,
    assignedTo || null,
    value || 0,
    notes || null
  ).run();

  return jsonResponse({
    id, contactId, status: status || 'new', source: source || null,
    assignedTo: assignedTo || null, value: value || 0, notes: notes || null, success: true
  }, 201);
});

router.patch('/leads/:id/status', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = leadStatusSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM crm_leads WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Lead not found', 404);

  await c.env.DB.prepare(
    'UPDATE crm_leads SET status = ? WHERE id = ? AND tenant_id = ?'
  ).bind(parsed.data.status, id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Opportunities ──────────────────────────────────────────────────────────

router.get('/opportunities', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM opportunities WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/opportunities', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = opportunityCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { leadId, name, stage, amount, probability, expectedCloseDate, assignedTo } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO opportunities (id, tenant_id, lead_id, name, stage, amount, probability, expected_close_date, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId,
    leadId || null,
    name,
    stage || 'qualification',
    amount || 0,
    probability || 0,
    expectedCloseDate || null,
    assignedTo || null
  ).run();

  return jsonResponse({
    id, leadId: leadId || null, name, stage: stage || 'qualification',
    amount: amount || 0, probability: probability || 0,
    expectedCloseDate: expectedCloseDate || null, assignedTo: assignedTo || null, success: true
  }, 201);
});

router.patch('/opportunities/:id/stage', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = opportunityStageSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM opportunities WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Opportunity not found', 404);

  await c.env.DB.prepare(
    'UPDATE opportunities SET stage = ? WHERE id = ? AND tenant_id = ?'
  ).bind(parsed.data.stage, id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Tasks ──────────────────────────────────────────────────────────────────

router.get('/tasks', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const projectId = url.searchParams.get('projectId');
  const assigneeId = url.searchParams.get('assigneeId');
  const status = url.searchParams.get('status');

  let sql = 'SELECT * FROM crm_tasks WHERE tenant_id = ?';
  const binds = [tenantId];

  if (projectId) { sql += ' AND project_id = ?'; binds.push(projectId); }
  if (assigneeId) { sql += ' AND assignee_id = ?'; binds.push(assigneeId); }
  if (status) { sql += ' AND status = ?'; binds.push(status); }
  sql += ' ORDER BY created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

router.post('/tasks', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { projectId, title, description, status, priority, assigneeId, dueDate } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO crm_tasks (id, tenant_id, project_id, title, description, status, priority, assignee_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId,
    projectId || null,
    title,
    description || null,
    status || 'todo',
    priority || 'medium',
    assigneeId || null,
    dueDate || null
  ).run();

  return jsonResponse({
    id, projectId: projectId || null, title, description: description || null,
    status: status || 'todo', priority: priority || 'medium',
    assigneeId: assigneeId || null, dueDate: dueDate || null, success: true
  }, 201);
});

router.patch('/tasks/:id/status', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = taskStatusSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM crm_tasks WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Task not found', 404);

  const currentStatus = existing.status;
  const newStatus = parsed.data.status;
  const allowed = TASK_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    return errorResponse(`Invalid status transition from '${currentStatus}' to '${newStatus}'`, 400);
  }

  const sets = ['status = ?'];
  const binds = [newStatus];
  if (newStatus === 'done') {
    sets.push("completed_at = datetime('now')");
  } else if (currentStatus === 'done') {
    sets.push('completed_at = NULL');
  }
  binds.push(id, tenantId);

  await c.env.DB.prepare(
    `UPDATE crm_tasks SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

// ── Time Entries ───────────────────────────────────────────────────────────

router.post('/time-entries', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = timeEntryCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { taskId, userId, hours, date, description } = parsed.data;

  const task = await c.env.DB.prepare(
    'SELECT id FROM crm_tasks WHERE id = ? AND tenant_id = ?'
  ).bind(taskId, tenantId).first();
  if (!task) return errorResponse('Task not found', 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO time_entries (id, tenant_id, task_id, user_id, hours, date, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, taskId, userId, hours, date, description || null).run();

  return jsonResponse({ id, taskId, userId, hours, date, description: description || null, success: true }, 201);
});

// ── Tickets ────────────────────────────────────────────────────────────────

router.get('/tickets', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT t.*, c.name as contact_name FROM tickets t LEFT JOIN contacts c ON t.contact_id = c.id WHERE t.tenant_id = ? ORDER BY t.created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/tickets', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = ticketCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { contactId, subject, description, status, priority, assignedTo } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO tickets (id, tenant_id, contact_id, subject, description, status, priority, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId,
    contactId || null,
    subject,
    description || null,
    status || 'new',
    priority || 'medium',
    assignedTo || null
  ).run();

  return jsonResponse({
    id, contactId: contactId || null, subject, description: description || null,
    status: status || 'new', priority: priority || 'medium', assignedTo: assignedTo || null, success: true
  }, 201);
});

router.post('/tickets/:id/comments', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = ticketCommentSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { userId, content, internal } = parsed.data;

  const ticket = await c.env.DB.prepare(
    'SELECT id FROM tickets WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!ticket) return errorResponse('Ticket not found', 404);

  const commentId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO ticket_comments (id, ticket_id, user_id, content, internal)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(commentId, id, userId, content, internal ? 1 : 0).run();

  await c.env.DB.prepare(
    "UPDATE tickets SET updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ id: commentId, ticketId: id, userId, content, internal: internal ? 1 : 0, success: true }, 201);
});

// ── Knowledge Articles ─────────────────────────────────────────────────────

router.get('/knowledge-articles', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM knowledge_articles WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/knowledge-articles', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = knowledgeArticleCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { title, content, category, tags, isPublished } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO knowledge_articles (id, tenant_id, title, content, category, tags, is_published)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId,
    title,
    content,
    category || null,
    tags || null,
    isPublished ? 1 : 0
  ).run();

  return jsonResponse({
    id, title, content, category: category || null, tags: tags || null,
    isPublished: isPublished ? 1 : 0, success: true
  }, 201);
});

export default router;
