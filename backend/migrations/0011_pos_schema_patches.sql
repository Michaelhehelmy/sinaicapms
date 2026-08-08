-- Migration 0011: POS Schema Patches
-- Add missing columns to pos_products and pos_categories expected by Hono POS codebase

ALTER TABLE pos_products ADD COLUMN price DECIMAL(10,2) DEFAULT 0.0;
ALTER TABLE pos_products ADD COLUMN stock_quantity INTEGER DEFAULT 0;
ALTER TABLE pos_products ADD COLUMN reorder_level INTEGER DEFAULT 10;
ALTER TABLE pos_products ADD COLUMN image_url TEXT;
ALTER TABLE pos_products ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 0.0;
ALTER TABLE pos_categories ADD COLUMN color TEXT DEFAULT '#1890ff';
