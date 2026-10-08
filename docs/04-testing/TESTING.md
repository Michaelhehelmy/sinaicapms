---
title: "SinaiCamps — Testing"
aliases:
tags:
  - type/guide
  - audience/developer
  - audience/tester
  - domain/testing
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[04-testing/README]]"
  - "[[98-history/merged/TESTING_ROADMAP]]"
  - "[[98-history/test-runs/2026-09-09-full-suite-run]]"
  - "[[98-history/tester-guides/testing-guide-owner]]"
  - "[[98-history/tester-guides/testing-guide-tester]]"
code-references:
  - "playwright.config.ts"
  - "vitest.integration.config.ts"
  - "tests/e2e/specs/"
  - "tests/e2e/pages/"
  - "tests/e2e/fixtures/"
  - "backend/tests/"
  - "app/tests/"
verified: never
---
# SinaiCamps — Testing

## Suites and counts (verified 2026-10-06)

Every figure names the commit that produced it, because a bare number rots
silently. `ARCHITECTURE.md` §7 is the canonical table — this file restates it for
testers and must not drift from it.

| Suite | Command | Files | Tests | Last verified |
| --- | --- | --- | --- | --- |
| Backend unit | `cd backend && npx vitest run` | **127** | **2743** | `9e58dae` (`a2-saga-status`) |
| Frontend unit | `cd app && npx vitest run` | **155** | **3632** | `88f307a` (`tenant-outage-vs-404`) |
| Root integration | `npx vitest run --config vitest.integration.config.ts` | **37** | **255** registered | 2026-09-09; see the caveat below |
| E2E | `CI=true npx playwright test` | **96** specs, 8 projects | **919 passed / 0 failed / 15 env-skipped** | 2026-09-06, per-project |

Two caveats that used to be stated as numbers and are now stated as facts:

- **The root integration run needs `--config vitest.integration.config.ts`.** Plain
  `npx vitest run` at the repo root uses `vitest.config.ts`, whose `include` is
  `tests/unit/**` only — a different suite. The full-config run has a documented
  pre-existing flake: `/api/auth`'s 30-minute login limit answers 429 and takes the
  tail of the run with it. Verify targeted or per-file.
- **CI does not run the full E2E gate.** `.github/workflows/e2e.yml` runs
  `npx playwright test --grep "@smoke"` — **10 tests**, all in
  `tests/e2e/specs/cross-cutting/mobile-responsive.spec.ts`. The 919 figure is the
  last *recorded* local full gate. **Run it; do not quote a remembered number.**

## E2E specifics

Playwright config lives in `playwright.config.ts` (repo root). The E2E suite **boots both servers** (backend + frontend) itself in CI mode.

```bash
CI=true npx playwright test          # full gate
npx playwright test --project=auth   # auth project only
npx playwright show-report tests/e2e/results/html
```

### Port hygiene before a full E2E run

If ports are already taken, the suite will fail before any test runs:

```bash
ss -tlnp | grep -E '4320|8787'
#  4320 = frontend (Astro dev/preview)
#  8787 = backend (wrangler dev)
```

Free the ports (or let the config pick alternates) before running.

### Environment-skipped tests (15)

A subset of specs only run against a live staging/prod environment (e.g. production-specific flows). In CI mode they are skipped — the gate is the set that runs locally. The last recorded full gate skipped **15** (2026-09-06). "Skipped" is a reported number here so a green run cannot quietly mean "most of the suite did not execute".

### Tenant page `load` hang

Tenant E2E pages can hang on `load` in `astro dev` because logo/favicon point at a dead `localhost:8001`. Specs use `page.goto(url, { waitUntil: 'domcontentloaded' })` — keep this convention in new specs.

### Ground truth

Three artifacts, and they answer different questions:

| Artifact | What it is | Trust it for |
|---|---|---|
| `test-results/.last-run.json` | Playwright's last-run summary on **this machine** | did the run I just did finish |
| `tests/e2e/results/html/` | the HTML report from that same local run | which specs failed, with traces |
| [[98-history/sessions/AGENT_LOGBOOK_HISTORY]] | the committed run records | **the number to quote in a doc** |

Both on-disk paths are **gitignored** (`.gitignore:10`, `:14`), so neither is ever
committed and neither describes CI or anyone else's machine. **A previous version of
this section pointed at `AGENT_LOGBOOK.md` for the suite numbers** — that file has
been the reference tier since the 2026-10-06 restructure and holds **no** run
results; the task history (with every suite result) moved to
`AGENT_LOGBOOK_HISTORY.md`. If `tests/e2e/results/*` disagrees with that history,
the history is the record and the local run is the newer fact — reconcile, don't pick.

## Writing tests

- **Unit**: Vitest. Backend tests live in `backend/tests/` (**127 files**); frontend in `app/tests/` (**155 files**, under `unit/`, `e2e/` and `mocks/` — `app/src/**` carries **no** colocated tests).
- **Integration**: `tests/` root, run via `vitest.integration.config.ts` (`npm run test:integration`).
- **E2E**: Playwright specs in `tests/e2e/specs/` with shared pages/fixtures in `tests/e2e/pages/` and `tests/e2e/fixtures/`.
- Reusable processes: use the `fix-failing-test` skill (`.opencode/skills/testing/fix-failing-test/SKILL.md`) to debug failures and `new-e2e-test` (`.opencode/skills/testing/new-e2e-test/SKILL.md`) to add specs.

## Cross-cutting concerns (manual steps 32–34)

### Manual step 32: Authentication and Security
| # | Action | Expected Result |
|---|---|---|
| 32.1 | Visit `/admin` while logged out | Redirected to login |
| 32.2 | Login with wrong password | Error toast shown |
| 32.3 | Login with valid credentials | Dashboard loads |
| 32.4 | Refresh page while logged in | Session persists (JWT in localStorage) |
| 32.5 | Visit `/admin` with expired token | Redirected to login |
| 32.6 | Click Logout | Session cleared, redirected to login |
| 32.7 | Attempt access after logout (back button) | Redirected to login |

---

### Manual step 33: Responsive Design
| # | Action | Expected Result |
|---|---|---|
| 33.1 | Resize to mobile (< 768px) | Sidebar collapses, hamburger menu appears |
| 33.2 | Click hamburger menu | Sidebar slides in |
| 33.3 | Navigate on mobile | Panels load correctly |
| 33.4 | Resize to tablet (768-1024px) | Sidebar persistent, content adjusts |
| 33.5 | Resize to desktop (> 1024px) | Full sidebar visible |

---

### Manual step 34: Error Handling
| # | Action | Expected Result |
|---|---|---|
| 34.1 | Disconnect network (DevTools offline) | Graceful error messages, no white screen |
| 34.2 | Reconnect network | Data refreshes automatically |
| 34.3 | Submit form with invalid data | Validation errors shown (no 500 errors) |
| 34.4 | Navigate to non-existent route | 404 page shown |

## Quick reference: all admin panel tab IDs

**Source of truth: the nav arrays in the components, not this table.**
`AdminApp.tsx` declares `TENANT_NAV` (`:127-155`, **29** entries) and `SUPER_NAV`
(`:180-196`, **17**) — `grep -c "{ id: '" app/src/components/admin/AdminApp.tsx` → **46**
in total — and `POSApp.tsx` declares `POS_NAV` (`:39-44`, **6**). Re-derive those
numbers rather than trusting this table.

> **This table was wrong in the most expensive way: every ID it listed was real, and
> it was missing 30.** An earlier version said "3 super-admin / 15 tenant-admin /
> 4 POS" — correct about its own rows, 30 short of the source. A folder README also
> claimed the IDs "live only here", which is what stopped anyone diffing it against
> the arrays. E2E specs do **not** read this table either: they deep-link by path
> (`tests/e2e/pages/admin/dashboard.page.ts:16` builds `/admin/<tab>?tenant=…`), so a
> missing row fails navigation silently instead of failing a selector.

### Tenant Admin (29 tabs)
| Tab ID | Label |
|---|---|
| `dashboard` | Dashboard |
| `camps` | Projects |
| `rooms` | Rooms — needs `project` |
| `rateplans` | Rate Plans — needs `product` |
| `reservations` | Orders — needs `room` |
| `cashdesk` | Cash Desk — needs `room` |
| `folios` | Folios — needs `room` |
| `inbox` | Inbox |
| `calendar` | Booking Calendar — needs `room` |
| `meals` | Meals — needs `project` |
| `menu-planner` | Menu Planner — needs `project` |
| `menu` | Menu Page — needs `project` |
| `planning` | Planning — needs `project` |
| `reports` | Reports |
| `analytics` | Analytics |
| `low-stock` | Low Stock |
| `promotions` | Promotions |
| `services` | Services |
| `service-bookings` | Service Bookings |
| `staff` | Staff |
| `financials` | Financials |
| `hr` | HR & Payroll |
| `supply` | Supply Chain |
| `crm` | CRM |
| `storefront` | Storefront |
| `ai` | AI & Intelligence |
| `billing` | Billing |
| `import` | Import |
| `settings` | Settings |

### Super Admin (17 tabs)
| Tab ID | Label |
|---|---|
| `super_dashboard` | Super Dashboard |
| `super_tenants` | Tenants |
| `super_reservations` | All Orders |
| `super_feedback` | Feedback |
| `super_users` | Users |
| `super_settings` | System Settings |
| `super_audit` | Audit Log |
| `super_subscriptions` | Subscriptions |
| `super_financials` | Financials |
| `super_hr` | HR |
| `super_supply` | Supply Chain |
| `super_crm` | CRM |
| `super_storefront` | Storefront |
| `super_ai` | AI & Insights |
| `super_reports` | Reports |
| `super_health` | System Health |
| `super_performance` | Performance |

### POS (6 tabs)
| Tab ID | Label |
|---|---|
| `dashboard` | Dashboard |
| `products` | Products |
| `orders` | Orders |
| `tables` | Tables |
| `kitchen` | Kitchen |
| `shift` | Shift |

**Totals: 46 admin + 6 POS = 52 nav entries.** A `requires` gate in `TENANT_NAV`
(`'project'` needs ≥1 camp, `'product'` ≥1 product, `'room'` ≥1 room; the field is
documented at `AdminApp.tsx:118-124`) hides a tab until the tenant owns the rows it
edits — so a deep link to a gated tab is neither a 404 nor a bug.

## CI checks before shipping

**These are the checks `.github/workflows/` actually runs, read from
`ci.yml` (132 lines) and `e2e.yml` on 2026-10-06.** A previous version of this
section was a five-item local habit list presented as "the CI checks … in order";
it was missing four of the real gates, and — worse — it implied CI runs the full
E2E suite, which it does not.

| # | Gate | Command | Workflow job |
|---|---|---|---|
| 1 | Backend unit + coverage | `cd backend && npm run test:coverage` | `ci.yml` → `backend-tests` |
| 2 | Frontend typecheck | `cd app && npx tsc --noEmit` | `ci.yml` → `frontend-tests` |
| 3 | Frontend unit | `cd app && npx vitest run` | `ci.yml` → `frontend-tests` |
| 4 | Astro build (PR gate) | `cd app && npm run build` | `ci.yml` → `frontend-tests` |
| 5 | Root integration | `npx vitest run --config vitest.integration.config.ts` | `ci.yml` → `integration-tests` |
| 6 | OpenAPI drift | `npx vite-node scripts/generate-openapi.js` then `git diff --exit-code -- openapi.json` | `ci.yml` → `backend-lint` |
| 7 | `/api/camps` sunset-shim grep | `! grep -rn -E "['\"]/api/camps" src \| grep -v -e "src/api/camps-alias.js" -e "src/routes/registry.js"` | `ci.yml` → `backend-lint` |

Notes that decide whether a local run means anything:

- **`--config` is not optional for #5.** Plain `npx vitest run` at the root uses
  `vitest.config.ts`, which only includes `tests/unit/**`.
- **#1 runs with `--coverage`, so the thresholds are evaluated there and nowhere
  else.** `backend/vitest.config.ts:21-30` = 83/72/89/89; `app/vitest.config.ts:35-40`
  = 95/80/99/99. A plain `npx vitest run` cannot tell you the coverage gate passed.
- **#6 is the one gate that fails on an un-regenerated artefact**: change a route in
  `backend/src/routes/registry.js` without running `npm run gen:openapi` and CI goes
  red on a spec file, not on code.
- **CI's E2E job is smoke-only.** `e2e.yml` runs
  `npx playwright test --grep "@smoke" --reporter=list` with `CI: true` — **10 tests**,
  all in `tests/e2e/specs/cross-cutting/mobile-responsive.spec.ts`. The full gate
  (`CI=true npx playwright test`, 8 projects, `playwright.config.ts:34-90`) is a
  **local/owner** gate and its last recorded result is 919 passed / 0 failed /
  15 skipped (2026-09-06).
- Node 22 in every job (`actions/setup-node@v4`, `node-version: 22`), which matches
  the real floor: `astro` 7.3.1 declares `engines.node ">=22.12.0"`.
- `scripts/run-all-tests.sh` (`npm run test:all`) is the local runner that wraps all
  of the above and writes `reports/all-tests-<timestamp>/REPORT.md`.
