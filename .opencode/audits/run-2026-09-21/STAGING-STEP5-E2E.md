# Staging Step 5 — E2E triage (2026-09-21)

Command: `STAGING=1 CI=true npx playwright test --config=tests/e2e/playwright.production.config.ts`
Result: 4 passed / 6 failed / 1 skipped (11 critical-flows).

Note: root `playwright.config.ts` hardcodes localhost baseURL, so the
production config with STAGING=1 is the correct staging harness.

Failed (all one root cause):
1. marketplace home hero-banner — no testids on `/`
2. marketplace search input — same
4. tenant portal homepage — backend has no such page
7. admin login page renders — backend has no /admin
10. X-Frame-Options on `/` — backend landing sets none
11. branded 404 — backend returns JSON `{"success":false,"error":"Not found"}`

Root cause (env drift, verified via curl):
`/` returns the backend "SinaiCamps API" landing page (1182 bytes, zero
data-testids); unknown routes return backend JSON 404. The staging hostname
is bound to the backend staging worker, not the frontend staging worker.
The 4 passing tests are API-level (tenants list, auth), which is why they pass.

Fix (owner, control-plane): attach staging.sinaicamps.com to the frontend
staging worker (custom domain), keep only staging.sinaicamps.com/api/*
routed to the backend staging worker. Then rerun this config.

No real bug. No rerun until routing is fixed.

## Rerun 2026-09-22 ~09:25 UTC (after isolated staging deploy c61d1e95)
Identical: 4 passed / 6 failed / 1 skipped, same 6 tests. Homepage is still
the 1182-byte backend landing (zero testids) — hostname still bound to the
backend worker. The staging frontend worker IS live and correctly bound
(SESSION c5ce9cfa staging, API_BACKEND campmaster-backend-staging) but has
no public hostname yet.

Health-check gap (P2, log it): deploy health checks passed vacuously —
backend landing HTTP 200 counts as "Homepage 200", /admin + /pos JSON 404s
accepted as branded-404 expectations. Checks should assert a frontend
marker (e.g. hero testid), not just status codes.

Next: owner moves staging.sinaicamps.com custom domain to
campmaster-marketplace-staging (dashboard), removes it from backend worker,
then agent reruns this config.
