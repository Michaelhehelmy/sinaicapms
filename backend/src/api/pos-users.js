import { jsonResponse, errorResponse, toSnake } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination.js';
import { hashPassword } from '../middleware/sharedAuth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { z } from 'zod';

// ensureTenantOrg moved verbatim to middleware/resolveScope.js (Phase 4 T3);
// re-exported here so existing import paths keep working.
import { ensureTenantOrg as _ensureTenantOrg } from '../middleware/resolveScope.js';
export const ensureTenantOrg = _ensureTenantOrg;

export const POS_USER_ROLES = ['cashier', 'manager', 'admin'];

export const posUserCreateSchema = z.object({
  email: z.string().email('Valid email is required'),
  username: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  role: z.enum(POS_USER_ROLES).default('cashier'),
  department: z.string().optional(),
  employee_id: z.string().optional(),
  store_id: z.number().int().optional(),
}).strip();

export const posUserPatchSchema = z.object({
  email: z.string().email('Valid email is required').optional(),
  username: z.string().min(1).optional(),
  first_name: z.string().min(1, 'First name is required').optional(),
  last_name: z.string().min(1, 'Last name is required').optional(),
  phone: z.string().optional(),
  role: z.enum(POS_USER_ROLES).optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  department: z.string().optional(),
  employee_id: z.string().optional(),
  store_id: z.number().int().optional(),
}).strip();

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
}).strip();

const POS_USER_SELECT =
  'id, username, email, first_name, last_name, name, phone, role, is_active, status, ' +
  'department, employee_id, organization_id, store_id, tenant_id, last_login, created_at, updated_at';

const POS_USER_SELECT_P =
  'pu.id, pu.username, pu.email, pu.first_name, pu.last_name, pu.name, pu.phone, pu.role, ' +
  'pu.is_active, pu.status, pu.department, pu.employee_id, pu.organization_id, pu.store_id, ' +
  'pu.tenant_id, pu.last_login, pu.created_at, pu.updated_at';

const PATCH_FIELD_MAP = {
  email: 'email',
  username: 'username',
  first_name: 'first_name',
  last_name: 'last_name',
  phone: 'phone',
  role: 'role',
  is_active: 'is_active',
  department: 'department',
  employee_id: 'employee_id',
  store_id: 'store_id',
};

/**
 * Resolve the effective scoped tenantId for the caller.
 * super_admin reads `?tenantId=` (falls back to the host-resolved arg);
 * admin is hard-scoped to decoded.tenantId. Returns { tenantId } or { error }.
 */
export function scopeTenant(decoded, url, tenantId) {
  if (decoded.role === 'super_admin') {
    const scoped = url.searchParams.get('tenantId') || tenantId;
    if (!scoped) return { error: errorResponse('tenantId query parameter is required', 400) };
    return { tenantId: scoped };
  }
  if (decoded.role === 'admin') {
    if (!decoded.tenantId) return { error: errorResponse('Forbidden: Insufficient permissions', 403) };
    return { tenantId: decoded.tenantId };
  }
  return { error: errorResponse('Forbidden: Insufficient permissions', 403) };
}

async function resolveOrganization(env, tenantId) {
  const { results } = await env.DB.prepare(
    'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
  ).bind(tenantId).all();
  if (results.length > 0) return results[0].organization_id;
  return await ensureTenantOrg(env, tenantId);
}

// Phase 1: the one auth gate (defense-in-depth behind the /api/pos-users
// route gate). Byte-compat with the former inline gate, including its quirk
// of reporting a missing Authorization header with the invalid-token message.
// checkActive stays off here: the wrapping route gate already runs the
// every-request activity probe — running it twice would double the DB cost.
const posUsersHandlerGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin', 'admin'],
  requireTenant: false,
  missingToken: { message: 'Session expired or invalid signature' },
  checkActive: false,
});

export async function handlePosUsersRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  // ─── Authz (all methods, first) ───────────────────────────
  const auth = await posUsersHandlerGate(request, env);
  if (auth instanceof Response) return auth;
  const decoded = auth.user;

  // ─── Scope resolution ─────────────────────────────────────
  const scoped = scopeTenant(decoded, url, tenantId);
  if (scoped.error) return scoped.error;
  const scopedTenantId = scoped.tenantId;

  const organizationId = await resolveOrganization(env, scopedTenantId);
  if (!organizationId) {
    return errorResponse('Tenant is not provisioned for POS', 409);
  }

  // ─── GET /api/pos-users — paginated list ──────────────────
  if (method === 'GET' && path.length === 2) {
    const isSuperAdmin = decoded.role === 'super_admin';
    const { page, pageSize, offset } = parsePagination(url);
    const roleFilter = url.searchParams.get('role');
    const search = url.searchParams.get('search');

    const conditions = ['pu.organization_id = ?', 'pu.deleted_at IS NULL'];
    const binds = [organizationId];
    if (roleFilter) {
      conditions.push('pu.role = ?');
      binds.push(roleFilter);
    }
    if (search) {
      conditions.push(
        '(pu.first_name LIKE ? OR pu.last_name LIKE ? OR pu.email LIKE ? OR pu.username LIKE ?)'
      );
      binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.join(' AND ');

    const { results: countResult } = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM pos_users pu WHERE ${whereClause}`
    ).bind(...binds).all();
    const total = countResult[0]?.total ?? 0;

    const query = isSuperAdmin
      ? `SELECT ${POS_USER_SELECT_P}, t.name AS tenant_name
         FROM pos_users pu
         LEFT JOIN tenants t ON t.id = pu.tenant_id
         WHERE ${whereClause}
         ORDER BY pu.created_at DESC
         LIMIT ? OFFSET ?`
      : `SELECT ${POS_USER_SELECT_P}
         FROM pos_users pu
         WHERE ${whereClause}
         ORDER BY pu.created_at DESC
         LIMIT ? OFFSET ?`;

    const { results } = await env.DB.prepare(query)
      .bind(...binds, pageSize, offset)
      .all();

    return jsonResponse(paginationEnvelope(results, total, page, pageSize));
  }

  // ─── POST /api/pos-users — create ─────────────────────────
  if (method === 'POST' && path.length === 2) {
    try {
      const parsed = posUserCreateSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) return validationError(parsed);

      const { email, password, first_name, last_name } = parsed.data;
      const username = parsed.data.username || email;
      const role = parsed.data.role;
      const phone = parsed.data.phone;
      const department = parsed.data.department;
      const employee_id = parsed.data.employee_id;
      // Default to the org's first store when none was specified — an
      // auto-provisioned org always has exactly one store (ensureTenantOrg),
      // so a store-less user would break order creation (pos_transactions
      // FK on store_id) for no reason.
      let store_id = parsed.data.store_id;
      if (store_id == null) {
        const { results: orgStores } = await env.DB.prepare(
          'SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1'
        ).bind(organizationId).all();
        store_id = orgStores.length > 0 ? orgStores[0].id : null;
      }

      const { results: dup } = await env.DB.prepare(
        'SELECT id FROM pos_users WHERE email = ? OR username = ?'
      ).bind(email, username).all();
      if (dup.length > 0) return errorResponse('Email or username already exists', 409);

      const passwordHash = await hashPassword(password);

      // id is intentionally omitted: pos_users.id is INTEGER PRIMARY KEY
      // AUTOINCREMENT — inserting a text id raises "datatype mismatch" in D1.
      const result = await env.DB.prepare(
        `INSERT INTO pos_users
          (organization_id, tenant_id, username, email, password_hash, first_name, last_name,
           phone, role, department, employee_id, store_id, is_active, status,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))`
      ).bind(
        organizationId, scopedTenantId, username, email, passwordHash,
        first_name, last_name, phone || null, role, department || null,
        employee_id || null, store_id ?? null
      ).run();

      const id = result?.meta?.last_row_id ?? null;
      const row = id != null
        ? await env.DB.prepare(`SELECT ${POS_USER_SELECT} FROM pos_users WHERE id = ? AND organization_id = ?`)
            .bind(id, organizationId).first()
        : null;

      return jsonResponse({ success: true, id, ...(row || {}) });
    } catch (e) {
      return errorResponse('Failed to create user');
    }
  }

  // ─── PATCH /api/pos-users/:id — partial update ────────────
  if (method === 'PATCH' && path.length === 3) {
    const userId = path[2];
    try {
      const { results: exists } = await env.DB.prepare(
        'SELECT id FROM pos_users WHERE id = ? AND organization_id = ? AND deleted_at IS NULL'
      ).bind(userId, organizationId).all();
      if (exists.length === 0) return errorResponse('User not found', 404);

      const parsed = posUserPatchSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) return validationError(parsed);

      const data = parsed.data;
      const sets = [];
      const binds = [];
      for (const [key, column] of Object.entries(PATCH_FIELD_MAP)) {
        if (data[key] !== undefined) {
          sets.push(`${column} = ?`);
          let value = data[key];
          if (key === 'is_active') value = value === true || value === 1 ? 1 : 0;
          binds.push(value);
        }
      }
      if (sets.length === 0) return errorResponse('No fields to update', 400);

      if (data.email !== undefined || data.username !== undefined) {
        const { results: dup } = await env.DB.prepare(
          'SELECT id FROM pos_users WHERE (email = ? OR username = ?) AND id != ?'
        ).bind(data.email ?? '', data.username ?? '', userId).all();
        if (dup.length > 0) return errorResponse('Email or username already exists', 409);
      }

      await env.DB.prepare(
        `UPDATE pos_users SET ${sets.join(', ')}, updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`
      ).bind(...binds, userId, organizationId).run();

      return jsonResponse({ success: true, id: userId });
    } catch (e) {
      return errorResponse('Failed to update user');
    }
  }

  // ─── DELETE /api/pos-users/:id — soft delete ──────────────
  if (method === 'DELETE' && path.length === 3) {
    const userId = path[2];
    try {
      const { results: exists } = await env.DB.prepare(
        'SELECT id FROM pos_users WHERE id = ? AND organization_id = ? AND deleted_at IS NULL'
      ).bind(userId, organizationId).all();
      if (exists.length === 0) return errorResponse('User not found', 404);

      await env.DB.prepare(
        `UPDATE pos_users SET deleted_at = datetime('now'), is_active = 0, status = 'inactive',
           updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`
      ).bind(userId, organizationId).run();

      return jsonResponse({ success: true, id: userId });
    } catch (e) {
      return errorResponse('Failed to delete user');
    }
  }

  // ─── POST /api/pos-users/:id/reset-password ───────────────
  if (method === 'POST' && path.length === 4 && path[3] === 'reset-password') {
    const userId = path[2];
    try {
      const parsed = resetPasswordSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) return validationError(parsed);

      const { results: exists } = await env.DB.prepare(
        'SELECT id FROM pos_users WHERE id = ? AND organization_id = ? AND deleted_at IS NULL'
      ).bind(userId, organizationId).all();
      if (exists.length === 0) return errorResponse('User not found', 404);

      const passwordHash = await hashPassword(parsed.data.password);
      await env.DB.prepare(
        `UPDATE pos_users SET password_hash = ?, updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`
      ).bind(passwordHash, userId, organizationId).run();

      return jsonResponse({ success: true, id: userId });
    } catch (e) {
      return errorResponse('Failed to reset password');
    }
  }

  return errorResponse('Method not allowed', 405);
}
