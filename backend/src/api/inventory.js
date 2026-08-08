import { jsonResponse, errorResponse } from '../utils/response';
import { parsePagination } from '../utils/pagination';

export async function handleInventoryRoute(request, env, tenantId) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.split('/').filter(Boolean);

  if (method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  if (path[1] !== 'inventory' || path[2] !== 'low-stock' || path.length > 3) {
    return errorResponse('Endpoint not found', 404);
  }

  try {
    // Resolve the caller's organization via tenant_org_mapping (migration 0041).
    // No mapping row => the tenant has no POS org yet: return an empty page.
    const { results: orgRows } = await env.DB.prepare(
      'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
    ).bind(tenantId).all();

    if (!orgRows.length) {
      return jsonResponse({ items: [], total: 0, page: 1, pageSize: 50, hasMore: false });
    }

    const organizationId = orgRows[0].organization_id;
    const { page, pageSize, offset } = parsePagination(url);

    const { results: countRows } = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM pos_products p
       WHERE p.organization_id = ?
         AND p.deleted_at IS NULL
         AND p.is_active = 1
         AND p.stock_quantity <= p.min_stock_level`
    ).bind(organizationId).all();

    const total = countRows[0]?.count ?? 0;

    const { results: rows } = await env.DB.prepare(
      `SELECT p.id, p.name, p.stock_quantity, p.min_stock_level, p.unit, pc.name AS category
       FROM pos_products p
       LEFT JOIN pos_categories pc ON pc.id = p.category_id
       WHERE p.organization_id = ?
         AND p.deleted_at IS NULL
         AND p.is_active = 1
         AND p.stock_quantity <= p.min_stock_level
       ORDER BY (p.stock_quantity * 1.0 / NULLIF(p.min_stock_level, 0)) ASC
       LIMIT ? OFFSET ?`
    ).bind(organizationId, pageSize, offset).all();

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      stockQuantity: r.stock_quantity,
      minStockLevel: r.min_stock_level,
      unit: r.unit ?? null,
      category: r.category ?? null,
      status: r.stock_quantity <= 0 ? 'out' : 'low',
    }));

    return jsonResponse({
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (e) {
    return errorResponse('Failed to load low-stock inventory', 500);
  }
}
