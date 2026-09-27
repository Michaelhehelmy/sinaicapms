#!/usr/bin/env bash
# deploy-preflight.sh — read-only pre-deploy gate: backup + parity + id match.
#
# Checks, WITHOUT deploying or writing to any remote:
#   1. Backup freshness: a non-empty backups/campmaster-*.sql newer than 24h
#      exists (deploy.sh takes one automatically; this only VERIFIES).
#   2. Parity: delegates to scripts/check-deploy-parity.sh (same safety
#      contract — dry-run by default, --live for reads, --ack-prod for prod).
#   3. wrangler.toml id match: [default] database_id == prod id and
#      [env.staging] database_id == staging id (local grep, no network).
#   4. Migration file count sanity: top-level backend/migrations/*.sql count
#      reported alongside the parity result (equality enforced by the parity
#      script in --live mode; dry-run prints both numbers for eyeball check).
#
# SAFETY CONTRACT: read-only. Never runs deploy.sh, never applies migrations,
# never touches prod without --live --ack-prod. Default (no flags) runs local
# checks only (1, 3, 4-local) + parity dry-run, and exits non-zero if any
# local check fails.
#
# Usage:
#   ./scripts/deploy-preflight.sh                       — local checks + parity dry-run (staging)
#   ./scripts/deploy-preflight.sh --staging --live      — plus live staging reads
#   ./scripts/deploy-preflight.sh --production --live --ack-prod
#                                                       — plus live both-env reads
# Exit codes: 0 = all checks pass; 1 = any check fails; 2 = usage/refusal.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$REPO_ROOT/backend/migrations"
WRANGLER_TOML="$REPO_ROOT/backend/wrangler.toml"
BACKUP_DIR="$REPO_ROOT/backups"

PROD_DB_ID="1008d7ef-c64a-4594-a500-2e09e07e0e12"
STAGING_DB_ID="40f944f2-2d50-42b5-91bd-e629585c428c"

ENV="staging"
LIVE=false
ACK_PROD=false

usage() {
  sed -n '2,22p' "${BASH_SOURCE[0]}"
}

for arg in "$@"; do
  case "$arg" in
    --staging|staging) ENV="staging" ;;
    --production|production|prod) ENV="production" ;;
    --live) LIVE=true ;;
    --ack-prod) ACK_PROD=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

FAILURES=0
fail() { echo "  FAIL: $1"; FAILURES=$((FAILURES + 1)); }
pass() { echo "  OK: $1"; }

echo "deploy preflight — env=$ENV live=$LIVE"

# ---- 1. backup freshness (local, read-only) ----
echo "[1/4] backup freshness ($BACKUP_DIR) ..."
LATEST_BACKUP="$(ls -t "$BACKUP_DIR"/campmaster-*.sql 2>/dev/null | head -1 || true)"
if [ -z "$LATEST_BACKUP" ]; then
  fail "no backups/campmaster-*.sql found — take one before deploying (deploy.sh takes one automatically)"
elif [ ! -s "$LATEST_BACKUP" ]; then
  fail "latest backup $LATEST_BACKUP is empty — abort, do not deploy"
elif [ "$LATEST_BACKUP" -ot "$BACKUP_DIR" ]; then
  : # placeholder keeps the chain readable; age check below is authoritative
fi
if [ -n "$LATEST_BACKUP" ] && [ -s "$LATEST_BACKUP" ]; then
  if [ "$(find "$BACKUP_DIR" -maxdepth 1 -name 'campmaster-*.sql' -mtime -1 | wc -l | tr -d ' ')" -eq 0 ]; then
    fail "latest backup $LATEST_BACKUP is older than 24h — refresh before deploying"
  else
    pass "fresh non-empty backup present: $(basename "$LATEST_BACKUP") ($(wc -c < "$LATEST_BACKUP") bytes)"
  fi
fi

# ---- 2. parity (delegated; inherits its safety contract) ----
echo "[2/4] parity (scripts/check-deploy-parity.sh) ..."
PARITY_ARGS="--$ENV"
if [ "$LIVE" = true ]; then PARITY_ARGS="$PARITY_ARGS --live"; fi
if [ "$ACK_PROD" = true ]; then PARITY_ARGS="$PARITY_ARGS --ack-prod"; fi
# shellcheck disable=SC2086
if "$SCRIPT_DIR/check-deploy-parity.sh" $PARITY_ARGS; then
  pass "parity script passed (dry-run unless --live)"
else
  fail "parity script reported mismatch/refusal (see above)"
fi

# ---- 3. wrangler.toml id match (local grep, no network) ----
echo "[3/4] wrangler.toml database_id match ..."
if [ ! -f "$WRANGLER_TOML" ]; then
  fail "wrangler.toml not found at $WRANGLER_TOML"
else
  if grep -q "database_id = \"$PROD_DB_ID\"" "$WRANGLER_TOML"; then
    pass "prod database_id $PROD_DB_ID present"
  else
    fail "prod database_id $PROD_DB_ID NOT found in backend/wrangler.toml"
  fi
  if grep -q "database_id = \"$STAGING_DB_ID\"" "$WRANGLER_TOML"; then
    pass "staging database_id $STAGING_DB_ID present"
  else
    fail "staging database_id $STAGING_DB_ID NOT found in backend/wrangler.toml"
  fi
  if grep -q '^\[env\.staging\]' "$WRANGLER_TOML"; then
    pass "[env.staging] section present"
  else
    fail "[env.staging] section missing — --staging deploys would abort"
  fi
fi

# ---- 4. migration file count sanity (local, read-only) ----
echo "[4/4] migration file inventory ..."
FILE_COUNT="$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
FILE_HEAD="$(ls "$MIGRATIONS_DIR"/*.sql | sort | tail -1 | xargs basename)"
echo "  local: $FILE_COUNT top-level migration files, head $FILE_HEAD"
echo "  (ledger-count equality is enforced by the parity script in --live mode)"
if [ "$FILE_COUNT" -eq 0 ]; then
  fail "zero migration files found — inventory broken"
else
  pass "inventory readable: $FILE_COUNT files"
fi

if [ "$FAILURES" -gt 0 ]; then
  echo "PREFLIGHT FAIL: $FAILURES check(s) failed. Do not deploy."
  exit 1
fi
echo "PREFLIGHT OK (env=$ENV, live=$LIVE). Safe to proceed with ./deploy.sh."
