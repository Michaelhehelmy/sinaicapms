import bcrypt from 'bcryptjs';
import { jsonResponse, cachedJsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { verifyToken } from '../middleware/sharedAuth.js';
import { extractRequestToken, isActiveAdmin } from '../middleware/requireAuth.js';
import { getScope } from '../middleware/resolveScope.js';
import { Hono } from 'hono';
import { z } from 'zod';

export const tenantPostSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  subdomain: z.string().min(1, 'Subdomain is required'),
  // Shared/reconciled tenant-type vocabulary — union of PROJECT_TYPES
  // (backend/src/api/camps.js 'camp'|'supermarket'|'transportation'|'restaurant'|'custom')
  // plus the legacy 'other'. `type` and `project_type` must stay in sync so a
  // tenant built from a project type never 400s on this schema.
  // Default stays 'camp' (backward compatible).
  type: z.enum(['camp', 'supermarket', 'transportation', 'restaurant', 'custom', 'other']).optional(),
  custom_domain: z.string().optional(),
  logo_url: z.string().optional(),
  favicon_url: z.string().optional(),
  primary_color: z.string().optional(),
  footer_text: z.string().optional(),
  location: z.string().optional(),
  whatsapp_number: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  description: z.string().optional(),
  hero_image_url: z.string().optional(),
  gallery_images: z.string().optional(),
  about_text: z.string().optional(),
  faq_items: z.string().optional(),
  reviews: z.string().optional(),
  map_embed_url: z.string().optional(),
  activities: z.string().optional(),
  capacity: z.number().optional(),
  currency: z.string().optional(),
  admin_email: z.string().optional(),
  admin_first_name: z.string().optional(),
  admin_last_name: z.string().optional(),
  admin_password: z.string().min(1, 'Admin password is required'),
}).strip();

export const tenantMePutSchema = z.object({
  name: z.string().optional(),
  logo_url: z.string().optional(),
  favicon_url: z.string().optional(),
  primary_color: z.string().optional(),
  footer_text: z.string().optional(),
  location: z.string().optional(),
  whatsapp_number: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  description: z.string().optional(),
  hero_image_url: z.string().optional(),
  gallery_images: z.string().optional(),
  about_text: z.string().optional(),
  faq_items: z.string().optional(),
  reviews: z.string().optional(),
  map_embed_url: z.string().optional(),
  activities: z.string().optional(),
  capacity: z.number().optional(),
  currency: z.string().optional(),
  admin_email: z.string().optional(),
  admin_first_name: z.string().optional(),
  admin_last_name: z.string().optional(),
  admin_password: z.string().optional(),
  admin_id: z.string().optional(),
}).strip();

function selectFieldsPublic() {
  return "id, name, subdomain, type, custom_domain, logo_url, favicon_url, primary_color, footer_text, location, whatsapp_number, phone, email, description, hero_image_url, gallery_images, about_text, faq_items, reviews, map_embed_url, activities, capacity, currency, status, menu_config";
}

export async function handleTenants(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  let isSuperAdmin = false;
  try {
    // Soft elevation: never rejects — an absent/invalid token simply means
    // the public view. Token parsing and the activity probe are shared with
    // requireAuth so no inline Authorization handling remains here.
    const token = extractRequestToken(request);
    if (token) {
      const decoded = await verifyToken(token, env.JWT_SECRET);
      if (decoded && decoded.role === 'super_admin') {
        // P0-6/P0-7: Verify super admin is active before granting access
        if (await isActiveAdmin(env, decoded.userId || decoded.sub)) {
          isSuperAdmin = true;
        }
      }
    }
  } catch(e){}

  if (method === 'GET') {
    if (path.length === 2 || (path.length === 3 && path[2] === 'public')) {
      let query;
      if (isSuperAdmin) {
        query = `
          SELECT tenants.*, MIN(a.email) AS admin_email, MIN(a.first_name || ' ' || a.last_name) AS admin_name
          FROM tenants
          LEFT JOIN admins a ON a.tenant_id = tenants.id AND a.role IN ('admin', 'tenant_admin')
          WHERE 1=1 AND tenants.id != 'marketplace'
        `;
      } else {
        query = `SELECT ${selectFieldsPublic()} FROM tenants WHERE 1=1 AND status = 'active' AND tenants.id != 'marketplace'`;
      }
      
      const bindArgs = [];

      const search = url.searchParams.get('search');
      const location = url.searchParams.get('location');
      const capacity = url.searchParams.get('capacity');
      const activities = url.searchParams.get('activities');
      const status = url.searchParams.get('status');

      if (search) {
        query += " AND (tenants.name LIKE ? OR tenants.location LIKE ? OR tenants.description LIKE ?)";
        bindArgs.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (location) {
        query += " AND tenants.location LIKE ?";
        bindArgs.push(`%${location}%`);
      }
      if (capacity) {
        query += " AND tenants.capacity >= ?";
        bindArgs.push(parseInt(capacity) || 0);
      }
      if (activities) {
        query += " AND tenants.activities LIKE ?";
        bindArgs.push(`%${activities}%`);
      }
      if (status) {
        query += " AND tenants.status = ?";
        bindArgs.push(status);
      }

      // Group by tenant id: the admin join is 1:N (one row per admin), so
      // without GROUP BY a tenant with multiple admins fans out into
      // duplicate rows — duplicate keys crash list UIs (React duplicate-key
      // warnings, "may cause children to be duplicated and/or omitted").
      query += " GROUP BY tenants.id";

      const { results } = await env.DB.prepare(query).bind(...bindArgs).all();
      return cachedJsonResponse(results);
    } else if (path.length === 3) {
      // Support lookup by id, subdomain, or custom_domain (SEO-friendly URLs use subdomain).
      // Normalize a leading `www.` so www.acaciacamp.com matches custom_domain = 'acaciacamp.com'.
      const lookupKey = path[2].replace(/^www\./, '');
      let query;
      if (isSuperAdmin) {
        query = `
          SELECT tenants.*, MIN(a.email) AS admin_email, MIN(a.first_name || ' ' || a.last_name) AS admin_name
          FROM tenants
          LEFT JOIN admins a ON a.tenant_id = tenants.id AND a.role IN ('admin', 'tenant_admin')
          WHERE tenants.id = ? OR tenants.subdomain = ? OR tenants.custom_domain = ?
          GROUP BY tenants.id
        `;
      } else {
        // H5 fix: suspended/pending tenants must not resolve for public or
        // tenant-scoped callers. Status is an inline literal (fixed enum, not
        // user input) so the lookup stays 3 binds — callers/tests rely on the
        // exact [key, key, key] bind signature.
        query = `SELECT ${selectFieldsPublic()} FROM tenants WHERE (id = ? OR subdomain = ? OR custom_domain = ?) AND status = 'active'`;
      }
      const { results } = await env.DB.prepare(query).bind(lookupKey, lookupKey, lookupKey).all();
      if (results.length === 0) return errorResponse('Tenant not found', 404);
      return cachedJsonResponse(results[0]);
    }
  } else if (method === 'POST') {
    // P0-7: Require authentication for tenant creation
    if (!isSuperAdmin) {
      return errorResponse('Unauthorized: Super Admin access required', 403);
    }
    try {
      const parsed = tenantPostSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const {
        id, name, subdomain, type, custom_domain, logo_url, favicon_url, 
        primary_color, footer_text, location, whatsapp_number, phone, email, description,
        hero_image_url, gallery_images, about_text, faq_items, reviews, map_embed_url, activities, capacity, currency,
        admin_email, admin_first_name, admin_last_name, admin_password
      } = parsed.data;

      if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain)) {
        return errorResponse('Subdomain must be lowercase alphanumeric with hyphens, 3-63 chars');
      }

      const existing = await env.DB.prepare(
        "SELECT id FROM tenants WHERE subdomain = ?"
      ).bind(subdomain).all();
      if (existing.results.length > 0) {
        return errorResponse('This subdomain is already taken');
      }

      if (custom_domain) {
        const existingDomain = await env.DB.prepare(
          "SELECT id FROM tenants WHERE custom_domain = ?"
        ).bind(custom_domain).all();
        if (existingDomain.results.length > 0) {
          return errorResponse('This custom domain is already registered');
        }
      }

      const tid = id || ('tenant_' + crypto.randomUUID().slice(0, 12));
      
      await env.DB.prepare(
        `INSERT INTO tenants (
          id, subdomain, custom_domain, name, type, logo_url, favicon_url, 
          primary_color, footer_text, location, whatsapp_number, phone, email, description,
          hero_image_url, gallery_images, about_text, faq_items, reviews, map_embed_url, activities, capacity, currency, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      ).bind(
        tid, subdomain, custom_domain || null, name, type || 'camp', logo_url || null, favicon_url || null, 
        primary_color || '#4a7c4f', footer_text || null, location || null, whatsapp_number || null, 
        phone || null, email || null, description || null,
        hero_image_url || null, gallery_images || null, about_text || null, faq_items || null, 
        reviews || null, map_embed_url || null, activities || null, capacity || 50, currency || 'EGP'
      ).run();

      // Create default admin user — require admin_password for security
      const adminId = 'adm_' + crypto.randomUUID().slice(0, 12);
      if (!admin_password) {
        return errorResponse('admin_password is required for tenant creation', 400);
      }
      const hashedPassword = await bcrypt.hash(admin_password, 12);
      
      await env.DB.prepare(
        `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, datetime('now'), datetime('now'))`
      ).bind(
        adminId,
        tid,
        admin_email || `admin@${subdomain}.com`,
        hashedPassword,
        admin_first_name || 'Admin',
        admin_last_name || 'User'
      ).run();
      
      return jsonResponse({ id: tid, name, subdomain, success: true });
    } catch (e) {
      return errorResponse('Failed to create tenant');
    }
  }
  return errorResponse('Method not allowed', 405);
}

/**
 * /api/me sub-router (Phase 4 T1). Mixed visibility: GET is public (R-9 —
 * graceful 200 without tenant context), PUT/PATCH are admin-scoped.
 *
 * Mounted by index.js as:
 *   app.use('/api/me', meScope);
 *   app.route('/api/me', meRoutes);
 */
const meRoutes = new Hono();

// R-9 fix: /api/me is public — return graceful 200 when no tenant context
meRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  if (!tenantId) {
    return jsonResponse({ id: null, name: null, subdomain: null, message: 'No tenant context provided' });
  }
  const { results } = await c.env.DB.prepare(
      `SELECT t.id, t.name, t.subdomain, t.type, t.custom_domain, t.logo_url, t.favicon_url, t.primary_color, t.footer_text, t.location, t.whatsapp_number, t.phone, t.email, t.description, t.hero_image_url, t.gallery_images, t.about_text, t.faq_items, t.reviews, t.map_embed_url, t.activities, t.capacity, t.currency, t.status, t.menu_config,
              (SELECT COUNT(*) FROM meals WHERE tenant_id = t.id AND (is_active = 1 OR is_active IS NULL)) AS has_meals
       FROM tenants t WHERE t.id = ?`
  ).bind(tenantId).all();
  if (results.length === 0) return errorResponse('Tenant not found', 404);
  return jsonResponse(results[0]);
});

async function meUpdate(c) {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = tenantMePutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const {
      name, logo_url, favicon_url, primary_color, footer_text,
      location, whatsapp_number, phone, email, description,
      hero_image_url, gallery_images, about_text, faq_items, reviews, map_embed_url, activities, capacity, currency,
      admin_email, admin_first_name, admin_last_name, admin_password, admin_id
    } = parsed.data;

    await c.env.DB.prepare(
      `UPDATE tenants SET
        name = COALESCE(?, name),
        logo_url = COALESCE(?, logo_url),
        favicon_url = COALESCE(?, favicon_url),
        primary_color = COALESCE(?, primary_color),
        footer_text = COALESCE(?, footer_text),
        location = COALESCE(?, location),
        whatsapp_number = COALESCE(?, whatsapp_number),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        description = COALESCE(?, description),
        hero_image_url = COALESCE(?, hero_image_url),
        gallery_images = COALESCE(?, gallery_images),
        about_text = COALESCE(?, about_text),
        faq_items = COALESCE(?, faq_items),
        reviews = COALESCE(?, reviews),
        map_embed_url = COALESCE(?, map_embed_url),
        activities = COALESCE(?, activities),
        capacity = COALESCE(?, capacity),
        currency = COALESCE(?, currency)
      WHERE id = ?`
    ).bind(
      name || null, logo_url || null, favicon_url || null, primary_color || null, footer_text || null,
      location || null, whatsapp_number || null, phone || null, email || null, description || null,
      hero_image_url || null, gallery_images || null, about_text || null, faq_items || null,
      reviews || null, map_embed_url || null, activities || null, capacity ?? null, currency || null,
      tenantId
    ).run();

    // Update admin user if fields provided
    if (admin_id && (admin_email || admin_first_name || admin_last_name || admin_password)) {
      let hashedPassword = null;
      if (admin_password) {
        hashedPassword = await bcrypt.hash(admin_password, 12);
      }
      await c.env.DB.prepare(
        `UPDATE admins SET
          email = COALESCE(?, email),
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          password_hash = COALESCE(?, password_hash),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?`
      ).bind(
        admin_email || null,
        admin_first_name || null,
        admin_last_name || null,
        hashedPassword,
        admin_id,
        tenantId
      ).run();
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update tenant');
  }
}

meRoutes.put('/', meUpdate);
meRoutes.patch('/', meUpdate);

meRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default meRoutes;
