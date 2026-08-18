#!/usr/bin/env bash
# SinaiCamps Full Test Suite
# Runs unit/integration (vitest) + E2E (Playwright) against local dev and/or production
#
# Usage:
#   ./test.sh                 — unit tests + E2E against local dev servers
#   ./test.sh --unit-only     — vitest only (no E2E, no servers needed)
#   ./test.sh --e2e-local     — E2E against local dev servers only
#   ./test.sh --e2e-prod      — E2E against production (sinaicamps.com)
#   ./test.sh --e2e-staging   — E2E against staging (staging.sinaicamps.com)
#   ./test.sh --all           — unit + E2E local + E2E production
#   ./test.sh --ci            — unit + E2E local (CI mode: 1 worker, retries 2)
#   ./test.sh --coverage      — unit tests with coverage thresholds check

set -eo pipefail
export NO_COLOR=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_TIME=$(date +%s)
MODE="${1:-full}"
FAILED_SUITES=()
PASSED_SUITES=()

log()   { echo "[$(date +%H:%M:%S)] $*"; }
ok()    { echo "[$(date +%H:%M:%S)] ✅ $*"; }
fail()  { echo "[$(date +%H:%M:%S)] ❌ $*"; }
warn()  { echo "[$(date +%H:%M:%S)] ⚠️  $*"; }
section() { echo ""; echo "━━━ $1 ━━━"; }
elapsed() { echo "$(( $(date +%s) - START_TIME ))s"; }

# ─────────────────────────────────────────────
# Load .env if present
# ─────────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ─────────────────────────────────────────────
# Unit / Integration Tests (vitest)
# ─────────────────────────────────────────────
run_unit_tests() {
  section "Unit & Integration Tests (vitest)"
  local failed=false

  # Backend
  log "Backend unit tests..."
  if (cd "$SCRIPT_DIR/backend" && npx vitest run 2>&1); then
    ok "Backend unit tests passed"
  else
    fail "Backend unit tests FAILED"
    FAILED_SUITES+=("backend-unit")
    failed=true
  fi

  # Frontend
  log "Frontend unit tests..."
  if (cd "$SCRIPT_DIR/app" && npx vitest run 2>&1); then
    ok "Frontend unit tests passed"
  else
    fail "Frontend unit tests FAILED"
    FAILED_SUITES+=("frontend-unit")
    failed=true
  fi

  # Root integration tests (if any)
  if ls "$SCRIPT_DIR"/tests/*.test.* 1>/dev/null 2>&1; then
    log "Root integration tests..."
    if (cd "$SCRIPT_DIR" && npx vitest run 2>&1); then
      ok "Root integration tests passed"
    else
      fail "Root integration tests FAILED"
      FAILED_SUITES+=("root-integration")
      failed=true
    fi
  fi

  if [ "$failed" = false ]; then
    PASSED_SUITES+=("unit")
  fi
}

# ─────────────────────────────────────────────
# E2E Tests — Local Dev (Playwright)
# ─────────────────────────────────────────────
run_e2e_local() {
  section "E2E Tests — Local Dev (wrangler + astro)"
  log "Playwright will auto-start wrangler dev (8787) + astro dev (4320)"

  if (cd "$SCRIPT_DIR" && npx playwright test --config=playwright.config.ts 2>&1); then
    ok "Local E2E tests passed"
    PASSED_SUITES+=("e2e-local")
  else
    fail "Local E2E tests FAILED"
    FAILED_SUITES+=("e2e-local")
  fi
}

# ─────────────────────────────────────────────
# E2E Tests — Production (sinaicamps.com)
# ─────────────────────────────────────────────
run_e2e_production() {
  section "E2E Tests — Production (sinaicamps.com + acaciacamp.com)"
  log "Read-only smoke tests against live production — no local servers needed"
  log "Excludes admin/auth/POS specs (need prod credentials not available here)"
  export API_BASE_URL="https://sinaicamps.com"

  if (cd "$SCRIPT_DIR" && npx playwright test --config=tests/e2e/playwright.production.config.ts 2>&1); then
    ok "Production E2E tests passed"
    PASSED_SUITES+=("e2e-production")
  else
    fail "Production E2E tests FAILED"
    FAILED_SUITES+=("e2e-production")
  fi
}

# ─────────────────────────────────────────────
# E2E Tests — Staging (staging.sinaicamps.com)
# ─────────────────────────────────────────────
run_e2e_staging() {
  section "E2E Tests — Staging (staging.sinaicamps.com)"
  log "Running against live staging — no local servers needed"
  export API_BASE_URL="https://staging.sinaicamps.com"
  export STAGING=1

  if (cd "$SCRIPT_DIR" && npx playwright test --config=tests/e2e/playwright.production.config.ts 2>&1); then
    ok "Staging E2E tests passed"
    PASSED_SUITES+=("e2e-staging")
  else
    fail "Staging E2E tests FAILED"
    FAILED_SUITES+=("e2e-staging")
  fi
}

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
print_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  TEST RESULTS  ($(elapsed))"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ ${#PASSED_SUITES[@]} -gt 0 ]; then
    echo ""
    echo "  ✅ Passed:"
    for s in "${PASSED_SUITES[@]}"; do
      echo "     • $s"
    done
  fi

  if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
    echo ""
    echo "  ❌ Failed:"
    for s in "${FAILED_SUITES[@]}"; do
      echo "     • $s"
    done
  fi

  echo ""
  if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
    echo "  RESULT: ❌ ${#FAILED_SUITES[@]} suite(s) failed"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
  else
    echo "  RESULT: ✅ All suites passed"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  fi
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SinaiCamps Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Mode: $MODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

case "$MODE" in
  --unit-only)
    run_unit_tests
    ;;
  --e2e-local)
    run_e2e_local
    ;;
  --e2e-prod)
    run_e2e_production
    ;;
  --e2e-staging)
    run_e2e_staging
    ;;
  --all)
    run_unit_tests
    run_e2e_local
    run_e2e_production
    ;;
  --ci)
    export CI=true
    run_unit_tests
    run_e2e_local
    ;;
  --coverage)
    run_unit_tests
    ;;
  full|*)
    run_unit_tests
    run_e2e_local
    ;;
esac

print_summary
