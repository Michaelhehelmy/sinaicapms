/**
 * Unified Inbox API — merged leads + bookings feed (Phase 4).
 *
 * Tenant-scoped (admin auth enforced by the index.js catch-all dispatcher):
 *   GET    /api/inbox?kind=all|lead|booking&status=&page=&pageSize=
 *   PATCH  /api/inbox/read        { kind: 'lead'|'booking', id }
 *   DELETE /api/inbox/:kind/:id   lead only; booking -> 400
 *
 * Wire is camelCase end-to-end: jsonResponse() camelizes the snake_case UNION
 * rows. Read state: leads carry is_read/read_at columns (migration 0049);
 * bookings reference the inbox_reads side table via ref_type='booking'.
 */

import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { z } from 'zod';

export const inboxReadSchema = z.object({
  kind: z.enum(['lead', 'booking'], { required_error: 'Invalid kind' }),
  id: z.string().min(1, 'ID is required'),
}).strip();

// Rooms live in rooms_new, which has NO room_number column (that name only ever
// existed on the dead `rooms` table, migration 0001). The booking arm therefore
// surfaces the display name via `rooms_new.name AS room_number` so the wire
// contract keeps the field name the frontend expects.
const LEAD_ARM = `
  SELECT l.id, 'lead' AS kind,
         l.name, l.email, l.phone, l.subject, l.message,
         l.status, l.source, l.is_read,
         NULL AS camp_name, NULL AS room_number, NULL AS customer_name,
         NULL AS check_in_date, NULL AS check_out_date, NULL AS number_of_people,
         NULL AS total_amount, NULL AS amount_paid, NULL AS payment_status,
         NULL AS order_state_id, NULL AS reference,
         l.created_at
  FROM leads l
  WHERE l.tenant_id = ?`;

const BOOKING_ARM = `
  SELECT o.id, 'booking' AS kind,
         NULL AS name, NULL AS email, NULL AS phone, NULL AS subject, NULL AS message,
         o.payment_status AS status, NULL AS source,
         CASE WHEN ir.ref_id IS NULL THEN 0 ELSE 1 END AS is_read,
         c.name AS camp_name, r.name AS room_number,
         (cust.first_name || ' ' || cust.last_name) AS customer_name,
         o.check_in_date, o.check_out_date, o.number_of_people,
         o.total_amount, o.amount_paid, o.payment_status,
         o.order_state_id, o.reference,
         o.created_at
  FROM orders o
  LEFT JOIN camps c ON c.id = o.camp_id
  LEFT JOIN rooms_new r ON r.id = o.room_id
  LEFT JOIN customers cust ON cust.id = o.customer_id
  LEFT JOIN inbox_reads ir
         ON ir.tenant_id = o.tenant_id AND ir.ref_type = 'booking' AND ir.ref_id = o.id
  WHERE o.tenant_id = ?`;

// Builds the SQL + params for one arm, applying the optional status filter to
// the arm's own status column (leads.status / orders.payment_status). Returns
// { sql, params } with the base tenant_id bound first.
function buildArm(kind, tenantId, status) {
  if (kind === 'lead') {
    let sql = LEAD_ARM;
    const params = [tenantId];
    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }
    return { sql, params };
  }
  let sql = BOOKING_ARM;
  const params = [tenantId];
  if (status) {
    sql += ' AND o.payment_status = ?';
    params.push(status);
  }
  return { sql, params };
}

export async function handleInboxRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);
  const subRoute = path[2]; // /api/inbox/:sub

  // ───── GET /api/inbox ─────
  if (!subRoute && method === 'GET') {
    try {
      const { page, pageSize, offset } = parsePagination(url);
      const kind = url.searchParams.get('kind') || 'all';
      const status = url.searchParams.get('status');

      const arms = [];
      if (kind === 'all') {
        arms.push(buildArm('lead', tenantId, status));
        arms.push(buildArm('booking', tenantId, status));
      } else if (kind === 'lead' || kind === 'booking') {
        arms.push(buildArm(kind, tenantId, status));
      } else {
        return errorResponse('Invalid kind filter', 400);
      }

      const unionSql = arms.map((a) => a.sql).join(' UNION ALL ');
      const params = arms.flatMap((a) => a.params);

      const query = `SELECT * FROM (${unionSql}) AS u ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
      const countQuery = `SELECT COUNT(*) AS total FROM (${unionSql}) AS u`;

      const { results } = await env.DB.prepare(query).bind(...params, pageSize, offset).all();
      const { results: countResult } = await env.DB.prepare(countQuery).bind(...params).all();

      // Unread totals are tenant-wide (not scoped to the page/filter).
      const { results: unreadLeads } = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM leads WHERE tenant_id = ? AND is_read = 0'
      ).bind(tenantId).all();
      const { results: unreadBookings } = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM orders o
         LEFT JOIN inbox_reads ir
                ON ir.tenant_id = o.tenant_id AND ir.ref_type = 'booking' AND ir.ref_id = o.id
         WHERE o.tenant_id = ? AND ir.ref_id IS NULL`
      ).bind(tenantId).all();

      const envelope = paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize);
      envelope.unread = (unreadLeads?.[0]?.total || 0) + (unreadBookings?.[0]?.total || 0);
      return jsonResponse(envelope);
    } catch (e) {
      return errorResponse('Failed to fetch inbox');
    }
  }

  // ───── PATCH /api/inbox/read ─────
  if (subRoute === 'read' && method === 'PATCH') {
    try {
      const parsed = inboxReadSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { kind, id } = parsed.data;

      if (kind === 'lead') {
        const result = await env.DB.prepare(
          "UPDATE leads SET is_read = 1, read_at = datetime('now') WHERE id = ? AND tenant_id = ?"
        ).bind(id, tenantId).run();
        if (result.changes === 0) {
          return errorResponse('Lead not found', 404);
        }
        return jsonResponse({ success: true });
      }

      // booking — side-table ack, idempotent (INSERT OR IGNORE).
      await env.DB.prepare(
        "INSERT OR IGNORE INTO inbox_reads (tenant_id, ref_type, ref_id, read_at) VALUES (?, 'booking', ?, datetime('now'))"
      ).bind(tenantId, id).run();
      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to update inbox');
    }
  }

  // ───── DELETE /api/inbox/:kind/:id ─────
  if (subRoute && method === 'DELETE') {
    const kind = subRoute;
    const id = path[3];
    if (kind !== 'lead') {
      return errorResponse('Booking deletion not allowed via inbox', 400);
    }
    if (!id) {
      return errorResponse('ID is required', 400);
    }
    try {
      const result = await env.DB.prepare(
        'DELETE FROM leads WHERE id = ? AND tenant_id = ?'
      ).bind(id, tenantId).run();
      if (result.changes === 0) {
        return errorResponse('Lead not found', 404);
      }
      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to delete lead');
    }
  }

  return errorResponse('Inbox endpoint not found', 404);
}
