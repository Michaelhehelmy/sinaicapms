/**
 * Leads API — handles contact form and onboarding submissions.
 *
 * Hono sub-router (Phase 4 T1). Mixed visibility: POST is public (contact /
 * reservation forms — best-effort tenant resolution), GET/PUT/DELETE are
 * admin-scoped. The POST handler is exported (createLead) so index.js can
 * mount the same public behavior at /api/contact without duplicating logic.
 */

import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import crypto from 'crypto';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const leadPostSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required').optional().or(z.literal('')),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
  source: z.string().optional(),
}).strip().superRefine((d, ctx) => {
  // Booking-style submissions may arrive with only a phone number (the public
  // reservation form has no email field). Require at least one contact channel.
  if (!d.email && !d.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email or phone is required',
      path: ['email'],
    });
  }
});

export const leadPutSchema = z.object({
  status: z.enum(['new', 'contacted', 'converted', 'archived'], { required_error: 'Invalid status' }),
}).strip();

// Fire-and-forget SSE broadcast to the tenant's Broadcaster Durable Object
// (same pattern as broadcastNewBooking in orders.js). Best-effort only — an
// error here must NEVER fail the lead-create response. Skips when there is no
// tenant context (public form submission without a resolved tenant) so the hub
// is never addressed by a bogus tenantId.
export function broadcastNewLead(env, tenantId, leadData) {
  if (!env || !env.BROADCASTER || !tenantId) return;
  const payload = {
    type: 'new-lead',
    leadId: leadData.leadId,
    name: leadData.name,
    subject: leadData.subject,
  };
  try {
    const id = env.BROADCASTER.idFromName(String(tenantId));
    const stub = env.BROADCASTER.get(id);
    Promise.resolve()
      .then(() => stub.fetch('http://broadcaster/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: String(tenantId), event: payload }),
      }))
      .catch(() => {});
  } catch {
    // Broadcast is best-effort — never fail the lead on a hub error.
  }
}

/**
 * POST /api/leads — public lead creation. Exported for reuse by the
 * /api/contact public mount in index.js. Requires the request scope to be
 * resolved first (resolveScope({ public: true })).
 */
export async function createLead(c) {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = leadPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, email, phone, subject, message, source } = parsed.data;

    const leadId = 'lead_' + crypto.randomUUID().slice(0, 12);
    const resolvedTenantId = tenantId || null;

    await c.env.DB.prepare(
      `INSERT INTO leads (id, tenant_id, name, email, phone, subject, message, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', datetime('now'))`
    ).bind(leadId, resolvedTenantId, name.trim(), (email || '').trim() || null, phone || null, subject || null, message || null, source || 'contact').run();

    broadcastNewLead(c.env, resolvedTenantId, { leadId, name: name.trim(), subject: subject || null });

    return jsonResponse({
      success: true,
      message: 'Thank you for your message. We will get back to you soon.',
      id: leadId
    });
  } catch (e) {
    return errorResponse('Failed to submit lead');
  }
}

/**
 * Leads sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/leads', leadsScope);   // POST public, the rest admin
 *   app.use('/api/leads/*', leadsScope);
 *   app.route('/api/leads', leadsRoutes);
 */
const leadsRoutes = new Hono();

// ───── GET /api/leads ─────
leadsRoutes.get('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    // T6: page/pageSize envelope (clean migration from limit/offset)
    const url = new URL(c.req.url);
    const { page, pageSize, offset } = parsePagination(url);
    const status = url.searchParams.get('status');

    let query = 'SELECT * FROM leads WHERE tenant_id = ?';
    const params = [tenantId];
    let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE tenant_id = ?';
    const countParams = [tenantId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
      // T6 fix: count must reflect the SAME filter as the page (was unfiltered)
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    const { results: countResult } = await c.env.DB.prepare(countQuery).bind(...countParams).all();

    return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
  } catch (e) {
    return errorResponse('Failed to fetch leads');
  }
});

// ───── POST /api/leads ─────
leadsRoutes.post('/', createLead);

// ───── PUT /api/leads/:id ───── (update status)
leadsRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const leadId = c.req.param('id');
    const parsed = leadPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { status } = parsed.data;

    const result = await c.env.DB.prepare(
      'UPDATE leads SET status = ? WHERE id = ? AND tenant_id = ?'
    ).bind(status, leadId, tenantId).run();

    if (result.changes === 0) {
      return errorResponse('Lead not found', 404);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update lead');
  }
});

// ───── DELETE /api/leads/:id ─────
leadsRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const result = await c.env.DB.prepare(
      'DELETE FROM leads WHERE id = ? AND tenant_id = ?'
    ).bind(c.req.param('id'), tenantId).run();

    if (result.changes === 0) {
      return errorResponse('Lead not found', 404);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete lead');
  }
});

leadsRoutes.all('*', () => errorResponse('Leads endpoint not found', 404));

export default leadsRoutes;
