-- Migration 0098: Storefront checkout — real Paymob payment flow.
-- Mirrors 0087 (booking order Paymob columns) on storefront_orders so the
-- storefront checkout can persist the payment intention and transaction IDs,
-- and the webhook can mark storefront orders as paid.

ALTER TABLE storefront_orders ADD COLUMN payment_intent_id TEXT;
ALTER TABLE storefront_orders ADD COLUMN paymob_transaction_id TEXT;
ALTER TABLE storefront_orders ADD COLUMN paymob_paid_at TEXT;
