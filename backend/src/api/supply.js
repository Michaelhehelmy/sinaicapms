/**
 * Supply Chain Management Module — warehouses, stock, transfers, purchase orders, BOMs, manufacturing.
 *
 * Endpoints (mounted at /api/supply in index.js):
 *   GET    /warehouses               list warehouses
 *   POST   /warehouses               create warehouse
 *   PUT    /warehouses/:id           update warehouse
 *   DELETE /warehouses/:id           soft-delete warehouse
 *   GET    /stock                    current stock per warehouse
 *   POST   /stock                    adjust stock
 *   POST   /stock-transfers          create transfer
 *   PATCH  /stock-transfers/:id/confirm  confirm transfer (atomic stock move)
 *   GET    /purchase-orders          list POs
 *   POST   /purchase-orders          create PO with lines
 *   PATCH  /purchase-orders/:id/receive  receive goods
 *   GET    /boms                     list BOMs
 *   POST   /boms                     create BOM with lines
 *   POST   /manufacturing-orders     create MO
 *   PATCH  /manufacturing-orders/:id/progress  update production progress
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Schemas ────────────────────────────────────────────────────────────────

const warehouseCreateSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().max(500).optional(),
  isActive: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const warehouseUpdateSchema = warehouseCreateSchema.partial().strip();

const stockAdjustSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int(),
}).strip();

const transferCreateSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  createdBy: z.string().max(200).optional(),
}).strip();

const poLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
}).strip();

const poCreateSchema = z.object({
  vendorId: z.string().optional(),
  orderDate: z.string().min(1),
  expectedDelivery: z.string().optional(),
  notes: z.string().max(2000).optional(),
  createdBy: z.string().max(200).optional(),
  lines: z.array(poLineSchema).min(1),
}).strip();

const bomLineSchema = z.object({
  componentId: z.string().min(1),
  quantity: z.number().min(0.01),
  unit: z.string().max(50).optional(),
}).strip();

const bomCreateSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).max(200),
  lines: z.array(bomLineSchema).min(1),
}).strip();

const moCreateSchema = z.object({
  bomId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  createdBy: z.string().max(200).optional(),
}).strip();

const moProgressSchema = z.object({
  producedQuantity: z.number().int().min(0),
  status: z.enum(['draft', 'planned', 'in_production', 'completed', 'canceled']).optional(),
}).strip();

// ── Warehouses ─────────────────────────────────────────────────────────────

router.get('/warehouses', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM warehouses WHERE tenant_id = ? ORDER BY name'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/warehouses', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = warehouseCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { name, location, isActive } = parsed.data;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM warehouses WHERE tenant_id = ? AND name = ?'
  ).bind(tenantId, name).first();
  if (existing) return errorResponse('Warehouse name already exists', 409);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO warehouses (id, tenant_id, name, location, is_active)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, tenantId, name, location || null, isActive !== undefined ? (isActive ? 1 : 0) : 1).run();

  return jsonResponse({ id, name, location: location || null, isActive: isActive !== undefined ? (isActive ? 1 : 0) : 1, success: true }, 201);
});

router.put('/warehouses/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = warehouseUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM warehouses WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Warehouse not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.name !== undefined) { sets.push('name = ?'); binds.push(data.name); }
  if (data.location !== undefined) { sets.push('location = ?'); binds.push(data.location); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); binds.push(data.isActive ? 1 : 0); }
  if (sets.length === 0) return jsonResponse({ success: true });
  binds.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE warehouses SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/warehouses/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM warehouses WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Warehouse not found', 404);

  await c.env.DB.prepare(
    "UPDATE warehouses SET is_active = 0 WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Stock ──────────────────────────────────────────────────────────────────

router.get('/stock', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    `SELECT sq.*, w.name as warehouse_name, p.name as product_name
     FROM stock_quant sq
     LEFT JOIN warehouses w ON sq.warehouse_id = w.id
     LEFT JOIN pos_products p ON sq.product_id = p.id
     WHERE sq.tenant_id = ?
     ORDER BY w.name, p.name`
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/stock', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = stockAdjustSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { productId, warehouseId, quantity } = parsed.data;

  const wh = await c.env.DB.prepare(
    'SELECT id FROM warehouses WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(warehouseId, tenantId).first();
  if (!wh) return errorResponse('Warehouse not found', 404);

  const existing = await c.env.DB.prepare(
    'SELECT id, quantity FROM stock_quant WHERE product_id = ? AND warehouse_id = ? AND tenant_id = ?'
  ).bind(productId, warehouseId, tenantId).first();

  if (existing) {
    const newQty = existing.quantity + quantity;
    await c.env.DB.prepare(
      'UPDATE stock_quant SET quantity = ? WHERE id = ? AND tenant_id = ?'
    ).bind(newQty, existing.id, tenantId).run();
    return jsonResponse({ id: existing.id, productId, warehouseId, quantity: newQty, success: true });
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO stock_quant (id, tenant_id, product_id, warehouse_id, quantity)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(id, tenantId, productId, warehouseId, quantity).run();
    return jsonResponse({ id, productId, warehouseId, quantity, success: true }, 201);
  }
});

// ── Stock Transfers ────────────────────────────────────────────────────────

router.get('/stock-transfers', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    `SELECT st.*,
       fw.name as from_warehouse_name,
       tw.name as to_warehouse_name,
       p.name as product_name
     FROM stock_transfers st
     LEFT JOIN warehouses fw ON st.from_warehouse_id = fw.id
     LEFT JOIN warehouses tw ON st.to_warehouse_id = tw.id
     LEFT JOIN pos_products p ON st.product_id = p.id
     WHERE st.tenant_id = ?
     ORDER BY st.created_at DESC`
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/stock-transfers', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = transferCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { fromWarehouseId, toWarehouseId, productId, quantity, createdBy } = parsed.data;

  if (fromWarehouseId === toWarehouseId) return errorResponse('Source and destination warehouses must differ', 400);

  const fromWh = await c.env.DB.prepare(
    'SELECT id FROM warehouses WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(fromWarehouseId, tenantId).first();
  if (!fromWh) return errorResponse('Source warehouse not found', 404);

  const toWh = await c.env.DB.prepare(
    'SELECT id FROM warehouses WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(toWarehouseId, tenantId).first();
  if (!toWh) return errorResponse('Destination warehouse not found', 404);

  const stock = await c.env.DB.prepare(
    'SELECT quantity FROM stock_quant WHERE product_id = ? AND warehouse_id = ? AND tenant_id = ?'
  ).bind(productId, fromWarehouseId, tenantId).first();
  if (!stock || stock.quantity < quantity) return errorResponse('Insufficient stock in source warehouse', 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO stock_transfers (id, tenant_id, from_warehouse_id, to_warehouse_id, product_id, quantity, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`
  ).bind(id, tenantId, fromWarehouseId, toWarehouseId, productId, quantity, createdBy || null).run();

  return jsonResponse({ id, fromWarehouseId, toWarehouseId, productId, quantity, status: 'draft', success: true }, 201);
});

router.patch('/stock-transfers/:id/confirm', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const transfer = await c.env.DB.prepare(
    'SELECT * FROM stock_transfers WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!transfer) return errorResponse('Transfer not found', 404);
  if (transfer.status !== 'draft') return errorResponse('Transfer cannot be confirmed in current status', 400);

  // Deduct from source
  const fromStock = await c.env.DB.prepare(
    'SELECT id, quantity FROM stock_quant WHERE product_id = ? AND warehouse_id = ? AND tenant_id = ?'
  ).bind(transfer.product_id, transfer.from_warehouse_id, tenantId).first();
  if (!fromStock || fromStock.quantity < transfer.quantity) return errorResponse('Insufficient stock', 400);

  const newFromQty = fromStock.quantity - transfer.quantity;
  await c.env.DB.prepare(
    'UPDATE stock_quant SET quantity = ? WHERE id = ? AND tenant_id = ?'
  ).bind(newFromQty, fromStock.id, tenantId).run();

  // Upsert destination
  const toStock = await c.env.DB.prepare(
    'SELECT id, quantity FROM stock_quant WHERE product_id = ? AND warehouse_id = ? AND tenant_id = ?'
  ).bind(transfer.product_id, transfer.to_warehouse_id, tenantId).first();

  if (toStock) {
    await c.env.DB.prepare(
      'UPDATE stock_quant SET quantity = ? WHERE id = ? AND tenant_id = ?'
    ).bind(toStock.quantity + transfer.quantity, toStock.id, tenantId).run();
  } else {
    const newId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO stock_quant (id, tenant_id, product_id, warehouse_id, quantity)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(newId, tenantId, transfer.product_id, transfer.to_warehouse_id, transfer.quantity).run();
  }

  // Update transfer status
  await c.env.DB.prepare(
    "UPDATE stock_transfers SET status = 'completed' WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Purchase Orders ────────────────────────────────────────────────────────

router.get('/purchase-orders', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM purchase_orders WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/purchase-orders', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = poCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { vendorId, orderDate, expectedDelivery, notes, createdBy, lines } = parsed.data;

  let totalAmount = 0;
  for (const line of lines) {
    totalAmount += line.quantity * line.unitPrice;
  }

  const seqResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM purchase_orders WHERE tenant_id = ?"
  ).bind(tenantId).first();
  const seq = (seqResult?.cnt || 0) + 1;
  const poNumber = `PO-${String(seq).padStart(5, '0')}`;

  const poId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO purchase_orders (id, tenant_id, po_number, vendor_id, order_date, expected_delivery, total_amount, created_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(poId, tenantId, poNumber, vendorId || null, orderDate, expectedDelivery || null, totalAmount, createdBy || null, notes || null).run();

  for (const line of lines) {
    const lineId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO purchase_order_lines (id, po_id, product_id, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(lineId, poId, line.productId, line.quantity, line.unitPrice, line.quantity * line.unitPrice).run();
  }

  return jsonResponse({ id: poId, poNumber, vendorId: vendorId || null, orderDate, expectedDelivery: expectedDelivery || null, totalAmount, status: 'draft', success: true }, 201);
});

router.patch('/purchase-orders/:id/receive', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const po = await c.env.DB.prepare(
    'SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!po) return errorResponse('Purchase order not found', 404);
  if (po.status === 'received' || po.status === 'canceled') return errorResponse('PO is already received or canceled', 400);

  const lines = await c.env.DB.prepare(
    'SELECT * FROM purchase_order_lines WHERE po_id = ?'
  ).bind(id).all();
  const lineResults = lines.results || [];
  if (lineResults.length === 0) return errorResponse('PO has no lines', 400);

  // Receive all lines (set received_quantity = quantity)
  for (const line of lineResults) {
    await c.env.DB.prepare(
      'UPDATE purchase_order_lines SET received_quantity = quantity WHERE id = ?'
    ).bind(line.id).run();

    // Add to stock (use first active warehouse or we could make warehouseId a param)
    // For now, we create/update stock_quant for product in a generic way
    const existingStock = await c.env.DB.prepare(
      'SELECT id, quantity FROM stock_quant WHERE product_id = ? AND tenant_id = ? LIMIT 1'
    ).bind(line.product_id, tenantId).first();

    if (existingStock) {
      await c.env.DB.prepare(
        'UPDATE stock_quant SET quantity = ? WHERE id = ?'
      ).bind(existingStock.quantity + line.quantity, existingStock.id).run();
    } else {
      const stockId = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO stock_quant (id, tenant_id, product_id, warehouse_id, quantity)
         VALUES (?, ?, ?, 'default', ?)`
      ).bind(stockId, tenantId, line.product_id, line.quantity).run();
    }
  }

  await c.env.DB.prepare(
    "UPDATE purchase_orders SET status = 'received' WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── BOMs ───────────────────────────────────────────────────────────────────

router.get('/boms', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    `SELECT b.*, p.name as product_name
     FROM boms b
     LEFT JOIN pos_products p ON b.product_id = p.id
     WHERE b.tenant_id = ?
     ORDER BY b.name`
  ).bind(tenantId).all();
  const boms = rows.results || [];

  for (const bom of boms) {
    const lines = await c.env.DB.prepare(
      'SELECT * FROM bom_lines WHERE bom_id = ?'
    ).bind(bom.id).all();
    bom.lines = lines.results || [];
  }

  return jsonResponse(boms);
});

router.post('/boms', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = bomCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { productId, name, lines } = parsed.data;

  const bomId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO boms (id, tenant_id, product_id, name)
     VALUES (?, ?, ?, ?)`
  ).bind(bomId, tenantId, productId, name).run();

  for (const line of lines) {
    const lineId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO bom_lines (id, bom_id, component_id, quantity, unit)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(lineId, bomId, line.componentId, line.quantity, line.unit || 'each').run();
  }

  return jsonResponse({ id: bomId, productId, name, version: 1, lines, success: true }, 201);
});

// ── Manufacturing Orders ───────────────────────────────────────────────────

router.get('/manufacturing-orders', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    `SELECT mo.*, p.name as product_name, b.name as bom_name
     FROM manufacturing_orders mo
     LEFT JOIN pos_products p ON mo.product_id = p.id
     LEFT JOIN boms b ON mo.bom_id = b.id
     WHERE mo.tenant_id = ?
     ORDER BY mo.created_at DESC`
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/manufacturing-orders', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = moCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { bomId, productId, quantity, startDate, endDate, createdBy } = parsed.data;

  const bom = await c.env.DB.prepare(
    'SELECT id FROM boms WHERE id = ? AND tenant_id = ?'
  ).bind(bomId, tenantId).first();
  if (!bom) return errorResponse('BOM not found', 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO manufacturing_orders (id, tenant_id, bom_id, product_id, quantity, start_date, end_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, bomId, productId, quantity, startDate || null, endDate || null, createdBy || null).run();

  return jsonResponse({ id, bomId, productId, quantity, status: 'draft', producedQuantity: 0, success: true }, 201);
});

router.patch('/manufacturing-orders/:id/progress', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = moProgressSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { producedQuantity, status } = parsed.data;

  const mo = await c.env.DB.prepare(
    'SELECT * FROM manufacturing_orders WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!mo) return errorResponse('Manufacturing order not found', 404);

  const sets = ['produced_quantity = ?'];
  const binds = [producedQuantity];
  if (status) { sets.push('status = ?'); binds.push(status); }

  // If completing, consume BOM components from stock
  if (status === 'completed') {
    const bomLines = await c.env.DB.prepare(
      'SELECT * FROM bom_lines WHERE bom_id = ?'
    ).bind(mo.bom_id).all();
    const components = bomLines.results || [];

    for (const comp of components) {
      const consumeQty = comp.quantity * producedQuantity;
      const stock = await c.env.DB.prepare(
        'SELECT id, quantity FROM stock_quant WHERE product_id = ? AND tenant_id = ? LIMIT 1'
      ).bind(comp.component_id, tenantId).first();
      if (stock) {
        const newQty = Math.max(0, stock.quantity - consumeQty);
        await c.env.DB.prepare(
          'UPDATE stock_quant SET quantity = ? WHERE id = ?'
        ).bind(newQty, stock.id).run();
      }
    }
  }

  binds.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE manufacturing_orders SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

export default router;
