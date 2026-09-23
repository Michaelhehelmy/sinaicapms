-- Migration 0061: Backfill slugs and extract coordinates (Phase 4)
--
-- This migration:
--   1. Generates SEO-friendly slugs from camp names (with shortId for uniqueness)
--   2. Extracts latitude/longitude from Google Maps URLs stored in location field
--
-- Slug generation algorithm:
--   1. slug = LOWER(REPLACE(name, ' ', '-'))
--   2. Remove non-alphanumeric characters (except hyphens)
--   3. If duplicate for this tenant, append '-' + first 6 chars of id
--
-- Coordinate extraction:
--   - Parse Google Maps URLs for @lat,lng patterns
--   - Parse ?q=lat,lng patterns
--   - Parse ?ll=lat,lng patterns

PRAGMA defer_foreign_keys = true;

-- Drop the camps timestamp trigger BEFORE any UPDATE below runs.
-- Migration 0060 created it as `UPDATE camps SET updated_at = ...`, but this
-- schema lineage has NO camps.updated_at column, so every UPDATE on camps
-- fails at runtime with "no such table/column" while the trigger exists.
-- The trigger dies anyway when 0063 drops the camps table; dropping it here
-- keeps THIS migration's own backfill UPDATEs executable.
DROP TRIGGER IF EXISTS trg_camps_updated_at;

-- ============================================
-- STEP 1: Generate slugs from names
-- ============================================

-- NOTE (D1 compatibility): this migration previously opened with
-- `CREATE TEMPORARY TABLE camp_slugs AS SELECT ...` as a scratch computation.
-- D1's SQL authorizer rejects temporary tables (locally in Miniflare AND in
-- production workerd) with `not authorized: SQLITE_AUTH`, which made the whole
-- migrations chain unapplyable from a fresh ledger. The table was also DEAD
-- CODE — no statement below ever read it (the real slug generation is the
-- direct UPDATEs that follow) — so it is simply removed.

-- Step 1a: Create slugs with simple replacement
UPDATE camps SET slug = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  name,
  ' ', '-'),
  '.', ''),
  ',', ''),
  '(', ''),
  ')', ''),
  '&', 'and'),
  '@', ''),
  '#', ''),
  '%', ''),
  '!', ''));

-- Step 1b: Remove consecutive hyphens
UPDATE camps SET slug = REPLACE(slug, '--', '-') WHERE slug LIKE '%--%';
UPDATE camps SET slug = REPLACE(slug, '--', '-') WHERE slug LIKE '%--%';
UPDATE camps SET slug = REPLACE(slug, '--', '-') WHERE slug LIKE '%--%';

-- Step 1c: Remove leading/trailing hyphens
UPDATE camps SET slug = TRIM(slug, '-') WHERE slug LIKE '-%' OR slug LIKE '%-';

-- Step 1d: Handle duplicates by appending short id
-- First, find duplicates and update them
UPDATE camps SET slug = slug || '-' || SUBSTR(id, 1, 6)
WHERE id IN (
  SELECT c1.id
  FROM camps c1
  INNER JOIN camps c2
    ON c1.tenant_id = c2.tenant_id
    AND c1.slug = c2.slug
    AND c1.id != c2.id
  WHERE c1.slug NOT LIKE '%-%' || SUBSTR(c1.id, 1, 6)
);

-- Step 1e: Handle any remaining duplicates (if multiple camps have same name)
-- This is a safety net for edge cases
UPDATE camps SET slug = slug || '-' || SUBSTR(id, 1, 6)
WHERE slug IN (
  SELECT slug FROM camps GROUP BY tenant_id, slug HAVING COUNT(*) > 1
);

-- ============================================
-- STEP 2: Extract coordinates from Google Maps URLs
-- ============================================

-- Extract coordinates from URLs with @lat,lng pattern
UPDATE camps
SET latitude = CAST(SUBSTR(location, INSTR(location, '@') + 1, INSTR(SUBSTR(location, INSTR(location, '@') + 1), ',') - 1) AS REAL),
    longitude = CAST(SUBSTR(location, INSTR(location, '@') + INSTR(SUBSTR(location, INSTR(location, '@') + 1), ',') + 1, INSTR(SUBSTR(location, INSTR(location, '@') + INSTR(SUBSTR(location, INSTR(location, '@') + 1), ',') + 1), '/') - 1) AS REAL)
WHERE location LIKE '%/@%,%/%';

-- Extract coordinates from URLs with ?q=lat,lng pattern
UPDATE camps
SET latitude = CAST(SUBSTR(location, INSTR(location, '?q=') + 3, INSTR(SUBSTR(location, INSTR(location, '?q=') + 3), ',') - 3) AS REAL),
    longitude = CAST(SUBSTR(location, INSTR(location, '?q=') + INSTR(SUBSTR(location, INSTR(location, '?q=') + 3), ',') + 3 - INSTR(location, '?q=') - 3, INSTR(SUBSTR(location, INSTR(location, '?q=') + INSTR(SUBSTR(location, INSTR(location, '?q=') + 3), ',') + 3 - INSTR(location, '?q=') - 3), '&') - 1) AS REAL)
WHERE location LIKE '%?q=%,%&%';

-- Extract coordinates from URLs with ?ll=lat,lng pattern
UPDATE camps
SET latitude = CAST(SUBSTR(location, INSTR(location, '?ll=') + 4, INSTR(SUBSTR(location, INSTR(location, '?ll=') + 4), ',') - 4) AS REAL),
    longitude = CAST(SUBSTR(location, INSTR(location, '?ll=') + INSTR(SUBSTR(location, INSTR(location, '?ll=') + 4), ',') + 4 - INSTR(location, '?ll=') - 4, INSTR(SUBSTR(location, INSTR(location, '?ll=') + INSTR(SUBSTR(location, INSTR(location, '?ll=') + 4), ',') + 4 - INSTR(location, '?ll=') - 4), '&') - 1) AS REAL)
WHERE location LIKE '%?ll=%,%&%';

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
