-- Baseline 0008_supply.sql: supply chain + inventory ledger.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: warehouses, stock_quant, stock_transfers, purchase_orders, purchase_order_lines, boms, bom_lines, manufacturing_orders, inventory_adjustments
PRAGMA defer_foreign_keys = ON;

CREATE TABLE warehouses (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name)
);

CREATE TABLE stock_quant (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, warehouse_id)
);

CREATE TABLE stock_transfers (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  to_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'confirmed', 'in_transit', 'completed', 'canceled')),
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  vendor_id TEXT,
  order_date TEXT NOT NULL,
  expected_delivery TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'received', 'canceled')),
  total_amount REAL DEFAULT 0,
  created_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE purchase_order_lines (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE boms (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE bom_lines (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  bom_id TEXT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'each',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE manufacturing_orders (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bom_id TEXT NOT NULL REFERENCES boms(id),
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'planned', 'in_production', 'completed', 'canceled')),
  start_date TEXT,
  end_date TEXT,
  produced_quantity INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE inventory_adjustments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  adjustment INTEGER NOT NULL,          
  reason TEXT NOT NULL DEFAULT 'manual', 
  reference TEXT,                        
  notes TEXT,
  created_by TEXT,                       
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_bom_lines_bom ON bom_lines(bom_id);
CREATE INDEX idx_boms_tenant ON boms(tenant_id);
CREATE INDEX idx_inv_adj_date ON inventory_adjustments(created_at);
CREATE INDEX idx_inv_adj_product ON inventory_adjustments(product_id);
CREATE INDEX idx_inv_adj_tenant ON inventory_adjustments(tenant_id);
CREATE INDEX idx_manufacturing_orders_status ON manufacturing_orders(status);
CREATE INDEX idx_manufacturing_orders_tenant ON manufacturing_orders(tenant_id);
CREATE INDEX idx_purchase_order_lines_po ON purchase_order_lines(po_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX idx_stock_quant_product ON stock_quant(product_id);
CREATE INDEX idx_stock_quant_tenant ON stock_quant(tenant_id);
CREATE INDEX idx_stock_quant_warehouse ON stock_quant(warehouse_id);
CREATE INDEX idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX idx_stock_transfers_tenant ON stock_transfers(tenant_id);
CREATE INDEX idx_warehouses_tenant ON warehouses(tenant_id);
