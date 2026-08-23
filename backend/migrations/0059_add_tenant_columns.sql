-- Migration 0059: Add unified schema columns to tenants (Phase 2)
--
-- Adds:
--   - business_type: Renamed semantic from 'type' (camp/supermarket/transportation/custom)
--   - latitude/longitude: Geospatial coordinates for future geo queries
--   - deleted_at: Soft delete support (like pos_products, pos_users)
--   - meta_version: Version tracker for future meta migrations
--
-- Note: The existing 'type' column is NOT renamed (would break existing queries).
-- business_type is added as a new column with the same default. Once all code
-- references business_type, the old 'type' column can be dropped in a future migration.

PRAGMA defer_foreign_keys = true;

-- Add business_type column (same values as 'type', but semantically clearer)
ALTER TABLE tenants ADD COLUMN business_type TEXT NOT NULL DEFAULT 'camp';

-- Add geospatial columns (nullable — not all tenants need geo)
ALTER TABLE tenants ADD COLUMN latitude DECIMAL(10, 8);
ALTER TABLE tenants ADD COLUMN longitude DECIMAL(11, 8);

-- Add soft delete support
ALTER TABLE tenants ADD COLUMN deleted_at DATETIME;

-- Add meta version tracker for future migrations
ALTER TABLE tenants ADD COLUMN meta_version INTEGER DEFAULT 1;

-- Backfill business_type from existing 'type' column
UPDATE tenants SET business_type = type WHERE business_type = 'camp' AND type != 'camp';

-- Add updated_at if not exists (some tenants may not have it)
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we use a trigger instead
CREATE TRIGGER IF NOT EXISTS trg_tenants_updated_at
AFTER UPDATE ON tenants
BEGIN
  UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
