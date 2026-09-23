-- Migration 0108: Phase-2 meals-scope guard (assert-only, no schema/data change).
--
-- WHAT: fail-closed guard + missing-index top-up for the meals scope
-- (meals, meal_categories, meal_schedules). No new columns, no backfill,
-- no rebuild, no lang-table changes, no camp_id removal.
--
-- Recon ground truth: /tmp/opencode/p2-recon.md §5 (task tenant-arch-p2a-recon,
-- 2026-09-23). Schema evidence, all three tables already added + backfilled
-- + enforced:
--   - 0100 ADDED (nullable + lookup index): meals (0100:114-115,
--     idx_meals_project); meal_categories (0100:120-121,
--     idx_meal_categories_project); meal_schedules (0100:126-127,
--     idx_meal_schedules_project).
--   - 0105 BACKFILLED (data-only, NULLs-only): meals → tenant default, 5/5
--     locally (0105:119-123); meal_categories → tenant default, 3/3
--     (0105:128-132); meal_schedules → COALESCE(camp_id, tenant default),
--     locally vacuous (0105:137-142).
--   - 0107 ENFORCED NOT NULL (full rebuilds, plain-INSERT fail-closed copies):
--     meal_categories_new with project_id TEXT NOT NULL (0107:180-187);
--     meals_new with project_id TEXT NOT NULL (0107:190-200); meal_schedules_new
--     with project_id TEXT NOT NULL (0107:259-271); copies 0107:352-400; all
--     pre-existing indexes recreated incl. idx_meals_project (0107:511),
--     idx_meal_categories_project (0107:514), idx_meal_schedules_project
--     (0107:502); PRAGMA foreign_key_check (0107:595).
--
-- PART 1 — fail-closed NULL guards (plain-INSERT idiom): each INSERT below
-- writes exactly one row and ONLY succeeds when its table holds zero NULL
-- project_id values — a residual NULL selects NULL into the NOT NULL guard
-- column, the statement violates the constraint, and D1 aborts the whole
-- migration file atomically (mirrors the 0107 plain-INSERT gate, 0107:41-44).
-- P2-D must additionally run the three COUNT(*) queries remotely first and
-- STOP on any non-zero (mirrors the 0107 gate pattern, 0107:21-24):
--   SELECT COUNT(*) FROM meals WHERE project_id IS NULL;
--   SELECT COUNT(*) FROM meal_categories WHERE project_id IS NULL;
--   SELECT COUNT(*) FROM meal_schedules WHERE project_id IS NULL;
-- (All three return 0 vacuously on near-empty staging — still a valid
-- fail-closed assertion per recon §6.)
--
-- PART 2 — missing-index top-up only: CREATE INDEX IF NOT EXISTS for the three
-- idx_*_project indexes. Expected no-ops (added in 0100, recreated in 0107) —
-- harmless on rerun, protective against any ledger divergence.
--
-- Explicitly OUT of 0108: no ADD COLUMN (exists since 0100), no UPDATE
-- backfill (0105 owns it), no table rebuild (0107 done), no project_id on
-- meal_lang / meal_categories_lang (translation rows follow parents by
-- design), no camp_id removal on meal_schedules (P2 modeling decision, not a
-- guard's job).
--
-- ROLLBACK SAFETY (hard rule 7): the guard table is created AND dropped inside
-- this file, so committed state is unchanged by Part 1; Part 2 uses
-- IF NOT EXISTS indexes. Rollback = no-op (nothing persists on success).

-- ─────────────────────────────────────────────────────────────
-- Part 1: fail-closed NULL guards (one INSERT per table).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _0108_project_guard (ok TEXT NOT NULL);
DELETE FROM _0108_project_guard;

INSERT INTO _0108_project_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM meals WHERE project_id IS NULL) = 0 THEN 'ok' ELSE NULL END;

INSERT INTO _0108_project_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM meal_categories WHERE project_id IS NULL) = 0 THEN 'ok' ELSE NULL END;

INSERT INTO _0108_project_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM meal_schedules WHERE project_id IS NULL) = 0 THEN 'ok' ELSE NULL END;

DROP TABLE _0108_project_guard;

-- ─────────────────────────────────────────────────────────────
-- Part 2: missing-index top-up (expected no-ops).
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meals_project ON meals(project_id);
CREATE INDEX IF NOT EXISTS idx_meal_categories_project ON meal_categories(project_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_project ON meal_schedules(project_id);
