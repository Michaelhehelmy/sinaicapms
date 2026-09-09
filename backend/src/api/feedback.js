/**
 * Feedback API — human-testing debug reports (Phase: testing infra).
 *
 * Mixed visibility:
 *  - POST /api/feedback — PUBLIC (debug widget on any surface; rate-limited
 *    6/min per IP via the policy table). `tenant_id` is NEVER client-provided:
 *    it comes only from the resolved request scope (hostname), so a public
 *    marketplace report lands with null tenant and a tenant-host report is
 *    scoped to that tenant. Author identity is best-effort form data — for a
 *    testing tool this is acceptable (the report is not privileged data).
 *  - GET /api/admin/feedback + GET /api/admin/feedback/:id + PATCH
 *    /api/admin/feedback/:id — SUPER ADMIN ONLY (mounted under the
 *    superAdminGate sub-router loop in index.js).
 *
 * Screenshots are stored inline as base64 JPEG (≈100–250 KB after client-side
 * downscale). The list endpoint omits the payload to keep envelopes small;
 * the detail endpoint returns the full row (screenshot included).
 */

import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { requireAuth } from '../middleware/requireAuth.js';
import crypto from 'crypto';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

// ~450 KB decoded JPEG cap. Base64 expands ≈4/3, so cap the raw string at
// 450_000 * 4/3 ≈ 600_000 characters. Kept generous — the widget downscales to
// ~150 KB, this guards against aggressive/malformed payloads (D1 row blobs).
export const MAX_SCREENSHOT_STR = 600_000;

export const feedbackPostSchema = z.object({
  category: z.enum(['bug', 'missing', 'flow'], { errorMap: () => ({ message: 'Invalid category' }) }),
  message: z.string().min(1, 'Message is required').max(4000, 'Message is too long'),
  personal_view: z.string().max(4000, 'Personal view is too long').optional().nullable(),
  page_url: z.string().min(1, 'Page URL is required').max(2048),
  author_type: z.enum(['admin', 'pos', 'public'], { errorMap: () => ({ message: 'Invalid author type' }) }),
  author_name: z.string().max(200).optional().nullable(),
  author_email: z.string().email('Valid email is required').optional().nullable().or(z.literal('')),
  role: z.string().max(100).optional().nullable(),
  user_agent: z.string().max(500).optional().nullable(),
  screenshot: z.string().max(MAX_SCREENSHOT_STR).optional().nullable(),
}).strip();

const feedbackStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'archived'], { errorMap: () => ({ message: 'Invalid status' }) }),
}).strip();

const feedbackGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

/**
 * POST /api/feedback — public report creation. Mounted with
 * resolveScope({ public: true }) so hostname-scoped tenantId is resolved.
 */
export async function createFeedback(c) {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = feedbackPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const d = parsed.data;
    const feedbackId = 'fb_' + crypto.randomUUID().slice(0, 12);

    await c.env.DB.prepare(
      `INSERT INTO feedback
         (id, tenant_id, author_type, author_id, author_name, author_email, role,
          category, message, personal_view, page_url, user_agent, screenshot, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))`
    ).bind(
      feedbackId,
      tenantId || null,
      d.author_type,
      null,
      (d.author_name || '').trim() || null,
      d.author_email || null,
      d.role || null,
      d.category,
      d.message.trim(),
      d.personal_view?.trim() || null,
      d.page_url.trim(),
      d.user_agent || null,
      d.screenshot || null,
    ).run();

    return jsonResponse({ success: true, id: feedbackId }, 201);
  } catch (e) {
    return errorResponse('Failed to submit feedback');
  }
}

/**
 * Feedback sub-router (super-admin only — index.js mounts it under the
 * superAdminGate prefix loop before the /api/admin catch-all).
 */
const feedbackRoutes = new Hono();

// ───── GET /api/admin/feedback ───── (list; screenshot payload omitted)
feedbackRoutes.get('/', async (c) => {
  try {
    const auth = await feedbackGate(c.req.raw, c.env);
    if (auth instanceof Response) return auth;

    const url = new URL(c.req.url);
    const { page, pageSize, offset } = parsePagination(url);
    const status = url.searchParams.get('status');
    const authorType = url.searchParams.get('authorType');

    let where = 'WHERE 1 = 1';
    const params = [];
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (authorType) {
      where += ' AND author_type = ?';
      params.push(authorType);
    }

    const { results } = await c.env.DB.prepare(
      `SELECT id, tenant_id, author_type, author_id, author_name, author_email, role,
              category, message, personal_view, page_url, user_agent,
              status, created_at, resolved_at, resolved_by
       FROM feedback ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, offset).all();

    const { results: countResult } = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM feedback ${where}`
    ).bind(...params).all();

    return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
  } catch (e) {
    return errorResponse('Failed to fetch feedback');
  }
});

// ───── GET /api/admin/feedback/:id ───── (full row incl. screenshot)
feedbackRoutes.get('/:id', async (c) => {
  try {
    const auth = await feedbackGate(c.req.raw, c.env);
    if (auth instanceof Response) return auth;

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM feedback WHERE id = ?'
    ).bind(c.req.param('id')).all();

    if (results.length === 0) {
      return errorResponse('Feedback not found', 404);
    }
    return jsonResponse(results[0]);
  } catch (e) {
    return errorResponse('Failed to fetch feedback');
  }
});

// ───── PATCH /api/admin/feedback/:id ───── (status transition)
feedbackRoutes.patch('/:id', async (c) => {
  try {
    const auth = await feedbackGate(c.req.raw, c.env);
    if (auth instanceof Response) return auth;

    const parsed = feedbackStatusSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { status } = parsed.data;
    const feedbackId = c.req.param('id');

    const result = await c.env.DB.prepare(
      `UPDATE feedback SET status = ?,
         resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END,
         resolved_by = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_by END
       WHERE id = ?`
    ).bind(status, status, status, auth.user?.id || 'system', feedbackId).run();

    if ((result?.meta?.changes ?? 0) === 0) {
      return errorResponse('Feedback not found', 404);
    }
    return jsonResponse({ success: true, id: feedbackId, status });
  } catch (e) {
    return errorResponse('Failed to update feedback');
  }
});

feedbackRoutes.all('*', () => errorResponse('Feedback endpoint not found', 404));

export default feedbackRoutes;