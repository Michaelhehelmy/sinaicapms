/**
 * Leads API — handles contact form and onboarding submissions.
 */

import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import crypto from 'crypto';
import { z } from 'zod';

export const leadPostSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
  source: z.string().optional(),
}).strip();

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

export async function handleLeadsRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);
  const subRoute = path[2]; // /api/leads/:id

  // ───── GET /api/leads ─────
  if (!subRoute && method === 'GET') {
    try {
      // T6: page/pageSize envelope (clean migration from limit/offset)
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

      const { results } = await env.DB.prepare(query).bind(...params).all();

      const { results: countResult } = await env.DB.prepare(countQuery).bind(...countParams).all();

      return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
    } catch (e) {
      return errorResponse('Failed to fetch leads');
    }
  }

  // ───── POST /api/leads ─────
  if (!subRoute && method === 'POST') {
    try {
      const parsed = leadPostSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { name, email, phone, subject, message, source } = parsed.data;

      const leadId = 'lead_' + crypto.randomUUID().slice(0, 12);
      const resolvedTenantId = tenantId || null;

      await env.DB.prepare(
        `INSERT INTO leads (id, tenant_id, name, email, phone, subject, message, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', datetime('now'))`
      ).bind(leadId, resolvedTenantId, name.trim(), email.trim(), phone || null, subject || null, message || null, source || 'contact').run();

      broadcastNewLead(env, resolvedTenantId, { leadId, name: name.trim(), subject: subject || null });

      return jsonResponse({
        success: true,
        message: 'Thank you for your message. We will get back to you soon.',
        id: leadId
      });
    } catch (e) {
      return errorResponse('Failed to submit lead');
    }
  }

  // ───── PUT /api/leads/:id ───── (update status)
  if (subRoute && method === 'PUT') {
    try {
      const leadId = subRoute;
      const parsed = leadPutSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { status } = parsed.data;

      const result = await env.DB.prepare(
        'UPDATE leads SET status = ? WHERE id = ? AND tenant_id = ?'
      ).bind(status, leadId, tenantId).run();

      if (result.changes === 0) {
        return errorResponse('Lead not found', 404);
      }

      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to update lead');
    }
  }

  // ───── DELETE /api/leads/:id ─────
  if (subRoute && method === 'DELETE') {
    try {
      const leadId = subRoute;
      const result = await env.DB.prepare(
        'DELETE FROM leads WHERE id = ? AND tenant_id = ?'
      ).bind(leadId, tenantId).run();

      if (result.changes === 0) {
        return errorResponse('Lead not found', 404);
      }

      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to delete lead');
    }
  }

  return errorResponse('Leads endpoint not found', 404);
}
