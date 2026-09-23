-- Migration 0064: Drop old columns from projects (Phase 6b)
--
-- This migration drops the notes and activities columns from projects
-- after they have been successfully moved to project_meta.
--
-- IMPORTANT: Only run this AFTER:
--   - Phase 5: Data copied to project_meta
--   - Phase 6: Table renamed to projects
--   - Phase 8: Backend APIs updated to read from project_meta
--   - Phase 9: Frontend updated to read from project_meta
--
-- This is a DESTRUCTIVE migration. Ensure all code references are updated first.

PRAGMA defer_foreign_keys = true;

-- Drop notes column (data now in project_meta)
-- ALTER TABLE projects DROP COLUMN notes;

-- Drop activities column (data now in project_meta)
-- ALTER TABLE projects DROP COLUMN activities;

-- NOTE: These are commented out until Phase 8/9 are complete.
-- Uncomment only after verifying all code references have been updated.

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
