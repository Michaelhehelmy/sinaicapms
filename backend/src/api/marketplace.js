/**
 * Public Marketplace — directory, search, categories, ratings.
 *
 * Mounted by index.js as:
 *   app.use('/api/marketplace/*', marketplacePublicScope);
 *   app.route('/api/marketplace', marketplaceRoutes);
 *
 * All endpoints are public (no auth required).
 */
import { Hono } from 'hono';
import { jsonResponse, errorResponse, toCamel } from '../utils/response.js';

const router = new Hono();

// ── GET /marketplace — Directory listing with search + category filter ──
router.get('/', async (c) => {
  const env = c.env;
  try {
    const search = c.req.query('search') || '';
    const categoryId = c.req.query('category') || '';
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '12')));
    const offset = (page - 1) * pageSize;

    let whereClause = `WHERE t.status = 'active' AND t.onboarding_status = 'completed'`;
    const params = [];

    if (search) {
      whereClause += ` AND (t.name LIKE ? OR t.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    let joinClause = '';
    if (categoryId) {
      joinClause = ` JOIN marketplace_project_categories mpc ON p.id = mpc.project_id AND mpc.category_id = ?`;
      params.unshift(categoryId);
    }

    // Count total
    const countSql = `SELECT COUNT(DISTINCT t.id) as count
      FROM tenants t
      JOIN projects p ON p.tenant_id = t.id AND p.deleted_at IS NULL
      ${joinClause}
      ${whereClause}`;
    const { results: countRows } = await env.DB.prepare(countSql).bind(...params).all();
    const total = countRows[0]?.count || 0;

    // Fetch projects with tenant info
    const dataSql = `SELECT DISTINCT t.id as tenant_id, t.name as tenant_name, t.subdomain,
        t.description as tenant_description, t.primary_color, t.location,
        p.id as project_id, p.name as project_name, p.description as project_description,
        p.project_type as project_type, p.capacity, p.slug,
        (SELECT COUNT(*) FROM marketplace_reviews mr WHERE mr.project_id = p.id AND mr.is_approved = 1) as review_count,
        (SELECT COALESCE(AVG(mr.rating), 0) FROM marketplace_reviews mr WHERE mr.project_id = p.id AND mr.is_approved = 1) as avg_rating
      FROM tenants t
      JOIN projects p ON p.tenant_id = t.id AND p.deleted_at IS NULL
      ${joinClause}
      ${whereClause}
      ORDER BY avg_rating DESC, t.name ASC
      LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    const { results } = await env.DB.prepare(dataSql).bind(...params).all();

    return jsonResponse({
      data: results.map(toCamel),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (e) {
    return errorResponse('Failed to load marketplace', 500);
  }
});

// ── GET /marketplace/categories — List marketplace categories ────────────
router.get('/categories', async (c) => {
  const env = c.env;
  try {
    const { results } = await env.DB.prepare(
      `SELECT mc.*, COUNT(mpc.project_id) as project_count
       FROM marketplace_categories mc
       LEFT JOIN marketplace_project_categories mpc ON mc.id = mpc.category_id
       GROUP BY mc.id
       ORDER BY mc.sort_order ASC, mc.name ASC`
    ).all();
    return jsonResponse(results.map(toCamel));
  } catch (e) {
    return errorResponse('Failed to load categories', 500);
  }
});

// ── GET /marketplace/:tenantSlug — Tenant public profile ─────────────────
router.get('/:tenantSlug', async (c) => {
  const env = c.env;
  const { tenantSlug } = c.req.param();
  try {
    const tenant = await env.DB.prepare(
      `SELECT id, name, subdomain, description, primary_color, location, phone, capacity, currency
       FROM tenants WHERE (subdomain = ? OR id = ?) AND status = 'active'`
    ).bind(tenantSlug, tenantSlug).first();

    if (!tenant) return errorResponse('Tenant not found', 404);

    // Get projects
    const { results: projects } = await env.DB.prepare(
      `SELECT id, name, description, project_type, capacity, slug
       FROM projects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name`
    ).bind(tenant.id).all();

    // Get reviews
    const { results: reviews } = await env.DB.prepare(
      `SELECT mr.*, p.name as project_name
       FROM marketplace_reviews mr
       JOIN projects p ON mr.project_id = p.id
       WHERE mr.tenant_id = ? AND mr.is_approved = 1
       ORDER BY mr.created_at DESC LIMIT 10`
    ).bind(tenant.id).all();

    // Get categories
    const { results: categories } = await env.DB.prepare(
      `SELECT mc.name, mc.slug
       FROM marketplace_categories mc
       JOIN marketplace_project_categories mpc ON mc.id = mpc.category_id
       WHERE mpc.project_id IN (SELECT id FROM projects WHERE tenant_id = ?)`
    ).bind(tenant.id).all();

    return jsonResponse({
      tenant: toCamel(tenant),
      projects: projects.map(toCamel),
      reviews: reviews.map(toCamel),
      categories: categories.map(toCamel),
    });
  } catch (e) {
    return errorResponse('Failed to load tenant profile', 500);
  }
});

// ── POST /marketplace/reviews — Submit a public review ───────────────────
router.post('/reviews', async (c) => {
  const env = c.env;
  try {
    const body = await c.req.json();
    const { project_id, reviewer_name, rating, comment } = body;

    if (!project_id || !rating || rating < 1 || rating > 5) {
      return errorResponse('project_id and rating (1-5) are required', 400);
    }

    // Verify project exists
    const project = await env.DB.prepare(
      'SELECT id, tenant_id FROM projects WHERE id = ? AND deleted_at IS NULL'
    ).bind(project_id).first();
    if (!project) return errorResponse('Project not found', 404);

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO marketplace_reviews (id, project_id, tenant_id, reviewer_name, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, project_id, project.tenant_id, reviewer_name || 'Anonymous', rating, comment || null).run();

    return jsonResponse({ id, success: true, message: 'Review submitted for moderation' }, 201);
  } catch (e) {
    return errorResponse('Failed to submit review', 500);
  }
});

// ── GET /marketplace/reviews/:projectId — Get reviews for a project ──────
router.get('/reviews/:projectId', async (c) => {
  const env = c.env;
  const { projectId } = c.req.param();
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, reviewer_name, rating, comment, created_at
       FROM marketplace_reviews
       WHERE project_id = ? AND is_approved = 1
       ORDER BY created_at DESC`
    ).bind(projectId).all();

    return jsonResponse(results.map(toCamel));
  } catch (e) {
    return errorResponse('Failed to load reviews', 500);
  }
});

export default router;
