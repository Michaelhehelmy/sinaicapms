/**
 * Supply Chain Management tests — warehouses, stock, transfers, POs, BOMs, manufacturing.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as financials-unit.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import supplyRouter from '../../src/api/supply';
import { mountRouter } from '../helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: TENANT_HEADERS, ...init });

// ── Warehouses ──────────────────────────────────────────────────────────────

describe('Warehouses', () => {
  it('GET /warehouses lists all warehouses', async () => {
    const db = makeRoutingDb().on(/FROM warehouses/, [
      { id: 'wh1', tenant_id: 't1', name: 'Main Warehouse', location: 'Cairo', is_active: 1 }
    ]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/warehouses'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Main Warehouse');
  });

  it('POST /warehouses creates a new warehouse', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE.*name/, null)
      .on(/INSERT INTO warehouses/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/warehouses', {
      method: 'POST',
      body: JSON.stringify({ name: 'Secondary Warehouse', location: 'Alexandria' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Secondary Warehouse');
  });

  it('POST /warehouses rejects duplicate name', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE.*name/, [{ id: 'existing' }]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/warehouses', {
      method: 'POST',
      body: JSON.stringify({ name: 'Main Warehouse' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('PUT /warehouses/:id updates a warehouse', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE id/, [{ id: 'wh1' }])
      .on(/UPDATE warehouses SET/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/warehouses/wh1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Warehouse' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /warehouses/:id soft-deletes a warehouse', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE id/, [{ id: 'wh1' }])
      .on(/UPDATE warehouses SET is_active/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/warehouses/wh1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Stock ───────────────────────────────────────────────────────────────────

describe('Stock', () => {
  it('GET /stock lists stock with product names', async () => {
    const db = makeRoutingDb().on(/FROM stock_quant sq/, [
      { id: 'sq1', product_id: 'p1', warehouse_id: 'wh1', quantity: 100, reserved: 0, product_name: 'Widget', warehouse_name: 'Main' }
    ]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].productName).toBe('Widget');
  });

  it('POST /stock creates new stock record', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE id.*is_active/, [{ id: 'wh1' }])
      .on(/SELECT id, quantity FROM stock_quant WHERE product_id.*warehouse_id/, null)
      .on(/INSERT INTO stock_quant/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', warehouseId: 'wh1', quantity: 50 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.quantity).toBe(50);
  });

  it('POST /stock updates existing stock record', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE id.*is_active/, [{ id: 'wh1' }])
      .on(/SELECT id, quantity FROM stock_quant WHERE product_id.*warehouse_id/, [{ id: 'sq1', quantity: 10 }])
      .on(/UPDATE stock_quant SET quantity/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', warehouseId: 'wh1', quantity: 5 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.quantity).toBe(15);
  });

  it('POST /stock rejects invalid warehouse', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE id.*is_active/, null);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', warehouseId: 'wh-invalid', quantity: 50 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ── Stock Transfers ─────────────────────────────────────────────────────────

describe('Stock Transfers', () => {
  it('GET /stock-transfers lists transfers', async () => {
    const db = makeRoutingDb().on(/FROM stock_transfers st/, [
      { id: 'st1', from_warehouse_id: 'wh1', to_warehouse_id: 'wh2', product_id: 'p1', quantity: 10, status: 'draft', from_warehouse_name: 'Main', to_warehouse_name: 'Secondary', product_name: 'Widget' }
    ]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock-transfers'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].status).toBe('draft');
  });

  it('POST /stock-transfers creates a transfer', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE/, [{ id: 'wh1' }])
      .on(/SELECT quantity FROM stock_quant WHERE/, [{ quantity: 100 }])
      .on(/INSERT INTO stock_transfers/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock-transfers', {
      method: 'POST',
      body: JSON.stringify({ fromWarehouseId: 'wh1', toWarehouseId: 'wh2', productId: 'p1', quantity: 10 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.status).toBe('draft');
  });

  it('POST /stock-transfers rejects same warehouse', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock-transfers', {
      method: 'POST',
      body: JSON.stringify({ fromWarehouseId: 'wh1', toWarehouseId: 'wh1', productId: 'p1', quantity: 10 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('differ');
  });

  it('POST /stock-transfers rejects insufficient stock', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM warehouses WHERE id.*is_active/, [{ id: 'wh1' }])
      .on(/SELECT quantity FROM stock_quant/, [{ quantity: 5 }]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock-transfers', {
      method: 'POST',
      body: JSON.stringify({ fromWarehouseId: 'wh1', toWarehouseId: 'wh2', productId: 'p1', quantity: 10 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Insufficient');
  });

  it('PATCH /stock-transfers/:id/confirm confirms transfer and moves stock', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM stock_transfers WHERE/, [{ id: 'st1', status: 'draft', product_id: 'p1', from_warehouse_id: 'wh1', to_warehouse_id: 'wh2', quantity: 10 }])
      .on(/SELECT id, quantity FROM stock_quant WHERE/, [{ id: 'sq1', quantity: 100 }])
      .on(/UPDATE stock_quant SET quantity/, { meta: { changes: 1 } })
      .on(/INSERT INTO stock_quant/, { meta: { changes: 1 } })
      .on(/UPDATE stock_transfers SET/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock-transfers/st1/confirm', { method: 'PATCH' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /stock-transfers/:id/confirm rejects non-draft transfer', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM stock_transfers WHERE/, [{ id: 'st1', status: 'completed', product_id: 'p1', from_warehouse_id: 'wh1', to_warehouse_id: 'wh2', quantity: 10 }]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock-transfers/st1/confirm', { method: 'PATCH' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('current status');
  });
});

// ── Purchase Orders ─────────────────────────────────────────────────────────

describe('Purchase Orders', () => {
  it('GET /purchase-orders lists POs', async () => {
    const db = makeRoutingDb().on(/FROM purchase_orders/, [
      { id: 'po1', po_number: 'PO-00001', vendor_id: 'v1', order_date: '2026-01-01', total_amount: 500, status: 'draft' }
    ]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/purchase-orders'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].poNumber).toBe('PO-00001');
  });

  it('POST /purchase-orders creates a PO with lines', async () => {
    const db = makeRoutingDb()
      .on(/SELECT COUNT/, [{ cnt: 0 }])
      .on(/INSERT INTO purchase_orders/, { meta: { changes: 1 } })
      .on(/INSERT INTO purchase_order_lines/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        orderDate: '2026-01-01',
        lines: [
          { productId: 'p1', quantity: 10, unitPrice: 25 },
          { productId: 'p2', quantity: 5, unitPrice: 50 },
        ],
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.totalAmount).toBe(500);
    expect(body.poNumber).toMatch(/^PO-/);
  });

  it('POST /purchase-orders rejects empty lines', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ orderDate: '2026-01-01', lines: [] }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('PATCH /purchase-orders/:id/receive receives goods and updates stock', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM purchase_orders WHERE/, [{ id: 'po1', status: 'draft' }])
      .on(/SELECT \* FROM purchase_order_lines WHERE/, [{ id: 'pl1', product_id: 'p1', quantity: 10 }])
      .on(/UPDATE purchase_order_lines SET received_quantity/, { meta: { changes: 1 } })
      .on(/SELECT id, quantity FROM stock_quant WHERE product_id.*tenant_id/, [{ id: 'sq1', quantity: 20 }])
      .on(/UPDATE stock_quant SET quantity.*WHERE id.*sq1/, { meta: { changes: 1 } })
      .on(/UPDATE purchase_orders SET status.*received/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/purchase-orders/po1/receive', { method: 'PATCH' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /purchase-orders/:id/receive rejects already received PO', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM purchase_orders WHERE/, [{ id: 'po1', status: 'received' }]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/purchase-orders/po1/receive', { method: 'PATCH' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('already');
  });
});

// ── BOMs ────────────────────────────────────────────────────────────────────

describe('BOMs', () => {
  it('GET /boms lists BOMs with lines', async () => {
    const db = makeRoutingDb()
      .on(/FROM boms b/, [{ id: 'bom1', product_id: 'p1', name: 'Widget BOM', version: 1, product_name: 'Widget' }])
      .on(/FROM bom_lines WHERE/, [{ id: 'bl1', component_id: 'p2', quantity: 2, unit: 'each' }]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/boms'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Widget BOM');
    expect(body[0].lines.length).toBe(1);
  });

  it('POST /boms creates a BOM with lines', async () => {
    const db = makeRoutingDb()
      .on(/INSERT INTO boms/, { meta: { changes: 1 } })
      .on(/INSERT INTO bom_lines/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/boms', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'p1',
        name: 'Widget Assembly',
        lines: [{ componentId: 'p2', quantity: 3 }, { componentId: 'p3', quantity: 1, unit: 'kg' }],
      }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Widget Assembly');
  });

  it('POST /boms rejects empty lines', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/boms', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', name: 'Empty BOM', lines: [] }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Manufacturing Orders ────────────────────────────────────────────────────

describe('Manufacturing Orders', () => {
  it('GET /manufacturing-orders lists MOs', async () => {
    const db = makeRoutingDb().on(/FROM manufacturing_orders mo/, [
      { id: 'mo1', product_id: 'p1', quantity: 100, status: 'draft', produced_quantity: 0, product_name: 'Widget', bom_name: 'Widget BOM' }
    ]);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/manufacturing-orders'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].bomName).toBe('Widget BOM');
  });

  it('POST /manufacturing-orders creates an MO', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM boms WHERE/, [{ id: 'bom1' }])
      .on(/INSERT INTO manufacturing_orders/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/manufacturing-orders', {
      method: 'POST',
      body: JSON.stringify({ bomId: 'bom1', productId: 'p1', quantity: 50 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.quantity).toBe(50);
  });

  it('POST /manufacturing-orders rejects invalid BOM', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM boms WHERE/, null);
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/manufacturing-orders', {
      method: 'POST',
      body: JSON.stringify({ bomId: 'bom-invalid', productId: 'p1', quantity: 50 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
  });

  it('PATCH /manufacturing-orders/:id/progress updates progress', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM manufacturing_orders WHERE/, [{ id: 'mo1', bom_id: 'bom1', quantity: 50 }])
      .on(/UPDATE manufacturing_orders SET/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/manufacturing-orders/mo1/progress', {
      method: 'PATCH',
      body: JSON.stringify({ producedQuantity: 25, status: 'in_production' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /manufacturing-orders/:id/progress completes and consumes components', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM manufacturing_orders WHERE/, [{ id: 'mo1', bom_id: 'bom1', quantity: 10 }])
      .on(/SELECT \* FROM bom_lines WHERE bom_id/, [{ component_id: 'p2', quantity: 2 }])
      .on(/SELECT id, quantity FROM stock_quant WHERE product_id.*tenant_id/, [{ id: 'sq1', quantity: 100 }])
      .on(/UPDATE stock_quant SET quantity.*WHERE id.*sq1/, { meta: { changes: 1 } })
      .on(/UPDATE manufacturing_orders SET/, { meta: { changes: 1 } });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/manufacturing-orders/mo1/progress', {
      method: 'PATCH',
      body: JSON.stringify({ producedQuantity: 10, status: 'completed' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Tenant Isolation ────────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  it('queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM warehouses/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [{ id: 'wh1', name: 'Main', location: 'Cairo', is_active: 1 }], meta: { changes: 0 } };
    });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    await app.request(req('/warehouses'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('stock queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM stock_quant sq/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [], meta: { changes: 0 } };
    });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    await app.request(req('/stock'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('transfer queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM stock_transfers st/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [], meta: { changes: 0 } };
    });
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    await app.request(req('/stock-transfers'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('POST /warehouses rejects empty name', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/warehouses', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /stock rejects invalid quantity type', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/stock', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', warehouseId: 'wh1', quantity: 'not-a-number' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /boms rejects missing productId', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(supplyRouter, { tenantId: 't1' });
    const res = await app.request(req('/boms', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test BOM', lines: [{ componentId: 'p1', quantity: 1 }] }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});
