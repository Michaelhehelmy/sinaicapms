import { jsonResponse, errorResponse } from '../utils/response';
import { getScope } from '../middleware/resolveScope.js';
import { Hono } from 'hono';

const mealPlanRoutes = new Hono();

mealPlanRoutes.get('/:id/meal-plans', async (c) => {
  try {
    const projectId = c.req.param('id');

    const project = await c.env.DB.prepare(
      'SELECT tenant_id, meal_plan_category_id FROM projects WHERE id = ? AND deleted_at IS NULL'
    ).bind(projectId).first();

    if (!project || !project.meal_plan_category_id) {
      return jsonResponse({ meal_plans: [] });
    }

    const { results: orgMapping } = await c.env.DB.prepare(
      'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
    ).bind(project.tenant_id).all();

    if (orgMapping.length === 0) {
      return jsonResponse({ meal_plans: [] });
    }

    const organizationId = orgMapping[0].organization_id;

    const { results: products } = await c.env.DB.prepare(
      `SELECT id, name, selling_price, description, image_url
       FROM pos_products
       WHERE category_id = ? AND organization_id = ? AND is_active = 1`
    ).bind(project.meal_plan_category_id, organizationId).all();

    return jsonResponse({ meal_plans: products });
  } catch (e) {
    return errorResponse('Failed to fetch meal plans');
  }
});

mealPlanRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default mealPlanRoutes;
