#!/usr/bin/env bash
# check-deploy-parity.sh — read-only staging-vs-prod deploy parity probe.
#
# Compares, WITHOUT writing anything anywhere:
#   1. D1 migration ledger head + row count (staging vs production, remote)
#   2. Local migration file count (backend/migrations/*.sql) vs each ledger
#   3. User table count via sqlite_master (staging vs production, remote)
#
# SAFETY CONTRACT (read-only; never auto-touches prod):
#   - Default run (no flags) is a DRY-RUN: prints the exact commands it WOULD
#     run and exits 0. It runs nothing by itself.
#   - Live reads require an explicit env arg AND --live.
#   - Production contact additionally requires --ack-prod (explicit ack).
#   - The only wrangler subcommands ever issued are read-only:
#       d1 migrations list | d1 execute --command "SELECT ..."
#     No export, no migrations apply, no deploy, no secret/config commands.
#
# Usage:
#   ./scripts/check-deploy-parity.sh                        — dry-run plan (default, staging)
#   ./scripts/check-deploy-parity.sh --staging --live       — live read-only probe of staging
#   ./scripts/check-deploy-parity.sh --production --live --ack-prod
#                                                           — live read-only probe of both envs
# Exit codes: 0 = parity holds (or dry-run printed); 1 = mismatch detected;
#             2 = usage / refusal (e.g. prod without --ack-prod).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$REPO_ROOT/backend/migrations"

PROD_DB="campmaster-db"
STAGING_DB="campmaster-db-staging"

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

# ---- local migration file inventory (read-only, always safe) ----
# Top-level *.sql only: legacy/ holds pre-squash history, not applied lineage.
FILE_COUNT="$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
FILE_HEAD="$(ls "$MIGRATIONS_DIR"/*.sql | sort | tail -1 | xargs basename)"

ledger_head_sql="SELECT name FROM d1_migrations ORDER BY name DESC LIMIT 1;"
ledger_count_sql="SELECT COUNT(*) AS ledger_rows FROM d1_migrations;"
table_count_sql="SELECT COUNT(*) AS user_tables FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations';"

probe_db() {
  # $1 = D1 database name, $2 = wrangler env flag ("" or "--env staging")
  local db="$1" env_flag="$2"
  local head count tables
  head=$(cd "$REPO_ROOT/backend" && npx wrangler d1 execute "$db" --remote $env_flag --command "$ledger_head_sql" --json 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const r=j[0].results[0];console.log(r.name||r.NAME||'')}catch(e){console.log('UNREADABLE')}})")
  count=$(cd "$REPO_ROOT/backend" && npx wrangler d1 execute "$db" --remote $env_flag --command "$ledger_count_sql" --json 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const r=j[0].results[0];console.log(r.ledger_rows||r.LEDGER_ROWS||'')}catch(e){console.log('UNREADABLE')}})")
  tables=$(cd "$REPO_ROOT/backend" && npx wrangler d1 execute "$db" --remote $env_flag --command "$table_count_sql" --json 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const r=j[0].results[0];console.log(r.user_tables||r.USER_TABLES||'')}catch(e){console.log('UNREADABLE')}})")
  echo "$head|$count|$tables"
}

echo "deploy parity — env=$ENV live=$LIVE"
echo "local migrations: $FILE_COUNT files, head $FILE_HEAD"

if [ "$LIVE" = false ]; then
  echo ""
  echo "DRY-RUN (no commands executed). With --live this would run, read-only:"
  echo "  cd backend && npx wrangler d1 execute $STAGING_DB --remote --env staging --command \"$ledger_head_sql\""
  echo "  cd backend && npx wrangler d1 execute $STAGING_DB --remote --env staging --command \"$ledger_count_sql\""
  echo "  cd backend && npx wrangler d1 execute $STAGING_DB --remote --env staging --command \"$table_count_sql\""
  if [ "$ENV" = "production" ]; then
    echo "  cd backend && npx wrangler d1 execute $PROD_DB --remote --command \"$ledger_head_sql\""
    echo "  cd backend && npx wrangler d1 execute $PROD_DB --remote --command \"$ledger_count_sql\""
    echo "  cd backend && npx wrangler d1 execute $PROD_DB --remote --command \"$table_count_sql\""
    echo "NOTE: production contact additionally requires --ack-prod."
  fi
  echo "Then compare: ledger head/count staging-vs-prod, file count vs each ledger."
  echo "Exit 1 on any mismatch. No writes are ever issued by this script."
  exit 0
fi

if [ "$ENV" = "production" ] && [ "$ACK_PROD" = false ]; then
  echo "REFUSED: live production contact requires explicit --ack-prod." >&2
  echo "Re-run with: $0 --production --live --ack-prod" >&2
  exit 2
fi

FAILURES=0

echo "probing staging ($STAGING_DB) — read-only SELECT ..."
STAGING_RES="$(probe_db "$STAGING_DB" "--env staging")"
STAGING_HEAD="${STAGING_RES%%|*}"; rest="${STAGING_RES#*|}"
STAGING_COUNT="${rest%%|*}"; STAGING_TABLES="${rest#*|}"
echo "  staging ledger head=$STAGING_HEAD rows=$STAGING_COUNT user_tables=$STAGING_TABLES"

if [ "$STAGING_HEAD" != "$FILE_HEAD" ]; then
  echo "  MISMATCH: staging ledger head ($STAGING_HEAD) != local file head ($FILE_HEAD)"
  FAILURES=$((FAILURES + 1))
fi
if [ "$STAGING_COUNT" != "$FILE_COUNT" ]; then
  echo "  MISMATCH: staging ledger rows ($STAGING_COUNT) != local file count ($FILE_COUNT)"
  FAILURES=$((FAILURES + 1))
fi

if [ "$ENV" = "production" ]; then
  echo "probing production ($PROD_DB) — read-only SELECT (acked) ..."
  PROD_RES="$(probe_db "$PROD_DB" "")"
  PROD_HEAD="${PROD_RES%%|*}"; rest="${PROD_RES#*|}"
  PROD_COUNT="${rest%%|*}"; PROD_TABLES="${rest#*|}"
  echo "  prod ledger head=$PROD_HEAD rows=$PROD_COUNT user_tables=$PROD_TABLES"

  if [ "$PROD_HEAD" != "$FILE_HEAD" ]; then
    echo "  MISMATCH: prod ledger head ($PROD_HEAD) != local file head ($FILE_HEAD)"
    FAILURES=$((FAILURES + 1))
  fi
  if [ "$PROD_COUNT" != "$FILE_COUNT" ]; then
    echo "  MISMATCH: prod ledger rows ($PROD_COUNT) != local file count ($FILE_COUNT)"
    FAILURES=$((FAILURES + 1))
  fi
  if [ "$STAGING_HEAD" != "$PROD_HEAD" ]; then
    echo "  MISMATCH: staging head ($STAGING_HEAD) != prod head ($PROD_HEAD) — staging stale or prod ahead"
    FAILURES=$((FAILURES + 1))
  fi
  if [ "$STAGING_TABLES" != "$PROD_TABLES" ]; then
    echo "  MISMATCH: staging tables ($STAGING_TABLES) != prod tables ($PROD_TABLES)"
    FAILURES=$((FAILURES + 1))
  fi
fi

if [ "$FAILURES" -gt 0 ]; then
  echo "PARITY FAIL: $FAILURES mismatch(es). Do not deploy until resolved."
  exit 1
fi
echo "PARITY OK: ledger head/count and table counts agree (env=$ENV)."
