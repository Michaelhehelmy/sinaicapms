---
task_id: c-deploy-backend
parent_task: Close out T0-T3 sprint — deploy backend, apply migration 0050 to production
created: 2026-08-08
status: pending
category: devops
---

# Tmp Agent: Deploy backend + apply migration 0050 (production)

## Objective
Apply pending D1 migrations (incl. 0050_add_pos_idempotency) to production and deploy the Worker via `./deploy.sh --backend`, with pre/post-flight verification.

## Scope
- Commands: `cd backend && npx wrangler d1 migrations list campmaster-db --remote` (pre/post), `./deploy.sh --backend` (from sinaicamps root).
- Files to touch: NONE besides what deploy.sh itself creates (backups/ dir is gitignored).
- Must NOT: edit any source, use `--no-health`, or run a full/frontend deploy.

## Done Condition
1. Preflight `wrangler d1 migrations list` shows the pending set (0050 at minimum; possibly 0048/0049) BEFORE deploy.
2. `./deploy.sh --backend` exits 0 with: D1 export saved, migrations applied, Worker deployed, all health checks ✅.
3. Postflight `wrangler d1 migrations list` shows 0050_add_pos_idempotency as applied (no pending entries).
4. If ANY health check fails → STOP, report the exact output, and do NOT retry with --no-health.

## Steps
1. `cd backend && npx wrangler d1 migrations list campmaster-db --remote` → record pending set.
2. `cd /home/michael/devin/opencode-workspace/sinaicamps && ./deploy.sh --backend` → record full tail (last ~40 lines).
3. `cd backend && npx wrangler d1 migrations list campmaster-db --remote` → record post-deploy status.
4. Report: preflight pending set, deploy exit code + key milestones (backup file, migration apply, worker deploy, health check lines), postflight status.

## Context
- Credentials: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are set in `sinaicamps/.env` (deploy.sh Path 1). Do NOT print the token value anywhere.
- `--backend` (not `--migrate`) is required because it runs the D1 export backup before migrating and runs health checks after.
- Migration 0050 is additive (ALTER TABLE pos_transactions ADD COLUMN idempotency_key TEXT + partial unique index) — safe, idempotency is optional in the API.
- Network is sandbox-flaky: deploy.sh already retries worker deploy (3×, 15s) and D1 export (3×). If the final health check fails, report — do not bypass.
- Do NOT commit.
