import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response.js';

const barcode = new Hono();

/**
 * GET /api/pos/products/barcode/:code
 * Look up a POS product by SKU or barcode.
 * Returns 404 if no matching active product is found for the tenant.
 */
barcode.get('/:code', async (c) => {
  const code = c.req.param('code');
  if (!code) return errorResponse(c, 'Barcode/SKU is required', 400);

  const tenantId = c.get('tenantId');
  if (!tenantId) return errorResponse(c, 'Tenant not resolved', 400);

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, sku, name, description, selling_price, cost_price, category_id, type, image_url, is_active, stock_quantity FROM pos_products WHERE (sku = ? OR barcode = ?) AND tenant_id = ? AND is_active = 1 LIMIT 1'
    ).bind(code, code, tenantId).all();

    if (results.length === 0) {
      return errorResponse(c, 'Product not found', 404);
    }

    const row = results[0];
    return jsonResponse(c, {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      sellingPrice: row.selling_price,
      costPrice: row.cost_price,
      categoryId: row.category_id,
      type: row.type,
      imageUrl: row.image_url,
      isActive: row.is_active,
      stockQuantity: row.stock_quantity,
    });
  } catch (err) {
    console.error('[POS BARCODE] lookup failed:', err.message);
    return errorResponse(c, 'Failed to look up product', 500);
  }
});

export default barcode;
