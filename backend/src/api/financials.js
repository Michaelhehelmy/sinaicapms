/**
 * Financial Management Module — double-entry accounting, invoicing, payments, tax rates, exchange rates.
 *
 * Endpoints (mounted at /api/financials in index.js):
 *   GET    /accounts             list chart of accounts
 *   POST   /accounts             create account
 *   PUT    /accounts/:id         update account
 *   DELETE /accounts/:id         soft-delete account
 *   GET    /journals             list journals
 *   POST   /journals             create journal
 *   POST   /journal-entries      create entry with lines
 *   GET    /journal-entries      list entries (date range, journal filters)
 *   POST   /journal-entries/:id/post  post entry
 *   GET    /invoices             list invoices (status, type filters)
 *   POST   /invoices             create invoice with lines
 *   PATCH  /invoices/:id/status  update invoice status
 *   POST   /payments             record payment
 *   GET    /tax-rates            list tax rates
 *   POST   /tax-rates            create tax rate
 *   GET    /exchange-rates       list exchange rates
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Schemas ────────────────────────────────────────────────────────────────

const accountCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.string().nullable().optional(),
  isActive: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const accountUpdateSchema = accountCreateSchema.partial().strip();

const journalCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['sales', 'purchase', 'cash', 'bank', 'general']),
  isActive: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const entryLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
}).strip();

const journalEntryCreateSchema = z.object({
  journalId: z.string().min(1),
  date: z.string().min(1),
  description: z.string().max(1000).optional(),
  reference: z.string().max(200).optional(),
  lines: z.array(entryLineSchema).min(2),
}).strip();

const invoiceLineSchema = z.object({
  productId: z.string().nullable().optional(),
  description: z.string().min(1),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100).optional(),
}).strip();

const invoiceCreateSchema = z.object({
  type: z.enum(['sales', 'purchase']),
  contactId: z.string().nullable().optional(),
  issueDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  currency: z.string().max(3).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(invoiceLineSchema).min(1),
}).strip();

const invoiceStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'canceled']),
}).strip();

const paymentCreateSchema = z.object({
  invoiceId: z.string().nullable().optional(),
  amount: z.number().min(0.01),
  paymentDate: z.string().min(1),
  method: z.enum(['cash', 'card', 'bank_transfer', 'stripe', 'other']),
  reference: z.string().max(200).optional(),
}).strip();

const taxRateCreateSchema = z.object({
  name: z.string().min(1).max(100),
  rate: z.number().min(0).max(100),
  jurisdiction: z.string().max(200).optional(),
  isDefault: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
}).strip();

// ── Accounts ───────────────────────────────────────────────────────────────

router.get('/accounts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM accounts WHERE tenant_id = ? ORDER BY code'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/accounts', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = accountCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { code, name, type, parentId, isActive } = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE tenant_id = ? AND code = ?'
  ).bind(tenantId, code).first();
  if (existing) return errorResponse('Account code already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO accounts (id, tenant_id, code, name, type, parent_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, code, name, type, parentId || null, isActive !== undefined ? (isActive ? 1 : 0) : 1).run();

  return jsonResponse({ id, code, name, type, parentId: parentId || null, isActive: isActive !== undefined ? (isActive ? 1 : 0) : 1, success: true }, 201);
});

router.put('/accounts/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Account not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.code !== undefined) { sets.push('code = ?'); binds.push(data.code); }
  if (data.name !== undefined) { sets.push('name = ?'); binds.push(data.name); }
  if (data.type !== undefined) { sets.push('type = ?'); binds.push(data.type); }
  if (data.parentId !== undefined) { sets.push('parent_id = ?'); binds.push(data.parentId); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); binds.push(data.isActive ? 1 : 0); }
  if (sets.length === 0) return jsonResponse({ success: true });
  sets.push("updated_at = datetime('now')");
  binds.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE accounts SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/accounts/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Account not found', 404);

  await c.env.DB.prepare(
    "UPDATE accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Journals ───────────────────────────────────────────────────────────────

router.get('/journals', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM journals WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/journals', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = journalCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { name, type, isActive } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO journals (id, tenant_id, name, type, is_active)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, tenantId, name, type, isActive !== undefined ? (isActive ? 1 : 0) : 1).run();

  return jsonResponse({ id, name, type, sequenceNext: 1, isActive: isActive !== undefined ? (isActive ? 1 : 0) : 1, success: true }, 201);
});

// ── Journal Entries ────────────────────────────────────────────────────────

router.get('/journal-entries', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const journalId = url.searchParams.get('journalId');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');

  let sql = 'SELECT je.*, j.name as journal_name FROM journal_entries je LEFT JOIN journals j ON je.journal_id = j.id WHERE je.tenant_id = ?';
  const binds = [tenantId];

  if (journalId) { sql += ' AND je.journal_id = ?'; binds.push(journalId); }
  if (dateFrom) { sql += ' AND je.date >= ?'; binds.push(dateFrom); }
  if (dateTo) { sql += ' AND je.date <= ?'; binds.push(dateTo); }
  sql += ' ORDER BY je.date DESC, je.created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  const entries = rows.results || [];

  for (const entry of entries) {
    const lines = await c.env.DB.prepare(
      'SELECT el.*, a.name as account_name, a.code as account_code FROM entry_lines el LEFT JOIN accounts a ON el.account_id = a.id WHERE el.entry_id = ?'
    ).bind(entry.id).all();
    entry.lines = lines.results || [];
  }

  return jsonResponse(entries);
});

router.post('/journal-entries', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = journalEntryCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { journalId, date, description, reference, lines } = parsed.data;

  const journal = await c.env.DB.prepare(
    'SELECT id FROM journals WHERE id = ? AND tenant_id = ?'
  ).bind(journalId, tenantId).first();
  if (!journal) return errorResponse('Journal not found', 404);

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += line.debit || 0;
    totalCredit += line.credit || 0;
  }
  if (Math.abs(totalDebit - totalCredit) > 0.001) return errorResponse('Debits must equal credits', 400);

  const entryId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO journal_entries (id, tenant_id, journal_id, date, description, reference)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(entryId, tenantId, journalId, date, description || null, reference || null).run();

  for (const line of lines) {
    const lineId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO entry_lines (id, entry_id, account_id, debit, credit)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(lineId, entryId, line.accountId, line.debit || 0, line.credit || 0).run();
  }

  return jsonResponse({ id: entryId, journalId, date, description, reference, posted: 0, success: true }, 201);
});

router.post('/journal-entries/:id/post', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id, posted FROM journal_entries WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Journal entry not found', 404);
  if (existing.posted) return errorResponse('Journal entry already posted', 400);

  await c.env.DB.prepare(
    "UPDATE journal_entries SET posted = 1, posted_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Invoices ───────────────────────────────────────────────────────────────

router.get('/invoices', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');

  let sql = 'SELECT * FROM invoices WHERE tenant_id = ?';
  const binds = [tenantId];

  if (status) { sql += ' AND status = ?'; binds.push(status); }
  if (type) { sql += ' AND type = ?'; binds.push(type); }
  sql += ' ORDER BY created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

router.post('/invoices', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = invoiceCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { type, contactId, issueDate, dueDate, currency, notes, lines } = parsed.data;

  let totalAmount = 0;
  for (const line of lines) {
    const qty = line.quantity || 1;
    const lineTotal = qty * line.unitPrice;
    totalAmount += lineTotal;
  }

  const seqResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id = ? AND type = ?"
  ).bind(tenantId, type).first();
  const seq = (seqResult?.cnt || 0) + 1;
  const invoiceNumber = `${type === 'sales' ? 'INV' : 'PUR'}-${String(seq).padStart(5, '0')}`;

  const invoiceId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO invoices (id, tenant_id, invoice_number, type, contact_id, issue_date, due_date, total_amount, currency, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(invoiceId, tenantId, invoiceNumber, type, contactId || null, issueDate, dueDate || null, totalAmount, currency || 'USD', notes || null).run();

  for (const line of lines) {
    const qty = line.quantity || 1;
    const lineTotal = qty * line.unitPrice;
    const lineId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO invoice_lines (id, invoice_id, product_id, description, quantity, unit_price, tax_rate, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(lineId, invoiceId, line.productId || null, line.description, qty, line.unitPrice, line.taxRate || 0, lineTotal).run();
  }

  return jsonResponse({ id: invoiceId, invoiceNumber, type, totalAmount, status: 'draft', currency: currency || 'USD', success: true }, 201);
});

router.patch('/invoices/:id/status', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = invoiceStatusSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM invoices WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Invoice not found', 404);

  await c.env.DB.prepare(
    "UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(parsed.data.status, id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Payments ───────────────────────────────────────────────────────────────

router.post('/payments', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = paymentCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { invoiceId, amount, paymentDate, method, reference } = parsed.data;

  if (invoiceId) {
    const invoice = await c.env.DB.prepare(
      'SELECT id, total_amount, paid_amount FROM invoices WHERE id = ? AND tenant_id = ?'
    ).bind(invoiceId, tenantId).first();
    if (!invoice) return errorResponse('Invoice not found', 404);
    const newPaid = (invoice.paid_amount || 0) + amount;
    await c.env.DB.prepare(
      "UPDATE invoices SET paid_amount = ?, status = CASE WHEN ? >= total_amount THEN 'paid' ELSE status END, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
    ).bind(newPaid, newPaid, invoiceId, tenantId).run();
  }

  const paymentId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO payments (id, tenant_id, invoice_id, amount, payment_date, method, reference, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`
  ).bind(paymentId, tenantId, invoiceId || null, amount, paymentDate, method, reference || null).run();

  return jsonResponse({ id: paymentId, invoiceId: invoiceId || null, amount, paymentDate, method, status: 'completed', success: true }, 201);
});

// ── Payment Gateway (Stub) ─────────────────────────────────────────────────
// Stub for payment gateway integration (Stripe, PayPal, etc.)
// When STRIPE_SECRET_KEY or PAYPAL_CLIENT_ID env vars are set, this can be
// extended to create actual payment intents/checkout sessions.

router.post('/process-payment', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const { invoiceId, amount, method, currency, customerEmail } = body;

  if (!amount || amount <= 0) return errorResponse('Invalid payment amount', 400);
  if (!method) return errorResponse('Payment method required', 400);

  // Generate a payment intent ID (in production, this would call Stripe/PayPal API)
  const paymentIntentId = `pi_${crypto.randomUUID().slice(0, 24)}`;
  const clientSecret = `${paymentIntentId}_secret_${crypto.randomUUID().slice(0, 16)}`;

  // Store the payment intent for later confirmation
  const intentId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO payments (id, tenant_id, invoice_id, amount, payment_date, method, reference, status)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, 'pending')`
  ).bind(intentId, tenantId, invoiceId || null, amount, method, paymentIntentId).run();

  return jsonResponse({
    id: intentId,
    paymentIntentId,
    clientSecret,
    amount,
    currency: currency || 'USD',
    method,
    status: 'pending',
    message: 'Payment intent created. In production, redirect to Stripe/PayPal checkout.',
    success: true,
  }, 201);
});

router.post('/confirm-payment', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const { paymentId } = body;

  if (!paymentId) return errorResponse('Payment ID required', 400);

  // In production, this would verify the payment with Stripe/PayPal
  // For now, mark as completed
  const existing = await c.env.DB.prepare(
    'SELECT id, invoice_id, amount FROM payments WHERE id = ? AND tenant_id = ?'
  ).bind(paymentId, tenantId).first();
  if (!existing) return errorResponse('Payment not found', 404);

  await c.env.DB.prepare(
    "UPDATE payments SET status = 'completed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(paymentId, tenantId).run();

  // Update invoice if linked
  if (existing.invoice_id) {
    const invoice = await c.env.DB.prepare(
      'SELECT id, total_amount, paid_amount FROM invoices WHERE id = ? AND tenant_id = ?'
    ).bind(existing.invoice_id, tenantId).first();
    if (invoice) {
      const newPaid = (invoice.paid_amount || 0) + existing.amount;
      await c.env.DB.prepare(
        "UPDATE invoices SET paid_amount = ?, status = CASE WHEN ? >= total_amount THEN 'paid' ELSE status END, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
      ).bind(newPaid, newPaid, existing.invoice_id, tenantId).run();
    }
  }

  return jsonResponse({ success: true, status: 'completed' });
});

// ── Tax Rates ──────────────────────────────────────────────────────────────

router.get('/tax-rates', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM tax_rates WHERE tenant_id = ? ORDER BY name'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/tax-rates', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = taxRateCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { name, rate, jurisdiction, isDefault, validFrom, validTo } = parsed.data;

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO tax_rates (id, tenant_id, name, rate, jurisdiction, is_default, valid_from, valid_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, name, rate, jurisdiction || null, isDefault ? 1 : 0, validFrom || null, validTo || null).run();

  return jsonResponse({ id, name, rate, jurisdiction: jurisdiction || null, isDefault: isDefault ? 1 : 0, success: true }, 201);
});

// ── Exchange Rates ─────────────────────────────────────────────────────────

router.get('/exchange-rates', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM exchange_rates ORDER BY date DESC'
  ).all();
  return jsonResponse(rows.results || []);
});

export default router;
