-- Migration 0046: Repair pos_transaction_items foreign key to pos_products
--
-- Root cause: migration 0042 (cleanup_pos_products) renamed pos_products ->
-- pos_products_old, created a new pos_products, then dropped pos_products_old.
-- SQLite auto-rewrites child-table FK clauses on RENAME, so
-- pos_transaction_items.product_id ended up referencing the now-dropped
-- "pos_products_old" table. Every INSERT into pos_transaction_items then fails
-- FK validation with `D1_ERROR: no such table: main.pos_products_old` — POS cash
-- checkout 500s ("Failed to create order") after the order row is written.
--
-- Fix: recreate pos_transaction_items with product_id correctly referencing
-- pos_products(id), preserving all columns, constraints and existing data.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE pos_transaction_items_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
    order_id TEXT NOT NULL,
    transaction_id TEXT,
    product_id TEXT NOT NULL,
    variant_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    tax_amount DECIMAL(10,2) DEFAULT 0.0,
    discount_amount DECIMAL(10,2) DEFAULT 0.0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
    FOREIGN KEY (product_id) REFERENCES pos_products(id)
);

INSERT INTO pos_transaction_items_new (
    id, tenant_id, order_id, transaction_id, product_id, variant_id,
    quantity, unit_price, subtotal, tax_amount, discount_amount,
    total_amount, notes, created_at, updated_at
)
SELECT
    id, tenant_id, order_id, transaction_id, product_id, variant_id,
    quantity, unit_price, subtotal, tax_amount, discount_amount,
    total_amount, notes, created_at, updated_at
FROM pos_transaction_items;

DROP TABLE pos_transaction_items;
ALTER TABLE pos_transaction_items_new RENAME TO pos_transaction_items;

PRAGMA defer_foreign_keys = OFF;
