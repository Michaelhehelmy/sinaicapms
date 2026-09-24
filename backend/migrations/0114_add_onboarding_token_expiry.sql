-- Migration 0114: onboarding token 7-day expiry (U-004 — additive-only).
--
-- WHAT: a single nullable TEXT column `onboarding_token_expires_at` on
-- tenants, backfilled to now+7d for every row that currently holds a live
-- onboarding bearer token. The signup handler (backend/src/api/onboarding.js)
-- stamps the same +7d ISO value at generation; every onboarding_token read
-- path (status / setup / partial-update) rejects a past expiry with 410, and
-- completion burns BOTH columns to NULL (single-use).
--
-- WHY (U-004, LOW, CONFIRMED): the onboarding bearer token is UUIDv4 (122-bit,
-- unguessable) and single-use-burned, but had NO TTL — a leaked signup link
-- stayed valid indefinitely until the wizard completed, while the adjacent
-- auto_login_token already carries a 24h expiry. This column closes the
-- unbounded exposure window to 7 days.
--
-- BACKFILL: `datetime('now', '+7 days')` (UTC, SQLite native format) for
-- existing non-null tokens. The JS read-path compares with
-- `new Date(value).getTime() < Date.now()`; a NULL expiry is treated as valid
-- (legacy rows the backfill could not see), so no live token is bricked.
--
-- ROLLBACK SAFETY (hard rule 7): additive-only migration. Rollback = DROP the
-- column (SQLite ≥3.35: `ALTER TABLE tenants DROP COLUMN
-- onboarding_token_expires_at`). No table is rebuilt and no existing column is
-- touched, so committed state of every other object is unchanged by this file.

ALTER TABLE tenants ADD COLUMN onboarding_token_expires_at TEXT;
UPDATE tenants SET onboarding_token_expires_at = datetime('now', '+7 days') WHERE onboarding_token IS NOT NULL AND onboarding_token_expires_at IS NULL;
