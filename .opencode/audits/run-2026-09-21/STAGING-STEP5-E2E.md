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
