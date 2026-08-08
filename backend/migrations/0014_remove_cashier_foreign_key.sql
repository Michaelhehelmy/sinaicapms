-- Migration 0014: Remove Cashier Foreign Key Constraints
-- Recreate pos_transactions without foreign key constraints on pos_users(id)

-- 1. Rename existing table
ALTER TABLE pos_transactions RENAME TO pos_transactions_old;

-- 2. Create new table without pos_users foreign keys
CREATE TABLE pos_transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
    organization_id INTEGER NOT NULL DEFAULT 1,
    store_id INTEGER NOT NULL DEFAULT 1,
    order_number TEXT UNIQUE NOT NULL,
    transaction_number TEXT,
    customer_id INTEGER,
    cashier_id TEXT NOT NULL,
    order_type TEXT DEFAULT 'sale',
    status TEXT DEFAULT 'pending',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    discount_type TEXT,
    discount_reason TEXT,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    tax_rate REAL DEFAULT 0.1,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    change_amount DECIMAL(10,2) DEFAULT 0,
    payment_method TEXT,
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',
    order_status TEXT DEFAULT 'completed',
    notes TEXT,
    receipt_url TEXT,
    void_reason TEXT,
    voided_by TEXT,
    voided_at DATETIME,
    refunded_amount DECIMAL(12,2) DEFAULT 0,
    refunded_at DATETIME,
    refunded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (store_id) REFERENCES pos_stores(id),
    FOREIGN KEY (customer_id) REFERENCES pos_customers(id)
);

-- 3. Copy data
INSERT INTO pos_transactions (
    id, tenant_id, organization_id, store_id, order_number, transaction_number,
    customer_id, cashier_id, order_type, status, subtotal, discount_amount,
    discount_type, discount_reason, tax_amount, tax_rate, total_amount,
    paid_amount, change_amount, payment_method, points_earned, points_redeemed,
    payment_status, order_status, notes, receipt_url, void_reason, voided_by,
    voided_at, refunded_amount, refunded_at, refunded_by, created_at, updated_at
)
SELECT 
    id, tenant_id, organization_id, store_id, order_number, transaction_number,
    customer_id, CAST(cashier_id AS TEXT), order_type, status, subtotal, discount_amount,
    discount_type, discount_reason, tax_amount, tax_rate, total_amount,
    paid_amount, change_amount, payment_method, points_earned, points_redeemed,
    payment_status, order_status, notes, receipt_url, void_reason, CAST(voided_by AS TEXT),
    voided_at, refunded_amount, refunded_at, CAST(refunded_by AS TEXT), created_at, updated_at
FROM pos_transactions_old;

-- 4. Drop old table
DROP TABLE pos_transactions_old;

-- 5. Recreate Indexes
CREATE INDEX idx_orders_organization_store ON pos_transactions(organization_id, store_id);
CREATE INDEX idx_orders_customer ON pos_transactions(customer_id);
CREATE INDEX idx_orders_cashier ON pos_transactions(cashier_id);
CREATE INDEX idx_orders_date ON pos_transactions(created_at);
CREATE INDEX idx_orders_status ON pos_transactions(status);
CREATE INDEX idx_orders_number ON pos_transactions(order_number);

-- 6. Recreate Trigger
CREATE TRIGGER update_customer_stats_after_order
    AFTER INSERT ON pos_transactions
    WHEN NEW.status = 'completed' AND NEW.customer_id IS NOT NULL
    BEGIN
        UPDATE pos_customers SET 
            total_spent = total_spent + NEW.total_amount,
            total_orders = total_orders + 1,
            average_order_value = (total_spent + NEW.total_amount) / (total_orders + 1),
            last_order_date = DATE(NEW.created_at),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.customer_id;
    END;
