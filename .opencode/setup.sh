#!/bin/bash
# =============================================================================
# OpenCode Workspace — Setup & Template Renderer
# Usage: bash .opencode/setup.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${1}${NC}"; }

log "${GREEN}========================================${NC}"
log "${GREEN}  OpenCode Universal Setup & Renderer   ${NC}"
log "${GREEN}========================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Node.js check (try fnm path first) ───────────────────────────────────
# Check for fnm-installed node in common locations
FNM_NODE_PATH="$HOME/.local/share/fnm/node-versions"
if [ -d "$FNM_NODE_PATH" ]; then
  # Find the latest node version in fnm
  LATEST_NODE=$(ls -1 "$FNM_NODE_PATH" | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
  if [ -n "$LATEST_NODE" ]; then
    export PATH="$FNM_NODE_PATH/$LATEST_NODE/installation/bin:$PATH"
    log "${GREEN}✅ Found fnm Node.js $LATEST_NODE${NC}"
  fi
fi

if ! command -v node &>/dev/null; then
  log "${RED}ERROR: Node.js is required to render workspace templates.${NC}"
  log "${YELLOW}  Install via fnm: curl -fsSL https://fnm.vercel.app/install | bash${NC}"
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_BIN_DIR="$(dirname "$NODE_BIN")"
NODE_VERSION=$(node --version)
log "${GREEN}✅ Node.js: $NODE_VERSION ($NODE_BIN)${NC}"

# ── 2. Create stable node/npx symlinks in ~/.local/bin ───────────────────────
# This ensures Electron desktop apps (which launch without shell PATH) can find node.
STABLE_BIN_DIR="$HOME/.local/bin"
mkdir -p "$STABLE_BIN_DIR"
for bin in node npm npx; do
  bin_path="$(command -v $bin 2>/dev/null || true)"
  if [ -n "$bin_path" ] && [ ! -L "$STABLE_BIN_DIR/$bin" ]; then
    ln -sf "$bin_path" "$STABLE_BIN_DIR/$bin"
    log "${GREEN}  ✅ Symlinked $bin → $bin_path${NC}"
  elif [ -n "$bin_path" ]; then
    # Update symlink in case node version changed
    ln -sf "$bin_path" "$STABLE_BIN_DIR/$bin"
  fi
done

# ── 3. Install Renderer & MCP dependencies ───────────────────────────────────
log "${YELLOW}📦 Installing workspace dependencies (mustache + MCPs)...${NC}"
npm install --prefix "$SCRIPT_DIR" --prefer-offline 2>/dev/null || npm install --prefix "$SCRIPT_DIR"
log "${GREEN}✅ Workspace dependencies installed${NC}"

# ── 3.5 Install OpenCode Plugins ─────────────────────────────────────────────
log "${YELLOW}🔌 Installing OpenCode plugins...${NC}"

# Official plugins from npm (3)
log "${YELLOW}  📦 Installing official plugins from npm...${NC}"
npm install --prefix "$SCRIPT_DIR" opencode-plugin-compose 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-plugin-compose${NC}"
npm install --prefix "$SCRIPT_DIR" opencode-plugin-inspector 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-plugin-inspector${NC}"
npm install --prefix "$SCRIPT_DIR" opencode-plugin-notification 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-plugin-notification${NC}"

# Community plugins from GitHub (14)
log "${YELLOW}  📦 Installing community plugins from GitHub...${NC}"
npm install --prefix "$SCRIPT_DIR" github:tickernelz/opencode-mem 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-mem${NC}"
npm install --prefix "$SCRIPT_DIR" github:Tarquinen/opencode-smart-title 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-smart-title${NC}"
npm install --prefix "$SCRIPT_DIR" github:ramtinJ95/opencode-tokenscope 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-tokenscope${NC}"
npm install --prefix "$SCRIPT_DIR" github:gotgenes/opencode-agent-identity 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-agent-identity${NC}"
npm install --prefix "$SCRIPT_DIR" github:athal7/opencode-pilot 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-pilot${NC}"
npm install --prefix "$SCRIPT_DIR" github:numman-ali/openskills 2>/dev/null || log "${YELLOW}  ⚠️ Could not install openskills${NC}"
npm install --prefix "$SCRIPT_DIR" github:kdcokenny/opencode-notify 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-notify${NC}"
npm install --prefix "$SCRIPT_DIR" github:AnganSamadder/opentmux 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opentmux${NC}"
npm install --prefix "$SCRIPT_DIR" github:code-yeongyu/oh-my-openagent 2>/dev/null || log "${YELLOW}  ⚠️ Could not install oh-my-openagent${NC}"
npm install --prefix "$SCRIPT_DIR" github:kdcokenny/opencode-worktree 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-worktree${NC}"
npm install --prefix "$SCRIPT_DIR" github:malhashemi/opencode-sessions 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-sessions${NC}"
npm install --prefix "$SCRIPT_DIR" github:JosXa/opencode-snippets 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-snippets${NC}"
npm install --prefix "$SCRIPT_DIR" github:spoons-and-mirrors/subtask2 2>/dev/null || log "${YELLOW}  ⚠️ Could not install subtask2${NC}"
npm install --prefix "$SCRIPT_DIR" github:Lyapsus/opencode-optimal-model-temps 2>/dev/null || log "${YELLOW}  ⚠️ Could not install opencode-optimal-model-temps${NC}"

log "${GREEN}✅ Plugins installation complete${NC}"

# ── 4. Render Templates ──────────────────────────────────────────────────────
log "${YELLOW}⚙️  Generating project configuration and agent assets...${NC}"
node lib/detect.js
node lib/render.js

# ── 5. Load environment variables from .env if present ───────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  log "${YELLOW}📋 Loading environment from .env...${NC}"
  set -a
  source "$ENV_FILE"
  set +a
  log "${GREEN}✅ Environment loaded from .env${NC}"
else
  log "${YELLOW}⚠️  No .env file found. Create one for API tokens.${NC}"
  # Create .env template
  log "${YELLOW}📝 Creating .env template...${NC}"
  cat > "$ENV_FILE" <<'ENV_TEMPLATE'
# OpenCode Workspace Environment Variables
# Copy this file to .env and fill in your tokens

# === Core ===
# GitHub MCP (required for github server)
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here

# === Memory & Knowledge Graph ===
# MEMORY_FILE_PATH=./.opencode/memory/memory.json

# === Database Adapters ===
# DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
# DB_TYPE=postgres
# MYSQL_URL=mysql://user:pass@localhost:3306/mydb

# === Search ===
# MEILISEARCH_HOST=http://localhost:7700
# MEILISEARCH_API_KEY=your_key
# ELASTICSEARCH_URL=http://localhost:9200
# ELASTICSEARCH_API_KEY=your_key

# === Communication ===
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=your_email
# SMTP_PASS=your_password
# SLACK_BOT_TOKEN=xoxb-your-token
# SLACK_TEAM_ID=T00000000
# DISCORD_BOT_TOKEN=your_discord_token

# === Infrastructure & Cloud ===
# DOCKER_HOST=unix:///var/run/docker.sock
# KUBERNETES_KUBECONFIG=~/.kube/config
# AWS_ACCESS_KEY_ID=your_aws_key
# AWS_SECRET_ACCESS_KEY=your_aws_secret
# AWS_REGION=us-east-1
# AZURE_SUBSCRIPTION_ID=your_subscription_id
# AZURE_TENANT_ID=your_tenant_id
# GCP_PROJECT_ID=your_project_id

# === Media & Content ===
# DALE_API_KEY=your_openai_key_for_dalle
# STABILITY_API_KEY=your_stability_key
# PDF_OUTPUT_DIR=./.opencode/output/docs

# === Error Tracking & Analytics ===
# SENTRY_DSN=https://key@o0.ingest.sentry.io/project
# POSTHOG_API_KEY=phc_your_key
# POSTHOG_HOST=https://app.posthog.com

# === Feature Flags ===
# UNLEASH_URL=http://localhost:4242
# UNLEASH_API_TOKEN=your_unleash_token

# === Cloudflare MCP (optional) ===
# CLOUDFLARE_API_TOKEN=your_token
# CLOUDFLARE_ACCOUNT_ID=your_account_id

# === Linear MCP (optional) ===
# LINEAR_API_KEY=your_key
ENV_TEMPLATE
  log "${GREEN}✅ Created .env template at $ENV_FILE${NC}"
  log "${YELLOW}   Edit it to add your API tokens${NC}"
fi

# ── 6. Detect installed MCPs and generate configs ───────────────────────────
log "${YELLOW}🔍 Detecting installed MCP servers...${NC}"

# Use Node.js script for proper JSON generation
node "$SCRIPT_DIR/lib/generate-config.js"
log "${GREEN}✅ MCP configs generated successfully${NC}"

# ── 7. Patch desktop app launcher for permanent Node PATH ────────────────────
# The Electron desktop app launches without shell PATH so node is not found.
# We write a user-local .desktop override that injects the correct PATH.
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/@opencode-aidesktop.desktop"
SYSTEM_DESKTOP="/usr/share/applications/@opencode-aidesktop.desktop"

if [ -f "$SYSTEM_DESKTOP" ]; then
  mkdir -p "$DESKTOP_DIR"
  DESKTOP_PATH_ENV="$STABLE_BIN_DIR:$NODE_BIN_DIR:$HOME/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Name=OpenCode
Exec=env PATH=$DESKTOP_PATH_ENV "/opt/OpenCode/@opencode-aidesktop" %U
Terminal=false
Type=Application
Icon=@opencode-aidesktop
StartupWMClass=OpenCode
MimeType=x-scheme-handler/opencode;
Categories=Development;
DESKTOP
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  log "${GREEN}✅ Desktop launcher patched with Node PATH${NC}"
else
  log "${YELLOW}  ℹ️  Desktop app not installed, skipping launcher patch${NC}"
fi

# ── 8. Verify OpenCode installation ─────────────────────────────────────────
log "${YELLOW}🔍 Checking OpenCode installation...${NC}"
if command -v opencode &>/dev/null; then
  OC_VERSION=$(opencode --version 2>/dev/null || echo "unknown")
  log "${GREEN}  ✅ OpenCode $OC_VERSION is installed${NC}"
else
  log "${YELLOW}  ⚠️  OpenCode not found. Install it: curl -fsSL https://opencode.ai/install | bash${NC}"
fi

log "${GREEN}========================================${NC}"
log "${GREEN}  ✅ Workspace bootstrap complete!      ${NC}"
log "${GREEN}========================================${NC}"
log "Run 'opencode' in the project root to start."
log ""
