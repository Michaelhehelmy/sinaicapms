-- Migration 0003: query indexes for the `checks` probe table.
--
-- NUMBERING: `0002_indexes.sql` (the name used in the FIX-A mission) would
-- collide with the existing `0002_login_attempts.sql` prefix, so the next free
-- number is used: 0003.
--
-- WHAT: three indexes over `checks` (campmaster-monitor-db), one per hot query
--   shape in monitor/src/db.js:
--   1. (target, id DESC)          -> getLatestPerTarget: WHERE id IN
--                                    (SELECT MAX(id) ... GROUP BY target)
--                                    and getLastNChecks: ORDER BY id DESC
--   2. (target, checked_at DESC)  -> getHistory / getUptimeSince:
--                                    WHERE target = ? AND checked_at >= ?
--   3. (checked_at DESC)          -> getLastCheckTime: SELECT MAX(checked_at)
--
-- NOTE (redundancy, deliberate): 0001_init.sql already created
--   `idx_checks_target_checked ON checks (target, checked_at)`. SQLite can
--   traverse an index in either direction, so #2 is largely redundant with it
--   and #3 is a prefix-only extension target; both are kept because the
--   mission calls for three named indexes and the DESC form documents the
--   read direction. 0001's index is NOT dropped (out of scope for FIX A).
--
-- Idempotent: every statement is IF NOT EXISTS, so re-applying is a no-op.
-- Validation is LOCAL ONLY: node:sqlite in-memory apply + EXPLAIN QUERY PLAN
-- (never --remote, no d1 apply).

CREATE INDEX IF NOT EXISTS idx_checks_target_id
  ON checks (target, id DESC);

CREATE INDEX IF NOT EXISTS idx_checks_target_checked_desc
  ON checks (target, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_checks_checked_at
  ON checks (checked_at DESC);