import { jsonResponse, errorResponse } from '../utils/response';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * GET /api/admin/users — List all admin users across tenants.
 * PUT /api/admin/users/:id — Update a user's role.
 * DELETE /api/admin/users/:id — Soft-delete (deactivate) a user.
 *
 * All endpoints require super_admin auth (enforced by superAdminGate in index.js).
 */
export async function handleAdminUsersList(request, env) {
  const url = new URL(request.url);
  try {
    const { page, pageSize, offset } = parsePagination(url);
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (a.email LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (role) {
      whereClause += ' AND a.role = ?';
      params.push(role);
    }

    const { results: countResult } = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM admins a ${whereClause}`
    ).bind(...params).all();

    const dataParams = [...params, pageSize, offset];
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.email,
              COALESCE(a.first_name || ' ' || a.last_name, a.first_name, a.last_name, a.email) AS display_name,
              a.role, a.tenant_id, t.name AS tenant_name,
              a.last_login, a.created_at
       FROM admins a
       LEFT JOIN tenants t ON t.id = a.tenant_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...dataParams).all();

    return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
  } catch (e) {
    return errorResponse('Failed to fetch admin users');
  }
}

export async function handleAdminUserUpdate(request, env, userId) {
  if (!userId) return errorResponse('User ID is required', 400);
  try {
    const body = await request.json();
    const { role } = body;

    // Verify target exists and is not super_admin
    const existing = await env.DB.prepare('SELECT id, role FROM admins WHERE id = ?').bind(userId).first();
    if (!existing) return errorResponse('User not found', 404);
    if (existing.role === 'super_admin') return errorResponse('Cannot modify super_admin accounts', 403);

    if (!role) return errorResponse('Role is required', 400);

    await env.DB.prepare(
      "UPDATE admins SET role = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(role, userId).run();

    return jsonResponse({ success: true, id: userId });
  } catch (e) {
    return errorResponse('Failed to update admin user');
  }
}

export async function handleAdminUserDelete(request, env, userId) {
  if (!userId) return errorResponse('User ID is required', 400);
  try {
    // Verify target exists and is not super_admin
    const existing = await env.DB.prepare('SELECT id, role FROM admins WHERE id = ?').bind(userId).first();
    if (!existing) return errorResponse('User not found', 404);
    if (existing.role === 'super_admin') return errorResponse('Cannot delete super_admin accounts', 403);

    // Soft-delete: deactivate rather than hard delete
    await env.DB.prepare(
      "UPDATE admins SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
    ).bind(userId).run();

    return jsonResponse({ success: true, id: userId });
  } catch (e) {
    return errorResponse('Failed to delete admin user');
  }
}
