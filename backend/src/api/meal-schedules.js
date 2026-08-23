import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';

export const schedulePostSchema = z.object({
  camp_id: z.string().min(1, 'Camp ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  meal_id: z.string().min(1, 'Meal ID is required'),
  package_type: z.enum(['all', 'full_board', 'half_board']).optional().default('all'),
  max_servings: z.number().int().min(0).optional().default(100),
}).strip();

export async function handleMealSchedulesRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  // GET /meal-schedules — list all for tenant
  if (method === 'GET' && path.length === 2) {
    const campId = url.searchParams.get('campId');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    let query = `
      SELECT ms.id, ms.tenant_id, ms.camp_id, c.name AS camp_name,
             ms.date, ms.meal_id, ml.name AS meal_name,
             ms.package_type, ms.max_servings, ms.created_at
      FROM meal_schedules ms
      LEFT JOIN projects c ON c.id = ms.camp_id
      LEFT JOIN meals m ON m.id = ms.meal_id
      LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
      WHERE ms.tenant_id = ?
    `;
    const binds = [tenantId];

    if (campId) {
      query += ' AND ms.camp_id = ?';
      binds.push(campId);
    }
    if (dateFrom) {
      query += ' AND ms.date >= ?';
      binds.push(dateFrom);
    }
    if (dateTo) {
      query += ' AND ms.date <= ?';
      binds.push(dateTo);
    }

    query += ' ORDER BY ms.date ASC, ms.created_at ASC';

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return jsonResponse(results);
  }

  // POST /meal-schedules — create
  if (method === 'POST' && path.length === 2) {
    try {
      const parsed = schedulePostSchema.safeParse(toSnake(await request.json()));
      if (!parsed.success) {
        return validationError(parsed);
      }

      const { camp_id, date, meal_id, package_type, max_servings } = parsed.data;

      // Verify meal belongs to this tenant
      const meal = await env.DB.prepare(
        'SELECT id FROM meals WHERE id = ? AND tenant_id = ?'
      ).bind(meal_id, tenantId).first();
      if (!meal) return errorResponse('Meal not found', 404);

      // Verify camp belongs to this tenant
      const camp = await env.DB.prepare(
        'SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL'
      ).bind(camp_id, tenantId).first();
      if (!camp) return errorResponse('Camp not found', 404);

      const id = 'msch_' + crypto.randomUUID().slice(0, 12);

      await env.DB.prepare(
        `INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, tenantId, camp_id, date, meal_id, package_type, max_servings).run();

      return jsonResponse({ id, success: true });
    } catch (e) {
      return errorResponse('Failed to create meal schedule');
    }
  }

  // DELETE /meal-schedules/:id
  if (method === 'DELETE' && path.length === 3) {
    const scheduleId = path[2];

    const ownership = await env.DB.prepare(
      'SELECT id FROM meal_schedules WHERE id = ? AND tenant_id = ?'
    ).bind(scheduleId, tenantId).first();
    if (!ownership) return errorResponse('Schedule not found', 404);

    await env.DB.prepare(
      'DELETE FROM meal_schedules WHERE id = ? AND tenant_id = ?'
    ).bind(scheduleId, tenantId).run();

    return jsonResponse({ success: true });
  }

  return errorResponse('Method not allowed', 405);
}
