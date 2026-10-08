---
title: "SinaiCamps — Developer Roadmap (Backlog State)"
aliases:
tags:
  - type/plan
  - audience/developer
  - domain/plans
  - status/live
created: 2026-08-13
updated: 2026-10-06
relates-to:
  - "[[09-plans/README]]"
  - "[[FINAL_IMPLEMENTATION_PLAN_v3_waves]]"
  - "[[03-frontend/PERF_BASELINE]]"
  - "[[06-security/security-guide]]"
code-references:
  - "app/src/lib/routeZones.ts"
  - "app/src/hooks/useQueryHooks.ts"
  - "app/src/lib/browser-ai.ts"
  - "app/src/lib/api.ts"
  - "backend/openapi.json"
  - "app/budget.json"
  - "app/lighthouserc.cjs"
  - "tests/e2e/specs/tenant/arabic-rtl-deep.spec.ts"
  - "app/src/components/ui/SafeImage.astro"
  - "app/src/components/admin/AdminApp.tsx:60-107"
  - "app/src/components/admin/AdminApp.tsx:127-196"
  - "app/src/components/pos/views/"
  - "app/src/pages/"
  - "docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md:9093"
  - "docs/01-architecture/ARCHITECTURE.md"
verified: never
---
# SinaiCamps — Developer Roadmap (Backlog State)

Status of the production-readiness backlog, as of the **T9–T18** batch plus the docs refresh (2026-08-13). Session completions through 2026-09-28 folded below (T20–T23: Phase 4 gates, Phase 5 exit, storefront FK + POS bind fixes, Phase 6 docs 6.1–6.9). The `AGENT_LOGBOOK.md` in the repo root holds the session-by-session log with dates and file lists.

## Done

| ID | Task | Notes |
| --- | --- | --- |
| T8 | OpenAPI generation | `backend/openapi.json`, `gen:openapi` / `gen:types` scripts |
| T9 | Design-system expansion | +8 a11y-first UI primitives (Accordion, Checkbox, FormField, Radio, Separator, Switch, Textarea, Tooltip) + 8 stories — **both removed since.** Added `5d11305`, deleted `69311ce` in the unified-architecture migration ("65 tables → 34 tables, 30 dead tables dropped"); `app/src/components/ui/` is **20** files and `app/src/stories/` holds 10 files, none of the 8. `ls app/src/components/ui/ \| wc -l`. |
| T10 | Marketplace SEO (JSON-LD) | `CollectionPage`/`ItemList` on `/camps`; `Campground`/`LodgingBusiness` already present on home + tenant landing |
| T11 | ~~Arabic RTL~~ **CANCELLED** | Deliberate product decision: frontend stays hard-coded English LTR. No `app/src/i18n/` exists, no locale middleware, no `sc_lang` cookie; the "arabic-rtl-deep" E2E spec asserts en/ltr (verified). Implementing RTL would break the passing E2E suite. |
| T12 | Image pipeline | `sharpImageService()` (no passthrough), `image.remotePatterns`, new `SafeImage.astro` with graceful fallback; migrated hero/logos/room cards |
| T13 | Admin query migration | Verified already complete: admin SPA fully on TanStack Query, zero raw `fetch` data loads, zero `window.*` globals, every panel reaches data through `@/lib/api`. The substantive claims still hold — `grep -rn "fetch(" app/src/components/admin app/src/components/pos` returns 9 hits and **all 9 are `refetch()`**, i.e. zero raw network fetches. Only the denominator was stale: it is **46 nav tabs** (`grep -c "{ id: '" app/src/components/admin/AdminApp.tsx` → 46 = `TENANT_NAV` 29 + `SUPER_NAV` 17), 48 `lazy()` calls at `:60-107`, and **63** files under `components/admin/` — not "16/16 panels". |
| T14 | POS terminal | Shipped (11 POS views, `pos_token` auth, shifts, cart/checkout). `ls app/src/components/pos/views/` → 11: CartPanel, DashboardView, KitchenView, LoginView, OrdersView, ProductsView, ProjectPicker, ReceiptModal, ShiftDashboard, ShiftOverlay, TableView. |
| T15 | Performance pass | `budget.json` + `lighthouserc.cjs` + `npm run lighthouse`; CampBooking island now `client:visible`; backend caching audit (no KV caching — safe under free plan) |
| T16 | A11y suite | E2E + unit coverage for a11y patterns |
| T18 | Documentation set | This docs/ set |
| T19 | Docs refresh | README + AGENTS + `.opencode/prompts/project-context.md` + `docs/*` updated to match the codebase. The four counts it published described the tree of that day and are now historical: **"53 migrations"** → the applied lineage is **40** top-level `.sql`, head `0127_meals_tenant_composite_pk.sql` (53 is a pre-squash number; `legacy/` holds 99 files); **"18 admin panels"** → 46 nav tabs / 63 component files; **"552 E2E gate"** → the last recorded full gate is 919 passed / 0 failed / 15 env-skipped (2026-09-06, `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md`); R2/DO bindings unchanged. |
| T20 | Phase 4 project-scoping | `0118` default store per project, `0119` shift `store_id`, `0120` `pos_transactions.tip_amount`; gates 1–6 PASS (`04-phase4-gates.md`); staging walkthrough PASS post-redeploy |
| T21 | Phase 5 unified-cart exit | PASS — `2712171` `docs(audit): Phase 5 exit — unified cart PASS` (per-project P&L `149a38c`, project filter, storefront FK era) |
| T22 | Storefront FK + POS bind fixes | `49d7ce1` retargets `storefront_order_items.product_id` → `pos_products(id)` (`0123`); `kitchen_status`/`tip_amount` bind swap + positional INSERT-shape test |
| T23 | Phase 6 docs truth 6.1–6.9 | 9 commits `4892268`–`ca597c1` (admin Projects label, 403 scope-denial, API_SURFACE, ARCHITECTURE head 0123, MIGRATION_GUIDE, README, TESTING counts, security XSS, POLISH_PLAN demotions); audit closure in `FINAL-CLOSURE-v2` (2026-09-22) |

## Remaining / follow-ups

| Area | Status | Next step |
| --- | --- | --- |
| Staging DNS | Blocked on human | Create `staging.sinaicamps.com` → Workers custom-domain DNS record/route, then `./deploy.sh --staging`. **UNVERIFIED as of 2026-10-06** — the code half is confirmed (`deploy.sh:39-40` sets `DEPLOY_ENV="staging"` on `--staging` and `backend/wrangler.toml` has a full `[env.staging]` block at `:92` with its own `d1_databases` (`:124`), `kv_namespaces` (`:130`, `:134`), `r2_buckets` (`:138`), `durable_objects` (`:142`), `migrations` (`:146`) and three `routes` (`:110`, `:116`, `:120`)), but whether the DNS record exists is a Cloudflare-console fact and **no probe was issued**. Owner to confirm. |
| Git remote + push | **Repo created** — private; the configured remote is `https://github.com/Michaelhehelmy/sinaicapms.git` (`git remote get-url origin`). **Push blocker RESOLVED**: `git log --oneline origin/main..HEAD` is empty and `git branch -r --contains ddc63c6` → `origin/main`, so every commit including the `workflow`-scope work is on the remote. No OAuth action outstanding. |
| Credential vault | Owner action | Store rotated admin credentials (2 accounts) |
| Lighthouse execution | Tooling ready | Run `cd app && npm run lighthouse` against a live preview once a URL is up |

## Known pre-existing type errors (baseline, not regressions)

`BookPage.astro` (`apiBase` prop) and `MenuPage.astro` (meal/mealCategory types)
are named here as LSP-level noise. Two corrections, because the **number** was
dead and the **tool** cannot see these files at all:

- **The "153-error baseline" is retired.** `cd app && npx tsc --noEmit` reached
  **0 errors** at `T33 TEST-FIXTURE TSC DEBT: DONE (329 → 0)` (2026-09-06,
  `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md:9093`), with 2 pre-existing
  on 2026-10-03. Do not restore a 153 figure — it describes the pre-T33 tree.
- **`tsc` cannot check `.astro` files.** The two named errors are editor/LSP
  diagnostics, which is why no `tsc` baseline can confirm or refute them. The
  CI typecheck that does gate the repo is `npx tsc --noEmit` over `.ts`/`.tsx`
  (`.github/workflows/ci.yml`), and `npm run build` is the `.astro` gate.

They do not block `astro build` or the test suites. **Verify with a command, not
against this paragraph.**

## Wave 7 test-hygiene note (2026-09-22, staging walkthrough)

The POS feedback success-modal Done button needs `force: true` in Playwright: the POS shell overlay intercepts normal clicks in a hydration race. Human taps work; production unaffected. If POS modal tests flake on click timeouts, prefer force-click or `state: attached` + wait before asserting.
