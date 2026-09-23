-- Migration 0030: Add currency column to tenants table
ALTER TABLE tenants ADD COLUMN currency TEXT DEFAULT 'USD';
