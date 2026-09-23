-- Migration 0062: Move custom fields to project_meta (Phase 5)
--
-- This migration moves ONLY custom/display-only fields from camps to project_meta:
--   - notes: Free-text notes about the camp
--
-- NOTE: The original plan also copied an `activities` column, but this schema
-- lineage never had camps.activities (see migrations ledger through 0060), so
-- that step is intentionally absent.
--
-- Fields that STAY in core columns (queryable):
--   - name, location, start_date, end_date, capacity, status
--
-- Important: Do NOT drop the original columns yet. That happens in Phase 6b
-- (after the table rename) to ensure data safety.

PRAGMA defer_foreign_keys = true;

-- ============================================
-- STEP 1: Copy notes to project_meta
-- ============================================
INSERT INTO project_meta (project_id, meta_key, meta_value, sort_order)
SELECT
  id AS project_id,
  'notes' AS meta_key,
  notes AS meta_value,
  0 AS sort_order
FROM camps
WHERE notes IS NOT NULL AND notes != '';

-- ============================================
-- NOTE: Column drops happen in Phase 6b (after rename)
-- ============================================
-- Do NOT drop notes/activities columns here.
-- Wait until after Phase 6 (rename camps → projects) to ensure
-- all code references have been updated.

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
