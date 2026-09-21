# G6.5 Staging Validation — BLOCKED on owner deploy (2026-09-21)

Config is ready. Execution is owner-only.

## Ready
- `backend/wrangler.toml` `[env.staging]` complete: DB `campmaster-db-staging` (4a9e6e45…), KV_CACHE (dd34537e…), RATE_LIMIT_KV (72c10646…), R2 `campmaster-media-staging`, BROADCASTER, routes `staging.sinaicamps.com/api/*`.

## Owner runs (in order)
1. `npx wrangler secret put JWT_SECRET --env staging`
2. `./deploy.sh --staging` — paste last 60 lines
3. Confirm deploy success, then agent runs: `wrangler d1 migrations apply campmaster-db-staging-db --remote --env staging`, seed via `API_BASE_URL=https://staging.sinaicamps.com node scripts/seed-test-users.js`, login check admin@sinaicamps.com, Playwright `PLAYWRIGHT_BASE_URL=https://staging.sinaicamps.com CI=true npx playwright test`, 3-report walkthrough, `./deploy.sh --rollback` drill.

## Result
G6.5: BLOCKED — a4632f2 (no staging deploy yet). G6.6 walkthrough template ready in TESTING guides.
