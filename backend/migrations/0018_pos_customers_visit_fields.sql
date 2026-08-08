-- Migration 0018: Add Visit Fields to POS Customers Table
ALTER TABLE pos_customers ADD COLUMN last_visit DATETIME;
ALTER TABLE pos_customers ADD COLUMN visit_count INTEGER DEFAULT 0;
