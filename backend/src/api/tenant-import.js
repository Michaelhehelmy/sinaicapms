import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { slugify } from '../utils/slug.js';
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
    type: z.enum(['camp', 'supermarket', 'transportation', 'other']).optional(),
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
    // DEFECT-4: operational lifecycle columns. Readable via GET /api/rooms
    // (`SELECT r.*`) but previously dropped here, so an exported manifest
    // round-tripped every room back to the schema defaults. `room_status` has
    // no DB CHECK; the enum mirrors the values the admin status endpoint
    // accepts (camps.js PATCH /rooms/:id/status). `cleaning_status` is CHECKed
    // by the schema itself, so the enum must match it exactly.
    room_status: z.enum(['available', 'reserved', 'occupied', 'cleaning', 'out_of_service']).optional(),
    cleaning_status: z.enum(['dirty', 'in_progress', 'clean', 'inspected']).optional(),
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
 * Generate a meal id — Option 1 of the D3 uniqueness mission: RANDOM.
 * `meals.id` is the GLOBAL primary key (it is the `meal_lang.meal_id` join key
 * and 0111 left it as a bare PK, deliberately not tenant-scoped), so a
 * deterministic or tenant-derived id would still collide the moment two tenants
 * provision a menu from overlapping manifests. 48 random bits makes that
 * negligible, keeps ids unguessable, and — unlike reusing a manifest id — can
 * never leak another tenant's row identity. Length/prefix match the previous
 * `meal_` + 12-hex-char form so nothing downstream has to widen.
 */
function generateMealId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'meal_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Manifest sections that can carry a `campId` reference, with the label used
 * in the pre-flight's 400 message. Only `products[]` accepts the key at the
 * head schema — rooms/ratePlans/posUsers declare no `camp_id` field and zod's
 * object default is `strip`, so a campId sent there never survives parsing
 * (the `room.camp_id` read in the rooms section is dead for that reason).
 * Listing them anyway keeps the pre-flight honest if a later schema revision
 * adds one.
 */
const CAMP_ID_REFS = [
  ['products', 'Product', (entry) => entry.name],
  ['rooms', 'Room', (entry) => entry.name],
  ['rate_plans', 'Rate plan', (entry) => entry.name],
  ['pos_users', 'POS user', (entry) => entry.email || entry.username],
];

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
 *
 * `created` is the SAGA UNDO LOG, threaded from IDENTITY mode only. Every
 * section that commits rows pushes `{ table, column: 'tenant_id', value }` AFTER
 * its write succeeds, so the caller can reverse-order DELETE exactly what this
 * request wrote. In identity mode the tenant is brand-new (the provisioning
 * shell created it in the same request), so every row carrying this tenant_id
 * IS this request's work — that is what makes the tenant-scoped delete exact
 * rather than approximate. Existing-tenant mode passes null: nothing is tracked
 * and nothing can be deleted, because those rows belong to a tenant that
 * predates the request.
 */
async function runImport(env, tenantId, data, uploadedKeys, fail, created = null) {
  /** Record one committed section on the undo log (no-op without a log). */
  const track = (table) => {
    if (created) created.push({ table, column: 'tenant_id', value: tenantId });
  };

  const counts = {
    products: 0, rooms: 0, rate_plans: 0,
    meal_categories: 0, meals: 0, pos_users: 0,
  };

  // ── Pre-flight 1: every campId reference must resolve ─────────────
  // `camp_id` is the legacy alias of `project_id` and no constraint catches a
  // bad value: at the 0124/0126 head `pos_products.camp_id` is a bare
  // `camp_id TEXT` (only `project_id` carries the projects FK), so the import
  // stored ANOTHER tenant's project id verbatim and answered 200 — a dangling
  // cross-tenant id sitting in every POS report keyed off that column. Probe
  // one manifest with a bogus campId and no ratePlans on a real 0126 replay:
  // status 200, `pos_products.camp_id = 'proj_other_tenants_project'`. Add a
  // ratePlans block — which inherits the id via `p.camp_id` into
  // `rate_plans_new.camp_id`, a real `REFERENCES projects(id)` — and the same
  // manifest instead dies on that FK as an opaque 500 "Failed to import tenant
  // data", AFTER the project, branding, products and rooms were committed
  // (the handler has no cross-section transaction: F-A17-02 chose "no D1
  // rollback", R2 uploads only). Both outcomes are bad and neither names the
  // field, so probe resolvability first and answer with a 400 that names the
  // row and the camp — nothing is written at all.
  //
  // Resolvable = the live (not soft-deleted) projects the tenant owns, i.e.
  // exactly the set `defaultCampId` is drawn from below. The DEFECT-3 project
  // block needs no separate case: it updates the tenant's oldest live project
  // (already in the set), and when the tenant owns none it mints a
  // `proj_`+uuid the manifest has no key to name. Omitting campId stays legal
  // everywhere — it falls back to `defaultCampId`/`resolvedProjectId`.
  const campRefs = CAMP_ID_REFS.flatMap(([section, label, nameOf]) =>
    (data[section] || [])
      .filter((entry) => entry.camp_id)
      .map((entry) => ({ label, name: nameOf(entry) || 'unnamed', campId: entry.camp_id }))
  );
  if (campRefs.length > 0) {
    const distinct = [...new Set(campRefs.map((ref) => ref.campId))];
    // Chunked because D1 caps BOUND PARAMETERS PER QUERY at 100 (`too many SQL
    // variables at offset N`) — well under the products cap of 200, so a
    // single `IN (…)` over every distinct id would trade this 400 for an
    // opaque 500 on a large manifest. 50 ids + the tenant_id = 51 binds.
    const resolvable = new Set();
    for (let i = 0; i < distinct.length; i += 50) {
      const chunk = distinct.slice(i, i + 50);
      const { results: chunkProjects } = await env.DB.prepare(
        `SELECT id FROM projects
          WHERE tenant_id = ? AND deleted_at IS NULL
            AND id IN (${chunk.map(() => '?').join(', ')})`
      ).bind(tenantId, ...chunk).all();
      for (const p of chunkProjects || []) resolvable.add(p.id);
    }
    const unknown = campRefs.find((ref) => !resolvable.has(ref.campId));
    if (unknown) {
      return fail(
        400,
        `${unknown.label} "${unknown.name}" references unknown camp "${unknown.campId}". ` +
          'campId must name a project this tenant already owns; omit it to attach the row to the tenant default project.'
      );
    }
  }

  // ── Pre-flight 2: every meal's categoryName must resolve ───────────
  // `meals.meal_category_id` is NOT NULL REFERENCES meal_categories(id)
  // (0111 head), so a name the map can't resolve used to bind NULL and blow
  // the meals batch as an opaque 500 "Failed to import tenant data" — AFTER
  // the project, branding, products, rooms, rate plans and meal categories
  // had already been written. Probe resolvability first and answer with a
  // 400 that names the meal and the category, so nothing is written at all.
  //
  // Resolvable = the categories THIS manifest declares (menu.categories[].name,
  // keyed into the map below) plus the ones the tenant already owns. Meals
  // carrying an explicit `meal_category_id` are untouched — that id is bound
  // verbatim, so there is no name to resolve.
  const manifestMeals = data.menu?.meals || [];
  if (manifestMeals.length > 0) {
    const resolvableNames = new Set((data.menu?.categories || []).map((c) => c.name));
    const { results: ownedCats } = await env.DB.prepare(
      `SELECT mcl.name FROM meal_categories mc
       LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
       WHERE mc.tenant_id = ?`
    ).bind(tenantId).all();
    for (const c of ownedCats || []) if (c.name) resolvableNames.add(c.name);

    for (const meal of manifestMeals) {
      if (meal.meal_category_id || !meal.category_name) continue;
      if (!resolvableNames.has(meal.category_name)) {
        return fail(
          400,
          `Meal "${meal.name}" references unknown category "${meal.category_name}". ` +
            'Declare the category in menu.categories[] or remove categoryName.'
        );
      }
    }
  }

  // Resolve POS org for this tenant (required for products + pos_users).
  const organizationId = await ensureTenantOrg(env, tenantId);
  if (!organizationId) {
    return errorResponse('Tenant is not provisioned for POS', 409);
  }

  // ── 0. Project block (DEFECT-3: was parsed then dropped) ──────────
  // Upsert on the tenant's oldest live project so a re-import updates the
  // tenant default instead of forking a second project row on every run.
  // Runs BEFORE the default-camp resolution below so products/rooms created
  // in this same import attach to the project this manifest just wrote.
  // `projectId` stays null when the manifest has no project block —
  // `resolvedProjectId` below then falls back to the tenant default and
  // finally to NULL (never a throw).
  let projectId = null;
  if (data.project) {
    const p = data.project;
    const { results: liveProjects } = await env.DB.prepare(
      'SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1'
    ).bind(tenantId).all();
    const liveProjectId = liveProjects[0]?.id || null;

    if (liveProjectId) {
      projectId = liveProjectId;
      // slug is UNIQUE per tenant — keep the existing one when another of the
      // tenant's projects already owns the slug this name would produce
      // (renaming a project onto a sibling's slug must not 500 the import).
      // The probe deliberately does NOT filter `deleted_at`: the UNIQUE index
      // covers soft-deleted rows too, so a soft-deleted owner still collides.
      const nextSlug = p.name ? slugify(p.name) : '';
      let slug = null;
      if (nextSlug) {
        const { results: slugOwners } = await env.DB.prepare(
          'SELECT id FROM projects WHERE tenant_id = ? AND slug = ? AND id <> ? LIMIT 1'
        ).bind(tenantId, nextSlug, liveProjectId).all();
        if (slugOwners.length === 0) slug = nextSlug;
      }

      await env.DB.prepare(
        // COALESCE on the free-text columns: an omitted manifest field must
        // never blank a value the tenant already has. project_type/status
        // carry their schema defaults ('camp' / 'active') per the manifest
        // contract, so they assign directly.
        `UPDATE projects SET
          name = COALESCE(?, name),
          slug = COALESCE(?, slug),
          project_type = ?,
          location = COALESCE(?, location),
          capacity = COALESCE(?, capacity),
          status = ?,
          updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
      ).bind(
        p.name || null, slug,
        p.type || 'camp', p.location || null, p.capacity ?? null,
        p.status || 'active',
        projectId, tenantId
      ).run();
    } else {
      // No live project for this tenant — provision the manifest's project.
      // `name`/`slug` are NOT NULL in the schema, so both fall back to the
      // generated id when the manifest omits a (or an unslugifiable) name.
      projectId = 'proj_' + crypto.randomUUID().slice(0, 12);
      const projectName = p.name || projectId;
      await env.DB.prepare(
        `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, location, capacity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        projectId, tenantId, projectName, slugify(projectName) || projectId,
        p.type || 'camp', p.status || 'active',
        p.location || null, p.capacity ?? null
      ).run();
    }
  }

  // Resolve the default camp/project for this tenant.
  const { results: tenantProjects } = await env.DB.prepare(
    "SELECT id FROM projects WHERE tenant_id = ? AND deleted_at IS NULL"
  ).bind(tenantId).all();
  const defaultCampId = tenantProjects.length === 1 ? tenantProjects[0].id : null;

  // DEFECT-1: the single resolved project every project_id-bearing write below
  // binds. Precedence: the project this import just wrote/updated (DEFECT-3) →
  // the tenant's sole live project (the existing camp_id fallback) → NULL.
  // NULL is a legal value on every target column (`ON DELETE SET NULL`
  // reference), so an unresolvable tenant degrades to project-less rows
  // instead of throwing the whole import away.
  const resolvedProjectId = projectId || defaultCampId || null;

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
          `INSERT INTO pos_products (id, tenant_id, organization_id, category_id, sku, name, description, short_description, selling_price, capacity, image_url, is_active, type, camp_id, project_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          pid, tenantId, organizationId, item.category_id || null,
          item.sku || 'PROD-' + pid.toUpperCase(),
          item.name, item.description || null, item.short_description || null,
          item.base_price || 0, item.capacity || 1,
          imageUrl || null, item.is_active !== undefined ? item.is_active : 1,
          item.type || 'retail', item.camp_id || defaultCampId, resolvedProjectId
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
    // Undo log: pos_products has NO FK to tenants (only project_id SET NULL),
    // so it would survive the tenant delete as an orphan — and rooms_new holds
    // a RESTRICT edge on it, so it must be dropped AFTER rooms/rate plans.
    track('pos_products');
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
          `INSERT INTO rooms_new (id, camp_id, product_id, name, status, bed_type, max_guests, base_price, floor, notes, is_active, tenant_id, project_id, room_status, cleaning_status, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
           FROM projects c3
           WHERE c3.id = ? AND c3.tenant_id = ? AND c3.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM pos_products p WHERE p.id = ? AND p.tenant_id = c3.tenant_id)`
        ).bind(
          rid, campId, productId, room.name,
          room.status || 'available', room.bed_type || null, maxGuests,
          room.base_price !== undefined ? room.base_price : null,
          room.floor !== undefined ? String(room.floor) : null,
          room.notes || null, room.is_active !== undefined ? room.is_active : 1,
          tenantId, resolvedProjectId,
          // DEFECT-4: default to the schema defaults so an omitted field writes
          // the same value the column would have had anyway.
          room.room_status || 'available', room.cleaning_status || 'clean',
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
    track('rooms_new');
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
          `INSERT INTO rate_plans_new (id, tenant_id, product_id, camp_id, name, price_per_night, start_date, end_date, season, min_stay, is_active, project_id, created_at, updated_at)
           SELECT ?, ?, ?, p.camp_id, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
           FROM pos_products p
           WHERE p.id = ? AND p.tenant_id = ?`
        ).bind(
          rpid, tenantId, productId, rp.name, rp.price_per_night,
          rp.start_date || null, rp.end_date || null,
          rp.season || 'all', rp.min_stay || 1,
          rp.is_active !== undefined ? rp.is_active : 1,
          resolvedProjectId,
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
    track('rate_plans_new');
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
          "INSERT INTO meal_categories (id, tenant_id, position, project_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
        ).bind(catId, tenantId, cat.position || 0, resolvedProjectId)
      );
      catStmts.push(
        env.DB.prepare(
          "INSERT INTO meal_categories_lang (meal_category_id, lang, name) VALUES (?, 'en', ?)"
        ).bind(catId, cat.name)
      );
    }
    await env.DB.batch(catStmts);
    counts.meal_categories = data.menu.categories.length;
    // Before `meals` on the log: meals.meal_category_id CASCADEs from here, and
    // reverse order drops the meals first either way — but keeping creation
    // order means "children before parents" stays true by construction.
    track('meal_categories');
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
    // Explicit manifest ids are kept (round-trip parity: an exported manifest
    // must re-import its own meal ids), but `meals.id` is the GLOBAL primary
    // key — so a manifest id that already belongs to ANOTHER tenant can only
    // ever collide. Probe the owners first and answer with a clear 4xx naming
    // the meal, instead of letting the raw UNIQUE/PK error surface as a generic
    // "Duplicate SKU, ID, or unique field" 409 (or a 500 on a batch rollback).
    const explicitIds = data.menu.meals.map((m) => m.id).filter(Boolean);
    if (explicitIds.length > 0) {
      const { results: owners } = await env.DB.prepare(
        `SELECT id, tenant_id FROM meals WHERE id IN (${explicitIds.map(() => '?').join(', ')})`
      ).bind(...explicitIds).all();
      for (const owner of owners) {
        const meal = data.menu.meals.find((m) => m.id === owner.id);
        if (owner.tenant_id !== tenantId) {
          return fail(
            400,
            `Meal "${meal.name}" id "${owner.id}" already belongs to another tenant — ` +
            'remove the explicit meal id to let the import generate a fresh one'
          );
        }
        return fail(409, `Meal "${meal.name}" already exists in this tenant (duplicate id "${owner.id}")`);
      }
    }

    const mealStmts = [];
    for (const meal of data.menu.meals) {
      const mid = meal.id || generateMealId();
      let categoryId = meal.meal_category_id;
      if (!categoryId && meal.category_name) categoryId = categoryNameToId.get(meal.category_name);
      const imageUrl = await resolveImage(env, tenantId, meal.image_url, uploadedKeys);

      mealStmts.push(
        env.DB.prepare(
          `INSERT INTO meals (id, tenant_id, meal_category_id, price, image_url, is_active, project_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(
          mid, tenantId, categoryId || null, meal.price || 0,
          imageUrl || null, meal.is_active !== undefined ? meal.is_active : 1,
          resolvedProjectId
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
    track('meals');
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
             phone, role, department, employee_id, store_id, project_id, is_active, status,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', datetime('now'), datetime('now'))`
        ).bind(
          organizationId, tenantId, user.username || user.email, user.email, passwordHash,
          user.first_name, user.last_name, user.phone || null,
          user.role || 'cashier', user.department || null,
          user.employee_id || null, storeId ?? null, resolvedProjectId
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
    // pos_users has NO tenant FK and holds NO ACTION edges on pos_stores /
    // pos_organizations, so leaving rows behind would block both deletes below.
    track('pos_users');
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
 *
 * `created` is the caller-owned saga undo log (see runImport). It is an
 * optional, out-parameter: identity mode passes an array and deletes from it
 * on failure; existing-tenant mode omits it, so this function can never delete
 * a row of a pre-existing tenant.
 */
export async function importTenantManifest(env, tenantId, payload, created = null) {
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
    return await runImport(env, tenantId, data, uploadedKeys, fail, created);
  } catch (e) {
    await rollbackUploads();
    throw e; // route wrapper maps UNIQUE→409, anything else→generic 500
  }
}

/**
 * Best-effort read of an error Response's own message, for the saga wrapper's
 * 500 (which must quote the ORIGINAL reason without consuming the response it
 * may still have to return verbatim). Falls back to the status code.
 */
async function responseReason(res) {
  try {
    const body = await res.clone().json();
    return body?.error || body?.message || `HTTP ${res.status}`;
  } catch (_) {
    return `HTTP ${res.status}`;
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

      // ── Saga undo log ────────────────────────────────────────────
      // Everything below this line creates rows for a tenant that did not
      // exist when the request arrived, so every row is this request's to undo.
      // Each entry is pushed only AFTER its INSERT resolves, and the rollback
      // walks the log in reverse, which yields "children before parents" for
      // free: the FK edges that force the order are pos_users →(NO ACTION)
      // pos_stores/pos_organizations, rooms_new →(RESTRICT) pos_products,
      // projects →(NO ACTION) tenants and admins →(SET NULL) tenants.
      const created = [];
      const track = (table, column, value) => {
        if (value !== null && value !== undefined) created.push({ table, column, value });
      };
      const rollbackCreated = async () => {
        for (const step of [...created].reverse()) {
          try {
            await c.env.DB.prepare(`DELETE FROM ${step.table} WHERE ${step.column} = ?`)
              .bind(step.value)
              .run();
          } catch (e) {
            // Best-effort per step: a blocked/failed delete is logged and the
            // rest of the log still runs — a half-finished rollback must not
            // hide the failure that caused it.
            console.error(
              `tenant-import rollback: ${step.table}.${step.column}=${step.value} not deleted:`,
              e?.message,
            );
          }
        }
        created.length = 0;
      };
      const rolledBack = (reason) =>
        errorResponse(
          `Import failed: ${reason}. All partial data has been rolled back. ` +
            'You can retry with a corrected manifest.',
          500,
        );

      try {
        // 1. Create tenant
        await c.env.DB.prepare(
          `INSERT INTO tenants (id, subdomain, name, type, business_type, email, status, onboarding_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 'completed', datetime('now'), datetime('now'))`
        ).bind(newTenantId, id.subdomain, id.name, id.type, id.business_type || id.type, id.email).run();
        track('tenants', 'id', newTenantId);

        // 2. Create admin (active — super-admin provisioning)
        await c.env.DB.prepare(
          `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, datetime('now'), datetime('now'))`
        ).bind(adminId, newTenantId, id.email, hashedPassword, id.first_name, id.last_name).run();
        track('admins', 'id', adminId);

        // 3. POS org + store + mapping. ensureTenantOrg is idempotent and does
        //    not report what it created, so probe the mapping first: only an org
        //    this request provisioned is ours to delete.
        const { results: priorMapping } = await c.env.DB.prepare(
          'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
        ).bind(newTenantId).all();
        const organizationId = await ensureTenantOrg(c.env, newTenantId);
        if (organizationId && priorMapping.length === 0) {
          const { results: orgStores } = await c.env.DB.prepare(
            'SELECT id FROM pos_stores WHERE organization_id = ?'
          ).bind(organizationId).all();
          track('pos_organizations', 'id', organizationId);
          for (const store of orgStores) track('pos_stores', 'id', store.id);
          track('tenant_org_mapping', 'tenant_id', newTenantId);
        }

        // 4. Default project
        const projectSlug = id.subdomain.replace(/[^a-z0-9-]/g, '-').slice(0, 60);
        const projectId = 'proj_' + crypto.randomUUID().slice(0, 12);
        await c.env.DB.prepare(
          `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`
        ).bind(projectId, newTenantId, id.name, projectSlug, id.type).run();
        track('projects', 'id', projectId);

        // 5. Run data import (strips identity block automatically via schema).
        //    The shared `created` log continues here, so the data sections land
        //    on it ahead of the shell and roll back ahead of it too.
        const importPayload = { ...rawPayload };
        delete importPayload.identity;
        const result = await importTenantManifest(c.env, newTenantId, toSnake(importPayload), created);

        // Import failed. An empty log means the failure landed BEFORE the first
        // INSERT (or inside the import's own schema pre-flight), so there is
        // nothing to undo and the caller's precise 4xx is the most useful answer.
        if (result.status >= 400) {
          if (created.length === 0) return result;
          const reason = await responseReason(result);
          await rollbackCreated();
          return rolledBack(reason);
        }

        const importData = await result.json();
        return jsonResponse({
          ...importData,
          created: { tenantId: newTenantId, adminId, organizationId },
        }, 201);
      } catch (e) {
        // Same rule for thrown R2/DB errors: nothing written → rethrow so the
        // outer catch keeps its UNIQUE→409 contract; something written → roll
        // back and report the rolled-back 500.
        if (created.length === 0) throw e;
        const reason = e?.message || String(e);
        await rollbackCreated();
        return rolledBack(reason);
      }
    }

    // ── Existing-tenant import mode ───────────────────────────────
    const tenantId = scope.tenantId;
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
    // Deliberately NOT a saga: these rows belong to a tenant that predates the
    // request, so there is no undo log to replay and nothing may be deleted. A
    // thrown error therefore leaves partial data behind and says so, instead of
    // pretending the import was undone. Deterministic 4xx/409 responses keep
    // their own status and message — they are the caller's actionable feedback.
    try {
      return await importTenantManifest(c.env, tenantId, toSnake(rawPayload));
    } catch (e) {
      console.error(`tenant-import: partial data may remain for tenant ${tenantId}:`, e?.message);
      return errorResponse(
        `Import failed: ${e?.message || String(e)}. Partial data may remain in the tenant. ` +
          'Re-run with the same manifest to retry, or clean up manually.',
        500,
      );
    }
  } catch (e) {
    if (e?.message?.includes('UNIQUE constraint failed')) {
      return errorResponse('Duplicate SKU, ID, or unique field', 409);
    }
    return errorResponse('Failed to import tenant data');
  }
});

tenantImportRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default tenantImportRoutes;
