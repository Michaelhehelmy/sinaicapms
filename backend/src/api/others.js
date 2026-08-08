import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';

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

export async function handlePlansRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  if (method === 'GET' && path.length === 2) {
    const { results } = await env.DB.prepare(
      "SELECT p.* FROM plans_new p JOIN camps c ON c.id = p.camp_id WHERE c.tenant_id = ?"
    ).bind(tenantId).all();
    return jsonResponse(results);
  } else if (method === 'GET' && path.length === 3) {
    const { results } = await env.DB.prepare(
      "SELECT p.* FROM plans_new p JOIN camps c ON c.id = p.camp_id WHERE c.tenant_id = ? AND p.id = ?"
    ).bind(tenantId, path[2]).all();
    if (results.length === 0) return errorResponse('Plan not found', 404);
    return jsonResponse(results[0]);
  } else if (method === 'POST' && path.length === 2) {
    try {
      const parsed = planPostSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { id, name, description, camp_id, date, time, capacity, status, category } = parsed.data;

      const { results: campCheck } = await env.DB.prepare(
        "SELECT id FROM camps WHERE id = ? AND tenant_id = ?"
      ).bind(camp_id, tenantId).all();
      if (campCheck.length === 0) return errorResponse('Camp not found for this tenant', 404);

      const pid = id || 'pln_' + crypto.randomUUID().slice(0, 12);
      await env.DB.prepare(
        "INSERT INTO plans_new (id, camp_id, name, description, date, time, capacity, status, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
      ).bind(pid, camp_id, name, description || null, date || null, time || null, capacity ?? null, status || 'planned', category || null).run();
      return jsonResponse({ id: pid, success: true });
    } catch (e) {
      return errorResponse('Failed to create plan');
    }
  } else if (method === 'PUT' && path.length === 3) {
    try {
      const pid = path[2];
      const parsed = planPutSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { name, description, camp_id, date, time, capacity, status, category } = parsed.data;
      await env.DB.prepare(
        `UPDATE plans_new SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          camp_id = COALESCE(?, camp_id),
          date = COALESCE(?, date),
          time = COALESCE(?, time),
          capacity = COALESCE(?, capacity),
          status = COALESCE(?, status),
          category = COALESCE(?, category)
         WHERE id = ? AND camp_id IN (SELECT id FROM camps WHERE tenant_id = ?)`
      ).bind(name || null, description || null, camp_id || null, date || null, time || null, capacity ?? null, status || null, category || null, pid, tenantId).run();
      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to update plan');
    }
  } else if (method === 'DELETE' && path.length === 3) {
    try {
      await env.DB.prepare(
        "DELETE FROM plans_new WHERE id = ? AND camp_id IN (SELECT id FROM camps WHERE tenant_id = ?)"
      ).bind(path[2], tenantId).run();
      return jsonResponse({ success: true });
    } catch (e) {
      return errorResponse('Failed to delete plan');
    }
  }
  return errorResponse('Method not allowed', 405);
}
