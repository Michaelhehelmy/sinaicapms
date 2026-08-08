-- Migration 0015: Relink Transactions Foreign Keys
-- Recreate tables that referenced pos_transactions to update their foreign key definitions from pos_transactions_old back to pos_transactions

DROP TABLE IF EXISTS pos_loyalty_transactions;
CREATE TABLE pos_loyalty_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    order_id TEXT,
    transaction_type TEXT NOT NULL,
    points INTEGER NOT NULL,
    description TEXT,
    expiry_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES pos_customers(id),
    FOREIGN KEY (order_id) REFERENCES pos_transactions(id)
);

DROP TABLE IF EXISTS pos_transaction_items;
CREATE TABLE pos_transaction_items (
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

DROP TABLE IF EXISTS pos_payments;
CREATE TABLE pos_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'VND',
    reference_number TEXT,
    transaction_id TEXT,
    gateway TEXT,
    gateway_response JSON,
    status TEXT DEFAULT 'pending',
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES pos_transactions(id)
);

DROP TABLE IF EXISTS pos_promotion_usage;
CREATE TABLE pos_promotion_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promotion_id INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    customer_id INTEGER,
    discount_amount DECIMAL(10,2) NOT NULL,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (promotion_id) REFERENCES pos_promotions(id),
    FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
    FOREIGN KEY (customer_id) REFERENCES pos_customers(id)
);
