#!/usr/bin/env bash
# SinaiCamps Unified App Deployment
# Deploys: Backend Worker + D1 migrations, then unified frontend to Cloudflare Pages

set -eo pipefail
export NODE_OPTIONS="--dns-result-order=ipv4first"

echo "=================================================="
echo "🚀 SinaiCamps Unified Deployment"
echo "=================================================="

# 1. Deploy Backend Worker
echo ""
echo "── Backend ──"
cd backend
npm ci --no-audit --no-fund

BACKUP_NAME="pre-deploy-$(date +%Y%m%d-%H%M%S)"
echo "Creating D1 backup: $BACKUP_NAME ..."
npx wrangler d1 backup create campmaster-db --name "$BACKUP_NAME" --remote 2>/dev/null || echo "⚠️  Backup skipped"

echo "Applying database migrations..."
npx wrangler d1 migrations apply campmaster-db --remote
echo "Deploying Worker API..."
npx wrangler deploy --minify
cd ..

# 2. Deploy Unified Frontend
echo ""
echo "── Unified Frontend ──"
cd app
npm ci --no-audit --no-fund
npm run build
echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=campmaster-marketplace --branch=production
cd ..

echo ""
echo "=================================================="
echo "🎉 Deployment Complete!"
echo "=================================================="
echo "Backend API:  https://api.sinaicamps.com"
echo "Frontend:     https://sinaicamps.com"
echo "Admin:        https://sinaicamps.com/admin"
echo "POS:          https://acaciacamp.com/pos (tenant-only; apex = branded 404)"
echo "=================================================="
