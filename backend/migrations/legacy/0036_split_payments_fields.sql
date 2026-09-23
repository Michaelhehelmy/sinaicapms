-- Migration 0036: Split Payment Fields
-- Adds cash/card breakdown columns to pos_transactions for split payment support.

ALTER TABLE pos_transactions ADD COLUMN amount_cash REAL DEFAULT 0.0;
ALTER TABLE pos_transactions ADD COLUMN amount_card REAL DEFAULT 0.0;
