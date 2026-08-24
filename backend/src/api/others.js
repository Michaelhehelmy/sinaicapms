import { Hono } from 'hono';
import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import { getScope } from '../middleware/resolveScope.js';

export const planPostSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  camp_id: z.string().min(1, 'Camp ID is required'),
  date: z.string().optional(),
  time: z.string().optional(),
  capacity: z.number().min(1).optional(),
  status: z.string().optional(),
  category: z.string().optional(),
}).strip(); // S-M1 fix: strip unknown fields

export const planPutSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  camp_id: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  capacity: z.number().min(1).optional(),
  status: z.string().optional(),
  category: z.string().optional(),
}).strip(); // S-M1 fix

/**
 * Plans sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/plans', resolveScope());
 *   app.use('/api/plans/*', resolveScope());
 *   app.route('/api/plans', plansRoutes);
 */
const plansRoutes = new Hono();

// GET /api/plans — every plan whose camp belongs to this tenant.
plansRoutes.get('/', async (c) => {
  const tenantId = getScope(c).tenantId;
  const { results } = await c.env.DB.prepare(
    "SELECT p.* FROM plans_new p JOIN projects c ON c.id = p.camp_id WHERE c.tenant_id = ? AND c.deleted_at IS NULL"
  ).bind(tenantId).all();
  return jsonResponse(results);
});

// GET /api/plans/:id
plansRoutes.get('/:id', async (c) => {
  const tenantId = getScope(c).tenantId;
  const { results } = await c.env.DB.prepare(
    "SELECT p.* FROM plans_new p JOIN projects c ON c.id = p.camp_id WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND p.id = ?"
  ).bind(tenantId, c.req.param('id')).all();
  if (results.length === 0) return errorResponse('Plan not found', 404);
  return jsonResponse(results[0]);
});

// POST /api/plans
plansRoutes.post('/', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const parsed = planPostSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { id, name, description, camp_id, date, time, capacity, status, category } = parsed.data;

    const { results: campCheck } = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL"
    ).bind(camp_id, tenantId).all();
    if (campCheck.length === 0) return errorResponse('Camp not found for this tenant', 404);

    const pid = id || 'pln_' + crypto.randomUUID().slice(0, 12);
    await c.env.DB.prepare(
      "INSERT INTO plans_new (id, camp_id, name, description, date, time, capacity, status, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    ).bind(pid, camp_id, name, description || null, date || null, time || null, capacity ?? null, status || 'planned', category || null).run();
    return jsonResponse({ id: pid, success: true });
  } catch (e) {
    return errorResponse('Failed to create plan');
  }
});

// PUT /api/plans/:id
plansRoutes.put('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    const pid = c.req.param('id');
    const parsed = planPutSchema.safeParse(toSnake(await c.req.json()));
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, description, camp_id, date, time, capacity, status, category } = parsed.data;

    // H3 fix: when moving a plan to a different camp, verify the NEW camp
    // belongs to this tenant. The UPDATE below only scopes on the OLD
    // camp_id, so without this check a tenant could re-parent its plan onto
    // another tenant's camp via COALESCE(camp_id).
    if (camp_id) {
      const { results: campCheck } = await c.env.DB.prepare(
        "SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL"
      ).bind(camp_id, tenantId).all();
      if (campCheck.length === 0) return errorResponse('Camp not found for this tenant', 404);
    }

    await c.env.DB.prepare(
      `UPDATE plans_new SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        camp_id = COALESCE(?, camp_id),
        date = COALESCE(?, date),
        time = COALESCE(?, time),
        capacity = COALESCE(?, capacity),
        status = COALESCE(?, status),
        category = COALESCE(?, category)
       WHERE id = ? AND camp_id IN (SELECT id FROM projects WHERE tenant_id = ?)`
    ).bind(name || null, description || null, camp_id || null, date || null, time || null, capacity ?? null, status || null, category || null, pid, tenantId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update plan');
  }
});

// DELETE /api/plans/:id
plansRoutes.delete('/:id', async (c) => {
  try {
    const tenantId = getScope(c).tenantId;
    await c.env.DB.prepare(
      "DELETE FROM plans_new WHERE id = ? AND camp_id IN (SELECT id FROM projects WHERE tenant_id = ?)"
    ).bind(c.req.param('id'), tenantId).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete plan');
  }
});

plansRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default plansRoutes;
