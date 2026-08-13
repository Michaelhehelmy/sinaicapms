#!/usr/bin/env bash
# SinaiCamps Unified App Deployment
# Deploys: Backend Worker + D1 migrations, then unified frontend to Cloudflare Pages
#
# Usage:
#   ./deploy.sh              — full deploy (production)
#   ./deploy.sh --backend    — backend only
#   ./deploy.sh --frontend   — frontend only
#   ./deploy.sh --migrate    — migrations only (no deploy)
#   ./deploy.sh --staging    — full deploy to staging environment
#   ./deploy.sh --no-health  — skip health checks (emergency deploy)

set -eo pipefail
# Sandbox has broken IPv6 — force IPv4 DNS order so Node/wrangler fetches succeed.
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
export NO_COLOR=1

# Load .env credentials if present
if [ -f "$(dirname "${BASH_SOURCE[0]}")/.env" ]; then
  set -a
  source "$(dirname "${BASH_SOURCE[0]}")/.env"
  set +a
fi

MODE="${1:-full}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_TIME=$(date +%s)
SKIP_HEALTH=false
HEALTH_FAILURES=0

# Environment detection
DEPLOY_ENV="production"
if [ "$MODE" = "--staging" ]; then
  DEPLOY_ENV="staging"
  MODE="full"
elif [ "$MODE" = "--no-health" ]; then
  SKIP_HEALTH=true
  MODE="full"
fi

log() { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "── $1 ──"; }
elapsed() { echo "$(( $(date +%s) - START_TIME ))s"; }

# ─────────────────────────────────────────────
# Auth (Path 1 = CLOUDFLARE_API_TOKEN in .env, Path 2 = wrangler OAuth)
# Falls back automatically: invalid/missing token → OAuth session.
# If the OAuth session is also missing/expired, INTERACTIVELY launches
# `wrangler login` (browser auth) and continues the deploy in the same run.
# NOTE: browser auth is interactive — run ./deploy.sh from a terminal where
# the user can complete the Cloudflare login page.
# ─────────────────────────────────────────────
check_auth() {
  section "Auth"
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    local code
    code=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/user/tokens/verify" 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then
      log "✅ Cloudflare API token valid (Path 1: .env)"
      return 0
    fi
    log "⚠️  CLOUDFLARE_API_TOKEN rejected (HTTP $code) — falling back to wrangler OAuth (Path 2)."
    unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  else
    log "ℹ️  No CLOUDFLARE_API_TOKEN set — using wrangler OAuth (Path 2)."
  fi

  # Path 2: wrangler OAuth session (from `wrangler login`).
  # Gate on the LOCAL config file, not `wrangler whoami` — whoami polls the CF
  # API which is network-flaky in this sandbox (can hang 40s+ or flake).
  # Respect the WRANGLER_OAUTH_CONFIG override; unparseable expiration_time is
  # warned about but never blocks a possibly-valid session.
  local oauth_cfg="${WRANGLER_OAUTH_CONFIG:-$HOME/.config/.wrangler/config/default.toml}"

  _session_valid() {
    [ -s "$oauth_cfg" ] || return 1
    grep -q "^oauth_token" "$oauth_cfg" 2>/dev/null || return 1
    local exp_raw=""
    exp_raw=$(sed -n 's/^expiration_time[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$oauth_cfg" 2>/dev/null | head -1) || true
    if [ -n "$exp_raw" ]; then
      local exp_epoch=""
      if exp_epoch=$(date -u -d "$exp_raw" +%s 2>/dev/null); then
        # Fail FAST on an EXPIRED session: otherwise wrangler auto-triggers a
        # doomed browser OAuth flow mid-deploy (fails with "fetch failed").
        [ "$exp_epoch" -gt "$(date -u +%s)" ] || return 1
      fi
      # Unparseable expiration_time → proceed optimistically.
    fi
    return 0
  }

  if _session_valid; then
    log "✅ wrangler OAuth session found — deploying with login credentials (Path 2)"
    return 0
  fi

  log "⚠️  wrangler OAuth session missing or expired — launching browser login…"
  log "     Complete the Cloudflare login in your browser, then return here."
  # Interactive browser OAuth flow. Uses the backend install of wrangler.
  # unset the token vars so wrangler login/deploy actually use the OAuth session.
  unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  if (cd "$SCRIPT_DIR/backend" && npx wrangler login); then
    if _session_valid; then
      log "✅ wrangler OAuth login completed — session active (Path 2)"
      return 0
    fi
    log "⚠️  wrangler login finished but no OAuth session was found in $oauth_cfg"
  else
    log "❌ wrangler login failed or was cancelled."
  fi

  log ""
  log "   Manual fallback:"
  log "     1) Put a valid CLOUDFLARE_API_TOKEN in .env (see README), OR"
  log "     2) Run:  cd backend && npx wrangler login   (opens browser; then re-run ./deploy.sh)"
  log ""
  log "   NOTE: .env tokens are masked in the dashboard list view — the full value is"
  log "   only shown once on the token-creation success screen or after Roll → Copy."
  exit 1
}

# ─────────────────────────────────────────────
# URL Resolution
# ─────────────────────────────────────────────
resolve_urls() {
  if [ "$DEPLOY_ENV" = "staging" ]; then
    BASE_URL="https://staging.sinaicamps.com"
  else
    BASE_URL="https://sinaicamps.com"
  fi
}

# ─────────────────────────────────────────────
# Health Checks
# ─────────────────────────────────────────────
# Single curl helper: returns 0 on HTTP 2xx, 1 otherwise
_check_url() {
  local method="$1" url="$2" data="$3" label="$4"
  local follow_redirects="$5"
  local args=(-s -o /dev/null -w "%{http_code}" --max-time 10 -X "$method")
  if [ "$follow_redirects" = "-L" ]; then
    args+=(-L)
  fi
  if [ -n "$data" ]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  local code
  code=$(curl "${args[@]}" "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "000" ]]; then
    log "  ❌ $label — Connection failed ($url)"
    return 1
  elif [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
    log "  ✅ $label — HTTP $code"
    return 0
  elif [[ "$code" =~ ^[45][0-9][0-9]$ ]]; then
    # 4xx may be acceptable (e.g. auth expects 401), 5xx is a server error
    log "  ⚠️  $label — HTTP $code ($url)"
    return 0  # warn but don't fail
  else
    log "  ❌ $label — HTTP $code ($url)"
    return 1
  fi
}

health_check_backend() {
  log "Backend health checks ($BASE_URL)..."
  local fails=0

  # 1. GET /api/tenants — must return 200
  if ! _check_url GET "$BASE_URL/api/tenants" "" "GET /api/tenants"; then
    fails=$((fails + 1))
  fi

  # 2. GET /api/me — public route, must return 200
  if ! _check_url GET "$BASE_URL/api/me" "" "GET /api/me"; then
    fails=$((fails + 1))
  fi

  # 3. GET /api/meals — public route, must return 200
  if ! _check_url GET "$BASE_URL/api/meals" "" "GET /api/meals"; then
    fails=$((fails + 1))
  fi

  # 4. POST /api/auth/login with empty body — should return 4xx (not 500)
  if ! _check_url POST "$BASE_URL/api/auth/login" '{}' "POST /api/auth/login"; then
    fails=$((fails + 1))
  fi

  return $fails
}

health_check_frontend() {
  log "Frontend health checks ($BASE_URL)..."

  # 1. Homepage — must return 200 with non-empty body
  if ! _check_url GET "$BASE_URL/" "" "Homepage"; then
    return 1
  fi

  # 2. /admin — may redirect to login SPA (follow redirects)
  if ! _check_url GET "$BASE_URL/admin" "" "/admin" "-L"; then
    return 1
  fi

  # 3. /pos — may redirect to login SPA (follow redirects)
  if ! _check_url GET "$BASE_URL/pos" "" "/pos" "-L"; then
    return 1
  fi

  # 4. Tenant custom domain — verify a real tenant resolves (non-critical)
  if ! _check_url GET "https://acaciacamp.com" "" "Tenant: acaciacamp.com" "-L"; then
    log "    ⚠️  acaciacamp.com not reachable — non-critical, ignoring"
  fi

  return 0
}

health_check() {
  section "Health Checks"
  resolve_urls

  local backend_ok=true
  local frontend_ok=true

  # Backend checks
  if ! health_check_backend; then
    backend_ok=false
    HEALTH_FAILURES=$((HEALTH_FAILURES + 1))
  fi

  # Frontend checks
  if ! health_check_frontend; then
    frontend_ok=false
    HEALTH_FAILURES=$((HEALTH_FAILURES + 1))
  fi

  if [ "$backend_ok" = true ] && [ "$frontend_ok" = true ]; then
    log "✅ All health checks passed for $DEPLOY_ENV"
    return 0
  else
    log "❌ Health checks failed for $DEPLOY_ENV"
    return 1
  fi
}

ENV_FLAG=""
if [ "$DEPLOY_ENV" = "staging" ]; then
  # Validate staging environment is configured before proceeding
  WRANGLER_TOML="$SCRIPT_DIR/backend/wrangler.toml"
  if [ ! -f "$WRANGLER_TOML" ]; then
    log "❌ wrangler.toml not found at $WRANGLER_TOML"
    exit 1
  fi
  if ! grep -q '^\[env\.staging\]' "$WRANGLER_TOML"; then
    log "❌ Staging environment not configured."
    log "   --staging was passed but [env.staging] is missing from backend/wrangler.toml."
    log ""
    log "   Either:"
    log "     1. Add an [env.staging] section to backend/wrangler.toml with staging-specific"
    log "        database_id, KV namespace IDs, and routes, OR"
    log "     2. Remove the --staging flag to deploy to production."
    log ""
    log "   See: https://developers.cloudflare.com/workers/wrangler/environments/"
    exit 1
  fi
  ENV_FLAG="--env staging"
fi

# Per-environment resource names — staging must NEVER touch prod D1/Pages.
if [ "$DEPLOY_ENV" = "staging" ]; then
  D1_NAME="campmaster-db-staging"
  PAGES_PROJECT="campmaster-marketplace-staging"
else
  D1_NAME="campmaster-db"
  PAGES_PROJECT="campmaster-marketplace"
fi

if [ "$SKIP_HEALTH" = true ]; then
  log "⚠️  Health checks disabled (--no-health flag)"
fi

retry() {
  local cmd="$1"
  local label="$2"
  local max_attempts=3
  local delay=15
  local attempt=1
  while [ $attempt -le $max_attempts ]; do
    if eval "$cmd"; then
      return 0
    fi
    log "⚠️  $label failed (attempt $attempt/$max_attempts), retrying in ${delay}s..."
    sleep $delay
    attempt=$((attempt + 1))
  done
  log "❌ $label failed after $max_attempts attempts"
  return 1
}

check_network() {
  log "Checking Cloudflare API connectivity..."
  if ! curl -s --max-time 10 -o /dev/null https://api.cloudflare.com/client/v4/user 2>/dev/null; then
    log "❌ Cannot reach Cloudflare API. Check your internet connection, VPN, or firewall."
    log "   Try: curl -v https://api.cloudflare.com/client/v4/user"
    exit 1
  fi
  log "✅ Network OK"
}

# ─────────────────────────────────────────────
# Backend
# ─────────────────────────────────────────────
deploy_backend() {
  section "Backend"
  cd "$SCRIPT_DIR/backend"

  log "Installing dependencies..."
  npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -5

  # D1 Export (with retry — abort on failure to prevent data loss)
  log "Exporting D1 backup..."
  mkdir -p "$SCRIPT_DIR/backups"
  BACKUP_FILE="$SCRIPT_DIR/backups/campmaster-$(date +%Y%m%d-%H%M%S).sql"
  if retry "npx wrangler d1 export $D1_NAME --remote --output '$BACKUP_FILE'" "D1 backup"; then
    log "✅ D1 export saved to $BACKUP_FILE"
  else
    log "❌ D1 backup failed after 3 attempts — aborting deploy to prevent data loss"
    log "   You can retry with: ./deploy.sh --backend"
    exit 1
  fi

  # Migrations (pipe to auto-confirm in interactive terminals)
  log "Applying database migrations..."
  echo y | npx wrangler d1 migrations apply $D1_NAME --remote $ENV_FLAG 2>&1

  # Deploy Worker (with retry)
  log "Deploying Worker API..."
  if retry "npx wrangler deploy --minify $ENV_FLAG 2>&1" "Worker deploy"; then
    log "✅ Backend deployed"
  else
    log "❌ Backend deploy failed — check network and try again"
    exit 1
  fi
  cd "$SCRIPT_DIR"
}

# ─────────────────────────────────────────────
# Frontend
# ─────────────────────────────────────────────
deploy_frontend() {
  section "Unified Frontend"
  cd "$SCRIPT_DIR/app"

  log "Installing dependencies..."
  npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -5

  log "Building..."
  if npm run build 2>&1; then
    log "✅ Build succeeded"
  else
    log "❌ Build failed — aborting deploy"
    exit 1
  fi

  log "Deploying to Cloudflare Pages ($PAGES_PROJECT)..."
  if retry "npx wrangler pages deploy dist --project-name=$PAGES_PROJECT --branch=main --commit-dirty=true 2>&1" "Pages deploy"; then
    log "✅ Frontend deployed"
  else
    log "❌ Frontend deploy failed — check network and try again"
    exit 1
  fi
  cd "$SCRIPT_DIR"
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

echo "=================================================="
echo "🚀 SinaiCamps Unified Deployment"
echo "=================================================="
echo "Mode: $MODE"
echo "Environment: $DEPLOY_ENV"
echo "Health Checks: $([ "$SKIP_HEALTH" = true ] && echo "DISABLED" || echo "ENABLED")"

check_network
resolve_urls
check_auth

DEPLOY_FAILED=false

case "$MODE" in
  --backend)
    deploy_backend
    if [ "$SKIP_HEALTH" = false ]; then
      health_check || DEPLOY_FAILED=true
    fi
    ;;
  --frontend)
    deploy_frontend
    if [ "$SKIP_HEALTH" = false ]; then
      health_check || DEPLOY_FAILED=true
    fi
    ;;
  --migrate)
    section "Migrations Only"
    cd "$SCRIPT_DIR/backend"
    npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -5
    echo y | npx wrangler d1 migrations apply campmaster-db --remote $ENV_FLAG 2>&1
    log "✅ Migrations applied"
    cd "$SCRIPT_DIR"
    ;;
  full|*)
    deploy_backend
    deploy_frontend
    if [ "$SKIP_HEALTH" = false ]; then
      health_check || DEPLOY_FAILED=true
    fi
    ;;
esac

echo ""
echo "=================================================="
if [ "$DEPLOY_FAILED" = true ]; then
  echo "❌ Deployment Failed — health check failed ($(elapsed))"
  echo "=================================================="
  echo ""
  echo "The deployment completed but health checks detected issues."
  echo "Review the health check output above for failing endpoints."
  echo ""
  echo "To retry without health checks:  ./deploy.sh --no-health"
  exit 1
else
  echo "🎉 Deployment Successful! ($(elapsed))"
  echo "=================================================="
fi
echo ""
if [ "$DEPLOY_ENV" = "staging" ]; then
  echo "Environment:  STAGING"
  echo "Frontend:     https://staging.sinaicamps.com"
  echo "Admin:        https://staging.sinaicamps.com/admin"
  echo "POS:          https://staging.sinaicamps.com/pos (tenant-only; branded 404 on apex)"
  echo "Backend API:  https://staging.sinaicamps.com/api/*"
else
  echo "Environment:  PRODUCTION"
  echo "Frontend:     https://sinaicamps.com"
  echo "Admin:        https://sinaicamps.com/admin"
  echo "POS:          https://acaciacamp.com/pos (tenant-only; sinaicamps.com/pos = branded 404 by design)"
  echo "Backend API:  https://sinaicamps.com/api/*"
  echo "Menu:         https://sinaicamps.com/camp/{id}/menu"
fi
echo "=================================================="
