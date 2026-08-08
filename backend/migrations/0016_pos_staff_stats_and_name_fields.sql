-- Migration 0016: POS Staff Stats and Name Fields
-- Add generated name columns to pos_users and pos_customers, and create pos_staff_stats table

ALTER TABLE pos_users ADD COLUMN name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
ALTER TABLE pos_customers ADD COLUMN name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;

CREATE TABLE IF NOT EXISTS pos_staff_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    total_sales DECIMAL(12,2) DEFAULT 0.0,
    total_orders INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    commission_earned DECIMAL(10,2) DEFAULT 0.0,
    current_streak INTEGER DEFAULT 0,
    last_sale DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
