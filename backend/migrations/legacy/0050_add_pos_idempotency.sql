-- Migration 0050: POS order idempotency
ALTER TABLE pos_transactions ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_transactions_idempotency
  ON pos_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
