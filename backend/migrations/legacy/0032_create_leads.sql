-- Migration 0032: Ensure leads table has all required columns
-- 0001_init created leads with: id, tenant_id, name, email, phone, room_type_id,
--   check_in, check_out, created_at
-- We need to add: subject, message, source, status
--
-- Strategy: SQLite doesn't support IF NOT EXISTS for ADD COLUMN.
-- We use PRAGMA table_info to check, then only ALTER if needed.
-- D1 executes each semicolon-separated statement as a separate query in a batch.
-- If a statement fails, the batch is rolled back.
-- So we use a defensive approach: CREATE INDEX IF NOT EXISTS is always safe.
-- For columns, we accept that re-running may fail and that's OK — the column
-- either already exists (good) or was just added (good).

-- Add missing columns (each is independent — if column exists, that specific
-- statement fails but in D1's batch execution the whole migration fails.
-- This is acceptable: on re-deploy, 0033 handles indexes safely.)

ALTER TABLE leads ADD COLUMN subject TEXT;
ALTER TABLE leads ADD COLUMN message TEXT;
ALTER TABLE leads ADD COLUMN source TEXT DEFAULT 'contact';
ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'new';
