-- 0087: Paymob payment-tracking columns on orders
-- Adds intent, transaction, and verification fields so online
-- pre-reservations can record their Paymob payment flow.

ALTER TABLE orders ADD COLUMN payment_intent_id TEXT;
ALTER TABLE orders ADD COLUMN paymob_transaction_id TEXT;
ALTER TABLE orders ADD COLUMN paymob_paid_at TEXT;
ALTER TABLE orders ADD COLUMN verified_by TEXT;
