-- Migration 0060: Add unified schema columns to camps (Phase 3)
--
-- Adds:
--   - slug: SEO-friendly URL identifier (unique per tenant)
--   - project_type: Discriminator for business type (camp|store|route|event|custom)
--   - latitude/longitude: Geospatial coordinates
--   - deleted_at: Soft delete support
--   - meta_version: Version tracker for future meta migrations
--   - gallery_images: JSON array of image URLs (display-only)
--   - description: Search snippets and short descriptions
--
-- Note: camps table will be renamed to projects in Phase 6 (after data backfill).

PRAGMA defer_foreign_keys = true;

-- Add slug column (will be backfilled in Phase 4)
ALTER TABLE camps ADD COLUMN slug TEXT;

-- Add project_type discriminator (default 'camp' for existing data)
ALTER TABLE camps ADD COLUMN project_type TEXT NOT NULL DEFAULT 'camp';

-- Add geospatial columns (nullable)
ALTER TABLE camps ADD COLUMN latitude DECIMAL(10, 8);
ALTER TABLE camps ADD COLUMN longitude DECIMAL(11, 8);

-- Add soft delete support
ALTER TABLE camps ADD COLUMN deleted_at DATETIME;

-- Add meta version tracker
ALTER TABLE camps ADD COLUMN meta_version INTEGER DEFAULT 1;

-- Add gallery images (JSON array, display-only)
ALTER TABLE camps ADD COLUMN gallery_images TEXT;

-- Add description for search snippets
ALTER TABLE camps ADD COLUMN description TEXT;

-- Add updated_at trigger
CREATE TRIGGER IF NOT EXISTS trg_camps_updated_at
AFTER UPDATE ON camps
BEGIN
  UPDATE camps SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
