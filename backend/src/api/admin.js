import bcrypt from 'bcryptjs';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { requireAuth } from '../middleware/requireAuth.js';
import { z } from 'zod';

export const tenantUpdateSchema = z.object({
  name: z.string().optional(),
  subdomain: z.string().optional(),
  type: z.enum(['camp', 'supermarket', 'transportation', 'other']).optional(),
  custom_domain: z.string().optional(),
  logo_url: z.string().optional(),
  favicon_url: z.string().optional(),
  primary_color: z.string().optional(),
  footer_text: z.string().optional(),
  status: z.string().optional(),
  location: z.string().optional(),
  whatsapp_number: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  admin_email: z.string().optional(),
  admin_password: z.string().optional(),
  admin_first_name: z.string().optional(),
  admin_last_name: z.string().optional(),
}).strip();

export const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, 'Tenant IDs array is required'),
}).strip();

export const adminCreateSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  tenant_id: z.string().optional(),
  role: z.string().min(1, 'Role is required'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
}).strip();

export const adminUpdateSchema = z.object({
  is_active: z.boolean().optional(),
  role: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
}).strip();

// Phase 1: the one auth gate. Byte-compat with the former inline gate:
// a missing header is still 401 "Missing or invalid Authorization header",
// while an invalid token, a POS session, or a non-super_admin role all
// collapse into the legacy combined-condition response
// 403 "Unauthorized: Super Admin access required".
// H2 fix: build the tenant cascade as prepared statements instead of running
// them inline, so callers can hand the whole set to DB.batch and delete a
// tenant atomically. Statement order is preserved exactly from the original
// sequential implementation. The tenants row itself is NOT included — callers
// append their own final tenants delete.
function buildTenantCascadeStmts(env, tid) {
  return [
    env.DB.prepare("DELETE FROM orders WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM inbox_reads WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM rooms_new WHERE camp_id IN (SELECT id FROM projects WHERE tenant_id = ?)").bind(tid),
    env.DB.prepare("DELETE FROM price_overrides WHERE product_id IN (SELECT id FROM pos_products WHERE tenant_id = ?)").bind(tid),
    env.DB.prepare("DELETE FROM product_camps WHERE product_id IN (SELECT id FROM pos_products WHERE tenant_id = ?)").bind(tid),
    env.DB.prepare("DELETE FROM pos_products WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM rate_plans_new WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM plans_new WHERE camp_id IN (SELECT id FROM projects WHERE tenant_id = ?)").bind(tid),
    env.DB.prepare("DELETE FROM projects WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM admins WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM categories WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM meal_categories WHERE tenant_id = ?").bind(tid),
    env.DB.prepare("DELETE FROM meal_schedules WHERE meal_id IN (SELECT id FROM meals WHERE tenant_id = ?)").bind(tid),
    env.DB.prepare("DELETE FROM meal_lang WHERE meal_id IN (SELECT id FROM meals WHERE tenant_id = ?)").bind(tid),
    env.DB.prepare("DELETE FROM meals WHERE tenant_id = ?").bind(tid),
  ];
}

const superAdminGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

export async function handleAdminRoute(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  const auth = await superAdminGate(request, env);
  if (auth instanceof Response) return auth;

  const subRoute = path[2];

  if (subRoute === 'stats') {
    if (method === 'GET') {
      try {
        const { results } = await env.DB.prepare(`
          SELECT
            (SELECT COUNT(*) FROM tenants) as total_tenants,
            (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) as total_camps,
            (SELECT COUNT(*) FROM rooms_new) as total_rooms,
            (SELECT COUNT(*) FROM orders) as total_orders,
            (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE order_state_id != 'cancelled') as total_revenue,
            (SELECT COUNT(*) FROM admins) as total_admins
        `).all();
        return jsonResponse(results[0]);
      } catch (e) {
        return errorResponse('Failed to fetch admin stats');
      }
    }
  } else if (subRoute === 'tenants') {
    // T6: GET /admin/tenants — paginated super-admin tenant list (new endpoint;
    // previously the only list was the public /tenants raw array)
    if (path.length === 3 && method === 'GET') {
      try {
        const { page, pageSize, offset } = parsePagination(url);
        // The root `marketplace` tenant row is not a real tenant — exclude it
        // from the directory (single-tenant /api/tenants/:id lookup still works).
        const { results: countResult } = await env.DB.prepare("SELECT COUNT(*) as total FROM tenants WHERE id != 'marketplace'").all();
        const { results } = await env.DB.prepare(
          `SELECT t.*, MIN(a.email) AS admin_email, MIN(a.first_name) AS admin_first_name, MIN(a.last_name) AS admin_last_name
           FROM tenants t
           LEFT JOIN admins a ON a.tenant_id = t.id AND a.role IN ('admin', 'tenant_admin')
           WHERE t.id != 'marketplace'
           GROUP BY t.id
           ORDER BY t.created_at DESC
           LIMIT ? OFFSET ?`
        ).bind(pageSize, offset).all();
        return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
      } catch (e) {
        return errorResponse('Failed to fetch tenants');
      }
    }
    const tenantId = path[3];
    if (!tenantId) return errorResponse('Tenant ID is required', 400);

    if (tenantId === 'bulk') {
      const action = path[4];
      if (method === 'POST') {
        try {
          const parsed = bulkActionSchema.safeParse(toSnake(await request.json()));
          if (!parsed.success) {
            return validationError(parsed);
          }
          const { ids } = parsed.data;

          if (action === 'suspend') {
            const placeholders = ids.map(() => '?').join(',');
            await env.DB.prepare(`UPDATE tenants SET status = 'suspended' WHERE id IN (${placeholders})`).bind(...ids).run();
            return jsonResponse({ success: true, suspended: ids });
          } else if (action === 'activate') {
            const placeholders = ids.map(() => '?').join(',');
            await env.DB.prepare(`UPDATE tenants SET status = 'active' WHERE id IN (${placeholders})`).bind(...ids).run();
            return jsonResponse({ success: true, activated: ids });
          } else if (action === 'delete') {
            // H2 fix: same atomicity as the single DELETE — every child row
            // for every id plus the tenants rows go in one transaction.
            const stmts = [];
            for (const tid of ids) {
              stmts.push(...buildTenantCascadeStmts(env, tid));
            }
            const placeholders = ids.map(() => '?').join(',');
            stmts.push(env.DB.prepare(`DELETE FROM tenants WHERE id IN (${placeholders})`).bind(...ids));
            await env.DB.batch(stmts);
            return jsonResponse({ success: true, deleted: ids });
          }
          return errorResponse('Invalid bulk action', 400);
        } catch (e) {
          return errorResponse('Failed to perform bulk action');
        }
      }
    }

    if (method === 'PUT' || method === 'PATCH') {
      try {
        const parsed = tenantUpdateSchema.safeParse(toSnake(await request.json()));
        if (!parsed.success) {
          return validationError(parsed);
        }
        const {
          name, subdomain, type, custom_domain, logo_url, favicon_url,
          primary_color, footer_text, status, location, whatsapp_number,
          phone, email, description, currency,
          admin_email, admin_password, admin_first_name, admin_last_name
        } = parsed.data;

        await env.DB.prepare(
          `UPDATE tenants SET
            name = COALESCE(?, name),
            subdomain = COALESCE(?, subdomain),
            type = COALESCE(?, type),
            custom_domain = COALESCE(?, custom_domain),
            logo_url = COALESCE(?, logo_url),
            favicon_url = COALESCE(?, favicon_url),
            primary_color = COALESCE(?, primary_color),
            footer_text = COALESCE(?, footer_text),
            status = COALESCE(?, status),
            location = COALESCE(?, location),
            whatsapp_number = COALESCE(?, whatsapp_number),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            description = COALESCE(?, description),
            currency = COALESCE(?, currency)
          WHERE id = ?`
        ).bind(
          name || null, subdomain || null, type || null, custom_domain || null, logo_url || null, favicon_url || null,
          primary_color || null, footer_text || null, status || null, location || null, whatsapp_number || null,
          phone || null, email || null, description || null, currency || null,
          tenantId
        ).run();

        if (admin_email || admin_password) {
          const existingAdmin = await env.DB.prepare(
            "SELECT id FROM admins WHERE tenant_id = ? AND role = 'admin'"
          ).bind(tenantId).first();

          if (existingAdmin) {
            if (admin_password) {
              const passHash = await bcrypt.hash(admin_password, 12);
              await env.DB.prepare(
                `UPDATE admins SET email = COALESCE(?, email), password_hash = ?, first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), updated_at = datetime('now') WHERE id = ?`
              ).bind(admin_email || null, passHash, admin_first_name || null, admin_last_name || null, existingAdmin.id).run();
            } else {
              await env.DB.prepare(
                `UPDATE admins SET email = COALESCE(?, email), first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), updated_at = datetime('now') WHERE id = ?`
              ).bind(admin_email || null, admin_first_name || null, admin_last_name || null, existingAdmin.id).run();
            }
          } else if (admin_password) {
            const passHash = await bcrypt.hash(admin_password, 12);
          const aid = 'adm_' + crypto.randomUUID().slice(0, 12); // L1 fix
          await env.DB.prepare(
            "INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at) VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, datetime('now'))"
          ).bind(aid, tenantId, admin_email || `admin@${subdomain || 'camp'}.com`, passHash, admin_first_name || 'Camp', admin_last_name || 'Admin').run();
          }
        }

        return jsonResponse({ success: true });
      } catch (e) {
        return errorResponse('Failed to update tenant');
      }
    } else if (method === 'DELETE') {
      try {
        // H2 fix: cascade delete in ONE DB.batch transaction. Previously these
        // 16 statements ran sequentially — a mid-way failure left a
        // half-deleted tenant (orphaned orders/rooms, or a tenant row whose
        // children were already gone).
        const stmts = buildTenantCascadeStmts(env, tenantId);
        stmts.push(env.DB.prepare("DELETE FROM tenants WHERE id = ?").bind(tenantId));
        await env.DB.batch(stmts);
        return jsonResponse({ success: true });
      } catch (e) {
        return errorResponse('Failed to delete tenant');
      }
    }
  } else if (subRoute === 'admins') {
    if (method === 'GET') {
      try {
        // T6: paginated envelope — GET /admin/admins now returns { data, total, page, pageSize, hasMore }
        const { page, pageSize, offset } = parsePagination(url);
        const { results: countResult } = await env.DB.prepare('SELECT COUNT(*) as total FROM admins').all();
        const { results } = await env.DB.prepare(
          "SELECT id, tenant_id, email, role, first_name, last_name, is_active, last_login, created_at FROM admins ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(pageSize, offset).all();
        return jsonResponse(paginationEnvelope(results, countResult?.[0]?.total || 0, page, pageSize));
      } catch (e) {
        return errorResponse('Failed to fetch admins');
      }
    } else if (method === 'POST') {
      try {
        const parsed = adminCreateSchema.safeParse(toSnake(await request.json()));
        if (!parsed.success) {
          return validationError(parsed);
        }
        const { email, password, tenant_id, role, first_name, last_name } = parsed.data;
        const passHash = await bcrypt.hash(password, 12);
        const existing = await env.DB.prepare("SELECT id, role FROM admins WHERE email = ? AND (tenant_id = ? OR tenant_id IS NULL)").bind(email, tenant_id || null).first();
        if (existing) {
          // Prevent overwriting super_admin accounts via this route
          if (existing.role === 'super_admin') {
            return errorResponse('Cannot modify super_admin accounts via this endpoint', 403);
          }
          await env.DB.prepare(
            "UPDATE admins SET tenant_id = ?, password_hash = ?, role = ?, first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), updated_at = datetime('now') WHERE id = ?"
          ).bind(tenant_id || null, passHash, role, first_name || null, last_name || null, existing.id).run();
          return jsonResponse({ success: true, id: existing.id, updated: true });
        } else {
          const aid = 'adm_' + crypto.randomUUID().slice(0, 12); // L1 fix
          await env.DB.prepare(
            "INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))"
          ).bind(aid, tenant_id || null, email, passHash, role, first_name || null, last_name || null).run();
          return jsonResponse({ success: true, id: aid });
        }
      } catch (e) {
        return errorResponse('Failed to create/update admin');
      }
    } else if (method === 'DELETE') {
      const adminId = path[3];
      if (!adminId) return errorResponse('Admin ID is required', 400);
      try {
        await env.DB.prepare("DELETE FROM admins WHERE id = ? AND role != 'super_admin'").bind(adminId).run();
        return jsonResponse({ success: true });
      } catch (e) {
        return errorResponse('Failed to delete admin');
      }
    } else if (method === 'PUT' || method === 'PATCH') {
      const adminId = path[3];
      if (!adminId) return errorResponse('Admin ID is required', 400);
      try {
        const parsed = adminUpdateSchema.safeParse(toSnake(await request.json()));
        if (!parsed.success) {
          return validationError(parsed);
        }
        const { is_active, role, first_name, last_name } = parsed.data;

        const existing = await env.DB.prepare("SELECT id, role FROM admins WHERE id = ?").bind(adminId).first();
        if (!existing) return errorResponse('Admin not found', 404);
        if (existing.role === 'super_admin') return errorResponse('Cannot modify super_admin accounts via this endpoint', 403);

        const updates = [];
        const params = [];
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
        if (role) { updates.push('role = ?'); params.push(role); }
        if (first_name !== undefined) { updates.push('first_name = ?'); params.push(first_name); }
        if (last_name !== undefined) { updates.push('last_name = ?'); params.push(last_name); }

        if (updates.length === 0) return errorResponse('No fields to update', 400);

        updates.push("updated_at = datetime('now')");
        params.push(adminId);

        await env.DB.prepare(
          `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...params).run();

        return jsonResponse({ success: true, id: adminId });
      } catch (e) {
        return errorResponse('Failed to update admin');
      }
    }
  }

  return errorResponse('Admin endpoint not found', 404);
}
