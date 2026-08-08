---
name: deploy-to-server
description: Build and deploy SinaiCamps to production (Cloudflare Pages + Workers)
---

## When to use
When requested to release, deploy, or push changes to production.

## What deploys where (isolated layers)
- **Frontend** (`app/`) → Cloudflare **Pages** project `campmaster-marketplace` (serves everything except `/api/*`).
- **Backend API** (`backend/`) → Cloudflare **Worker** `campmaster-backend` (serves `sinaicamps.com/api/*` via Worker routes).
- **Database** → D1 migrations applied to `campmaster-db` (only reachable inside the Worker).

## Steps

1. **Verify tests pass**
   - `cd app && npx vitest run` and `cd backend && npx vitest run` (1241 and 797 tests respectively).

2. **Deploy**
   ```bash
   ./deploy.sh            # D1 backup → migrations → backend Worker → frontend Pages
   ./deploy.sh --backend  # backend only
   ./deploy.sh --frontend # frontend only
   ./deploy.sh --no-health  # emergency: skip health checks
   ```
   - Health checks hit `/api/tenants`, `/api/me`, `/api/meals` (200) and `/api/auth/login` (4xx).

3. **Verify online status**
   - `curl https://sinaicamps.com/api/tenants` → 200
   - `curl https://sinaicamps.com/` → 200 (marketplace), `curl https://acaciacamp.com/` → 200 (tenant landing)
   - `/camps` → 200, `/rooms` on marketplace → 404 (zone exclusivity)

4. **KV / rate-limit note**
   - If the API returns `429 {"error":"Rate limit check failed"}`, the account's KV write quota is exhausted. Keep `RATE_LIMIT_KV_ENABLED="false"` in `backend/wrangler.toml` (in-memory rate limiting, zero KV writes) unless on a paid plan. Re-deploying the backend does NOT fix the quota — see `AGENT_LOGBOOK.md` (2026-08-03 incident).
