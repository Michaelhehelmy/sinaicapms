import { jsonResponse, cachedJsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { getScope } from '../middleware/resolveScope.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Ensure a product exists in the `products` table (FK target) by mirroring
 * the row from `pos_products`. The `products` table from migration 0028 is
 * empty in production — all product data lives in `pos_products`. However
 * `rooms_new` and `rate_plans_new` still have FK → products(id), so we
 * mirror on write to satisfy the constraint.
 *
 * Migration 0054 was meant to fix this but does not apply in D1 local mode.
 */
async function ensureProductInProductsTable(DB, tenantId, productId) {
  if (!productId) return;
  try {
    await DB.prepare(`
      INSERT OR IGNORE INTO products (id, tenant_id, category_id, sku, base_price, capacity, image_url, is_active, created_at, updated_at)
      SELECT id, tenant_id, category_id, sku, selling_price, capacity, image_url, is_active, created_at, updated_at
      FROM pos_products WHERE id = ? AND tenant_id = ?
    `).bind(productId, tenantId).run();
  } catch (_) {
    // Best-effort: if products table doesn't exist or schema mismatch, ignore.
    // The FK will still fail and the outer handler will return the error.
  }
}

// ─── Zod Schemas ───────────────────────────────────────────────
export const campPostSchema = z.object({
  id: z.string().optional(),
  name: z.string({ required_error: 'Name is required' }).min(1, 'Name is required'),
  location: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  capacity: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive', 'completed']).optional(),
  notes: z.string().optional(),
}).strip(); // S-M1 fix: strip unknown fields

export const campPutSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  capacity: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive', 'completed']).optional(),
  notes: z.string().optional(),
}).strip(); // S-M1 fix

export const productPostSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  lang: z.string().optional(),
  capacity: z.number().min(1).optional(),
  base_price: z.number().min(0).optional(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  link_rewrite: z.string().optional(),
  image_url: z.string().optional(),
  category_id: z.string().optional(),
  sku: z.string().optional(),
  is_active: z.number().optional(),
  camp_ids: z.array(z.string()).optional(),
  // One-camp-per-tenant (0053): room types point at their camp via camp_id.
  camp_id: z.string().optional(),
}).strip(); // S-M1 fix

export const roomPostSchema = z.object({
  id: z.string().optional(),
  camp_id: z.string().min(1, 'Camp ID is required'),
  product_id: z.string().min(1, 'Product ID is required'),
  name: z.string({ required_error: 'Room name is required' }).min(1, 'Room name is required'),
  floor: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  status: z.string().optional(),
  bed_type: z.string().optional(),
  max_guests: z.number().optional(),
  base_price: z.number().optional(),
  notes: z.string().optional(),
  is_active: z.number().optional(),
}).strip(); // S-M1 fix

export const ratePlanPostSchema = z.object({
  id: z.string().optional(),
  product_id: z.string().min(1, 'Product ID is required'),
  name: z.string().min(1, 'Name is required'),
  price_per_night: z.number().positive('Price must be positive'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  season: z.string().optional(),
  min_stay: z.number().optional(),
  is_active: z.number().optional(),
}).strip(); // S-M1 fix

// Marketplace host (no tenant context): 'marketplace', '', null, or undefined
// → cross-tenant queries with owning-tenant info instead of tenant-scoped ones.
const isMarketplaceTenant = (tenantId) => !tenantId || tenantId === 'marketplace' || tenantId === '';

// Camps table has a `status` TEXT column ('active' | 'inactive' | 'completed'),
// NOT `is_active`/`active` — see migrations/0001_init.sql. Active filter = status = 'active'.
const CROSS_TENANT_SELECT =
  "SELECT c.*, t.name AS tenant_name, t.subdomain AS tenant_subdomain FROM camps c LEFT JOIN tenants t ON t.id = c.tenant_id";

// ─── Camps sub-router (Phase 4 T1) ─────────────────────────────
// Mixed visibility: GET public (marketplace host → cross-tenant active
// listing; tenant host → own camp), mutations admin-scoped.
const campsRoutes = new Hono();

campsRoutes.get('/', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  const marketplace = isMarketplaceTenant(tenantId);
  const limit = c.req.query('limit');
  const offset = c.req.query('offset');
  if (limit) {
    const query = marketplace
      ? `${CROSS_TENANT_SELECT} WHERE c.status = 'active' GROUP BY c.tenant_id LIMIT ? OFFSET ?`
      : "SELECT * FROM camps WHERE tenant_id = ? LIMIT ? OFFSET ?";
    const bindings = marketplace ? [] : [tenantId];
    const { results } = await env.DB.prepare(query)
      .bind(...bindings, parseInt(limit), parseInt(offset || '0')).all();
    return cachedJsonResponse(results);
  }
  const query = marketplace
    ? `${CROSS_TENANT_SELECT} WHERE c.status = 'active' GROUP BY c.tenant_id`
    : "SELECT * FROM camps WHERE tenant_id = ?";
  const bindings = marketplace ? [] : [tenantId];
  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return cachedJsonResponse(results);
});

campsRoutes.get('/:id', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  const campId = c.req.param('id');
  const marketplace = isMarketplaceTenant(tenantId);
  const query = marketplace
    ? `${CROSS_TENANT_SELECT} WHERE c.id = ?`
    : "SELECT * FROM camps WHERE tenant_id = ? AND id = ?";
  const bindings = marketplace ? [campId] : [tenantId, campId];
  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  if (results.length === 0) return errorResponse('Camp not found', 404);
  return cachedJsonResponse(results[0]);
});

campsRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = campPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { id, name, location, start_date, end_date, capacity, status, notes } = parsed.data;
    // Do NOT escHtml() here — escape at render time, not storage time
    // Parameterized queries handle SQL injection; escHtml corrupts stored data
    if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
      return errorResponse('Start date must be before end date', 400);
    }
    // One-camp-per-tenant (migration 0053): a tenant may have at most one camp.
    // Guard with a clean 409 before the unique index on camps.tenant_id throws.
    const { results: existingCamps } = await c.env.DB.prepare(
      "SELECT id FROM camps WHERE tenant_id = ?"
    ).bind(tenantId).all();
    if (existingCamps.length > 0) {
      return errorResponse('Tenant already has a camp', 409);
    }
    const cid = id || 'camp_' + crypto.randomUUID().slice(0, 12); // L1 fix
    await c.env.DB.prepare(
      "INSERT INTO camps (id, tenant_id, name, location, start_date, end_date, capacity, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(cid, tenantId, name, location || null, start_date || null, end_date || null, capacity ?? 0, status || 'active', notes || null).run();
    return jsonResponse({ id: cid, success: true });
  } catch (e) {
    return errorResponse('Failed to create camp');
  }
});

campsRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const campId = c.req.param('id');
    const parsed = campPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, location, start_date, end_date, capacity, status, notes } = parsed.data;
    if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
      return errorResponse('Start date must be before end date', 400);
    }
    await c.env.DB.prepare(
      `UPDATE camps SET
        name = COALESCE(?, name),
        location = COALESCE(?, location),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        capacity = COALESCE(?, capacity),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes)
      WHERE tenant_id = ? AND id = ?`
    ).bind(
      name !== undefined ? name : null,
      location !== undefined ? location : null,
      start_date !== undefined ? start_date : null,
      end_date !== undefined ? end_date : null,
      capacity !== undefined ? capacity : null,
      status !== undefined ? status : null,
      notes !== undefined ? notes : null,
      tenantId, campId
    ).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update camp');
  }
});

campsRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const campId = c.req.param('id');
    // Verify ownership
    const { results: check } = await c.env.DB.prepare("SELECT id FROM camps WHERE tenant_id = ? AND id = ?").bind(tenantId, campId).all();
    if (check.length === 0) return errorResponse('Camp not found', 404);

    // Cascade: delete orders linked to rooms in this camp
    await c.env.DB.prepare(
      "DELETE FROM orders WHERE tenant_id = ? AND room_id IN (SELECT id FROM rooms_new WHERE camp_id = ?)"
    ).bind(tenantId, campId).run();
    // Cascade: delete rate plans linked to products in this camp
    await c.env.DB.prepare(
      "DELETE FROM rate_plans_new WHERE tenant_id = ? AND product_id IN (SELECT product_id FROM rooms_new WHERE camp_id = ?)"
    ).bind(tenantId, campId).run();
    // Cascade: delete rooms
    await c.env.DB.prepare("DELETE FROM rooms_new WHERE camp_id = ?").bind(campId).run();
    // Cascade: delete product_camps associations
    await c.env.DB.prepare("DELETE FROM product_camps WHERE camp_id = ?").bind(campId).run();
    // Finally: delete the camp
    await c.env.DB.prepare("DELETE FROM camps WHERE tenant_id = ? AND id = ?").bind(tenantId, campId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete camp');
  }
});

campsRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default campsRoutes;

// ─── Products sub-router (Phase 4 T1) ──────────────────────────
// Mixed visibility: GET public (D5: unified pos_products; marketplace host →
// cross-tenant), mutations admin-scoped.
export const productsRoutes = new Hono();

productsRoutes.get('/', async (c) => {
  // D5 fix: read from unified pos_products (production has 13 rows) instead of the
  // dead legacy `products` table (0 rows in production). Marketplace host → cross-tenant.
  // 0053: camp membership comes from pos_products.camp_id (source of truth), not the
  // product_camps junction, so no extra junction query is needed.
  const tenantId = getScope(c).tenantId;
  const marketplace = isMarketplaceTenant(tenantId);
  const select =
    `SELECT p.id, p.tenant_id, p.category_id, p.sku, p.name, p.description, p.short_description,
            p.selling_price AS base_price, p.capacity, p.image_url, p.images, p.is_active,
            p.camp_id, p.created_at, p.updated_at
     FROM pos_products p`;
  const where = marketplace
    ? ' WHERE p.deleted_at IS NULL'
    : ' WHERE p.tenant_id = ? AND p.deleted_at IS NULL';
  const bindings = marketplace ? [] : [tenantId];
  const { results } = await c.env.DB.prepare(select + where).bind(...bindings).all();

  // image_url fallback: image_url column → first element of images JSON
  const firstImage = (images) => {
    if (typeof images === 'string') {
      try {
        const arr = JSON.parse(images);
        return Array.isArray(arr) ? arr[0] : null;
      } catch { return null; }
    }
    return Array.isArray(images) ? images[0] : null;
  };

  const finalResults = results.map(p => ({
    id: p.id,
    tenant_id: p.tenant_id,
    category_id: p.category_id ?? null,
    sku: p.sku,
    name: p.name,
    description: p.description,
    short_description: p.short_description,
    base_price: p.base_price,
    capacity: p.capacity,
    image_url: p.image_url || firstImage(p.images) || null,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
    campIds: p.camp_id ? [p.camp_id] : []
  }));
  return cachedJsonResponse(finalResults);
});

productsRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = productPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { id, name, lang, capacity, base_price, description, short_description, meta_title, meta_description, link_rewrite, image_url, category_id, sku, is_active, camp_ids, camp_id } = parsed.data;
    const pid = id || 'prod_' + crypto.randomUUID().slice(0, 12); // L1 fix

    // One-camp-per-tenant (0053): room types belong to a camp. Use the provided
    // camp_id when given (must belong to this tenant) or resolve the tenant's
    // single camp when omitted.
    let productCampId = null;
    if (camp_id) {
      const { results: campCheck } = await c.env.DB.prepare(
        "SELECT id FROM camps WHERE tenant_id = ? AND id = ?"
      ).bind(tenantId, camp_id).all();
      if (campCheck.length === 0) {
        return errorResponse('Camp not found', 404);
      }
      productCampId = camp_id;
    } else {
      const { results: tenantCamps } = await c.env.DB.prepare(
        "SELECT id FROM camps WHERE tenant_id = ? LIMIT 1"
      ).bind(tenantId).all();
      productCampId = tenantCamps.length > 0 ? tenantCamps[0].id : null;
    }

    // The product must belong to the tenant's POS organization so it shows
    // up in that tenant's POS grid (pos_products.organization_id). The
    // column default is 1 (single-org legacy); resolving the tenant's real
    // org here keeps marketplace-created products visible in the POS after
    // 0051 removed the org-1 seed. Fall back to 1 for legacy tenants with
    // no mapping.
    const { results: orgRows } = await c.env.DB.prepare(
      'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
    ).bind(tenantId).all();
    const organizationId = orgRows.length > 0 ? orgRows[0].organization_id : 1;

    await c.env.DB.prepare(
      `INSERT INTO pos_products (id, tenant_id, organization_id, category_id, sku, name, description, short_description, selling_price, capacity, image_url, is_active, type, camp_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'room', ?, datetime('now'), datetime('now'))`
    ).bind(
      pid, tenantId, organizationId, category_id || null,
      sku || 'PROD-' + pid.toUpperCase(),
      name, description || null, short_description || null,
      base_price || 0, capacity || 1,
      image_url || null, is_active !== undefined ? is_active : 1,
      productCampId
    ).run();

    if (camp_ids && Array.isArray(camp_ids) && camp_ids.length > 0) {
      // Batch insert — P-H2 fix
      const placeholders = camp_ids.map(() => '(?, ?)').join(',');
      const bindings = [];
      for (const cid of camp_ids) { bindings.push(pid, cid); }
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO product_camps (product_id, camp_id) VALUES ${placeholders}`
      ).bind(...bindings).run();
    }

    return jsonResponse({ id: pid, success: true });
  } catch (e) {
    return errorResponse('Failed to create product');
  }
});

productsRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const pid = c.req.param('id');
    const parsed = productPostSchema.partial().safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, lang, capacity, base_price, description, short_description, meta_title, meta_description, link_rewrite, image_url, category_id, sku, is_active, camp_ids, camp_id } = parsed.data;

    // 0053: when a camp_id is provided it must belong to this tenant.
    let productCampId = null;
    if (camp_id) {
      const { results: campCheck } = await c.env.DB.prepare(
        "SELECT id FROM camps WHERE tenant_id = ? AND id = ?"
      ).bind(tenantId, camp_id).all();
      if (campCheck.length === 0) {
        return errorResponse('Camp not found', 404);
      }
      productCampId = camp_id;
    }

    await c.env.DB.prepare(
      `UPDATE pos_products SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        short_description = COALESCE(?, short_description),
        selling_price = COALESCE(?, selling_price),
        capacity = COALESCE(?, capacity),
        image_url = COALESCE(?, image_url),
        is_active = COALESCE(?, is_active),
        camp_id = COALESCE(?, camp_id),
        updated_at = datetime('now')
      WHERE tenant_id = ? AND id = ?`
    ).bind(
      name !== undefined ? name : null,
      description !== undefined ? description : null,
      short_description !== undefined ? short_description : null,
      base_price !== undefined ? base_price : null,
      capacity !== undefined ? capacity : null,
      image_url !== undefined ? image_url : null,
      is_active !== undefined ? is_active : null,
      productCampId,
      tenantId, pid
    ).run();

    if (camp_ids && Array.isArray(camp_ids)) {
      await c.env.DB.prepare("DELETE FROM product_camps WHERE product_id = ?").bind(pid).run();
      if (camp_ids.length > 0) {
        // Batch insert — P-H2 fix
        const placeholders = camp_ids.map(() => '(?, ?)').join(',');
        const bindings = [];
        for (const cid of camp_ids) { bindings.push(pid, cid); }
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO product_camps (product_id, camp_id) VALUES ${placeholders}`
        ).bind(...bindings).run();
      }
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update product');
  }
});

productsRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const pid = c.req.param('id');

    const { results: usedRooms } = await c.env.DB.prepare(
      "SELECT r.id FROM rooms_new r JOIN camps c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ? AND r.product_id = ?"
    ).bind(tenantId, pid).all();
    const { results: usedRates } = await c.env.DB.prepare(
      "SELECT id FROM rate_plans_new WHERE tenant_id = ? AND product_id = ?"
    ).bind(tenantId, pid).all();
    if (usedRooms.length > 0 || usedRates.length > 0) {
      return errorResponse('Cannot delete product because it is linked to existing rooms or rate plans', 400);
    }

    // Phase 3 cascade: per-night price overrides reference the product.
    await c.env.DB.prepare("DELETE FROM price_overrides WHERE product_id = ?").bind(pid).run();
    await c.env.DB.prepare("DELETE FROM product_camps WHERE product_id = ?").bind(pid).run();
    await c.env.DB.prepare("DELETE FROM pos_products WHERE tenant_id = ? AND id = ?").bind(tenantId, pid).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete product');
  }
});

productsRoutes.all('*', () => errorResponse('Method not allowed', 405));

// ─── Rooms sub-router (Phase 4 T1) ─────────────────────────────
// Mixed visibility: GET public (availability browsing), mutations admin-scoped.
export const roomsRoutes = new Hono();

roomsRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  const floor = c.req.query('floor');
  const campId = c.req.query('campId');

  let query = "SELECT r.* FROM rooms_new r JOIN camps c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ?";
  let bindings = [tenantId];

  if (campId) {
    query += " AND r.camp_id = ?";
    bindings.push(campId);
  }
  if (floor) {
    query += " AND r.floor = ?";
    bindings.push(floor);
  }

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all();
  return jsonResponse(results);
});

roomsRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = roomPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { id, camp_id, product_id, name, floor, status, bed_type, max_guests, base_price, notes, is_active } = parsed.data;

    let finalMaxGuests = max_guests;
    if (finalMaxGuests === undefined || finalMaxGuests === null) {
      const { results: prod } = await c.env.DB.prepare("SELECT capacity FROM pos_products WHERE tenant_id = ? AND id = ?").bind(tenantId, product_id).all();
      finalMaxGuests = prod.length > 0 ? prod[0].capacity : 2;
    }

    const { results: duplicate } = await c.env.DB.prepare(
      "SELECT r.id FROM rooms_new r JOIN camps c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ? AND r.camp_id = ? AND LOWER(r.name) = LOWER(?)"
    ).bind(tenantId, camp_id, name).all();
    if (duplicate.length > 0) {
      return errorResponse(`A room with name "${name}" already exists in this camp`, 400);
    }

    const rid = id || 'room_' + crypto.randomUUID().slice(0, 12); // L1 fix
    // Mirror pos_products → products to satisfy rooms_new FK constraint
    await ensureProductInProductsTable(c.env.DB, tenantId, product_id);
    // 0053: the INSERT only selects a row when the camp AND the product belong
    // to this tenant, so a foreign camp_id/product_id can never be stored.
    const insertResult = await c.env.DB.prepare(
      `INSERT INTO rooms_new (id, camp_id, product_id, name, status, bed_type, max_guests, base_price, floor, notes, is_active, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
       FROM camps c3
       WHERE c3.id = ? AND c3.tenant_id = ?
         AND EXISTS (SELECT 1 FROM pos_products p WHERE p.id = ? AND p.tenant_id = c3.tenant_id)`
    ).bind(rid, camp_id, product_id, name, status || 'available', bed_type || null, finalMaxGuests, base_price !== undefined ? base_price : null, floor || null, notes || null, is_active !== undefined ? is_active : 1, camp_id, tenantId, product_id).run();
    if (insertResult?.meta?.changes === 0) {
      return errorResponse('Camp or product not found for this tenant', 404);
    }
    return jsonResponse({ id: rid, success: true });
  } catch (e) {
    return errorResponse('Failed to create room: ' + (e?.message || String(e)));
  }
});

roomsRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const roomId = c.req.param('id');
    const parsed = roomPostSchema.partial().safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { camp_id, product_id, name, floor, status, bed_type, max_guests, base_price, notes, is_active } = parsed.data;

    const { results: roomCheck } = await c.env.DB.prepare(
      "SELECT r.id FROM rooms_new r JOIN camps c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ? AND r.id = ?"
    ).bind(tenantId, roomId).all();
    if (roomCheck.length === 0) {
      return errorResponse('Room not found', 404);
    }

    if (name && camp_id) {
      const { results: duplicate } = await c.env.DB.prepare(
        "SELECT r.id FROM rooms_new r JOIN camps c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ? AND r.camp_id = ? AND LOWER(r.name) = LOWER(?) AND r.id != ?"
      ).bind(tenantId, camp_id, name, roomId).all();
      if (duplicate.length > 0) {
        return errorResponse('A room with this name already exists in this camp', 400);
      }
    }

    await c.env.DB.prepare(
      `UPDATE rooms_new SET
        camp_id = COALESCE((SELECT id FROM camps WHERE id = ? AND tenant_id = ?), camp_id),
        product_id = COALESCE((SELECT id FROM pos_products WHERE id = ? AND tenant_id = ?), product_id),
        name = COALESCE(?, name),
        floor = COALESCE(?, floor),
        status = COALESCE(?, status),
        bed_type = COALESCE(?, bed_type),
        max_guests = COALESCE(?, max_guests),
        base_price = COALESCE(?, base_price),
        notes = COALESCE(?, notes),
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
      WHERE id = ? AND camp_id IN (SELECT id FROM camps WHERE tenant_id = ?)`
    ).bind(
      camp_id || null, tenantId, product_id || null, tenantId,
      name || null,
      floor !== undefined ? floor : null, status || null, bed_type !== undefined ? bed_type : null,
      max_guests !== undefined ? max_guests : null, base_price !== undefined ? base_price : null,
      notes !== undefined ? notes : null, is_active !== undefined ? is_active : null,
      roomId, tenantId
    ).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update room');
  }
});

roomsRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const roomId = c.req.param('id');
    const { results: roomCheck } = await c.env.DB.prepare(
      "SELECT r.id FROM rooms_new r JOIN camps c2 ON r.camp_id = c2.id WHERE c2.tenant_id = ? AND r.id = ?"
    ).bind(tenantId, roomId).all();
    if (roomCheck.length === 0) {
      return errorResponse('Room not found', 404);
    }

    const { results: orders } = await c.env.DB.prepare("SELECT id FROM orders WHERE tenant_id = ? AND room_id = ?").bind(tenantId, roomId).all();
    if (orders.length > 0) {
      return errorResponse('Cannot delete room with existing orders', 400);
    }
    await c.env.DB.prepare(
      "DELETE FROM rooms_new WHERE id = ? AND camp_id IN (SELECT id FROM camps WHERE tenant_id = ?)"
    ).bind(roomId, tenantId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete room');
  }
});

roomsRoutes.all('*', () => errorResponse('Method not allowed', 405));

// ─── Rate plans sub-router (Phase 4 T1) ────────────────────────
// Mixed visibility: GET public (price preview), mutations admin-scoped.
export const ratePlansRoutes = new Hono();

ratePlansRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  const { results } = await c.env.DB.prepare("SELECT * FROM rate_plans_new WHERE tenant_id = ?").bind(tenantId).all();
  return jsonResponse(results);
});

ratePlansRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = ratePlanPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { id, product_id, name, price_per_night, start_date, end_date, season, min_stay, is_active } = parsed.data;
    const rpid = id || 'rp_' + crypto.randomUUID().slice(0, 12); // L1 fix
    // Mirror pos_products → products to satisfy rate_plans_new FK constraint
    await ensureProductInProductsTable(c.env.DB, tenantId, product_id);
    // 0053: the INSERT only selects a row when the product belongs to this
    // tenant, so a foreign product_id can never be stored on a rate plan.
    const insertResult = await c.env.DB.prepare(
      `INSERT INTO rate_plans_new (id, tenant_id, product_id, name, price_per_night, start_date, end_date, season, min_stay, is_active, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
       FROM pos_products p
       WHERE p.id = ? AND p.tenant_id = ?`
    ).bind(rpid, tenantId, product_id, name, price_per_night, start_date || null, end_date || null, season || 'all', min_stay || 1, is_active !== undefined ? is_active : 1, product_id, tenantId).run();
    if (insertResult?.meta?.changes === 0) {
      return errorResponse('Product not found for this tenant', 404);
    }
    return jsonResponse({ id: rpid, success: true });
  } catch (e) {
    return errorResponse('Failed to create rate plan: ' + (e?.message || String(e)));
  }
});

ratePlansRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const rpid = c.req.param('id');
    const parsed = ratePlanPostSchema.partial().safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { product_id, name, price_per_night, start_date, end_date, season, min_stay, is_active } = parsed.data;
    await c.env.DB.prepare(
      `UPDATE rate_plans_new SET
        product_id = COALESCE((SELECT id FROM pos_products WHERE id = ? AND tenant_id = ?), product_id),
        name = COALESCE(?, name),
        price_per_night = COALESCE(?, price_per_night),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        season = COALESCE(?, season),
        min_stay = COALESCE(?, min_stay),
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
      WHERE tenant_id = ? AND id = ?`
    ).bind(
      product_id || null, tenantId,
      name || null, price_per_night !== undefined ? price_per_night : null,
      start_date !== undefined ? start_date : null, end_date !== undefined ? end_date : null,
      season !== undefined ? season : null, min_stay !== undefined ? min_stay : null,
      is_active !== undefined ? is_active : null,
      tenantId, rpid
    ).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update rate plan');
  }
});

ratePlansRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const rpid = c.req.param('id');
    const { results: rpInfo } = await c.env.DB.prepare(
      "SELECT product_id FROM rate_plans_new WHERE id = ?"
    ).bind(rpid).all();
    if (rpInfo.length > 0) {
      const prodId = rpInfo[0].product_id;
      const { results: existingOrders } = await c.env.DB.prepare(
        "SELECT id FROM orders WHERE tenant_id = ? AND room_id IN (SELECT id FROM rooms_new WHERE product_id = ?)"
      ).bind(tenantId, prodId).all();
      if (existingOrders.length > 0) {
        return errorResponse('Cannot delete rate plan because there are active orders for rooms of this product', 400);
      }
    }
    await c.env.DB.prepare("DELETE FROM rate_plans_new WHERE tenant_id = ? AND id = ?").bind(tenantId, rpid).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete rate plan');
  }
});

ratePlansRoutes.all('*', () => errorResponse('Method not allowed', 405));
