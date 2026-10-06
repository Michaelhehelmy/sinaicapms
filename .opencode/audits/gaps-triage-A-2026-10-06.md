---
title: "Gaps triage A — code-vs-docs.md (STALE/FALSE entries)"
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-06
source-spec: ".opencode/agents/tmp/2026-10-06-trA.md"
source-note: "docs/99-gaps/code-vs-docs.md"
baseline: "f309f74"
relates-to:
  - "[[99-gaps/README]]"
  - "[[99-gaps/code-vs-docs]]"
  - "[[99-gaps/unimplemented]]"
---

# Gaps triage A — `docs/99-gaps/code-vs-docs.md`

Mission: one triage row per **STALE/FALSE** entry of `code-vs-docs.md`, classified with the
mission's five rules, with a `git log -S` history check run **before** any entry could be called
`IMPLEMENT`. Read-only: no doc under `docs/` and no source file was edited.

## Census — found vs triaged

| Bucket | Count | Source |
|---|---|---|
| `###` headings in the whole note | **192** | structural scan |
| — under *Entries by folder* | **80** | lines 233–1806 |
| — under *Matched controls* | **112** | *controls — read, counted, **not triaged*** |
| *Entries by folder* carrying a `STALE`/`FALSE` class | **73** | **triaged** |
| *Entries by folder* carrying `MATCHED` only (`A‑6`, `A‑13`, `S‑7`, `P‑4`, `P‑10`, `O‑25`, `N‑19`) | **7** | skipped as controls |
| Consolidation `## Entry #1` — migration-head drift (a `##`, not a `###`) | **1** | **triaged** |
| `D‑13` — the pending-apply distinction `Entry #1` nests inside itself | **1** | **triaged** |
| **Rows in this audit** | **75** | **matches the mission's expected 75** |

The mission's 75 = 73 class-bearing `###` entries + `Entry #1` + its nested `D‑13`. Everything the
note itself asserts (`80` STALE+FALSE) is a **higher** figure than any defensible reading: it counts
the 7 `MATCHED` bodies and double-counts `D‑13`.

## Classification rules applied

- **FIX-DOC** — the code is correct and the doc is wrong, including **every wrong COUNT** (test
  counts, migration head/count, config values, component/tab/table counts) and every stale path.
- **IMPLEMENT** — the feature is genuinely absent **and** users need it. Requires a prior
  `git log -S` history check: existed-then-deliberately-removed → FIX-DOC; existed-then-accidentally
  removed → IMPLEMENT.
- **DEFER** — absent but not urgent, or a dated/design note that is correct as labelled.
- **REJECT** — never existed and never intended, or not desirable.
- **UNKNOWN** — cannot be decided without owner input.

Severity is assigned to `IMPLEMENT` only (P0 prod bug / P1 user-visible block / P2 nice / P3 polish).
**No row classified `IMPLEMENT`, so no severity is assigned anywhere in this table.** The source
entry's own P-rating is preserved in `docs/99-gaps/code-vs-docs.md` and is *not* restated here,
because re-deriving it would be a second, competing severity axis.

## History checks run (all before the first `IMPLEMENT` call)

| Check | Result | Bearing |
|---|---|---|
| `git log --oneline -S 'createCrmContact' -- app/src/lib/api.ts` | added `272ed1e`, removed `8d626e3` | `S‑2`/`S‑3` — deliberate removal, not IMPLEMENT |
| `git log -S '<table>' -- backend/` for all 13 `S‑4` tables | **0 commits each** | `S‑4` — never existed in backend at all |
| `git log -S 'crm_contacts'` (any path) | docs only (`docs/API_SURFACE.md`, `2daafaa`) | `S‑4` — doc-invented |
| `git log --diff-filter=A` + `--follow` on `ui/Checkbox.tsx`, `ui/Accordion.tsx` | added `5d11305`, **deleted `69311ce`** ("65 tables → 34 tables, 30 dead tables dropped") | `F‑7`/`R‑1` — deliberate dead-code sweep, not IMPLEMENT |
| `git log -S 'lifetime_value'` / `'clv'` | 0 code commits | `G‑1` — never existed |
| `git log -S 'retention' -- backend/src/api/reports.js` | 0 commits | `G‑3` — never existed |
| `git log -S 'segments' -- backend/src app/src` | path-segment helpers + a marketing taxonomy array only | `G‑2` — never existed |
| `git log -S 'orders/:id/void'` | doc/backlog text only (`a4632f2`, `2daafaa`); never code | `R‑9` — never existed, already tracked as a backlog proposal |
| `git branch -r --contains ddc63c6` | `origin/main` | `R‑7` — push blocker resolved |

**Result: 0 `IMPLEMENT`.** Every candidate that *looked* like a missing feature turned out to be
either a deliberately-removed dead-code artifact (`S‑2`, `S‑3`, `F‑7`, `R‑1`, `A‑4`) or a doc that
asserts a capability with zero code, zero migration, zero plan and zero stub anywhere in the tree
(`S‑4`, `G‑1`, `G‑2`, `G‑3`, `R‑9`). Per rule 2, the first group is FIX-DOC and the second group is
either FIX-DOC (the claim is wrong) or UNKNOWN (the owner may want the capability built) — never
IMPLEMENT.

## Triage rows

| id | source doc (wikilink + heading) | claim | code evidence (file:line or git finding) | class | severity |
|---|---|---|---|---|---|
| `A‑4` | [[ARCHITECTURE]] §5a — monitor bindings | `&#124; D1 &#124; campmaster-monitor-db, migrations_dir = migrations &#124;` | `monitor/wrangler.toml` has **0** `[[d1_databases]]` blocks; `:14-21` states "there is NO relational binding on this worker any more"; storage is R2 `MONITOR_BUCKET` (`:39-41`); `monitor/src/db.js` deleted | FIX-DOC | — |
| `A‑5` | [[ARCHITECTURE]] §5a — monitor retention | "cron-written tables are pruned (`checks` 14d, `reports` 30d, orphaned `alert_state`)" | day counts still exact (`monitor/src/storage.js:48-49`), swept by `runRetention` (`monitor/src/index.js:1881-1882`); substrate is now R2 prefixes `checks/<date>/<time>.json` (`monitor/wrangler.toml:26-27`) | FIX-DOC | — |
| `A‑16` | [[ARCHITECTURE]] §4 — rate-limit policy table | "~20-entry policy table … plus a tenant-scoped second layer on **7 prefixes**" | `RATE_LIMIT_POLICIES` = 23 entries (`backend/src/middleware/rateLimit.js:25-112`), first-match-wins `:13`, IP key `:181-182`, fail-closed `:211,:246`; `grep -c "tenantAwareLimiter())" backend/src/index.js` → **36** | FIX-DOC | — |
| `A‑20` | [[ARCHITECTURE]] §7 — test-count table | backend 124/2701 · frontend 154/3611 · monitor 7/72 · root 37/255 | latest committed (`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md`): backend **127/2743**, app **155/3632**, monitor **7/191**; root 37/255 still current | FIX-DOC | — |
| `A‑21` | [[ARCHITECTURE]] §7 — E2E count + logbook pointer | "96 spec files across 8 projects" + "last full gate in `AGENT_LOGBOOK.md` is 919/0/15" | `find tests/e2e -name "*.spec.ts" &#124; wc -l` → 96 ✓ and 8 projects ✓; but `AGENT_LOGBOOK.md` is 207 lines (reference tier only) — history moved to `AGENT_LOGBOOK_HISTORY.md` (9,740 lines) in the 2026-10-06 restructure, so the pointer is dangling | FIX-DOC | — |
| `A‑26` | [[ARCHITECTURE]] — header provenance | "Verified against `dbcb382` on 2026-10-02" while §5 cites the same commit for the 40/`0127` figure | `dbcb382` resolves; §5's `0127` half was committed later, so the header names a commit whose content no longer matches the file it certifies; HEAD is now `f309f74` | FIX-DOC | — |
| `Q‑4` | [[QUICK_START]] §4 — test counts | backend 2225/84 · frontend 3416/137 · E2E 929 total / 919 gate / **14** skipped | `docs/01-architecture/QUICK_START.md:79-82` verbatim; latest committed 127/2743, 155/3632, 919/**15** — a third count set, and it contradicts [[ARCHITECTURE]] §7 on the skip figure | FIX-DOC | — |
| `C‑1` | [[API_CONTRACT]] §1 — exported function count | "~276 exported functions" in `app/src/lib/api.ts` | `grep -c "^export \(async \)\?function &#124;^export const "` → **287** in 2,838 lines (+60 exported types) | FIX-DOC | — |
| `C‑2` | [[API_CONTRACT]] §2 + §5 — system row | "`/api/openapi.json`, `/api/health` &#124; schema + health" | `index.js:477` serves `/api/openapi.json` ✓; the health endpoint is **`/healthz`** at `backend/src/index.js:164`; `backend/openapi.json` `/api/health` = ABSENT | FIX-DOC | — |
| `C‑3` | [[API_CONTRACT]] §3 — RBAC hierarchy | "RBAC hierarchy: `admin` > `staff`" | **no `staff` rank**: `app/src/lib/rbac.ts:7-12` = `super_admin:100, admin:80, manager:50, cashier:30`, mirrored at `backend/src/middleware/requireAuth.js:58-63`; `'staff'` exists only as a nav-tab id (`AdminApp.tsx:146,437`) — a UI grouping, not a rank | FIX-DOC | — |
| `C‑7` | [[API_CONTRACT]] §7 — 401 vs 403 | 11-message table + order "signature → token-type → realm → role → activity → tenant scope" | all 11 messages verbatim (`requireAuth.js:66-71`, `resolveScope.js:200,208,236`); but `evaluate()` inserts a **1b null-tenant hard guard** *before* the token-type check (`requireAuth.js:160-163`), so the documented order is missing a gate | FIX-DOC | — |
| `S‑2·api` | [[API_SURFACE_MAP]] — Frontend Function column | 249 distinct function names | 64 absent from `app/src` (8 spot-checks → 0 refs each: `createCrmContact`, `getSettings`, `updateSettings`, `getMarketplaceProjects`, `createPlan`, `getPublicServices`, `createServiceItem`, `updateTag`); **git: added `272ed1e`, removed `8d626e3` "dead-code pass — delete 29 wrappers, grep-verified zero consumers"** → deliberate | FIX-DOC | — |
| `S‑3·api` | [[API_SURFACE_MAP]] — React Hook column | 195 `use*` names | `app/src/hooks/` = 5 files; `useQueryHooks.ts:1549` really does define `useCrmContactsQuery`; 120 unaccounted; **git: 24 hooks deleted in `8d626e3`** → deliberate | FIX-DOC | — |
| `S‑4` | [[API_SURFACE_MAP]] — DB Tables column | 84 table names incl. `ai_*`, `crm_*`, `storefront_*` | **git: `git log -S '<table>' -- backend/` returns 0 commits for all 13** — they exist in no SQL verb in either lineage; `crm_leads` does exist | FIX-DOC | — |
| `S‑5` | [[API_SURFACE_MAP]] — `/products/:id` GET "OpenAPI-registered" | three rows annotated "OpenAPI-registered" | `backend/openapi.json` → `/api/products/{id}` = `['delete','put']`, `/api/rateplans/{id}` = `['delete','put']`, `/api/meal-schedules/{id}` = `['delete']`; and in code `productsRoutes` (`camps.js:476+`) registers only `/` GET, `/` POST, `/bulk` POST, `/:id` PUT, `/:id` DELETE — **there is no GET-by-id endpoint at all**, so this is not an annotation slip | FIX-DOC | — |
| `S‑6` | [[API_SURFACE_MAP]] — Marketplace rows list `camps` | `camps`, `tenants`, `project_meta` | `camps` exists only in the excluded lineage (`backend/migrations/legacy/0001_init.sql:20`, dropped by `legacy/0063_rename_camps_to_projects.sql:60`); no `FROM`/`JOIN`/`INTO camps` in `backend/src` — only a comment at `routes/registry.js:285` | FIX-DOC | — |
| `F‑2` | [[COMPONENT_CATALOG]] §2 — admin panel count | "Admin — `components/admin/` (**25 files**)" | `find app/src/components/admin -type f &#124; wc -l` → **63**; all 23 named components exist, so the *enumeration* is right and the *count/coverage* is wrong (40 undocumented, incl. `AIPanel`, `CRMPanel`, `SuperSupplyPanel`, `AdminShell.tsx`) | FIX-DOC | — |
| `F‑4` | [[COMPONENT_CATALOG]] §3 — POS views | "**8 views**" | `ls app/src/components/pos/views/` → **11** (+ `KitchenView.tsx`, `ProjectPicker.tsx`, `TableView.tsx`) | FIX-DOC | — |
| `F‑5` | [[COMPONENT_CATALOG]] §5 — hooks | `useAdminData`, `useApiError`, `useQueryHooks`, `useSseInbox`, `useSseOrders` | `ls app/src/hooks/` → `useAdminData.ts`, `usePosQueries.ts`, `useQueryHooks.ts`, `useSseInbox.ts`, `useSseOrders.ts` — `useApiError` does not exist, `usePosQueries` is unlisted | FIX-DOC | — |
| `F‑7` | [[COMPONENT_CATALOG]] §7 — stories | "**8 new a11y stories** … Checkbox, Radio, Switch, Textarea, FormField, Separator, Tooltip, Accordion" | `find app -name "*.stories.*" -not -path "*/node_modules/*"` → 10 files, **none of the 8**; **git: `Accordion.tsx`/`Checkbox.tsx` added `5d11305`, deleted `69311ce`** ("30 dead tables dropped" — a deliberate dead-code sweep) → rule 2 makes this FIX-DOC | FIX-DOC | — |
| `P‑1` | [[PERF_BASELINE]] header vs §Status | §Status: "Active enforcement now lives in `app/budget.json` … **TBT < 200 ms**" | `tests/lighthouse/run.ts:54` = `{ cls: 0.1, lcpMs: 2500, tbtMs: 300, enforced: false }`; `app/budget.json` holds **no** cls/lcp/tbt at all (5 resource-size budgets, all `transferSize`) — the doc contradicts itself, and its own header is the accurate half | FIX-DOC | — |
| `Y‑1` | [[03-frontend/README]] §Concepts | "**four** public islands exist by design" | census over `app/src`: **9** public-facing sites — `client:visible` ×6 (`TenantLanding.astro`, `marketplace.astro`, `storefront/{index,cart,checkout,order/[orderNumber]/confirmation}.astro`) + `client:load` ×3 (`BookPage.astro`, `MenuPage.astro`, `PublicLayout.astro` debug widget); +8 `client:only` SPA hosts | FIX-DOC | — |
| `Y‑2` | [[03-frontend/README]] §Concepts | hook list + "nothing fetches data outside `@/lib/api`" | same phantom as `F‑5` (`useApiError` absent, `usePosQueries` unlisted); the fetch claim itself holds — zero network `fetch(` under `components/admin` + `components/pos` | FIX-DOC | — |
| `Y‑3` | [[03-frontend/README]] §Concepts | "`app/budget.json` holds the enforced limits" | `budget.json` = resource sizes only; the CLS/LCP/TBT targets live in `tests/lighthouse/run.ts:54` with `enforced: false`; it *is* consumed (`app/package.json` `lighthouse --budget-path=budget.json`), so "enforced" is right for sizes and wrong unqualified | FIX-DOC | — |
| `T‑1` | [[TESTING]] suite table | backend "**2610 tests / 115 files**" · frontend "**3561 tests / 149 files**" | `TESTING.md:34-35` verbatim; latest committed 127/2743 and 155/3632; the table header itself says "Suites and counts (verified)" | FIX-DOC | — |
| `T‑2` | [[TESTING]] suite table — E2E row | "**566 total / 552 gate passed, 14 env-skipped**" | `TESTING.md:37`; latest committed full gate is **919 passed / 0 failed / 15 skipped** (2026-09-06); the 552 figure traces to a verbatim 2026-08-12 run | FIX-DOC | — |
| `T‑4` | [[TESTING]] "Writing tests" | backend **115 files** · frontend **149 files** | 127 / 155 — the same drift as `T‑1`, stated a second time so one correction will not fix the doc | FIX-DOC | — |
| `T‑5` | [[TESTING]] §"Quick reference: all admin panel tab IDs" | 3 super + 15 tenant + 4 POS IDs | `AdminApp.tsx` carries **46** `{ id: '…', label: … }` entries, `POSApp.tsx` **6**; **28 admin + 2 POS IDs missing**, 12 of which E2E specs actually select on; 0 documented-but-missing, so this is incompleteness not invention | FIX-DOC | — |
| `T‑6` | [[04-testing/README]] §Concepts | "Admin tab IDs live only here" | `AdminApp.tsx:146+` and `POSApp.tsx:39-44` are by definition the source the table transcribes — the sentence that makes the stale table authoritative is what hid the drift | FIX-DOC | — |
| `T‑7` | [[04-testing/README]] §Concepts | "14 tests skip on missing env" | latest committed full gate = **15**; 14 traces to the same 2026-08-12 run as `T‑2`, so the vault now carries both 14 and 15 in two folders | FIX-DOC | — |
| `T‑8` | [[TESTING]] §"Ground truth" | `test-results/.last-run.json`, `tests/e2e/results/*`, `AGENT_LODBOOK.md` | both artifact paths are gitignored/absent (`ls test-results/` is empty); `AGENT_LOGBOOK.md` is 207 lines and holds no suite results — history moved to `AGENT_LOGBOOK_HISTORY.md` | FIX-DOC | — |
| `T‑12` | [[TESTING]] §CI checks before shipping | five ordered gates + "552 passed / 0 failed (14 skipped)" | all five gates real (`app/package.json` `build`, the three vitest commands, Playwright `testDir`); only the trailing figure is stale | FIX-DOC | — |
| `T‑14` | [[04-testing/README]] §Concepts | "**Verified counts, not remembered counts** … a claim with a date on it" | `TESTING.md`'s table carries **no date and no commit** on any row and the file's front matter says `verified: never`; the `T‑2` row is a 2026-08-12 result with nothing in the file saying so | FIX-DOC | — |
| `O‑16` | [[AUDIT_MASTER_FINDINGS]] PART 1 + PART 6 | six open P0s; PART 6 "RECOMMENDED FIX SEQUENCE (proposed — needs your go-ahead)" | **all six fixed in-tree**: `onboarding.js:31` zod `.strip()` whitelist (`T1 (P0.1)` at `:295`), `sanitize.js` absent (`index.js:149` "sanitizeInput middleware REMOVED"), `storefront.js:73-76` excludes `cost_price`, `0002_orders.sql:29`/`0004_pos.sql:156` CHECK includes `'canceled'`, `services.js:443-450` uses `subdomain`/`status`, `onboarding.js:22` `min(8)` + `:123` `is_active` gate | FIX-DOC | — |
| `O‑17` | [[AUDIT_MASTER_FINDINGS]] P0.4 | "Where: `backend/migrations/0069_restaurant_tables.sql:47`" | that file exists **only** at `backend/migrations/legacy/0069_restaurant_tables.sql` (excluded lineage); the live CHECKs are `0002_orders.sql:29` and `0004_pos.sql:156` | FIX-DOC | — |
| `O‑18` | [[AUDIT_MASTER_FINDINGS]] PART 5 | 1988/72 · 3489/137 · 158/10 | latest committed 2743/127, 3632/155, 255/37; the green-light block carries no date and no commit | FIX-DOC | — |
| `O‑19` | [[AUDIT_MASTER_FINDINGS]] PART 5 | "91/91 migrations sequential & fully applied" | applied lineage is **40** top-level files, head `0127`; 91 (and 99) are pre-squash numbers now living in `legacy/`; `foreign_key_check` is not re-derivable without a replay | FIX-DOC | — |
| `O‑20` | [[AUDIT_MASTER_FINDINGS]] PART 4 + PART 5 | `tsc --noEmit` **426 errors** · `escHtml()` 67× · `DB.batch` 27 places · ~167 indexes | logbook records `tsc` **0 errors** at the 2026-09-06 `T33 TEST-FIXTURE TSC DEBT: DONE (329 → 0)` entry and 2 pre-existing on 2026-10-03; `escHtml()` is 18; `DB.batch` is in 48 call sites; the index figure was measured on the 91-file lineage | FIX-DOC | — |
| `O‑21` | [[AUDIT_MASTER_FINDINGS]] M3 + M21 | feature flags have zero usages; 20 unsafe `DROP TABLE` in 11 migrations | `FEATURE_USER_REGISTRATION`/`FEATURE_TWO_FACTOR_AUTH` absent from `backend/` **and `app/src`** including `wrangler.toml` — the premise is gone; all 11 cited migrations are under `legacy/`; the applied lineage has **6** unsafe drops (0107, 0108, 0111, 0112, 0115, 0126) that the doc does *not* claim, so a reader who trusts it under-protects them | FIX-DOC | — |
| `O‑22` | [[AUDIT_MASTER_FINDINGS]] M11 | "4th public island (`MarketplaceDirectory client:load`)" | `app/src/pages/marketplace.astro:14` is **`client:visible`**; the public-facing census is 9 sites, not 3 | FIX-DOC | — |
| `S‑2·sec` | [[security-guide]] §Rate Limiting | "A second, tenant-scoped layer … is mounted on **7 prefixes**" | `grep -c "tenantAwareLimiter())" backend/src/index.js` → **36**; the 7 named are the first 7 in declaration order, list grew by 29 and was never re-counted; the same figure is repeated in [[ARCHITECTURE]] §4 and the guide's own §Verification note | FIX-DOC | — |
| `S‑3·sec` | [[security-guide]] §Rate Limiting | "a **~20-entry** ordered policy table" | `RATE_LIMIT_POLICIES` = 23 non-`default` entries + `default` (`rateLimit.js:25-112`); "~20" is a fair reading, only the number is loose | FIX-DOC | — |
| `S‑13` | [[security-guide]] §CSRF table | "**All** API requests use JSON bodies" (defense-in-depth row) | `POST /api/upload` takes `application/octet-stream` with `?filename=` (`backend/src/api/upload.js:84`, branch `:116`) alongside multipart (`:7` 8 MB cap, `:15-19` five MIME types) — a cross-origin `<form enctype="multipart/form-data">` can reach it | FIX-DOC | — |
| `S‑16` | [[security-guide]] §Token lifecycle + §XSS Layer 2 | `docs/API_CONTRACT.md` · `docs/audit-2026-09-30-eschtml-inventory.md` | neither path exists — they are `docs/02-api/API_CONTRACT.md` and `docs/98-history/worksheets/audit-2026-09-30-eschtml-inventory.md`; both *targets* and both *claims* are real, only the markdown paths missed the 2026-10-06 restructure | FIX-DOC | — |
| `D‑1` | [[migrations]] §1 | "**Current head: `0123_storefront_order_items_fk_pos_products.sql`** (37 files total … filesystem-verified)" | `ls backend/migrations/*.sql &#124; wc -l` → **40**, head `0127_meals_tenant_composite_pk.sql`; three landed since — `0124_guest_folios.sql`, `0126_tenant_scoped_unique_sku_email.sql`, `0127_…`; `docs/07-data/README.md` already publishes the correct figures, so the folder index caught what the guide missed | FIX-DOC | — |
| `D‑2` | [[migrations]] §2 step 1 | "Create `backend/migrations/0124_<slug>.sql` … (head is `0123`)" | `backend/migrations/0124_guest_folios.sql` **exists and is applied**; a literal follower authors a second `0124_*`, which filename-sorts ambiguously for `wrangler d1 migrations apply`; next free slot is **`0128`** | FIX-DOC | — |
| `D‑3` | [[migrations]] §6 | 2610/115 · 3561/149 · 255/37 | 127/2743 and 155/3632; root 255/37 is the one row still correct | FIX-DOC | — |
| `D‑5` | [[migrations]] §5 "earlier" row | "`0100`–`0118` project-scoping series" | `backend/migrations/0119_pos_shifts_store_id.sql` is the same series (POS shifts get `store_id`); the range runs 0100–0119 | FIX-DOC | — |
| `D‑11` | [[07-data/README]] §Concepts | "the live top level (`0001`–`0014` + `0100`–`0127`) is what wrangler scans" | ranges are accurate but read as contiguous; `0125` is **deliberately** absent — the fact and its reason are documented at [[ARCHITECTURE]] §5 but not here, so a reader concludes a migration is missing | FIX-DOC | — |
| `G‑1` | [[analytics-guide]] §Customer Metrics | "&#124; **Customer Lifetime Value (CLV)** &#124; Total spend per customer over time &#124;" | `reports.js:404-411` returns exactly six keys — `days, total_customers, new_customers, repeat_customers, avg_order_value, avg_collected`; no `clv`, no `lifetime_*`; **git: `git log -S 'lifetime_value'` → 0 code commits**. The guide is the *only* artifact in the repo asserting this metric — no backlog row, no roadmap line, no migration, no stub, no endpoint reservation — so whether to strike the row or ship the metric is an owner roadmap call | UNKNOWN | — |
| `G‑2` | [[analytics-guide]] §Customer Segments | customers "automatically segmented by" booking frequency · spend level · recency · source | no `segments` key in the response and no segmentation code; **git: `git log -S 'segments' -- backend/src app/src` returns only path-segment helpers (`utils/errors.js`, `rateLimit.js` regex comment) and a marketing taxonomy array** — same owner-decision shape as `G‑1` | UNKNOWN | — |
| `G‑3` | [[analytics-guide]] §Retention Analysis | "**30-day retention** … **90-day retention** … **Annual retention**" | nothing computes it: no `retention` key in `customer-metrics`, no retention SQL in `reports.js`; the only `retention` hits in `backend/src` are Durable-Object eviction comments (`durable/broadcaster.js:20,357`) — a different concept that greps to the same word; **git: `git log -S 'retention' -- backend/src/api/reports.js` → 0** | UNKNOWN | — |
| `G‑4` | [[analytics-guide]] §Exporting Data | "exports live in super-admin templates as CSV/JSON, **no PDF**" | the tenant-panel half is right (no `/export` route in `reports.js` or `admin-reports.js`); the "no PDF" half is false — `REPORT_TEMPLATES` declares `formats: ['csv','pdf']` on **5 of 7** templates (`admin-reports.js:24,32,43,59,69`) and `['csv']` only at `:51,:77` | FIX-DOC | — |
| `G‑8` | [[camp-guide]] §Room Status Lifecycle | "a **four-state** lifecycle: available → reserved → occupied → cleaning → available" | `backend/src/api/camps.js:952` `const allowed = ['available','reserved','occupied','cleaning','out_of_service']` — **five**; `:955` writes two columns (`status`, `room_status`); a separate `cleaning_status` column carries its own 4-value CHECK (`0003_products.sql:44`) maintained by a different endpoint (`:907`) | FIX-DOC | — |
| `R‑1` | [[DEVELOPER_ROADMAP]] T9 | "+8 a11y-first UI primitives … **ui library is now 26 components**" | `ls app/src/components/ui/ &#124; wc -l` → **20**; the 8 named files never reached HEAD — **git: added `5d11305`, deleted `69311ce`**, a deliberate dead-code sweep — and no stories for them either | FIX-DOC | — |
| `R‑2` | [[DEVELOPER_ROADMAP]] T13 | "**16/16 panels use `@/lib/api`**" | `AdminApp.tsx` = 46 nav tabs, 48 `lazy()` calls in `:60-107`, 63 admin component files; the row's *substantive* claims (zero raw `fetch`, zero `window.*` data globals) still hold — only the denominator is stale | FIX-DOC | — |
| `R‑3` | [[DEVELOPER_ROADMAP]] T14 | "Shipped (**8 POS views**, …)" | `ls app/src/components/pos/views/` → **11** | FIX-DOC | — |
| `R‑4` | [[DEVELOPER_ROADMAP]] T19 | "**53 migrations**, **18 admin panels**, **552 E2E gate**" | 40 migrations head `0127`; 46 nav tabs / 63 admin files; 919 gate / 15 skipped — all three describe the pre-squash, pre-T13, pre-2026-09-06 tree | FIX-DOC | — |
| `R‑7` | [[DEVELOPER_ROADMAP]] §Remaining | "**Push blocked on OAuth `workflow` scope**" | `git branch -r --contains ddc63c6` → `origin/main`; every preceding vault commit is on the remote, so the blocker is resolved and the row still lists it open | FIX-DOC | — |
| `R‑8` | [[DEVELOPER_ROADMAP]] §"Known pre-existing type errors" | "part of the known **153-error baseline**" | dead twice over: the logbook records `tsc --noEmit` → **0 errors** at `T33 TEST-FIXTURE TSC DEBT: DONE (329 → 0)` (2026-09-06) and 2 pre-existing on 2026-10-03; and `tsc` cannot check `.astro` at all, so the two named errors are LSP-level, outside `tsc`'s reach. The companion sentence ("do not block `astro build`") is correct and should be kept | FIX-DOC | — |
| `R‑9` | [[BACKLOG_VOID_REFUND]] §Current | "`POST /api/pos/orders/:id/void` **exists** (manager-gated, stock restore, audit)" | the POS router has 10 routes and no void; the only void in the repo is `foliosRoutes.post('/:id/void')` (`backend/src/api/folios.js:337`, admin-only folio status flip from `0124_guest_folios.sql`); the `status != 'voided'` filters at `pos/index.js:1163,1168,1308` are defensive exclusions for a value no writer produces; **git: `git log -S 'orders/:id/void'` returns doc/backlog text only** — never code | FIX-DOC | — |
| `R‑10` | [[BACKLOG_VOID_REFUND]] §Next cycle item 3 | "**add `tip_amount` to `pos_transactions` via migration** + backfill 0" | it shipped — `backend/migrations/0120_add_tip_amount_to_pos_transactions.sql` exists and the file's own `code-references` block admits it; only "surface in reports" is genuinely open | FIX-DOC | — |
| `R‑11` | [[BACKLOG_VOID_REFUND]] §A11y/Perf notes | "Island discipline recorded in ARCHITECTURE.md (**4 islands** …)" + bare `ARCHITECTURE.md` | 9 public-facing island sites, not 4; the bare filename no longer resolves — it is `docs/01-architecture/ARCHITECTURE.md`. The second note in the same block (F-A19/F-A20 IDs genuinely absent) is correct and is the right way to close a stale backlog line | FIX-DOC | — |
| `R‑12` | [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] §"Migration budget" | "&#124; Current &#124; **99** &#124; head `0099` &#124;" and reserves `0100_tip_amount.sql` as a free slot | lineage is 40 files head `0127`; the slot it reserves, `backend/migrations/0100_add_project_id_nullable.sql`, has been live for six migrations; the tip column landed as `0120_…` — a follower would author a second `0100_*` | FIX-DOC | — |
| `R‑14` | [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] §6 | backend 2158/83 · frontend 3363/137 · root 255/37 · tsc 8 errors | 2743/127, 3632/155, root 255/37 exact, tsc 0→2; the *mechanism* is intact (thresholds 83/72/89/89 still match `AGENTS.md` §6) but the baseline is 755 tests behind | FIX-DOC | — |
| `R‑16` | [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §9.5 | "Backend 2155 → 2158 = +3 net of ALL audit changes", 83 files / 2158 tests "Fresh full run (**this session**)" | `backend/tests/orders-unit.test.js` exists, the three titles are quoted verbatim, the run is explicitly labelled a single-session measurement, and §9.5 self-describes as a *calibration of a delta* — i.e. **correct as a dated record**, which is exactly the usage the source entry's own Action `none` endorses. Fixing it would destroy the evidence | DEFER | — |
| `R‑19` | [[09-plans/README]] §Docs | "Live **18-line** backlog proposal" | `wc -l docs/09-plans/BACKLOG_VOID_REFUND.md` → **43**; small alone, but it is a count in the table whose job is sizing the folder — and `R‑9` shows what the file it points at contains | FIX-DOC | — |
| `N‑3` | [[tenant-import-types]] §3 | evidence note 2: "**`project` (I × 5).** … `runImport` contains **zero references** to `data.project` … **Inert** in both modes" — contradicting its own `O` matrix row | `backend/src/api/tenant-import.js:451` `if (data.project) {` and `:452` `const p = data.project;` — the note's "re-verified by grep this session" is a false negative; the matrix row is the correct half | FIX-DOC | — |
| `N‑4` | [[tenant-import-schema]] §"Schema-level findings" item 2 | "**`project` validated but inert**: runImport never reads `data.project` (verified by grep — zero references)" | `tenant-import.js:451` reads it; the same file's §2 table says the opposite and correctly ("**written** … updates the tenant's oldest live project, or INSERTs `proj_`+uuid12"). That table's line range (`:344–411`) is itself stale — the block is at `:451`+ in a 1,151-line file | FIX-DOC | — |
| `N‑5` | [[tenant-import-appendix]] Table 3 A1 | "&#124; A1 &#124; Entire `project` block … &#124; Parses, **never read by `runImport` in either mode** &#124;" | `tenant-import.js:451-452`, inside `runImport`, which both the existing-tenant and identity modes call | FIX-DOC | — |
| `N‑8` | [[BLOCKED-pos-products-composite-pk]] §5 | "**Identity-path rollback assessment — SKIPPED**": `tenant-import.test.js:787-1038` is the only identity-path suite; nothing exercises the rollback branch | all three legs superseded: `backend/tests/tenant-import-identity.test.js` exists (9 tests, `M1`–`M6` + `S1`–`S3`); `rollbackCreated()` is defined at `tenant-import.js:1007` and called at `:1099, :1103, :1118`; `backend/tests/tenant-import-rollback.test.js` also exists | FIX-DOC | — |
| `N‑9` | [[BLOCKED-pos-products-composite-pk]] §5.2 | "`tenant-import.js:723-726` records … **no D1 rollback was authorized**" | that range no longer holds the quote — `:719-728` is now the `meal_categories` / `meal_categories_lang` INSERT build in the 1,151-line file; the *substance* is superseded for the identity path by `rollbackCreated()` (`N‑8`) while remaining true of the existing-tenant path and of cross-section atomicity | FIX-DOC | — |
| `N‑13` | [[tenant-import-appendix]] §4 | "Each file covers **84 of the 88** leaf fields (measured 2026-10-02 … not asserted by hand)" + a four-row omission table | the recount is **83 / 88 with five omissions** — the four named, plus `menu.meals.mealCategoryId`, a placeholder whose removal the same section's own prose already documents two paragraphs below. The companion number (example manifest 69/88) is exact, so one number in a pair of self-declared measurements is off by one — enough to make a reader re-run both | FIX-DOC | — |
| `E‑1` | three carriers — `AGENTS.md` §2 tree · [[migrations]] §1 · `docs/98-history/sessions/WAVE6_EXIT_REPORT.md` | 53 files / head `0053_camp_ownership.sql` · 37 files / head `0123_storefront_order_items_fk_pos_products.sql` · "99 migrations (`0099_normalize_marketplace_payouts_ids.sql`)" | `ls backend/migrations/*.sql &#124; wc -l` → **40**, head `0127_meals_tenant_composite_pk.sql`; `AGENTS.md:70` still reads "D1 schema migrations (53 files — Layer 3)", `migrations.md:29` still reads 37/`0123`; **99 is the size of the excluded `legacy/` folder**, which holds `0053_camp_ownership.sql` and `0099_normalize_marketplace_payouts_ids.sql`. The correct figures are already published at [[ARCHITECTURE]] §5 and `07-data/README.md:64-69`. `98-history` is dated-record bucket: annotate 99 as the pre-squash count, do not rewrite the 2026-09-21 entry | FIX-DOC | — |
| `D‑13` | [[migrations]] §1 — nested inside `E‑1` | no doc distinguishes "head **in the tree**" from "head **applied**" | `backend/migrations/0127_meals_tenant_composite_pk.sql:4` — "⚠️ PENDING-APPLY. This file is committed but NOT applied to any database"; three docs state a head and none says which sense it means, while the tenant-import folder already reasons about `0127` as a landed change ("Reusable across tenants since 0127") | FIX-DOC | — |

## Class counts

| Class | Rows | Notes |
|---|---|---|
| **FIX-DOC** | **71** | every wrong count, path, wording and dead citation; includes all nine `git log -S` findings that turned a candidate-absent feature into a deliberately-removed one |
| **DEFER** | **1** | `R‑16` — correctly labelled dated evidence; fixing it would destroy the measurement |
| **REJECT** | **0** | no entry met "never existed **and** never intended": every absence had either a removal commit or an owner decision attached |
| **IMPLEMENT** | **0** | see the history-check table — 0 candidates survived it |
| **UNKNOWN** | **3** | `G‑1`, `G‑2`, `G‑3` |
| **Total** | **75** | |

## IMPLEMENT list (with severities)

**None.** No entry classified `IMPLEMENT`, so the P0/P1/P2/P3 axis is empty. Every candidate that
failed the `git log -S` gate, with the finding that disqualified it:

| Candidate | Disqualifying finding |
|---|---|
| `S‑2`, `S‑3` — 64 client functions / 120 hooks "missing" | removed on purpose in `8d626e3` "dead-code pass … grep-verified zero consumers" → rule 2 ⇒ FIX-DOC |
| `F‑7`, `R‑1` — 8 a11y primitives + 8 stories "never realised" | added `5d11305`, **deleted `69311ce`** ("65 tables → 34 tables, 30 dead tables dropped") ⇒ FIX-DOC |
| `S‑4` — 13 `ai_*`/`crm_*`/`storefront_*` tables | `git log -S` over `backend/` returns **0 commits** for all 13; the tables were invented by `API_SURFACE.md` ⇒ FIX-DOC (the doc is wrong, nothing to build) |
| `A‑4` — monitor D1 binding | deliberately replaced by R2 in the phases 1–7 migration completed 2026-10-03 ⇒ FIX-DOC |
| `R‑9` — `POST /api/pos/orders/:id/void` | never existed, and already tracked as an explicit backlog proposal (`a4632f2`) ⇒ FIX-DOC for the false §Current claim; the build is the backlog's job, not a gap |
| `S‑5` — `GET /api/products/:id` | the endpoint does not exist either (not just the OpenAPI annotation) ⇒ the map row is wrong ⇒ FIX-DOC |
| `G‑1`/`G‑2`/`G‑3` — CLV, segmentation, retention | never existed and *might* be wanted → UNKNOWN, not IMPLEMENT |

**Two code-side residues were observed while verifying and are deliberately **not** classified,**
because no STALE/FALSE entry claims them and this audit must not invent scope:

1. `O‑21` M21's live residue — **6** `DROP TABLE` without `IF EXISTS` in the applied lineage
   (0107, 0108, 0111, 0112, 0115, 0126). The doc claims "20 in 11 migrations" (all legacy), so a
   reader who trusts it under-protects the 6 that remain.
2. `A‑4`'s orphaned `campmaster-monitor-db` D1 database — a Cloudflare resource that must be
   deleted by hand; an ops action, not a doc claim.

## UNKNOWN list (with severities)

Severity is assigned to `IMPLEMENT` only, so these carry **no** severity under the mission's rules.
The blocker is a decision, not evidence.

| id | source | claim | why it cannot be decided from the tree | owner question |
|---|---|---|---|---|
| `G‑1` | [[analytics-guide]] §Customer Metrics | "Customer Lifetime Value (CLV) — Total spend per customer over time" | `GET /api/reports/customer-metrics` returns exactly six keys (`reports.js:404-411`); `git log -S 'lifetime_value'` → 0 code commits. `analytics-guide.md` is `status/live` + `audience/tenant-admin` and is the **only** artifact in the repo that asserts this metric | strike the row, or add `clv` to the endpoint? |
| `G‑2` | [[analytics-guide]] §Customer Segments | four tiers of automatic segmentation (booking frequency · spend level · recency · source) | no `segments` key, no segmentation code; `git log -S 'segments'` finds only path-segment helpers. Same single-carrier situation as `G‑1` | strike the section, or build segmentation? |
| `G‑3` | [[analytics-guide]] §Retention Analysis | 30-day / 90-day / annual retention | no `retention` key or SQL in `reports.js`; `git log -S 'retention' -- reports.js` → 0. The only `retention` hits in `backend/src` are Durable-Object eviction comments — a different concept that greps to the same word | strike the section, or compute retention? |

**Interim safe action for all three** (independent of the answer): stop presenting them as shipping
metrics in a live tenant-admin guide. Three fabricated capabilities sit in the same table format as
the three that are real, so a tenant admin building a retention programme is currently planning
against numbers the API never returns.

## What this audit did **not** do

- Did not edit `docs/99-gaps/*`, any source doc, or any code.
- Did not re-run any suite; every test-count figure is quoted from
  `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md`, the same discipline the source note used.
- Did not run `wrangler`, deploy, or make a remote call — except `git branch -r --contains`, which is
  the check `R‑7` itself is about.
- Did not assign a second severity axis. The source entries' own P-ratings stay in
  `code-vs-docs.md`.