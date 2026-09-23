import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';

export const schedulePostSchema = z.object({
  camp_id: z.string().min(1, 'Camp ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  meal_id: z.string().min(1, 'Meal ID is required'),
  package_type: z.enum(['all', 'full_board', 'half_board']).optional().default('all'),
  max_servings: z.number().int().min(0).optional().default(100),
  // P2: optional coherence assertion — when present it MUST equal camp_id
  // (camp_id values are project ids: 0105 backfilled
  // meal_schedules.project_id = COALESCE(camp_id, tenant-default), and the list
  // query below joins projects ON c.id = ms.camp_id). Omitted → derived.
  project_id: z.string().min(1).optional(),
}).strip();

async function loadProject(DB, projectId) {
  const { results } = await DB.prepare(
    'SELECT id, tenant_id, name FROM projects WHERE id = ? AND deleted_at IS NULL'
  ).bind(projectId).all();
  return results[0] || null;
}

export async function handleMealSchedulesRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  // GET /meal-schedules — list all for tenant (tenant-wide merged by default;
  // ?projectId narrows to one same-tenant project alongside legacy ?campId).
  if (method === 'GET' && path.length === 2) {
    const campId = url.searchParams.get('campId');
    const projectId = url.searchParams.get('projectId');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    // P2: ?projectId is tenant-gated first — foreign/missing → 404, never leak.
    // P2 precedence: campId is the legacy alias; when both are passed they must
    // agree (camp_id values are project ids), otherwise the request is incoherent.
    if (projectId) {
      const project = await loadProject(env.DB, projectId);
      if (!project || project.tenant_id !== tenantId) return errorResponse('Project not found', 404);
      if (campId && campId !== projectId) {
        return errorResponse('projectId and campId must refer to the same project', 400);
      }
    }

    let query = `
      SELECT ms.id, ms.tenant_id, ms.project_id, ms.camp_id, c.name AS camp_name,
              ms.date, ms.meal_id, ml.name AS meal_name,
              ms.package_type, ms.max_servings, ms.created_at,
              p.name AS project_name
       FROM meal_schedules ms
       LEFT JOIN projects c ON c.id = ms.camp_id
       LEFT JOIN meals m ON m.id = ms.meal_id
       LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
       LEFT JOIN projects p ON p.id = ms.project_id
       WHERE ms.tenant_id = ?
    `;
    const binds = [tenantId];

    if (campId) {
      query += ' AND ms.camp_id = ?';
      binds.push(campId);
    }
    if (projectId) {
      query += ' AND ms.project_id = ?';
      binds.push(projectId);
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

      const { camp_id, date, meal_id, package_type, max_servings, project_id } = parsed.data;

      // P2 camp→project coherence: an explicit project_id must equal camp_id
      // (camp_id values ARE project ids — see schema note above).
      if (project_id && project_id !== camp_id) {
        return errorResponse('projectId must match campId', 400, [
          { field: 'projectId', message: 'projectId must match campId' },
        ]);
      }

      // Verify meal belongs to this tenant
      const meal = await env.DB.prepare(
        'SELECT id, project_id FROM meals WHERE id = ? AND tenant_id = ?'
      ).bind(meal_id, tenantId).first();
      if (!meal) return errorResponse('Meal not found', 404);

      // Verify camp belongs to this tenant
      const camp = await env.DB.prepare(
        'SELECT id FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL'
      ).bind(camp_id, tenantId).first();
      if (!camp) return errorResponse('Camp not found', 404);

      // P2: the scheduled meal must live in the schedule's project.
      if (meal.project_id !== camp_id) {
        return errorResponse('Meal must belong to the same project as the schedule', 400, [
          { field: 'mealId', message: 'Meal must belong to the same project as the schedule' },
        ]);
      }

      const id = 'msch_' + crypto.randomUUID().slice(0, 12);

      await env.DB.prepare(
        `INSERT INTO meal_schedules (id, tenant_id, project_id, camp_id, date, meal_id, package_type, max_servings, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, tenantId, camp_id, camp_id, date, meal_id, package_type, max_servings).run();

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
