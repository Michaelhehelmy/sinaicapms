-- Migration 0013: POS Inventory Logs and Order Status
-- Create pos_inventory_logs table and add order_status to pos_transactions

ALTER TABLE pos_transactions ADD COLUMN order_status TEXT DEFAULT 'completed';

CREATE TABLE IF NOT EXISTS pos_inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
