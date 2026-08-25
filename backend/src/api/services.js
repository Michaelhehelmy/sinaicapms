/**
 * Dynamic Service Module — tenant-defined bookable services.
 *
 * Endpoints (mounted at /api/services in src/index.js):
 *   GET    /definitions          list service definitions (admin)
 *   POST   /definitions          create definition         (admin)
 *   PUT    /definitions/:id      update definition         (admin)
 *   DELETE /definitions/:id      soft-delete definition    (admin)
 *   GET    /items                list bookable items       (admin)
 *   POST   /items                create item               (admin)
 *   PUT    /items/:id            update item               (admin)
 *   DELETE /items/:id            soft-delete item          (admin)
 *   GET    /bookings             list bookings             (admin)
 *   POST   /bookings             create booking            (admin/POS)
 *   PATCH  /bookings/:id/status  update booking status     (admin)
 *   GET    /public/:slug         public catalog            (no auth)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse, toCamel, toSnake } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Schemas ────────────────────────────────────────────────────────────────

const definitionCreateSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields_schema: z.any().optional(), // JSON array of field definitions
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const definitionUpdateSchema = definitionCreateSchema.partial().strip();

const itemCreateSchema = z.object({
  service_definition_id: z.string().min(1),
  project_id: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  base_price: z.number().min(0).optional(),
  meta_data: z.any().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
}).strip();

const itemUpdateSchema = itemCreateSchema.partial().strip();

const bookingCreateSchema = z.object({
  service_item_id: z.string().min(1),
  customer_name: z.string().max(200).optional(),
  customer_phone: z.string().max(50).optional(),
  scheduled_date: z.string().optional(),
  notes: z.string().max(1000).optional(),
}).strip();

const bookingStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'en_route', 'completed', 'canceled']),
}).strip();

// ── Helpers ────────────────────────────────────────────────────────────────

function getTenantId(c) {
  return c.get('tenantId') || c.req.header('x-tenant-id');
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Definitions ────────────────────────────────────────────────────────────

// GET /definitions — list all definitions for the tenant
router.get('/definitions', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM service_definitions WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(c, rows.results.map(toCamel));
});

// POST /definitions — create a new definition
router.post('/definitions', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const raw = await c.req.json();
  const parsed = definitionCreateSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const { slug, name, description, fields_schema, is_active } = parsed.data;
  const finalSlug = slug || slugify(name);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO service_definitions (id, tenant_id, slug, name, description, fields_schema, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, tenantId, finalSlug, name, description || null, JSON.stringify(fields_schema || []), is_active !== false ? 1 : 0).run();
    return jsonResponse(c, { id, slug: finalSlug, success: true }, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return errorResponse(c, 'A definition with this slug already exists', 409);
    throw e;
  }
});

// PUT /definitions/:id — update a definition
router.put('/definitions/:id', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const raw = await c.req.json();
  const parsed = definitionUpdateSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return errorResponse(c, 'No fields to update', 400);
  const sets = fields.map(([k]) => `${k === 'fields_schema' ? 'fields_schema' : k === 'is_active' ? 'is_active' : k} = ?`).join(', ');
  const vals = fields.map(([, v]) => typeof v === 'object' ? JSON.stringify(v) : v);
  await c.env.DB.prepare(
    `UPDATE service_definitions SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`
  ).bind(...vals, id, tenantId).run();
  return jsonResponse(c, { id, success: true });
});

// DELETE /definitions/:id — soft-delete (set is_active = 0)
router.delete('/definitions/:id', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  await c.env.DB.prepare(
    'UPDATE service_definitions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();
  return jsonResponse(c, { id, success: true });
});

// ── Items ──────────────────────────────────────────────────────────────────

// GET /items — list all items for the tenant
router.get('/items', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    `SELECT si.*, sd.name as definition_name, sd.slug as definition_slug
     FROM service_items si
     JOIN service_definitions sd ON si.service_definition_id = sd.id
     WHERE si.tenant_id = ?
     ORDER BY si.created_at DESC`
  ).bind(tenantId).all();
  return jsonResponse(c, rows.results.map(toCamel));
});

// POST /items — create a bookable item
router.post('/items', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const raw = await c.req.json();
  const parsed = itemCreateSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const { service_definition_id, project_id, name, description, base_price, meta_data, status } = parsed.data;
  // Verify the definition exists and belongs to the tenant
  const def = await c.env.DB.prepare(
    'SELECT id FROM service_definitions WHERE id = ? AND tenant_id = ?'
  ).bind(service_definition_id, tenantId).first();
  if (!def) return errorResponse(c, 'Service definition not found', 404);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO service_items (id, tenant_id, service_definition_id, project_id, name, description, base_price, meta_data, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, service_definition_id, project_id || null, name, description || null, base_price || 0, JSON.stringify(meta_data || {}), status || 'active').run();
  return jsonResponse(c, { id, success: true }, 201);
});

// PUT /items/:id — update an item
router.put('/items/:id', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const raw = await c.req.json();
  const parsed = itemUpdateSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return errorResponse(c, 'No fields to update', 400);
  const colMap = { service_definition_id: 'service_definition_id', project_id: 'project_id', base_price: 'base_price', meta_data: 'meta_data' };
  const sets = fields.map(([k]) => `${colMap[k] || k} = ?`).join(', ');
  const vals = fields.map(([k, v]) => (k === 'meta_data' && typeof v === 'object') ? JSON.stringify(v) : v);
  await c.env.DB.prepare(
    `UPDATE service_items SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`
  ).bind(...vals, id, tenantId).run();
  return jsonResponse(c, { id, success: true });
});

// DELETE /items/:id — soft-delete (set status = archived)
router.delete('/items/:id', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  await c.env.DB.prepare(
    "UPDATE service_items SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();
  return jsonResponse(c, { id, success: true });
});

// ── Bookings ───────────────────────────────────────────────────────────────

// GET /bookings — list all bookings for the tenant
router.get('/bookings', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const status = c.req.query('status');
  let sql = `SELECT sb.*, si.name as item_name, sd.name as definition_name
             FROM service_bookings sb
             JOIN service_items si ON sb.service_item_id = si.id
             JOIN service_definitions sd ON si.service_definition_id = sd.id
             WHERE sb.tenant_id = ?`;
  const params = [tenantId];
  if (status) {
    sql += ' AND sb.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY sb.created_at DESC';
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return jsonResponse(c, rows.results.map(toCamel));
});

// POST /bookings — create a booking
router.post('/bookings', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const raw = await c.req.json();
  const parsed = bookingCreateSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const { service_item_id, customer_name, customer_phone, scheduled_date, notes } = parsed.data;
  // Verify the item exists and belongs to the tenant
  const item = await c.env.DB.prepare(
    'SELECT id, status FROM service_items WHERE id = ? AND tenant_id = ?'
  ).bind(service_item_id, tenantId).first();
  if (!item) return errorResponse(c, 'Service item not found', 404);
  if (item.status !== 'active') return errorResponse(c, 'Service item is not available', 400);
  // Check for double-booking if scheduled_date is provided
  if (scheduled_date) {
    const conflict = await c.env.DB.prepare(
      `SELECT id FROM service_bookings WHERE service_item_id = ? AND scheduled_date = ? AND status NOT IN ('canceled') AND tenant_id = ?`
    ).bind(service_item_id, scheduled_date, tenantId).first();
    if (conflict) return errorResponse(c, 'This time slot is already booked', 409);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO service_bookings (id, tenant_id, service_item_id, customer_name, customer_phone, scheduled_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, service_item_id, customer_name || null, customer_phone || null, scheduled_date || null, notes || null).run();
  return jsonResponse(c, { id, success: true, status: 'pending' }, 201);
});

// PATCH /bookings/:id/status — update booking status
router.patch('/bookings/:id/status', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const raw = await c.req.json();
  const parsed = bookingStatusSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const { status } = parsed.data;
  // Verify booking exists and belongs to the tenant
  const booking = await c.env.DB.prepare(
    'SELECT id, status FROM service_bookings WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!booking) return errorResponse(c, 'Booking not found', 404);
  // Validate status transitions
  const validTransitions = {
    pending: ['confirmed', 'canceled'],
    confirmed: ['en_route', 'completed', 'canceled'],
    en_route: ['completed', 'canceled'],
    completed: [],
    canceled: [],
  };
  if (!validTransitions[booking.status]?.includes(status)) {
    return errorResponse(c, `Cannot transition from '${booking.status}' to '${status}'`, 400);
  }
  await c.env.DB.prepare(
    'UPDATE service_bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?'
  ).bind(status, id, tenantId).run();
  return jsonResponse(c, { id, status, success: true });
});

// PATCH /bookings/:id/assign — Assign a worker to a booking
router.patch('/bookings/:id/assign', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const raw = await c.req.json();
  const { assigned_worker_id } = raw;
  if (!assigned_worker_id) return errorResponse(c, 'assigned_worker_id is required', 400);
  const booking = await c.env.DB.prepare(
    'SELECT id FROM service_bookings WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!booking) return errorResponse(c, 'Booking not found', 404);
  await c.env.DB.prepare(
    'UPDATE service_bookings SET assigned_worker_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?'
  ).bind(assigned_worker_id, id, tenantId).run();
  return jsonResponse(c, { id, assigned_worker_id, success: true });
});

// GET /items/:id/availability — Get availability calendar for an item (next 30 days)
router.get('/items/:id/availability', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const item = await c.env.DB.prepare(
    'SELECT id FROM service_items WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!item) return errorResponse(c, 'Service item not found', 404);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM service_availability
     WHERE service_item_id = ? AND available_date >= date('now')
     ORDER BY available_date, available_from`
  ).bind(id).all();
  return jsonResponse(c, results.map(toCamel));
});

// POST /items/:id/availability — Create availability slot
router.post('/items/:id/availability', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const item = await c.env.DB.prepare(
    'SELECT id FROM service_items WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!item) return errorResponse(c, 'Service item not found', 404);
  const raw = await c.req.json();
  const { available_date, available_from, available_to, worker_id, is_available } = raw;
  if (!available_date) return errorResponse(c, 'available_date is required', 400);
  const slotId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO service_availability (id, tenant_id, service_item_id, available_date, available_from, available_to, worker_id, is_available)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(slotId, tenantId, id, available_date, available_from || null, available_to || null, worker_id || null, is_available !== false ? 1 : 0).run();
  return jsonResponse(c, { id: slotId, success: true }, 201);
});

// DELETE /availability/:id — Delete an availability slot
router.delete('/availability/:id', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const slot = await c.env.DB.prepare(
    'SELECT id FROM service_availability WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!slot) return errorResponse(c, 'Availability slot not found', 404);
  await c.env.DB.prepare(
    'DELETE FROM service_availability WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();
  return jsonResponse(c, { success: true });
});

// GET /bookings/:id/reviews — Get reviews for a booking's service item
router.get('/bookings/:id/reviews', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const booking = await c.env.DB.prepare(
    'SELECT service_item_id FROM service_bookings WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!booking) return errorResponse(c, 'Booking not found', 404);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM service_reviews WHERE service_item_id = ? ORDER BY created_at DESC'
  ).bind(booking.service_item_id).all();
  return jsonResponse(c, results.map(toCamel));
});

// POST /reviews — Create a review
router.post('/reviews', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const raw = await c.req.json();
  const { service_item_id, booking_id, customer_name, rating, comment } = raw;
  if (!service_item_id) return errorResponse(c, 'service_item_id is required', 400);
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return errorResponse(c, 'rating must be a number between 1 and 5', 400);
  }
  const item = await c.env.DB.prepare(
    'SELECT id FROM service_items WHERE id = ? AND tenant_id = ?'
  ).bind(service_item_id, tenantId).first();
  if (!item) return errorResponse(c, 'Service item not found', 404);
  const reviewId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO service_reviews (id, tenant_id, service_item_id, booking_id, customer_name, rating, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(reviewId, tenantId, service_item_id, booking_id || null, customer_name || null, rating, comment || null).run();
  return jsonResponse(c, { id: reviewId, success: true }, 201);
});

// GET /reviews — List all reviews for tenant
router.get('/reviews', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { results } = await c.env.DB.prepare(
    `SELECT sr.*, si.name as item_name
     FROM service_reviews sr
     JOIN service_items si ON sr.service_item_id = si.id
     WHERE sr.tenant_id = ?
     ORDER BY sr.created_at DESC`
  ).bind(tenantId).all();
  return jsonResponse(c, results.map(toCamel));
});

// PUT /items/:id/pricing — Update pricing tier for an item
router.put('/items/:id/pricing', async (c) => {
  const tenantId = getTenantId(c);
  if (!tenantId) return errorResponse(c, 'Tenant ID required', 400);
  const { id } = c.req.param();
  const raw = await c.req.json();
  const { price_tier, price_premium } = raw;
  if (!price_tier || !['standard', 'premium', 'luxury'].includes(price_tier)) {
    return errorResponse(c, "price_tier must be 'standard', 'premium', or 'luxury'", 400);
  }
  const item = await c.env.DB.prepare(
    'SELECT id FROM service_items WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!item) return errorResponse(c, 'Service item not found', 404);
  await c.env.DB.prepare(
    `UPDATE service_items SET price_tier = ?, price_premium = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`
  ).bind(price_tier, price_premium || 0, id, tenantId).run();
  return jsonResponse(c, { id, success: true });
});

// GET /public/:slug — public catalog for a tenant (no auth required)
router.get('/public/:slug', async (c) => {
  const { slug } = c.req.param();
  // Find tenant by slug
  const tenant = await c.env.DB.prepare(
    'SELECT id, name FROM tenants WHERE slug = ? AND is_active = 1'
  ).bind(slug).first();
  if (!tenant) return errorResponse(c, 'Tenant not found', 404);
  // Get active definitions with items
  const defs = await c.env.DB.prepare(
    `SELECT sd.id, sd.slug, sd.name, sd.description, sd.fields_schema
     FROM service_definitions sd
     WHERE sd.tenant_id = ? AND sd.is_active = 1
     ORDER BY sd.name`
  ).bind(tenant.id).all();
  const definitions = [];
  for (const def of defs.results) {
    const items = await c.env.DB.prepare(
      `SELECT id, name, description, base_price, meta_data
       FROM service_items WHERE service_definition_id = ? AND status = 'active'
       ORDER BY name`
    ).bind(def.id).all();
    definitions.push({
      ...toCamel(def),
      fields_schema: typeof def.fields_schema === 'string' ? JSON.parse(def.fields_schema) : def.fields_schema,
      items: items.results.map(toCamel),
    });
  }
  return jsonResponse(c, { tenant: { id: tenant.id, name: tenant.name }, definitions });
});

export default router;
