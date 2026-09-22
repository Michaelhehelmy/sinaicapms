# PROD Deploy Checklist — 2026-09-22

Staging G6.5 is SATISFIED. This checklist runs the production cutover.
Owner-only: every command below affects production.

## 0. Pre-flight
- `git log origin/main..HEAD` empty (all work pushed).
- Confirm staging green: E2E 11/11, walkthrough 5/5, rollback PASS (see G65).
- Manual D1 backup (deploy.sh also takes one automatically and aborts on empty):
  `cd backend && npx wrangler d1 export campmaster-db --remote --output ../backups/campmaster-manual-20260922.sql`
- Record current prod versions for rollback:
  `npx wrangler versions list --config backend/wrangler.toml` (note backend version id)
  `cd ../app && npx wrangler deployments list --name campmaster-marketplace` (note frontend version id)

## 1. Deploy
- `./deploy.sh` (no flag = production) from repo root.
- Acceptance: `Uploaded campmaster-backend` + `Uploaded campmaster-marketplace`,
  health checks pass, `Deployment Successful!`.

## 2. Post-deploy smoke (expect 200/400-guard, never 000/500)
- `curl -sS https://sinaicamps.com/ -w "\nHTTP %{http_code}\n" | tail -2`
- `curl -sS https://sinaicamps.com/api/me -w "\nHTTP %{http_code}\n" | tail -2`
- `curl -sS https://acaciacamp.com/ -w "\nHTTP %{http_code}\n" | tail -2`
- `curl -sS https://acaciacamp.com/admin -w "\nHTTP %{http_code}\n" | tail -2`
- `curl -sS https://michaelshouse.sinaicamps.com/ -w "\nHTTP %{http_code}\n" | tail -2`

## 3. Verification
- Open acaciacamp.com/admin → Settings panel loads, no chunk 404
  (the stale SettingsPanel.BoCCaASL.js skew is healed by this fresh deploy).
- Ghost SW: new boot code unregisters stale workers on next visit.

## 4. Rollback (only if smoke fails)
- `./deploy.sh --rollback <backend-version-id>` (backend pin; D1 is forward-only)
- Frontend: Cloudflare dashboard → campmaster-marketplace → rollback to noted version.
- Do NOT roll back for content drift — only for 5xx/auth-down.

## 5. Watch window — 24 hours
- 5xx rate on /api/* (Cloudflare analytics / tail).
- Login success (admin + POS), booking lead flow, marketplace search.
- Any recurrence of chunk 404s or SW intercept errors in reports.
