-- Migration 0119: Phase 4e — pos_shifts.store_id (nullable, schema + backfill).
--
-- WHAT: adds a nullable `store_id INTEGER REFERENCES pos_stores(id) ON DELETE SET NULL`
-- to pos_shifts plus an index, then backfills it from the cashier's store
-- (pos_users.store_id). Shifts belong to one project store (Option Y,
-- design §6): open/close/active + the close till-math scope by
-- tenant + cashier + store so two project stores (Camp + Restaurant) run
-- simultaneous shifts whose totals never cross.
--
-- WHY store_id (not project_id): the store record is already authoritative for
-- project scope (4c resolveStoreProjectId); the project follows the store, so
-- binding the shift to the store binds it to the project with no second
-- source of truth. pos_shifts has NO store/project column today (0004_pos.sql
-- DDL) — hence this migration (additive nullable, no enforcement; legacy
-- NULL rows keep tenant+cashier behavior in the handlers).
--
-- BACKFILL JOIN TYPE NOTE: pos_users.id is INTEGER AUTOINCREMENT while
-- pos_shifts.cashier_id is TEXT, so the join CASTs (plain `=` across
-- INTEGER/TEXT never matches in SQLite). Cashiers since deleted or with NULL
-- store stay NULL (legacy semantics, countable below).
--
-- IDEMPOTENCY: ALTER/INDEX use IF NOT EXISTS semantics via the ledger (each
-- migration applies once); the UPDATE touches only NULL rows, so reruns are
-- no-ops. Data-only + DDL-additive, forward-only.
--
-- ROLLBACK SAFETY (hard rule 7): forward-only. Rollback = restore from
-- pre-apply backup, or (SQLite 3.35+) a follow-up migration with
-- `ALTER TABLE pos_shifts DROP COLUMN store_id`. Run BEFORE any 4f+
-- enforcement migration turns store_id NOT NULL.
--
-- TOUCH DISCIPLINE: this file touches pos_shifts ONLY. It does NOT touch
-- pos_users (GENERATED name → first_name/last_name ONLY; organization_id
-- INTEGER NOT NULL), pos_transactions (cashier_id, not staff_id), or any
-- other table. No KV writes (free-plan 1,000 writes/day quota).

ALTER TABLE pos_shifts ADD COLUMN store_id INTEGER REFERENCES pos_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_shifts_store ON pos_shifts(store_id);

-- Backfill from the cashier's store (see TYPE NOTE above).
UPDATE pos_shifts SET store_id = (
  SELECT store_id FROM pos_users
  WHERE CAST(pos_users.id AS TEXT) = pos_shifts.cashier_id
) WHERE store_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- VERIFY (post-apply, read-only — comments only, not executed statements).
-- ─────────────────────────────────────────────────────────────
-- Expect 0 unbound rows whose cashier still holds a store:
-- SELECT COUNT(*) AS shifts_missing_store FROM pos_shifts s
-- WHERE s.store_id IS NULL
--   AND EXISTS (
--     SELECT 1 FROM pos_users u
--     WHERE CAST(u.id AS TEXT) = s.cashier_id AND u.store_id IS NOT NULL
--   );
-- Residual NULLs (deleted cashier / NULL-store cashier) keep legacy behavior:
-- SELECT COUNT(*) AS legacy_null_shifts FROM pos_shifts WHERE store_id IS NULL;
