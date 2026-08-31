import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { getScope } from '../middleware/resolveScope.js';

/**
 * Inventory sub-router (Phase 4 T1).
 *
 * Mounted by index.js as:
 *   app.use('/api/inventory', resolveScope());
 *   app.use('/api/inventory/*', resolveScope());
 *   app.route('/api/inventory', inventoryRoutes);
 *
 * Byte-compat with the former dispatcher: non-GET → 405 'Method not allowed'
 * (checked before path matching); anything but exactly /low-stock →
 * 404 'Endpoint not found'.
 */
const inventoryRoutes = new Hono();

// Legacy fallthrough guard: method check ran before path parsing.
inventoryRoutes.use('*', async (c, next) => {
  if (!['GET', 'POST', 'PUT'].includes(c.req.method)) {
    return errorResponse('Method not allowed', 405);
  }
  await next();
});

inventoryRoutes.get('/low-stock', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  try {
    // Resolve the caller's organization via tenant_org_mapping (migration 0041).
    // No mapping row => the tenant has no POS org yet: return an empty page.
    const { results: orgRows } = await env.DB.prepare(
      'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
    ).bind(tenantId).all();

    if (!orgRows.length) {
      // Phase 3: `data` mirrors `items` (paginated-envelope convergence).
      return jsonResponse({ data: [], items: [], total: 0, page: 1, pageSize: 50, hasMore: false });
    }

    const organizationId = orgRows[0].organization_id;
    const { page, pageSize, offset } = parsePagination(new URL(c.req.url));

    const { results: countRows } = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM pos_products p
       WHERE p.organization_id = ?
         AND p.deleted_at IS NULL
         AND p.is_active = 1
         AND p.stock_quantity <= p.min_stock_level`
    ).bind(organizationId).all();

    const total = countRows[0]?.count ?? 0;

    // `pos_categories` was dropped by migration 0057 (zero rows, display-only join).
    // `category` stays in the payload as null — wire-compatible with InventoryItem
    // (`category: string | null`) and renders as "—" in LowStockPanel.
    const { results: rows } = await env.DB.prepare(
      `SELECT p.id, p.name, p.stock_quantity, p.min_stock_level, p.unit
       FROM pos_products p
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
      category: null,
      status: r.stock_quantity <= 0 ? 'out' : 'low',
    }));

    return jsonResponse({
      // Phase 3: `data` mirrors `items` — consumers converge on the envelope key.
      data: items,
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (e) {
    return errorResponse('Failed to load low-stock inventory', 500);
  }
});

inventoryRoutes.get('/adjustments', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  const { results } = await env.DB.prepare(
    `SELECT ia.*, p.name as product_name
     FROM inventory_adjustments ia
     JOIN pos_products p ON ia.product_id = p.id
     WHERE ia.tenant_id = ?
     ORDER BY ia.created_at DESC LIMIT 100`
  ).bind(tenantId).all();
  return jsonResponse(results);
});

inventoryRoutes.post('/adjustments', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  const body = await c.req.json();
  const { product_id, adjustment, reason, reference, notes } = body;
  if (!product_id || typeof adjustment !== 'number') {
    return errorResponse('product_id and adjustment (number) are required', 400);
  }
  const product = await env.DB.prepare(
    'SELECT id, stock_quantity FROM pos_products WHERE id = ? AND tenant_id = ?'
  ).bind(product_id, tenantId).first();
  if (!product) return errorResponse('Product not found', 404);
  const id = crypto.randomUUID();
  // Atomic: INSERT adjustment log + conditional UPDATE in one batch.
  // The WHERE guard prevents negative stock even under concurrent adjustments.
  const insertStmt = env.DB.prepare(
    `INSERT INTO inventory_adjustments (id, tenant_id, product_id, adjustment, reason, reference, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, product_id, adjustment, reason || 'manual', reference || null, notes || null);
  const updateStmt = env.DB.prepare(
    `UPDATE pos_products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ? AND stock_quantity + ? >= 0`
  ).bind(adjustment, product_id, tenantId, adjustment);
  const [insertResult, updateResult] = await env.DB.batch([insertStmt, updateStmt]);
  if (!updateResult?.meta || updateResult.meta.changes === 0) {
    return errorResponse('Adjustment would result in negative stock', 400);
  }
  // Re-read actual stock after atomic update
  const updated = await env.DB.prepare('SELECT stock_quantity FROM pos_products WHERE id = ? AND tenant_id = ?').bind(product_id, tenantId).first();
  return jsonResponse({ id, success: true, new_stock: updated?.stock_quantity ?? 0 }, 201);
});

inventoryRoutes.get('/reorder-suggestions', async (c) => {
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.stock_quantity, p.reorder_point, p.min_stock_level, p.supplier_name,
            (p.reorder_point - p.stock_quantity) as suggested_order_qty
     FROM pos_products p
     WHERE p.tenant_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
       AND p.stock_quantity <= p.reorder_point
     ORDER BY (p.stock_quantity * 1.0 / NULLIF(p.reorder_point, 0)) ASC`
  ).bind(tenantId).all();
  return jsonResponse({ suggestions: results });
});

// Legacy fallthrough: every other inventory path keeps the dispatcher message.
inventoryRoutes.all('*', () => errorResponse('Endpoint not found', 404));

export default inventoryRoutes;
