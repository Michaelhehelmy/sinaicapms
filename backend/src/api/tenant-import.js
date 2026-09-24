import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope, ensureTenantOrg } from '../middleware/resolveScope.js';
import { hashPassword } from '../middleware/sharedAuth.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Identity block schema — used when creating a brand-new tenant from a manifest.
 * snake_case (caller must toSnake() first).
 */
const identitySchema = z.object({
  name: z.string().min(1, 'Tenant name is required'),
  subdomain: z.string().min(1, 'Subdomain is required'),
  type: z.enum(['camp', 'supermarket', 'transportation', 'other']).default('camp'),
  email: z.string().email('Valid admin email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  business_type: z.string().optional(),
}).strip();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const IMAGE_CONTENT_TYPE = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
};

/**
 * Resolve an image value: data URI → R2 upload → /api/media/ URL;
 * http(s) or /api/media/ URL → unchanged; else null.
 * NO KV writes ever (free-plan quota).
 * When `uploadedKeys` (array) is passed, every key PUT successfully is pushed
 * onto it so the import handler can roll partial uploads back on failure
 * (F-A17-02 / Wave 3.6b). Keys are pushed AFTER the put resolves.
 */
async function resolveImage(env, tenantId, value, uploadedKeys = null) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/api/media/')) {
    return value;
  }
  const m = value.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.includes(ext)) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return null;
  if (!env.MEDIA_BUCKET) return null;
  const key = `media/${tenantId}/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA_BUCKET.put(key, bytes.buffer, {
    httpMetadata: { contentType: IMAGE_CONTENT_TYPE[ext] },
  });
  if (uploadedKeys) uploadedKeys.push(key);
  return `/api/media/${key}`;
}

/**
 * Manifest zod schema — snake_case keys (caller must toSnake() first).
 * Wire camelCase → toSnake → this schema.
 */
const manifestSchema = z.object({
  tenant: z.object({
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
    menu_config: z.string().optional(),
  }).optional(),
  project: z.object({
    name: z.string().min(1).optional(),
    location: z.string().optional(),
    capacity: z.number().min(0).optional(),
    status: z.enum(['active', 'inactive', 'planning', 'completed']).optional(),
  }).optional(),
  products: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Product name is required'),
    sku: z.string().optional(),
    base_price: z.number().min(0).optional(),
    capacity: z.number().min(1).optional(),
    description: z.string().optional(),
    short_description: z.string().optional(),
    image_url: z.string().optional(),
    category_id: z.string().optional(),
    is_active: z.number().optional(),
    type: z.enum(['room', 'menu', 'buffet', 'retail']).optional(),
    camp_id: z.string().optional(),
  })).max(200).optional(),
  rooms: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Room name is required'),
    product_id: z.string().optional(),
    product_name: z.string().optional(),
    floor: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    bed_type: z.string().optional(),
    max_guests: z.number().optional(),
    base_price: z.number().optional(),
    notes: z.string().optional(),
    is_active: z.number().optional(),
  })).max(200).optional(),
  rate_plans: z.array(z.object({
    id: z.string().optional(),
    product_id: z.string().optional(),
    product_name: z.string().optional(),
    name: z.string().min(1, 'Rate plan name is required'),
    price_per_night: z.number().positive('Price must be positive'),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    season: z.string().optional(),
    min_stay: z.number().optional(),
    is_active: z.number().optional(),
  })).max(200).optional(),
  menu: z.object({
    categories: z.array(z.object({
      name: z.string().min(1, 'Category name is required'),
      position: z.number().optional(),
    })).max(50).optional(),
    meals: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1, 'Meal name is required'),
      meal_category_id: z.string().optional(),
      category_name: z.string().optional(),
      price: z.number().min(0).optional(),
      description: z.string().optional(),
      image_url: z.string().optional(),
      is_active: z.number().optional(),
    })).max(200).optional(),
  }).optional(),
  pos_users: z.array(z.object({
    email: z.string().email('Valid email is required'),
    username: z.string().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    phone: z.string().optional(),
    role: z.enum(['cashier', 'manager', 'admin']).optional(),
    department: z.string().optional(),
    employee_id: z.string().optional(),
    store_id: z.number().int().optional(),
  })).max(100).optional(),
}).strip();

/**
 * Ensure a product exists in the `products` table (FK target) by mirroring
 * from `pos_products`. Best-effort: ignores errors.
 */
async function ensureProductInProductsTable(DB, tenantId, productId) {
  if (!productId) return;
  try {
    await DB.prepare(`
      INSERT OR IGNORE INTO products (id, tenant_id, category_id, sku, base_price, capacity, image_url, is_active, created_at, updated_at)
      SELECT id, tenant_id, category_id, sku, selling_price, capacity, image_url, is_active, created_at, updated_at
      FROM pos_products WHERE id = ? AND tenant_id = ?
    `).bind(productId, tenantId).run();
  } catch (_) { /* best-effort */ }
}

/**
 * Core import body — extracted so `importTenantManifest` can roll back partial
 * R2 uploads on ANY failure (F-A17-02 / Wave 3.6b). Deterministic error paths
 * return `fail(status, message)` (which deletes every tracked key); thrown
 * R2/DB errors propagate to the importTenantManifest wrapper which also deletes
 * tracked keys before rethrowing, so the route wrapper keeps its UNIQUE→409 /
 * generic-500 contract. `fail` is deliberately not used before the first R2
 * upload (schema 400, unprovisioned-org 409) — nothing to roll back yet.
 * Accepts a parsed (already toSnake'd) manifest payload.
 */
async function runImport(env, tenantId, data, uploadedKeys, fail) {
  const counts = {
    products: 0, rooms: 0, rate_plans: 0,
    meal_categories: 0, meals: 0, pos_users: 0,
  };

  // Resolve POS org for this tenant (required for products + pos_users).
  const organizationId = await ensureTenantOrg(env, tenantId);
  if (!organizationId) {
    return errorResponse('Tenant is not provisioned for POS', 409);
  }

  // Resolve the default camp/project for this tenant.
  const { results: tenantProjects } = await env.DB.prepare(
    "SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL"
  ).bind(tenantId).all();
  const defaultCampId = tenantProjects.length === 1 ? tenantProjects[0].id : null;

  // ── 1. Tenant branding/content update ────────────────────────────
  if (data.tenant) {
    const t = data.tenant;
    const logoUrl = await resolveImage(env, tenantId, t.logo_url, uploadedKeys);
    const faviconUrl = await resolveImage(env, tenantId, t.favicon_url, uploadedKeys);
    const heroImageUrl = await resolveImage(env, tenantId, t.hero_image_url, uploadedKeys);

    await env.DB.prepare(
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
        currency = COALESCE(?, currency),
        menu_config = COALESCE(?, menu_config)
      WHERE id = ?`
    ).bind(
      t.name || null, logoUrl || t.logo_url || null, faviconUrl || t.favicon_url || null,
      t.primary_color || null, t.footer_text || null, t.location || null,
      t.whatsapp_number || null, t.phone || null, t.email || null,
      t.description || null, heroImageUrl || t.hero_image_url || null,
      t.gallery_images || null, t.about_text || null, t.faq_items || null,
      t.reviews || null, t.map_embed_url || null, t.activities || null,
      t.capacity ?? null, t.currency || null, t.menu_config || null,
      tenantId
    ).run();
  }

  // ── 2. Products (T12 bulk logic) ─────────────────────────────────
  // Build product name → id mapping for room/rate_plan product_name references.
  const productNameToId = new Map();
  if (data.products && data.products.length > 0) {
    const stmts = [];
    for (const item of data.products) {
      const pid = item.id || 'prod_' + crypto.randomUUID().slice(0, 12);
      const imageUrl = await resolveImage(env, tenantId, item.image_url, uploadedKeys);
      productNameToId.set(item.name, pid);

      stmts.push(
        env.DB.prepare(
          `INSERT INTO pos_products (id, tenant_id, organization_id, category_id, sku, name, description, short_description, selling_price, capacity, image_url, is_active, type, camp_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          pid, tenantId, organizationId, item.category_id || null,
          item.sku || 'PROD-' + pid.toUpperCase(),
          item.name, item.description || null, item.short_description || null,
          item.base_price || 0, item.capacity || 1,
          imageUrl || null, item.is_active !== undefined ? item.is_active : 1,
          item.type || 'retail', item.camp_id || defaultCampId
        )
      );
    }
    try {
      await env.DB.batch(stmts);
    } catch (e) {
      if (e?.message?.includes('UNIQUE constraint failed')) {
        return fail(409, 'One or more products already exist (duplicate SKU or ID)');
      }
      return fail(500, 'Failed to create products: ' + (e?.message || String(e)));
    }
    counts.products = data.products.length;
  }

  // Also index existing tenant products for product_name references.
  const { results: existingProducts } = await env.DB.prepare(
    "SELECT id, name FROM pos_products WHERE tenant_id = ? AND deleted_at IS NULL"
  ).bind(tenantId).all();
  for (const p of existingProducts) {
    if (!productNameToId.has(p.name)) productNameToId.set(p.name, p.id);
  }

  // ── 3. Rooms → rooms_new ─────────────────────────────────────────
  if (data.rooms && data.rooms.length > 0) {
    const roomStmts = [];
    for (const room of data.rooms) {
      let productId = room.product_id;
      if (!productId && room.product_name) productId = productNameToId.get(room.product_name);
      if (!productId) {
        return fail(400, `Room "${room.name}" references unknown product: ${room.product_name || 'no product_id'}`);
      }
      await ensureProductInProductsTable(env.DB, tenantId, productId);

      const rid = room.id || 'room_' + crypto.randomUUID().slice(0, 12);
      const campId = room.camp_id || defaultCampId;

      let maxGuests = room.max_guests;
      if (maxGuests === undefined || maxGuests === null) {
        const { results: prod } = await env.DB.prepare(
          "SELECT capacity FROM pos_products WHERE tenant_id = ? AND id = ?"
        ).bind(tenantId, productId).all();
        maxGuests = prod.length > 0 ? prod[0].capacity : 2;
      }

      roomStmts.push(
        env.DB.prepare(
          // 0115: tenant_id is NOT NULL + FK — bind the import tenant (equals
          // c3.tenant_id by the WHERE clause below, so the guard is unchanged).
          `INSERT INTO rooms_new (id, camp_id, product_id, name, status, bed_type, max_guests, base_price, floor, notes, is_active, tenant_id, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
           FROM projects c3
           WHERE c3.id = ? AND c3.tenant_id = ? AND c3.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM pos_products p WHERE p.id = ? AND p.tenant_id = c3.tenant_id)`
        ).bind(
          rid, campId, productId, room.name,
          room.status || 'available', room.bed_type || null, maxGuests,
          room.base_price !== undefined ? room.base_price : null,
          room.floor !== undefined ? String(room.floor) : null,
          room.notes || null, room.is_active !== undefined ? room.is_active : 1,
          tenantId,
          campId, tenantId, productId
        )
      );
    }
    const results = await env.DB.batch(roomStmts);
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.meta?.changes === 0) {
        return fail(404, `Room "${data.rooms[i].name}" failed: camp or product not found for this tenant`);
      }
    }
    counts.rooms = data.rooms.length;
  }

  // ── 4. Rate plans → rate_plans_new ───────────────────────────────
  if (data.rate_plans && data.rate_plans.length > 0) {
    const rpStmts = [];
    for (const rp of data.rate_plans) {
      let productId = rp.product_id;
      if (!productId && rp.product_name) productId = productNameToId.get(rp.product_name);
      if (!productId) {
        return fail(400, `Rate plan "${rp.name}" references unknown product: ${rp.product_name || 'no product_id'}`);
      }
      await ensureProductInProductsTable(env.DB, tenantId, productId);

      const rpid = rp.id || 'rp_' + crypto.randomUUID().slice(0, 12);
      rpStmts.push(
        env.DB.prepare(
          `INSERT INTO rate_plans_new (id, tenant_id, product_id, camp_id, name, price_per_night, start_date, end_date, season, min_stay, is_active, created_at, updated_at)
           SELECT ?, ?, ?, p.camp_id, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
           FROM pos_products p
           WHERE p.id = ? AND p.tenant_id = ?`
        ).bind(
          rpid, tenantId, productId, rp.name, rp.price_per_night,
          rp.start_date || null, rp.end_date || null,
          rp.season || 'all', rp.min_stay || 1,
          rp.is_active !== undefined ? rp.is_active : 1,
          productId, tenantId
        )
      );
    }
    const results = await env.DB.batch(rpStmts);
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.meta?.changes === 0) {
        return fail(404, `Rate plan "${data.rate_plans[i].name}" failed: product not found for this tenant`);
      }
    }
    counts.rate_plans = data.rate_plans.length;
  }

  // ── 5. Meal categories ───────────────────────────────────────────
  const categoryNameToId = new Map();
  if (data.menu?.categories && data.menu.categories.length > 0) {
    const catStmts = [];
    for (const cat of data.menu.categories) {
      const catId = 'mcat_' + crypto.randomUUID().slice(0, 12);
      categoryNameToId.set(cat.name, catId);
      catStmts.push(
        env.DB.prepare(
          "INSERT INTO meal_categories (id, tenant_id, position, created_at) VALUES (?, ?, ?, datetime('now'))"
        ).bind(catId, tenantId, cat.position || 0)
      );
      catStmts.push(
        env.DB.prepare(
          "INSERT INTO meal_categories_lang (meal_category_id, lang, name) VALUES (?, 'en', ?)"
        ).bind(catId, cat.name)
      );
    }
    await env.DB.batch(catStmts);
    counts.meal_categories = data.menu.categories.length;
  }

  // Index existing categories for category_name references on meals.
  const { results: existingCats } = await env.DB.prepare(
    `SELECT mc.id, mcl.name FROM meal_categories mc
     LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
     WHERE mc.tenant_id = ?`
  ).bind(tenantId).all();
  for (const c of existingCats) {
    if (c.name && !categoryNameToId.has(c.name)) categoryNameToId.set(c.name, c.id);
  }

  // ── 6. Meals ─────────────────────────────────────────────────────
  if (data.menu?.meals && data.menu.meals.length > 0) {
    const mealStmts = [];
    for (const meal of data.menu.meals) {
      const mid = meal.id || 'meal_' + crypto.randomUUID().slice(0, 12);
      let categoryId = meal.meal_category_id;
      if (!categoryId && meal.category_name) categoryId = categoryNameToId.get(meal.category_name);
      const imageUrl = await resolveImage(env, tenantId, meal.image_url, uploadedKeys);

      mealStmts.push(
        env.DB.prepare(
          `INSERT INTO meals (id, tenant_id, meal_category_id, price, image_url, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          mid, tenantId, categoryId || null, meal.price || 0,
          imageUrl || null, meal.is_active !== undefined ? meal.is_active : 1
        )
      );
      mealStmts.push(
        env.DB.prepare(
          `INSERT INTO meal_lang (meal_id, lang, name, description) VALUES (?, 'en', ?, ?)`
        ).bind(mid, meal.name, meal.description || null)
      );
    }
    await env.DB.batch(mealStmts);
    counts.meals = data.menu.meals.length;
  }

  // ── 7. POS users ─────────────────────────────────────────────────
  if (data.pos_users && data.pos_users.length > 0) {
    const userStmts = [];
    for (const user of data.pos_users) {
      let storeId = user.store_id;
      if (storeId == null) {
        const { results: orgStores } = await env.DB.prepare(
          'SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1'
        ).bind(organizationId).all();
        storeId = orgStores.length > 0 ? orgStores[0].id : null;
      }
      const passwordHash = await hashPassword(user.password);

      userStmts.push(
        env.DB.prepare(
          `INSERT INTO pos_users
            (organization_id, tenant_id, username, email, password_hash, first_name, last_name,
             phone, role, department, employee_id, store_id, is_active, status,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))`
        ).bind(
          organizationId, tenantId, user.username || user.email, user.email, passwordHash,
          user.first_name, user.last_name, user.phone || null,
          user.role || 'cashier', user.department || null,
          user.employee_id || null, storeId ?? null
        )
      );
    }
    try {
      await env.DB.batch(userStmts);
    } catch (e) {
      if (e?.message?.includes('UNIQUE constraint failed')) {
        return fail(409, 'One or more POS users already exist (duplicate email or username)');
      }
      return fail(500, 'Failed to create POS users: ' + (e?.message || String(e)));
    }
    counts.pos_users = data.pos_users.length;
  }

  return jsonResponse({ success: true, tenant_id: tenantId, counts });
}

/**
 * Core import function — exported for T2 reuse and unit testing.
 * Accepts a parsed (already toSnake'd) manifest payload.
 *
 * F-A17-02 / Wave 3.6b — R2 upload rollback: every key PUT successfully by
 * `runImport` is tracked; on ANY failure (deterministic error via `fail(…)` or
 * a thrown R2/DB error) every tracked key is best-effort deleted before the
 * error surfaces, so `items 1–N inserted, media N+1 fails` no longer orphans
 * objects in MEDIA_BUCKET. Imported *rows* are not rolled back (the plan's
 * "or" option — two-phase upload-then-insert-with-cleanup — was chosen; no D1
 * rollback was authorized). Thrown errors are rethrown after rollback so the
 * route wrapper keeps its UNIQUE→409 / generic-500 contract.
 */
export async function importTenantManifest(env, tenantId, payload) {
  const parsed = manifestSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed);
  const data = parsed.data;

  /** Every R2 key this import has PUT successfully — rolled back on failure. */
  const uploadedKeys = [];
  const rollbackUploads = async () => {
    if (uploadedKeys.length === 0 || !env.MEDIA_BUCKET) return;
    try {
      await Promise.all(uploadedKeys.map((k) => env.MEDIA_BUCKET.delete(k)));
    } catch (e) {
      // Best-effort only — a failed rollback never masks the original error.
    }
    uploadedKeys.length = 0;
  };
  const fail = async (status, message) => {
    await rollbackUploads();
    return errorResponse(message, status);
  };

  try {
    return await runImport(env, tenantId, data, uploadedKeys, fail);
  } catch (e) {
    await rollbackUploads();
    throw e; // route wrapper maps UNIQUE→409, anything else→generic 500
  }
}

// ─── Hono route wrapper ─────────────────────────────────────────────
const tenantImportRoutes = new Hono();

tenantImportRoutes.post('/', async (c) => {
  try {
    const scope = getScope(c);
    const rawPayload = await c.req.json();
    const identity = rawPayload.identity ? toSnake(rawPayload.identity) : null;

    // ── Creation mode: brand-new tenant from identity block ────────
    if (identity) {
      const parsedIdentity = identitySchema.safeParse(identity);
      if (!parsedIdentity.success) return validationError(parsedIdentity);
      const id = parsedIdentity.data;

      if (scope.user?.role !== 'super_admin') {
        return errorResponse('Only super-admin can provision new tenants', 403);
      }

      // Subdomain format check
      if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(id.subdomain)) {
        return errorResponse('Subdomain must be lowercase alphanumeric with hyphens, 3-63 chars', 400);
      }

      // Subdomain uniqueness
      const existingSubdomain = await c.env.DB.prepare(
        'SELECT id FROM tenants WHERE subdomain = ?'
      ).bind(id.subdomain).all();
      if (existingSubdomain.results?.length > 0) {
        return errorResponse('This subdomain is already taken', 400);
      }

      // Email uniqueness
      const existingAdmin = await c.env.DB.prepare(
        'SELECT id FROM admins WHERE email = ?'
      ).bind(id.email).all();
      if (existingAdmin.results?.length > 0) {
        return errorResponse('An account with this email already exists', 400);
      }

      const newTenantId = 'tenant_' + crypto.randomUUID().slice(0, 12);
      const adminId = 'adm_' + crypto.randomUUID().slice(0, 12);
      const hashedPassword = await hashPassword(id.password);

      // 1. Create tenant
      await c.env.DB.prepare(
        `INSERT INTO tenants (id, subdomain, name, type, business_type, email, status, onboarding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', 'completed', datetime('now'), datetime('now'))`
      ).bind(newTenantId, id.subdomain, id.name, id.type, id.business_type || id.type, id.email).run();

      // 2. Create admin (active — super-admin provisioning)
      await c.env.DB.prepare(
        `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, datetime('now'), datetime('now'))`
      ).bind(adminId, newTenantId, id.email, hashedPassword, id.first_name, id.last_name).run();

      // 3. POS org + store + mapping
      const organizationId = await ensureTenantOrg(c.env, newTenantId);

      // 4. Default project
      const projectSlug = id.subdomain.replace(/[^a-z0-9-]/g, '-').slice(0, 60);
      const projectId = 'proj_' + crypto.randomUUID().slice(0, 12);
      await c.env.DB.prepare(
        `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`
      ).bind(projectId, newTenantId, id.name, projectSlug, id.type).run();

      // 5. Run data import (strips identity block automatically via schema)
      const importPayload = { ...rawPayload };
      delete importPayload.identity;
      const result = await importTenantManifest(c.env, newTenantId, toSnake(importPayload));

      // If import returned an error response, clean up partial provisioning
      if (result.status >= 400) {
        return result;
      }

      const importData = await result.json();
      return jsonResponse({
        ...importData,
        created: { tenantId: newTenantId, adminId, organizationId },
      }, 201);
    }

    // ── Existing-tenant import mode ───────────────────────────────
    const tenantId = scope.tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    return await importTenantManifest(c.env, tenantId, toSnake(rawPayload));
  } catch (e) {
    if (e?.message?.includes('UNIQUE constraint failed')) {
      return errorResponse('Duplicate SKU, ID, or unique field', 409);
    }
    return errorResponse('Failed to import tenant data');
  }
});

tenantImportRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default tenantImportRoutes;
