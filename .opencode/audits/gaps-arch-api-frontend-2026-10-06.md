---
title: "Gap audit — architecture / api / frontend (code vs docs)"
aliases:
  - gaps-arch-api-frontend-2026-10-06
type: audit
audience: agent
domain: docs
status: current
created: 2026-10-06
baseline: dee3124
scope: docs/01-architecture docs/02-api docs/03-frontend
---

# Gap audit — architecture / api / frontend (code vs docs)

**Date** 2026-10-06 · **Baseline** `dee3124` (confirmed pushed before any write: `git rev-parse HEAD` ==
`git rev-parse @{u}` == `dee312406a60bbbbb62d378a8d541c42a300fb1f`, 0 ahead/behind).

**Scope** every doc in `docs/01-architecture` (3), `docs/02-api` (3), `docs/03-frontend` (3) — 9 files,
1,647 lines. **Fix nothing was fixed**: no doc edited, no source edited, no test suite re-run, no
`wrangler`, no deploy. The only files touched by this audit are this report and the `AGENT_LOGBOOK.md`
fold.

**Method.** Every verifiable claim was extracted and checked with a real command. `rg` is not on PATH;
searches used the `grep` tool and `node:fs` scripts from `/tmp`. Where a whole table could be checked
mechanically it was, rather than sampled — `API_SURFACE_MAP.md`'s 268 endpoint rows were extracted and
matched against `backend/openapi.json`, against every `app.route()` mount in `backend/src/index.js`,
against `app/src/lib/api.ts` exports, against every `use*` export under `app/src`, and against every
`CREATE TABLE` in `backend/migrations/**`. Test counts were **not** re-derived by running suites; they
are read from the latest committed suite result recorded in
`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` (see the source note on entry A‑20).

**Classes** — `MATCHED` (claim is true of the code), `STALE` (was true, has drifted), `FALSE` (not true
and never was, or contradicted by the same doc set), `UNVERIFIED` (cannot be checked from the tree
without running something expensive, or the cited authority does not exist), `UNDOCUMENTED` (real code
with no claim anywhere in scope).

## Summary

| Class | Count |
| --- | --- |
| MATCHED | 51 |
| STALE | 15 |
| FALSE | 13 |
| UNVERIFIED | 11 |
| UNDOCUMENTED | 4 |
| **Total entries** | **94** |

By severity: **P0 0 · P1 4 · P2 22 · P3 68**.

By doc: `ARCHITECTURE.md` 26 entries · `QUICK_START.md` 7 · `01-architecture/README.md` 1 ·
`API_CONTRACT.md` 11 · `API_SURFACE_MAP.md` 11 · `02-api/README.md` 2 · `COMPONENT_CATALOG.md` 8 ·
`PERF_BASELINE.md` 14 · `03-frontend/README.md` 3.

**The single worst structural finding is API_SURFACE_MAP's Frontend Function and React Hook columns.**
Those two columns are largely fictional: 64 of 249 referenced client functions and 120 of 195
referenced hooks do not exist anywhere under `app/src`. The Endpoint column, by contrast, is sound —
all 268 rows resolve to a real route. So the table is authoritative about the wire and invented about
the code that calls it, which is the inverse of what its own header instructs readers to trust.

---

# 01-architecture

## A‑1 · [[ARCHITECTURE]] §5 — migration lineage

- **Source** `docs/01-architecture/ARCHITECTURE.md` §5 "Database & migrations"
- **Claim (verbatim)** "At `dbcb382` that is **40 top-level `.sql` files**, head
  `0127_meals_tenant_composite_pk.sql`. It is *not* a contiguous range: `0001`–`0014`, then
  `0100`–`0127`."
- **Expected** 40 top-level `.sql` files; highest-numbered is `0127_*`; numbering runs 0001–0014 then
  0100–0127.
- **Actual** `ls backend/migrations/*.sql | wc -l` → **40**. Highest = `0127_meals_tenant_composite_pk.sql`.
  Sequence: `0001…0014 0100…0108 0110…0124 0126 0127` — exactly the two blocks claimed.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑2 · [[ARCHITECTURE]] §5 — the two deliberate gaps

- **Claim** "`0109` is **reserved-but-absent** … and `0125` was verified free and deliberately skipped
  when the D3 mission took `0126`. A gap in the ledger is normal and is not drift."
- **Expected** `0109*` and `0125*` absent from `backend/migrations/`.
- **Actual** `ls backend/migrations/0109*` → No such file. `ls backend/migrations/0125*` → No such file.
  The reason for `0109` is documented in `0110`'s own header, as claimed.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑3 · [[ARCHITECTURE]] §5 — `legacy/` is out of lineage

- **Claim** "`legacy/` (99 files, incl. the never-applied `0076_sanitize_user_data.sql`) … are
  **excluded** from the lineage — `scripts/check-deploy-parity.sh` inventories top-level `*.sql` only."
- **Expected** 99 files in `backend/migrations/legacy/`; `0076_sanitize_user_data.sql` among them; the
  parity script globs only the top level.
- **Actual** `ls backend/migrations/legacy/*.sql | wc -l` → **99**. `0076_sanitize_user_data.sql` present
  (`legacy/0076_sanitize_user_data.sql`). `scripts/check-deploy-parity.sh` (148 lines) inventories
  top-level only.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑4 · [[ARCHITECTURE]] §5a — monitor D1 binding · **FALSE**

- **Claim** "| D1 | `campmaster-monitor-db`, `migrations_dir = migrations` |"
- **Expected** a `[[d1_databases]]` binding in `monitor/wrangler.toml` naming `campmaster-monitor-db`
  with `migrations_dir = migrations`.
- **Actual** **`monitor/wrangler.toml` has no `[[d1_databases]]` block at all** (64 lines, full file
  read). Lines 14–21 say so explicitly: *"there is NO relational binding on this worker any more, and
  no `migrations/`"*. Storage is a single R2 bucket, `MONITOR_BUCKET` = `campmaster-monitor-media`
  (`monitor/wrangler.toml:39-41`). `monitor/migrations/` no longer exists and `monitor/src/db.js` was
  deleted. `campmaster-monitor-db` survives only as an orphaned Cloudflare resource the owner must delete
  manually.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Note** this is a *known* deferral, not a new discovery: the 2026-10-03 `mon-probe-selfcheck` logbook
  entry records it verbatim — *"the rest of that same `docs/ARCHITECTURE.md` monitor block still
  describes `D1 | campmaster-monitor-db, migrations_dir = migrations` … both untrue since the monitor's
  D1 migration completed (phases 1–7 …), i.e. this block has been describing a pre-R2 worker."*

## A‑5 · [[ARCHITECTURE]] §5a — monitor retention wording · STALE

- **Claim** "| Retention | cron-written tables are pruned (`checks` 14d, `reports` 30d, orphaned
  `alert_state`) |"
- **Expected** a daily prune over D1 tables named `checks` and `reports`, 14 and 30 days, plus
  orphaned alert state.
- **Actual** The day counts are still correct constants — `CHECKS_RETENTION_DAYS = 14`,
  `REPORTS_RETENTION_DAYS = 30` (`monitor/src/storage.js:48-49`), swept by `runRetention`
  (`monitor/src/index.js:1881-1882`). But the substrate is no longer tables: they are R2 objects under
  key prefixes `checks/<YYYY-MM-DD>/<HH-MM>.json` and `reports/…` (`monitor/wrangler.toml:26-27`).
  "tables" is a pre-R2 word for objects that no longer exist as tables.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC

## A‑6 · [[ARCHITECTURE]] §5a — monitor targets

- **Claim** "Targets | 5 public URLs, listed **in code** (`monitor/src/targets.js`), not in the DB.
  **No self-check target**: a Worker fetching a Worker through the same zone is answered with 522 …"
- **Expected** five targets; no self-check; the reasoning recorded in the source.
- **Actual** `monitor/src/targets.js:16-20` — `marketplace`, `api-public`, `acacia`, `michaelshouse`,
  `api-meals`, all `expect: 200`, `timeoutMs: 10000`. The removal note occupies lines 21–46 and states
  the 522 argument exactly as documented.
- **Class** MATCHED (content) with a line-range nit: the cited `monitor/src/targets.js:15-41` ends
  inside the comment block; the `TARGETS` array is lines **15–47**. · **Severity** P3 · **Action** UPDATE-DOC

## A‑7 · [[ARCHITECTURE]] §5a — worker identity, cron, deploy exclusion

- **Claim** "`campmaster-monitor` is a **separate Worker with its own bindings** … Cron `*/5 * * * *`
  … `deploy.sh` does **not** ship it."
- **Expected** name `campmaster-monitor`; `crons = ["*/5 * * * *"]`; no `monitor` reference in `deploy.sh`.
- **Actual** `monitor/wrangler.toml:1` `name = "campmaster-monitor"`; `:11-12`
  `crons = [ "*/5 * * * *" ]`; `grep -n "monitor" deploy.sh` → **zero hits**.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑8 · [[ARCHITECTURE]] §3 — island directive census · **all three numbers correct**

- **Claim** "re-counted 2026-10-02: **17 directive sites** — 8× `client:only` … 6× `client:visible` …
  3× `client:load` … (A raw `grep client:` over `app/src` reports 23 hits; 6 are code-comment mentions
  inside `Storefront*.tsx` / `PosShell.tsx` / `AdminShell.tsx`, not directives.)"
- **Expected** 17 real directives split 8/6/3; 23 raw grep hits of which 6 are comments.
- **Actual** Raw `grep -rn "client:"` over `app/src` → **23**. Of those, exactly 6 are JSDoc prose:
  `ShopCatalog.tsx:4`, `StorefrontCart.tsx:4`, `StorefrontCheckout.tsx:4`,
  `StorefrontConfirmation.tsx:4`, `PosShell.tsx:10`, `AdminShell.tsx:12`. The remaining **17** are real
  template attributes — `client:only` ×8 (`pages/admin/[...rest]/index.astro:7`,
  `pages/pos/login/index.astro:16`, `pages/pos/[...rest]/index.astro:16`,
  `pages/auth/forgot-password.astro:7`, `pages/auth/reset-password.astro:7`,
  `pages/onboarding.astro:7`, `pages/register/index.astro:7`, `pages/signup.astro:7`),
  `client:visible` ×6 (`components/public/TenantLanding.astro:203`,
  `pages/marketplace.astro:14`, `pages/storefront/index.astro:54`, `pages/storefront/cart.astro:52`,
  `pages/storefront/checkout.astro:53`,
  `pages/storefront/order/[orderNumber]/confirmation.astro:54`), `client:load` ×3
  (`components/public/BookPage.astro:45`, `components/public/MenuPage.astro:48`,
  `layouts/PublicLayout.astro:778`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** the arithmetic is the kind that invites a false report, so it was checked
  twice. The four storefront *components* carry a comment mentioning `client:visible`; their real
  directives live in the four storefront `.astro` pages. Counting comments as directives would have
  produced 10/10/3 and a spurious finding.

## A‑9 · [[ARCHITECTURE]] §3 — `DebugFeedbackWidget` fix

- **Claim** "`DebugFeedbackWidget` moved `client:visible` → `client:load` (PublicLayout only …) … This
  is why the split is **6 visible / 3 load** and not 7/2."
- **Expected** a `client:load` on the debug widget inside `PublicLayout.astro` only.
- **Actual** `app/src/layouts/PublicLayout.astro:778` → `client:load`. No `DebugFeedbackWidget` reference
  in `AdminShell`/`PosShell` template bodies.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑10 · [[ARCHITECTURE]] §3 — design-system primitive count

- **Claim** "**Design system**: 20 primitives in `app/src/components/ui/`"
- **Expected** 20 files.
- **Actual** `ls app/src/components/ui/ | wc -l` → **20**.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Cross-doc** `COMPONENT_CATALOG.md` §1 says the same 20 and accounts for them (26 rows − 9 with no
  file + 3 undocumented = 20). Internally consistent. Note the repo's `AGENTS.md` still says 26, but
  that file is out of this audit's scope.

## A‑11 · [[ARCHITECTURE]] §3 — `window.*` globals · one site omitted

- **Claim** "verified 2026-10-02: zero `window.*` data globals anywhere under `components/admin/` or
  `components/pos/`. … `CampsSection.astro` still sets/reads `window.__API_BASE` and
  `window.__SSR_RENDERED` (`MarketplaceHome.astro` reads `__API_BASE`) and `gallery.astro` uses
  `window.__galleryImages`."
- **Expected** no cross-file data global under admin/pos; the three named public files are the only
  public ones.
- **Actual** All 22 `window.*` occurrences under `components/admin/` + `components/pos/` are browser
  APIs, not channels: `window.print()` (`PaymentReceipt.tsx:115`, `FolioReceipt.tsx:157`,
  `views/ReceiptModal.tsx:51`), `window.URL.createObjectURL` (`AuditLogPanel.tsx:87,93`),
  `window.location` (`ResetPasswordPage.tsx:17`, `RegisterPage.tsx:18`, `AdminApp.tsx:217,329,332,333,341`,
  `POSApp.tsx:157,252`), `setTimeout`/`clearTimeout`, `window.open`. All three named public globals
  confirmed. **A fourth `__API_BASE` site is not listed**: `app/src/middleware/securityHeaders.ts` also
  references it.
- **Class** MATCHED (the claim itself) + one UNDOCUMENTED site · **Severity** P3 · **Action** UPDATE-DOC

## A‑12 · [[ARCHITECTURE]] §3 — image pipeline

- **Claim** "`astro.config.mjs` uses `sharpImageService()` with
  `image.remotePatterns: [{ protocol: 'https' }]`. `SafeImage.astro` normalizes URLs, runs
  `getImage`, and falls back to a plain `<img>` on any error so pages never 500 on remote fetch
  failure."
- **Expected** both.
- **Actual** `app/astro.config.mjs:1` imports `sharpImageService`; `:46` `service: sharpImageService()`;
  `:47` `remotePatterns: [{ protocol: 'https' }]`. `SafeImage.astro:16` `import { getImage } from
  'astro:assets'`, `:60` `optimized = await getImage({`, `:69` `} catch {`, `:76` plain `<img>`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑13 · [[ARCHITECTURE]] §3 — no i18n

- **Claim** "there is NO i18n system — the frontend is hard-coded English LTR (deliberate decision;
  see `DEVELOPER_ROADMAP.md`)"
- **Expected** no i18n directory; the roadmap file exists somewhere in the vault.
- **Actual** `ls app/src/i18n` → No such file or directory. `docs/09-plans/DEVELOPER_ROADMAP.md` exists.
- **Class** MATCHED (the vault-relative reference resolves; the bare filename is stale after the
  restructure) · **Severity** P3 · **Action** UPDATE-DOC

## A‑14 · [[ARCHITECTURE]] §3 — AI split

- **Claim** "deterministic math … stays server-side (D1-backed); model inference … runs client-side …
  (`app/src/lib/browser-ai.ts`, loaded lazily on the AI panel — never in the main bundle).
  `/api/ai/workers-ai/*` and `/api/ai/state/*` remain honest 503 stubs; no `AI`/`STATE_DO` binding
  exists."
- **Expected** all four.
- **Actual** `backend/src/api/ai.js` mounted at `/api/ai`; no `AI` or `STATE_DO` binding in
  `backend/wrangler.toml` (grep over all 149 lines → none). Lazy import at
  `app/src/lib/browser-ai.ts:237` (verified in A‑50).
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑15 · [[ARCHITECTURE]] §4 — frontend role ladder

- **Claim** "`ROLE_HIERARCHY` in `app/src/lib/rbac.ts` — `super_admin` 100 > `admin` 80 > `manager` 50 >
  `cashier` 30, and `roleAtLeast()` treats any unknown role (including undefined) as failing."
- **Expected** the four ranks and the fail-closed unknown behaviour.
- **Actual** `app/src/lib/rbac.ts:7-12` exactly those four keys; `:20`
  `return (ROLE_HIERARCHY[role ?? ''] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);` — an unknown role maps
  to 0, so it fails any positive minimum.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Cross-doc** `API_CONTRACT.md` §3 contradicts this. See entry **C‑3**.

## A‑16 · [[ARCHITECTURE]] §4 — rate-limit policy table · prefix count FALSE

- **Claim** "The limiter is a ~20-entry ordered policy table keyed `${cf-connecting-ip}:${path}` (first
  match wins) with per-entry env dials, plus a tenant-scoped second layer on **7 prefixes**; it keys on
  `cf-connecting-ip` only (not spoofable) and **fails closed** (429 on KV error)."
- **Expected** ~20 ordered entries; a tenant-scoped layer on 7 prefixes.
- **Actual** The table is `RATE_LIMIT_POLICIES` at `backend/src/middleware/rateLimit.js:25-112` — **23**
  entries (line range matches the doc's `rateLimit.js:25-113` code-reference), so "~20" is fair.
  First-match-wins confirmed by the header comment at `rateLimit.js:13`. Keying confirmed at
  `rateLimit.js:181-182`: `const ip = c.req.header('cf-connecting-ip') || 'unknown'`. Fail-closed
  confirmed at `:211` and `:246`: `c.json({ success: false, error: 'Rate limit check failed' }, 429)`.
  **The prefix count is wrong: the tenant-scoped second layer is mounted on 36 prefixes, not 7** —
  `grep -oE "app\.use\('/api/[^']*', tenantAwareLimiter\(\)\)"` over `backend/src/index.js` returns 36
  distinct mounts (`/api/admin/*`, `/api/ai/*`, `/api/audit/*`, `/api/categories/*`, `/api/crm/*`,
  `/api/financials/*`, `/api/folios/*`, `/api/hr/*`, `/api/inbox/*`, `/api/inventory/*`,
  `/api/leads/*`, `/api/meal-categories/*`, `/api/meals/*`, `/api/me/*`, `/api/orders/*`,
  `/api/plans/*`, `/api/pos-tables/*`, `/api/pos/*`, `/api/price-overrides/*`, `/api/products/*`,
  `/api/projects/items/*`, `/api/projects/links/*`, `/api/projects/:projectId/meta/*`,
  `/api/projects/:projectId/tags/*`, `/api/promotions/*`, `/api/rateplans/*`, `/api/reports/*`,
  `/api/rooms/*`, `/api/services/*`, `/api/storefront/*`, `/api/supply/*`, `/api/tags/*`,
  `/api/tenant/billing/*`, `/api/tenants/import/*`, `/api/tenants/:tenantId/meta/*`, `/api/upload/*`).
- **Class** FALSE (the 7-prefix figure) · **Severity** **P2** · **Action** UPDATE-DOC
- **Why it matters** 7 vs 36 understates the tenant-scoped surface by 5×, and this is the layer that makes
  multi-tenant rate limiting real. It was probably true when a handful of mounts existed and was never
  re-counted.

## A‑17 · [[ARCHITECTURE]] §4 — CORS is an async allowlist

- **Claim** "CORS is an **async** origin allowlist, not an array — wildcard regexes plus a 5-minute-cached
  tenant custom-domain lookup (`backend/src/index.js:123–141`)."
- **Expected** `origin` as a function, with a cached custom-domain lookup.
- **Actual** `backend/src/index.js:123` `app.use('*', cors({`; `:125` `origin: async (origin, _c) => {`;
  `:128` wildcard regex loop; `:130` `EXACT_ORIGINS.includes(origin)`; `:132-136`
  `getAllowedCustomDomains(_c.env)` behind a 5-min cache (`_customDomainCache`, see the helper ending
  at `:121`); `:138` `return null`. The cited range is exact.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑18 · [[ARCHITECTURE]] §4 — response helpers

- **Claim** "`jsonResponse` / `cachedJsonResponse` / `errorResponse` in `backend/src/utils/response.js`.
  All data is camelCased (`toCamel`) on the way out; the registry (`routes/registry.js`) documents the
  contract."
- **Expected** three helpers, `toCamel` applied on output, registry present.
- **Actual** `backend/src/utils/response.js:38` `jsonResponse`, `:64` `cachedJsonResponse`,
  `:87` `errorResponse`, `:11` `toCamel` — inside both success helpers (`JSON.stringify(toCamel(data))`
  at `:41` and `:65`). `backend/src/routes/registry.js` = 3,494 lines, header at `:1-8` calls itself
  "the single source of truth for the API contract". Two helpers the doc does not mention:
  `ok(data, status)` (`:96`) and `created(id, status)` (`:103`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑19 · [[ARCHITECTURE]] §1 — `pos_users` schema rules

- **Claim** "`pos_users.name` is a **generated column** (`first_name || ' ' || last_name`): INSERT with
  `first_name`/`last_name` only." and "`pos_users.organization_id` is `INTEGER NOT NULL` — every INSERT
  must include it."
- **Expected** both in the current lineage head.
- **Actual** `backend/migrations/0126_tenant_scoped_unique_sku_email.sql:224` (the latest `pos_users`
  rebuild) carries `name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED`;
  `:…` `organization_id INTEGER NOT NULL DEFAULT 1` (also `0004_pos.sql:36`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑20 · [[ARCHITECTURE]] §7 — test-count table · three STALE rows

- **Claim** (table) Backend unit **124** files / **2701** tests (`3f66503`) · Frontend unit **154** /
  **3611** (`09ff710`) · Monitor unit **7** / **72** (`921e871`) · Root integration **37** files /
  **255** registered.
- **Expected** the latest committed suite result for each suite.
- **Actual** Suites were **not** re-run (the mission says to read them, not to spend 90s+ per suite).
  Source: the latest suite result recorded per suite in
  `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` — `cd backend && npx vitest run` → **127 files /
  2743 tests** PASS (2026-10-02 `a2-saga-status`, re-confirmed same day by `a7-workstream-closure`);
  `cd app && npx vitest run` → **155 files / 3632 tests** PASS (2026-10-03 `tenant-outage-vs-404`);
  `cd monitor && npx vitest run` → **7 files / 191 tests** PASS (2026-10-03 `mon-probe-selfcheck`).
  So backend is **3 files / 42 tests** behind, frontend **1 file / 21 tests** behind, monitor **119
  tests** behind — monitor's count is off by more than 2×. Root integration 37/255 is the only row still
  current.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Mitigation already in the doc** each row is labelled with its producing commit, which is exactly why
  the drift is visible rather than authoritative. That design choice worked; it just needs a refresh.
- **Cross-doc** `QUICK_START.md` §4 carries a *third*, older set of numbers. See **Q‑4**.

## A‑21 · [[ARCHITECTURE]] §7 — E2E spec count and the `AGENT_LOGBOOK.md` pointer · STALE

- **Claim** "`tests/e2e/` now holds 96 spec files across 8 Playwright projects (`marketplace`, `tenant`,
  `admin`, `auth`, `cross-cutting`, `pos`, `public`, `routing`)." and "The last full gate recorded in
  `AGENT_LOGBOOK.md` is 919 passed / 0 failed / 15 env-skipped (2026-09-06, per-project)."
- **Expected** 96 specs, 8 projects, and the gate figure still findable in `AGENT_LOGBOOK.md`.
- **Actual** `find tests/e2e -name "*.spec.ts" | wc -l` → **96**. Eight projects named exactly as listed,
  `playwright.config.ts:…`. **The gate figure is no longer in `AGENT_LOGBOOK.md`** — that file is 182
  lines and now holds only the persistent-learnings tier; the append-only task history (9,725 lines)
  moved to `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` in the 2026-10-06 restructure, and the
  919/0/15 line lives there. The pointer is dangling.
- **Class** STALE (pointer) · **Severity** P2 · **Action** UPDATE-DOC
- **Credit where due** the counts themselves are exact and the decision to publish *no* E2E total rather
  than a remembered one is the right call. Only the citation needs re-pointing.

## A‑22 · [[ARCHITECTURE]] §7 — root-integration caveat

- **Claim** "`tests/globalSetup.ts` boots `wrangler dev` and never applies migrations, so a fresh
  `.wrangler/state` is a blank DB and the suite 500s on `no such table`."
- **Expected** `playwright.config.ts` style local apply vs `globalSetup.ts` without one.
- **Actual** Consistent and corroborated: `playwright.config.ts:107` *does* apply migrations
  (`wrangler d1 migrations apply campmaster-db --local && npx wrangler dev`), while `tests/globalSetup.ts`
  is the root-integration path the doc names. Not re-run (pre-existing, out of scope).
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑23 · [[ARCHITECTURE]] §5 — KV / R2 / SSE bindings

- **Claim** "KV holds **only** rate-limit state (`RATE_LIMIT_KV`); `KV_CACHE` is bound but never written …
  R2 (`MEDIA_BUCKET` = `campmaster-media`) holds uploads … SSE is broadcast through the `BROADCASTER`
  Durable Object."
- **Expected** all four.
- **Actual** `backend/wrangler.toml`: `:21` `binding = "KV_CACHE"`, `:25` `binding = "RATE_LIMIT_KV"`,
  `:33-34` `binding = "MEDIA_BUCKET"` / `bucket_name = "campmaster-media"`, `:38-39` `name = "BROADCASTER"`.
  `KV_CACHE` is **only ever read** — `grep -rn "KV_CACHE.put" backend/src` → **0 hits**; the three uses
  are `admin-health.js:31,36` and `index.js:180,181,184`, all `.get`/existence checks.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Cross-doc** `[env.staging]` names the staging R2 bucket `campmaster-media-staging`
  (`backend/wrangler.toml:140`); the doc quotes the production name only. Acceptable shorthand.

## A‑24 · [[ARCHITECTURE]] §6 — deploy

- **Claim** "`./deploy.sh` — deploys the backend Worker + D1 migrations, then builds/deploys the frontend
  to Cloudflare Workers … `./deploy.sh --staging` — same flow against the staging environment (validates
  `[env.staging]` … first)."
- **Expected** migrations then worker then frontend; a staging mode.
- **Actual** `deploy.sh:375-376` "Applying database migrations…" → `echo y | npx wrangler d1 migrations
  apply $D1_NAME --remote $ENV_FLAG`; `:379` `npx wrangler deploy --minify $ENV_FLAG`;
  `:39-40` `if [ "$MODE" = "--staging" ]; then DEPLOY_ENV="staging"`. `[env.staging]` exists at
  `backend/wrangler.toml:92`.
- **Class** MATCHED · **Severity** P3 · **Action** none

## A‑25 · [[ARCHITECTURE]] §2 — zone model

- **Claim** (full table + bullet) system prefixes never forbidden; `/camps /camp /camp/*` marketplace-only;
  `/pos /pos/* /menu /book /rooms /storefront /storefront/*` tenant-only; forbidden → branded 404 via
  `ZoneGuard`; exact-path matching so `/bookings` is not forbidden.
- **Expected** all of it, read off `app/src/lib/routeZones.ts`.
- **Actual** `routeZones.ts:25-36` `SYSTEM_PREFIXES` = exactly the ten listed, in the documented order.
  `:55` `if (pathname === '/camps' || pathname === '/camp' || pathname.startsWith('/camp/')) return zone !==
  'marketplace'`. `:58` `/pos` + `startsWith('/pos/')` → tenant-only. `:61` `/menu` `/book` `/rooms` →
  tenant-only. `:64` `/storefront` + `startsWith('/storefront/')` → tenant-only. `:48` `resolveZone(_url,
  tenantId)` returns `'marketplace'` for empty id. Exact-path matching holds: `/bookings` matches none of
  the branches.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** `ARCHITECTURE.md` §2 correctly lists `/storefront`; the repo's `AGENTS.md` zone bullet omits it.
  Out of scope, but it is why the in-scope doc is the correct one.

## A‑26 · [[ARCHITECTURE]] — header provenance

- **Claim** "Verified against `dbcb382` on 2026-10-02." while §5 in the same file says "At `dbcb382` that is
  **40 top-level `.sql` files**, head `0127`".
- **Expected** the named commit is an ancestor and its content matches the file.
- **Actual** `dbcb382` resolves in history, but the file has been edited since (the 0127 half was
  committed later) and HEAD is now `dee3124`. So the header names a commit that no longer matches the
  file's own §5, which cites the same commit for a number that commit did not have.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC

---

## Q‑1..Q‑7 · [[QUICK_START]]

## Q‑1 · §1/§3 — local run commands and ports

- **Claim** "Backend API (Hono on Workers, port 8787) … Frontend (Astro, port 4321 — Astro default) …
  Playwright's E2E webServer boots its own Astro instance on `:4320`".
- **Expected** 8787 / 4321 / 4320.
- **Actual** `playwright.config.ts:4` `const UNIFIED_PORT = 4320`; `:108` `port: BACKEND_PORT`;
  `:116-117` `command: 'cd app && npx astro dev --port 4320 --host'`, `port: UNIFIED_PORT`. 4321 is the
  Astro default and is what `app/package.json`'s `lighthouse` script targets
  (`http://localhost:4321 --budget-path=budget.json`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## Q‑2 · §2 — required env

- **Claim** "`JWT_SECRET` … **Yes** — no fallback; auth throws immediately if unset";
  "`RATE_LIMIT_KV_ENABLED` | `backend/wrangler.toml` `[vars]` | Keep `"false"`".
- **Expected** both.
- **Actual** `backend/wrangler.toml:56` `RATE_LIMIT_KV_ENABLED = "false"` in `[vars]` (and `:97` in
  `[env.staging.vars]`). `requireAuth.js` takes `env.JWT_SECRET` with no default and `verifyToken`
  fails without it; `AGENT_LOGBOOK.md` records `getJwtSecret()` throwing.
- **Class** MATCHED · **Severity** P3 · **Action** none

## Q‑3 · §5/§7 — build, lighthouse, codegen scripts

- **Claim** "`cd app && npm run build && npm run preview` … `cd app && npm run lighthouse` # audits
  http://localhost:4321 against budget.json"; "`cd backend && npm run gen:openapi` … `cd app && npm run
  gen:types`".
- **Expected** four scripts.
- **Actual** `app/package.json` `lighthouse`: `npx --yes lighthouse http://localhost:4321
  --budget-path=budget.json --only-categories=performance,accessibility,best-practices,seo …`.
  `gen:types`: `openapi-typescript ../backend/openapi.json -o src/lib/api-types.ts`.
  `backend/package.json` `gen:openapi`: `vite-node scripts/generate-openapi.js`
  (`backend/scripts/generate-openapi.js`, 14 lines).
- **Class** MATCHED · **Severity** P3 · **Action** none

## Q‑4 · §4 — test counts · **a third, older set** · STALE

- **Claim** (block) "backend unit: 2225 tests / 84 files · frontend unit: 3416 tests / 137 files · root
  integration: 255 tests / 37 files · E2E: 929 total / 919 gate (14 env-skipped)"
- **Expected** agreement with `ARCHITECTURE.md` §7 and with the logbook.
- **Actual** Latest committed results (`AGENT_LOGBOOK_HISTORY.md`, same source as **A‑20**): backend
  **127 / 2743**, frontend **155 / 3632**, monitor **7 / 191**. Root integration 37/255 is the one row
  still right. E2E: `ARCHITECTURE.md` §7 deliberately publishes **no** total, while this file still
  prints "929 total / 919 gate" and says **14** env-skipped where `ARCHITECTURE.md` says **15** — the two
  in-scope docs disagree with each other on a number neither can source.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** raised above P3 because this is not one drifted number in one doc: three
  different count sets for the same suites are live in the same folder, and the E2E total this file
  preserves is precisely the figure the sibling doc's design decision deleted for being unverifiable.

## Q‑5 · §6 — staging requirement

- **Claim** "Staging requires `staging.sinaicamps.com` → Workers DNS to be created in Cloudflare first
  (human action)."
- **Expected** a human-action note, unverifiable from the tree.
- **Actual** `deploy.sh:39-40` sets `DEPLOY_ENV="staging"`; `[env.staging]` exists at
  `backend/wrangler.toml:92-149`. The DNS claim is inherently a Cloudflare-console fact.
- **Class** UNVERIFIED (external state) · **Severity** P3 · **Action** VERIFY-RUNTIME

## Q‑6 · Prerequisites — "Node.js 20+ and npm"

- **Claim** "Node.js 20+ and npm"
- **Expected** either a machine-enforced floor or a documented one.
- **Actual** **No `engines` field in any of the three `package.json` files** (`package.json`,
  `app/package.json`, `backend/package.json` → `engines` = null in all three). The floor is documented
  only here. Local interpreter is `node v22.22.3`. This matters beyond pedantry: the repo's own
  `AGENT_LOGBOOK.md` records using `node:sqlite` (`DatabaseSync`, "Node ≥22 ships `node:sqlite` built
  in") for local migration replay — a Node-20-only machine cannot run that verification path.
- **Class** UNVERIFIED · **Severity** P3 · **Action** UPDATE-DOC
- **Suggested** if the doc wants to be honest rather than aspirational, say "Node 22+ — the
  `node:sqlite` local-replay path documented in the logbook needs it" and add `engines` separately.

## Q‑7 · §3 — zone behaviour of localhost

- **Claim** "`localhost:4321` is the marketplace zone by default … `app/src/lib/routeZones.ts` is the
  single source of truth."
- **Expected** an empty tenant id resolving to marketplace.
- **Actual** `routeZones.ts:48` `resolveZone` returns `'marketplace'` when `tenantId` is falsy; the
  JSDoc at `:42-47` states exactly the localhost-without-`?tenant=` case.
- **Class** MATCHED · **Severity** P3 · **Action** none

## R‑1 · [[01-architecture/README]] — index concepts

- **Source** `docs/01-architecture/README.md` §Concepts
- **Claim** four-layer contract; zone model with the marketplace/tenant split and `ZoneGuard`; tenant
  isolation enforced twice; the KV free-plan trap; `monitor/` as a separate Worker; `deploy.sh` as the
  single deploy path.
- **Expected** each concept true.
- **Actual** All six verified against the sources cited in **A‑4**, **A‑16**, **A‑24**, **A‑25**. The
  monitor bullet says "its own storage" rather than naming D1, which is why it survives the A‑4 failure.
  Code-reference `deploy.sh:376-380` lands on the migrations-apply/deploy pair.
- **Class** MATCHED · **Severity** P3 · **Action** none

---

# 02-api

## C‑1 · [[API_CONTRACT]] §1 — exported function count · STALE

- **Claim** "`app/src/lib/api.ts` — a typed client with **~276 exported functions** covering every
  endpoint the frontend uses."
- **Expected** ≈276.
- **Actual** `app/src/lib/api.ts` is **2,838 lines** (the `api.ts:1-2838` code-reference is exact).
  `export … function` declarations: **286**. Plus one exported const (`API_BASE`) → 287 exported
  callables/symbols. Plus 60 `export type|interface`.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Direction** the client has *grown* past the stated figure, so the claim understates coverage. The
  repo `README.md` was already corrected to "~290" by the same 2026-10-02 pass; this file was missed.

## C‑2 · [[API_CONTRACT]] §2 + §5 — generated types and the system row · **`/api/health` is FALSE**

- **Claim** §2: "`backend/openapi.json` — generated OpenAPI 3 document … `npm run gen:openapi` …
  `npm run gen:types` … the Worker serves the schema at `/api/openapi.json`." §5 table, System row:
  "`/api/openapi.json`, `/api/health` | schema + health".
- **Expected** both endpoints exist; `/api/health` at that path.
- **Actual** `index.js:477` `app.get('/api/openapi.json', …)` ✓ and `backend/openapi.json` exists
  (OpenAPI 3.0.0, 88 paths, `servers[0] = https://sinaicamps.com`). **The health endpoint is `/healthz`,
  not `/api/health`** — `backend/src/index.js:164` `app.get('/healthz', async (c) => {` returning
  `{ status, version: '3.0.0', checks: { database, kv, r2 } }`. `grep -E "app\.(get|post)\('/(api/)?health"`
  returns that one line only. Neither `/healthz` nor `/api/openapi.json` appears in `openapi.json`.
- **Class** FALSE (the `/api/health` path) · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** a wrong URL in the one table a client author reads before wiring a monitor or
  an uptime check.

## C‑3 · [[API_CONTRACT]] §3 — RBAC hierarchy · **FALSE, and it contradicts [[ARCHITECTURE]]**

- **Claim** "| Admin dashboard | JWT (`env.JWT_SECRET`) | `Authorization: Bearer <jwt>` | Admin/owner
  panel, RBAC hierarchy: `admin` > `staff` |"
- **Expected** a two-rank hierarchy naming `staff`.
- **Actual** **There is no `staff` role.** `app/src/lib/rbac.ts:7-12` is `super_admin: 100, admin: 80,
  manager: 50, cashier: 30`, mirroring `ROLE_RANKS` in `backend/src/middleware/requireAuth.js`. The
  string `'staff'` appears in the frontend only as a **nav-tab id** (`AdminApp.tsx:146` `{ id: 'staff',
  label: 'Staff', icon: IconStaff }`, `:437` `case 'staff':`) and a drilldown view name
  (`TenantDrilldown.tsx:35,160`) — a UI grouping over the `pos_users`-backed `StaffPanel`, not a rank.
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Note** this exact error was found and fixed in `ARCHITECTURE.md` by the 2026-10-02 `a5` pass — whose
  logbook entry says *"**role hierarchy admin > staff** — there is no `staff` role"* — and left in place
  here. The two docs in this audit now disagree about the authorization model of the admin dashboard.

## C‑4 · [[API_CONTRACT]] §3 — token worlds, JWT secret

- **Claim** Two token worlds (admin JWT, POS `pos_token`), both via `Authorization: Bearer`; "`env.JWT_SECRET`
  has **no fallback** — the Worker throws immediately if unset."
- **Expected** both.
- **Actual** `backend/src/middleware/sharedAuth.js:15` `algorithm: 'HS256'`; POS realm is enforced by
  `requireAuth`'s `realm` option (`requireAuth.js:139` `realm = 'admin'`, and POS routes mounted under
  `/api/pos` at `index.js:339`). No fallback secret anywhere in the sign/verify path.
- **Class** MATCHED · **Severity** P3 · **Action** none

## C‑5 · [[API_CONTRACT]] §4 — response envelope + cache headers

- **Claim** Success = camelCased JSON via `toCamel`; errors `{ success: false, error, errors? }` with
  `errors` appended only when present; "Public reads are cached at the HTTP layer: `Cache-Control: public,
  max-age=300, stale-while-revalidate=600` (availability checks use 60s). This is header-level only — **no
  KV caching**."
- **Expected** all four.
- **Actual** `response.js:64` `cachedJsonResponse(data, maxAge = 300, status = 200)`; `:71`
  `` `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}` `` → default 300/600 exactly.
  `:87-88` `errorResponse(message, status = 500, errors = undefined)` →
  `jsonResponse({ success: false, error: message, ...(errors ? { errors } : {}) }, status)` — matches the
  documented envelope including the conditional `errors`. Availability's 60s is real:
  `backend/src/api/orders.js:1709` and `:1714` both `cachedJsonResponse({…}, 60)`. Zero KV writes (A‑23).
- **Class** MATCHED · **Severity** P3 · **Action** none

## C‑6 · [[API_CONTRACT]] §6 — contract rules

- **Claim** (1) snake_case in requests / camelCase in responses, `toSnake` for incoming; (2) helpers add
  nosniff, X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy, CSP; (3) never set CORS in
  helpers; (4) public endpoints cache-safe; (5) components render user data through `escHtml()`.
- **Expected** all five enforceable or stated.
- **Actual** (2) `response.js:45-52` sets all six; `cachedJsonResponse` at `:69-76` sets the same six.
  (3) `response.js:39-40` carries the explicit comment *"NOTE: CORS headers are handled by hono/cors in
  index.js. Do NOT duplicate them here."* (1) `toSnake` at `response.js:27`, applied at 28 documented
  Zod parse sites. (5) `app/src/lib/utils.ts:3` `export function escHtml` — but only **3** files under
  `app/src/components/` reference `escHtml`; the rule is stated as a contract, not a measured property,
  which is the right framing for it.
- **Class** MATCHED · **Severity** P3 · **Action** none

## C‑7 · [[API_CONTRACT]] §7 — 401 vs 403 · **all eleven strings verbatim**

- **Claim** The 401/403 message table, and "Checks run in this order — signature → token-type → realm →
  role → activity → tenant scope (`evaluate`, requireAuth.js) — so the FIRST failure wins."
- **Expected** every message byte-identical, and the order.
- **Actual** **All eleven messages match verbatim**, in both files:
  `requireAuth.js:66` `'Missing or invalid Authorization header'` (401),
  `:67` `'Session expired or invalid signature'` (401),
  `:68` `'Forbidden: POS sessions are not allowed to access admin routes'` (403),
  `:69` `'Forbidden: Insufficient permissions'` (403),
  `:70` `'Account deactivated'` (401),
  `:71` `'Forbidden: Access denied to this tenant partition'` (403);
  `resolveScope.js:200` `'Forbidden: project scope mismatch'` (403),
  `:208,236` `'Unauthorized: missing tenant context'` (401),
  plus `'Invalid token type'` as the documented `typeMismatch` override. The role-scope claims hold:
  `pos-users.js:100` `roles: ['super_admin', 'admin']`; the SSE gate at `index.js:431-440` is
  `realm: 'admin'`, `roles: ['admin','super_admin']`, so POS sessions and non-admins get 403 as documented.
  **The stated order is incomplete**: `evaluate()` inserts a **1b NULL-tenant hard guard**
  (`requireAuth.js:160-163`, `if (decoded.role !== 'super_admin' && !decoded.tenantId) return
  deny(options, 'scopeDenied')`) *before* the token-type check, with a comment saying it runs "before
  type/realm/role checks". So the true order is signature → null-tenant → token-type → realm → role →
  activity → tenant.
- **Class** MATCHED (messages) + STALE (the order sentence) · **Severity** P3 · **Action** UPDATE-DOC
- **Credit** this is the most carefully written section in the three folders: every string is right, and
  the doc's own "Where" column points at real lines. The single omission is an *extra* gate, not a
  missing one — the doc errs toward understating the strictness of the gate, never toward overstating it.

## C‑8 · [[API_CONTRACT]] §5 — key endpoint groups

- **Claim** Auth `/api/auth/*`; Camps `/api/camps*`; Tenants `/api/tenant/*`, `/api/tenants*`;
  Categories/Meals; Orders `/api/orders*`, `/api/availability*`; Admin `/api/admin/*`; POS `/api/pos/*`;
  System.
- **Expected** each base path mounted.
- **Actual** All present. `index.js:255-257` `/api/tenants`, `:211` `/api/auth/pos-login`, `:339`
  `app.route('/api/pos', posRoutes)`, `:323` `app.route('/api/tenant/billing', …)`; `campsRoutes` mounted
  for `/api/projects` with `registerCampsAlias` at `:642` (`camps-alias.js:38` defines it).
  Note `/api/camps*` is a **sunset alias**, which `API_SURFACE_MAP.md` states and this table does not —
  see **S‑1**.
- **Class** MATCHED · **Severity** P3 · **Action** none

## C‑9 · [[API_CONTRACT]] §1 — "the backend mirrors it" · coverage is much thinner than implied

- **Claim** "The backend mirrors it: every route registered in `backend/src/routes/registry.js` and every
  handler in `backend/src/api/**` / `backend/src/routes/pos/**`." §5 closes: "Exact paths, methods, and
  payloads: see `backend/openapi.json` (source of truth)."
- **Expected** the registry / `openapi.json` to be a usable index of the surface.
- **Actual** `backend/openapi.json` contains **88 paths**. The surface map's 268 endpoint rows resolve
  against `openapi.json` for only **69** paths / **65** path+method pairs. The remaining **199** rows are
  real at runtime but have **no OpenAPI registration at all** — they are served by the wildcard
  dispatcher in `index.js` (`registry.js:5-7` documents this: *"Runtime dispatch (the wildcard catch-all in
  index.js …) is intentionally UNCHANGED"*). That includes the **canonical** `/api/projects` surface: the
  map's own headline says "Canonical mount is `/api/projects`", and `openapi.json` has no `/api/projects`
  path at all (only `/api/camps` and `/api/camps/{id}`).
- **Class** UNDOCUMENTED · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale** `API_CONTRACT.md` calls `openapi.json` the source of truth for exact paths, and
  `app/src/lib/api-types.ts` is generated from it. A reader who trusts that will find ~74% of the
  documented endpoints absent and no stated reason. The map's header does explain the registry's scope;
  the *contract* does not.

## C‑10 · [[API_CONTRACT]] §5 note on POS login

- **Claim** (map) "`/auth/pos-login` | POST | `posLogin(identifier, password)` | `pos_users` | POS cashier
  login via admin host"
- **Expected** `posLogin` exported from `api.ts`, backend route present.
- **Actual** `backend/src/index.js:211` `app.post('/api/auth/pos-login', (c) => handlePosLoginRequest(c.req.raw,
  c.env));` ✓ and `posLogin` is exported from `api.ts` ✓ (present in the 286).
- **Class** MATCHED · **Severity** P3 · **Action** none

---

## S‑1 · [[API_SURFACE_MAP]] — Camps section: canonical mount and the sunset alias

- **Claim** "Canonical mount is `/api/projects` (`campsRoutes`, index.js); `/api/camps` is a sunset alias
  (`registerCampsAlias`). There is no `camps` table — the table is `projects` (0001_core.sql);
  camp↔product links live in `product_camps` (0003_products.sql). No `/:id/products` sub-routes exist at
  runtime (dropped)."
- **Expected** all four.
- **Actual** `index.js:642` `registerCampsAlias(app, { scope: catalogScope, limiter: tenantAwareLimiter });`
  with `camps-alias.js:38` defining it — the alias mechanism is exactly as described. `camps` is absent
  from the current lineage (`backend/migrations/0003_products.sql:22` creates `product_camps`, and the only
  `CREATE TABLE camps` is `backend/migrations/legacy/0001_init.sql:20`, i.e. excluded). `grep -rE
  "projects/:[a-zA-Z]+/products|/:id/products" backend/src` → **0 hits**, so the sub-routes are indeed gone.
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑2 · [[API_SURFACE_MAP]] — Frontend Function column · **64 of 249 do not exist** · **P1**

- **Claim** 268 rows each naming a `Frontend Function` from `app/src/lib/api.ts`, e.g. `createCategory(data)`,
  `getSettings()`, `updateSettings(data)`, `getMarketplaceProjects(params?)`,
  `addCrmTicketComment(ticketId, content, internal?)`, `getPublicServices(slug)`, `createPlan(data)`.
- **Expected** every named export resolves in `app/src/lib/api.ts`.
- **Actual** 249 distinct function names are referenced across the section. **64 have no definition
  anywhere under `app/src`.** Verified two ways: (a) absence from the 287-symbol export set, and (b) a
  direct search for six spot-checks — `addCrmTicketComment`, `getSettings`, `updateSettings`,
  `getMarketplaceProjects`, `createPlan`, `getPublicServices` — across every `.ts`/`.tsx`/`.astro` file in
  `app/src`, which returned **nothing**. Full list of the 64: `addCrmTicketComment`, `adjustSupplyStock`,
  `assignServiceBooking`, `confirmSupplyTransfer`, `createAiAutomationRule`, `createAiPriceRule`,
  `createCategory`, `createCrmContact`, `createCrmKnowledgeArticle`, `createCrmLead`,
  `createCrmOpportunity`, `createCrmTask`, `createCrmTicket`, `createInventoryAdjustment`, `createPlan`,
  `createServiceAvailabilitySlot`, `createServiceDefinition`, `createServiceItem`,
  `createStorefrontBlogPost`, `createStorefrontPage`, `createSupplyBom`,
  `createSupplyManufacturingOrder`, `createSupplyPurchaseOrder`, `createSupplyTransfer`,
  `createSupplyWarehouse`, `deleteAiPriceRule`, `deleteInboxItem`, `deleteTag`, `getAiForecast`,
  `getInventoryAdjustments`, `getMarketplaceProjects`, `getMarketplaceReviews`,
  `getMarketplaceTenantProfile`, `getPublicServices`, `getReorderSuggestions`, `getServiceAvailability`,
  `getServiceBooking`, `getServiceDefinition`, `getServiceItem`, `getServiceReviews`, `getSettings`,
  `getTag`, `getTenantMeta`, `progressSupplyManufacturingOrder`, `receiveSupplyPurchaseOrder`,
  `setProjectTags`, `setTenantMeta`, `submitMarketplaceReview`, `submitServiceReview`, `updateAiPriceRule`,
  `updateCategory`, `updateCrmContact`, `updateCrmLeadStatus`, `updateCrmOpportunityStage`,
  `updateCrmTaskStatus`, `updatePlan`, `updateServiceBookingStatus`, `updateServiceDefinition`,
  `updateServiceItem`, `updateServicePricing`, `updateSettings`, `updateStorefrontBlogPost`,
  `updateStorefrontPage`, `updateTag`.
  They cluster by domain: all of Services (12), CRM (8), Supply (8), Financial (7), Tags (5), Meta (4),
  Storefront CMS (4), Inventory (3), AI (5), Marketplace (4), Plans (2), Categories (2).
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** the Endpoint column of the same rows is real (S‑11), so a reader has no internal
  signal that this column is not. Following it produces TypeScript that will not compile, in 30+ domains.
  The correct fix is per-row: replace the name with `—`, or point at whatever the client actually calls.

## S‑3 · [[API_SURFACE_MAP]] — React Hook column · **120 of 195 do not exist** · **P1**

- **Claim** 195 distinct `use*` names across the same rows, e.g. `useTagsQuery()`, `useCrmContactsQuery()`,
  `useStorefrontProductsQuery()`, `useSuperCRMOverviewQuery()`, `useTaxRatesQuery()`.
- **Expected** every named hook is exported from `app/src/hooks/`.
- **Actual** `app/src/hooks/` holds exactly five files: `useAdminData.ts`, `usePosQueries.ts`,
  `useQueryHooks.ts`, `useSseInbox.ts`, `useSseOrders.ts`. Enumerating every `export const|function` in
  all 632 exported `use*` symbols across `app/src/**/*.ts{,x}` (plus `export {}` blocks) leaves **120**
  of the 195 documented hooks unaccounted for, including every `useTag*`, `useStorefront*`,
  `useSuper*`, `useTax*`, `useFinancial*`, `useHr*`, `useSupply*`, `useCr*`, `useService*`,
  `useAi{Automation,Prediction,Price}*` and `useMarketplace*` hook. `useQueryHooks.ts` is 1,891 lines with
  113 top-level exports, and `useCrmContactsQuery` genuinely exists at `useQueryHooks.ts:1549` — which is
  why the sample count (75/195) looks plausible until you check all 195. Full 120-name list is
  reproducible with the method in S‑2.
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** same as S‑2 and worse in one respect: the hooks file is the documented
  integration surface ("TanStack Query hooks generated per endpoint group"), so a reader concludes the
  generation is incomplete rather than that the table is wrong.

## S‑4 · [[API_SURFACE_MAP]] — DB Tables column · **13 of 84 tables do not exist** · **P1**

- **Claim** 84 distinct table names in the `DB Tables` column, including `ai_predictions`,
  `ai_price_rules`, `ai_automation_rules`, `ai_automation_logs`, `crm_contacts`, `crm_leads`,
  `crm_opportunities`, `crm_tickets`, `crm_ticket_comments`, `crm_knowledge_articles`,
  `storefront_pages`, `storefront_cart`, `storefront_cart_items`, `storefront_blog_posts`.
- **Expected** each named table exists in the migration lineage.
- **Actual** Harvesting every `CREATE TABLE` from all 139 `.sql` files under `backend/migrations/`
  (40 top-level + 99 legacy) yields 199 distinct table names; **13 of the 84 claimed tables are in
  neither set**, and a wider `grep -rl "\b<table>\b" backend/migrations --include=*.sql` returns **0
  files** for each — so they appear under no SQL verb at all, in either lineage. The 13 are exactly:
  `ai_automation_logs`, `ai_automation_rules`, `ai_predictions`, `ai_price_rules`, `crm_contacts`,
  `crm_knowledge_articles`, `crm_opportunities`, `crm_ticket_comments`, `crm_tickets`,
  `storefront_blog_posts`, `storefront_cart`, `storefront_cart_items`, `storefront_pages`.
  (`crm_leads` *does* exist and is not in the failing set.)
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** combined with S‑2 and S‑3 this means a third independent column of the same
  table is also unbacked. Three columns of asserted plumbing, none of the three cross-checkable against
  the code.

## S‑5 · [[API_SURFACE_MAP]] — `/products/:id` GET marked "OpenAPI-registered" · FALSE

- **Claim** "| `/products/:id` | GET | — | `GET /api/products/:id` | `products`, `product_lang` | — |
  Get single product (**OpenAPI-registered**; no client wrapper/hook found) |"
- **Expected** a `get` operation on `/api/products/{id}` in `backend/openapi.json`.
- **Actual** `backend/openapi.json` → `/api/products/{id}` has operations **put, delete** only. No `get`.
  The same annotation error repeats twice more: `/rateplans/:id` GET is called "OpenAPI-registered" but
  `/api/rateplans/{id}` has **put, delete** only; and `/meal-schedules/:id` GET and PUT are both listed
  while `/api/meal-schedules/{id}` has **delete** only.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** "OpenAPI-registered" is the annotation a reader uses to decide whether a route is
  documented or accidental. Three rows tell them the opposite of the truth.

## S‑6 · [[API_SURFACE_MAP]] — Marketplace rows list the `camps` table · **FALSE**

- **Claim** "| `/marketplace/projects` | GET | `getMarketplaceProjects(params?)` | … | `camps`, `tenants`,
  `project_meta` |" and the two rows below it list `camps`.
- **Expected** `camps` to be a real table, or to be `projects`.
- **Actual** `camps` exists **only** in the excluded `legacy/` lineage — `legacy/0001_init.sql:20`
  `CREATE TABLE camps`, dropped by `legacy/0063_rename_camps_to_projects.sql:60`. No `FROM camps` /
  `JOIN camps` / `INTO camps` exists in `backend/src`; the only occurrence outside legacy is a *comment*,
  `backend/src/routes/registry.js:285` `// Wire rows: \`SELECT * FROM camps\``, and a comment in
  `backend/migrations/0104_provision_default_projects.sql:15`. **This file contradicts itself 200 lines
  earlier**: its own Camps section says "There is no `camps` table — the table is `projects`".
- **Class** FALSE · **Severity** **P1** · **Action** UPDATE-DOC

## S‑7 · [[API_SURFACE_MAP]] — POS route table

- **Claim** `/pos/auth/login`, `/pos/auth/refresh`, `/pos/products` GET, `/pos/orders` POST/GET,
  `/pos/orders/:id`, `/pos/dashboard`, `/pos/shifts/{active,open,close}`, all against `pos_*` tables with
  POS auth; orders "idempotent, with stock deduction + promo engine"; list is "paginated, `?raw=1` for
  legacy array".
- **Expected** all twelve routes.
- **Actual** All twelve registered in `backend/src/routes/pos/index.js`: `:278` POST `/auth/login`,
  `:305` POST `/auth/refresh`, `:402` GET `/products`, `:426` POST `/orders`, `:1032` GET `/orders`,
  `:1064` GET `/orders/:id`, `:1098` GET `/dashboard`, `:1212` GET `/shifts/active`, `:1238` POST
  `/shifts/open`, `:1277` POST `/shifts/close`. `?raw=1` confirmed at `:1040`
  (`url.searchParams.get('raw') === '1'`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Line-range nit** the code-reference `backend/src/routes/pos/index.js:127-248` does not contain any of
  these routes (they begin at `:278`). · **Action** UPDATE-DOC · **Severity** P3

## S‑8 · [[API_SURFACE_MAP]] — POS tables, barcode, POS users

- **Claim** `/pos-tables` GET/POST, `/:id` PUT/DELETE, `/:id/status` PATCH, `/:id/reserve` PATCH,
  `/:id/release` PATCH; `/pos/products/barcode/:code` GET; `/pos-users` GET/POST, `/:id` PATCH/DELETE,
  `/:id/reset-password` POST with `super_admin`/`admin` gate.
- **Expected** all fourteen.
- **Actual** `backend/src/api/pos-tables.js`, `pos-barcode.js`, `pos-users.js` all exist and are mounted
  (`index.js:342` `app.route('/api/pos/products/barcode', posBarcodeRoutes)`); the gate is
  `pos-users.js:100` `roles: ['super_admin', 'admin']` — matching the documented role pair exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none

## S‑9 · [[API_SURFACE_MAP]] — retired payments

- **Claim** "> RETIRED: `POST /api/payments/webhook` now replies 501 … Real callbacks go to
  `POST /api/public/paymob/webhook` (HMAC-verified). `create-intent`/`confirm` no longer exist." and
  "`handleStripeWebhook` — RETIRED, always 501".
- **Expected** both.
- **Actual** `backend/src/api/payments.js:44` `export async function handleStripeWebhook() {` returning
  `:47` `501`; header comment at `:16-17` says it "is kept mounted at POST /api/auth…/payments/webhook (it
  is still advertised in routes/registry.js) but now replies 501". Mounted at `index.js:333`
  `app.post('/api/payments/webhook', …)`. Real callback at `index.js:745`
  `app.post('/api/public/paymob/webhook', …)`, and `paymob-webhook.js:140` "Public HMAC-verified Paymob
  server-to-server callback" with the signature procedure documented at `:145-149`. No `create-intent` or
  `confirm` route exists.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** an explicit RETIRED banner plus the migration path (`/api/public/paymob/webhook`) is the
  right way to document a removed endpoint. This is the model the other columns in this file should follow.

## S‑10 · [[API_SURFACE_MAP]] — upload & media

- **Claim** "`/upload` | POST | `upload.js` | R2 bucket (`MEDIA_BUCKET`) | Auth | Upload image to R2
  (multipart or octet-stream, ≤8MB, jpg/png/webp/gif)"; "`/media/*` | GET | `upload.js` (mediaRoutes) |
  R2 bucket | Public | Stream stored media object (immutable cache, tenant-scoped keys)".
- **Expected** both, with the size and MIME list.
- **Actual** `backend/src/api/upload.js:7` `export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;` — exactly 8 MB.
  `:15-19` MIME map `jpg`/`jpeg` → `image/jpeg`, `png`, `webp`, `gif` — exactly the five documented.
  `:84` documents the `application/octet-stream` + `?filename=` path. `:146` `export const mediaRoutes =
  new Hono()`; `:148` `mediaRoutes.on(['GET','HEAD'], '*', …)`; `:191` `mediaRoutes.delete('*', …)`;
  `:222` the 404 fallback. The cited code-range `upload.js:146-222` is exact.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** the `DELETE /api/media/*` route at `upload.js:191` appears in no row of this
  section.

## S‑11 · [[API_SURFACE_MAP]] — Endpoint column · **all 268 rows real**

- **Claim** 268 endpoint rows across 28 groups.
- **Expected** each to resolve to a real route.
- **Actual** Every row resolves. Matching each `/api<endpoint>` against (a) `backend/openapi.json`'s 88
  paths, normalised for `:id` ↔ `{id}` and method, and (b) the 55 `app.route()` / `app.get|post|put|patch|delete()`
  mounts in `backend/src/index.js` as a prefix match: **268 / 268 covered**, 0 uncovered. (The 199 rows
  absent from `openapi.json` are all reached by the wildcard dispatcher — see C‑9.) Method mismatches
  against `openapi.json`, where the path does exist: 4, all three of them the S‑5 rows plus
  `PUT /api/meal-schedules/{id}`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this entry exists** it is the control for S‑2/S‑3/S‑4. One automated pass over the same 268 rows
  cleared the endpoint column and failed the other three, which is what makes those three findings
  credible rather than a sampling artifact.

## C‑11 · [[API_CONTRACT]] §5 cross-note — `/auth/refresh` raw fetch

- **Source** `docs/02-api/API_SURFACE_MAP.md` Auth table, `/auth/refresh` row
- **Claim** "— (internal silent-refresh via raw fetch) | `POST /api/auth/refresh` | … | Rotate access
  token (no public wrapper; **api.ts uses a raw fetch on purpose**)"
- **Expected** a deliberate raw `fetch` for refresh, distinct from the shared client.
- **Actual** `app/src/lib/api.ts:120-121` — `// T7: shared in-flight silent-refresh — concurrent 401s await
  one refresh call … Uses a raw fetch on purpose: apiFetch`; `:139` picks `/pos/auth/refresh` or
  `/auth/refresh` by realm; `:150` `const response = await fetch(...)`. The rationale is in the source.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** `api.ts` also holds raw `fetch` calls outside `apiFetch` that this table's blanket
  "never inline raw `fetch` calls in components" framing does not mention: `:1273` (`/upload` multipart),
  `:1558` (`/admin/audit/export`), `:2688` (`/admin/performance/export`).

## X‑1 · [[02-api/README]] — "25 domain groups"

- **Source** `docs/02-api/README.md` §Concepts
- **Claim** "**Per-domain map** — `API_SURFACE_MAP.md` walks **25 domain groups**, each as
  endpoint → client function → handler → table → hook."
- **Expected** 25.
- **Actual** `grep -c "^## " docs/02-api/API_SURFACE_MAP.md` → **41** `##` sections. The subset carrying
  the 7-column endpoint→client→handler→table→hook tables is **28** (Camps/Projects through Settings); the
  remaining 13 are POS, upload, payments, onboarding, leads, price-overrides and super-admin blocks that
  use the 6-column variant without a Frontend Function column.
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **Note** 25 matches no grouping of the file. The number predates the POS/media/onboarding sections being
  folded in.

## X‑2 · [[02-api/README]] §Concepts — auth-model summary

- **Claim** "**Auth model** — JWT (HS256) in `Authorization: Bearer`, tenant scope resolved server-side.
  401 means 'not authenticated', 403 means 'authenticated but not allowed' — the two are not
  interchangeable." and "**Response envelope** — errors are `errorResponse(message, status, errors)`;
  success is plain JSON."
- **Expected** HS256; the 401/403 distinction; the helper signature.
- **Actual** `backend/src/middleware/sharedAuth.js:15` `algorithm: 'HS256'` ✓. `response.js:87`
  `errorResponse(message, status = 500, errors = undefined)` — the documented 3-arg signature ✓. Success
  is plain JSON via `jsonResponse`/`ok`/`created`, with no success wrapper ✓. The 401/403 split matches
  C‑7 exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** "the two are not interchangeable" plus the "every endpoint answers the same shape so one client
  error path covers the whole surface" framing is the clearest statement of why the envelope exists
  anywhere in the vault.

---

# 03-frontend

## F‑1 · [[COMPONENT_CATALOG]] §1 — the ui/ census arithmetic

- **Claim** "## 1. UI primitives — `components/ui/` (**20 actual**, 2026-09-21) > Truth 2026-09-21: 20
  files on disk. 9 cataloged entries have no file (Accordion, Checkbox, FormField, Radio, Separator,
  Switch, Tabs, Textarea, Tooltip). 3 present files were undocumented (LineChart, RechartsLine, icons)."
- **Expected** 20 files; the named 9 absent; the named 3 present-but-uncatalogued.
- **Actual** `ls app/src/components/ui/ | wc -l` → **20**. The 20 are: Badge, Button, Card, ConfirmDialog,
  DataTable, EmptyState, ErrorBoundary, FormModal, icons, Input, LineChart, LoadingSpinner, Modal,
  RechartsLine, SafeImage.astro, Select, Skeleton, StatCard, StatusTag, Toast. The table has 26 rows;
  26 − 9 named-absent = 17 present, + 3 named-undocumented = 20. **Every one of the 9 named-absent
  components is genuinely absent** (`test -f` per file → no match), and `LineChart.tsx`,
  `RechartsLine.tsx`, `icons.tsx` are all genuinely present and absent from the 26-row table.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Credit** this is the single most honest count claim in the three folders: it states the on-disk truth,
  names the nine ghosts, names the three undocumented files, and the arithmetic closes exactly. It is
  also tagged `status/needs-refresh` in front matter, which is correct about §2 and §3 (below) and wrong
  about §1.

## F‑2 · [[COMPONENT_CATALOG]] §2 — admin panel count · **STALE by 38 files** · **P1**

- **Claim** "## 2. Admin — `components/admin/` (**25 files**) `AdminApp.tsx` + panels: `BookingCalendar`,
  `CampsPanel`, `DashboardPanel`, `InboxPanel`, `ListingWizard` (+ `PhotosStep`), `LowStockPanel`,
  `MealsPanel`, `MenuPanel`, `MenuPlannerPanel`, `OrdersPanel`, `PasswordPanel`, `PlanningPanel`,
  `RatePlansPanel`, `ReportsPanel`, `RoomsPanel`, `SettingsPanel`, `StaffPanel`, `SuperDashboardPanel`,
  `SuperOrdersPanel`, plus auth pages (`ForgotPasswordPage`, `RegisterPage`, `ResetPasswordPage`) and
  `icons.tsx`."
- **Expected** 25 files; every named file present.
- **Actual** `find app/src/components/admin -type f` → **63 files** (all `.tsx`). Every one of the 23 named
  components exists (verified individually), so the enumeration is correct — it is the *count* and the
  *coverage* that are wrong. **40 files are undocumented**, including every major feature area added
  since: `AIPanel`, `AnalyticsPanel`, `AuditLogPanel`, `BillingPanel`, `BrowserAIPanel`, `CashDeskPanel`,
  `CRMPanel`, `DynamicForm`, `FeedbackPanel`, `FinancialPanel`, `FolioDetail`, `FolioReceipt`, `FoliosPanel`,
  `HRPanel`, `PaymentReceipt`, `ProjectItemsPanel`, `PromotionsPanel`, `RecordPaymentModal`,
  `ServiceBookingsPanel`, `ServicesPanel`, `StorefrontPanel`, `SubscriptionsPanel`, `SuperAIPanel`,
  `SuperCRMPanel`, `SuperFinancialsPanel`, `SuperHRPanel`, `SuperReportsPanel`, `SuperStorefrontPanel`,
  `SuperSupplyPanel`, `SuperTenantsPanel`, `SupplyPanel`, `SystemHealthPanel`, `SystemSettingsPanel`,
  `TenantDrilldown`, `TenantImportPanel`, `TenantPerformancePanel`, `UsersPanel`, plus `AdminShell.tsx`
  (one of the two `client:only` shell islands, A‑8).
- **Class** STALE · **Severity** **P1** · **Action** UPDATE-DOC
- **Severity rationale** the front-matter tag already says `needs-refresh`, so the doc knows — but this is
  the layer-1 inventory a reader uses to find a panel, and 40 of 63 panels (64%) are invisible in it. Note
  that `PERF_BASELINE.md` (P‑9) counts "**All 48** admin/super-admin panels" as `React.lazy` from
  `AdminApp.tsx:60-107` — a number that contradicts both 25 and 63, and is the one that is actually
  right about the render graph. The doc set has three different answers and no reconciliation.

## F‑3 · [[COMPONENT_CATALOG]] §2 — "no raw `fetch`, no `window.*` globals"

- **Claim** "All data flows through **TanStack Query** (`useQueryHooks`/`useAdminData`) — no raw `fetch`,
  no `window.*` globals."
- **Expected** zero raw `fetch` and zero `window.*` data channels under admin.
- **Actual** `grep -rn "fetch(" app/src/components/admin app/src/components/pos` → 9 hits, **all of them
  `refetch()`** from TanStack Query (`InboxPanel.tsx:190,400`, `StaffPanel.tsx:335,372,418`,
  `LowStockPanel.tsx:54`, `pos/views/OrdersView.tsx:25`, `TableView.tsx:250`, `DashboardView.tsx:17`) — no
  network `fetch` at all. All 22 `window.*` occurrences are browser APIs, not channels (enumerated in
  **A‑11**). The T13 migration claim holds.
- **Class** MATCHED · **Severity** P3 · **Action** none

## F‑4 · [[COMPONENT_CATALOG]] §3 — POS views count · STALE

- **Claim** "## 3. POS — `components/pos/` (**8 views**) `CartPanel`, `DashboardView`, `LoginView`,
  `OrdersView`, `ProductsView`, `ReceiptModal`, `ShiftDashboard`, `ShiftOverlay` + supporting files."
- **Expected** 8 view files; the eight named present.
- **Actual** `ls app/src/components/pos/views/` → **11**: the eight named, plus **`KitchenView.tsx`**,
  **`ProjectPicker.tsx`**, **`TableView.tsx`**. (Total under `components/pos/` is 14 files: 11 views +
  `POSApp.tsx` + `PosShell.tsx` + `types.ts`.) `PosShell.tsx` is the second `client:only` island (A‑8).
- **Class** STALE · **Severity** P3 · **Action** UPDATE-DOC
- **UNDOCUMENTED (P3)** the three extra views. `TableView.tsx` is the restaurant-table surface that
  `API_SURFACE_MAP.md` documents as `/pos-tables/*`, so its absence from the catalog means the POS table
  feature has no layer-1 entry point anywhere in scope.

## F‑5 · [[COMPONENT_CATALOG]] §5 — hooks

- **Claim** "## 5. Hooks — `hooks/` (**5**) `useAdminData`, `useApiError`, `useQueryHooks`, `useSseInbox`,
  `useSseOrders`."
- **Expected** 5 files; the five named present.
- **Actual** `ls app/src/hooks/ | wc -l` → **5**: `useAdminData.ts`, `usePosQueries.ts`, `useQueryHooks.ts`,
  `useSseInbox.ts`, `useSseOrders.ts`. **Four of the five names are right; `useApiError` does not exist**
  and `usePosQueries` — the entire POS data layer, a real 5th file — is not listed.
- **Class** STALE (one wrong name, one omission) · **Severity** P3 · **Action** UPDATE-DOC
- **Note** the `useApiError` error is a known repo-wide one: the 2026-10-02 `a5` logbook entry records it
  as *"REPORTED-NOT-FIXED … `AGENTS.md` §2 and `README.md` still list a `useApiError` hook that does not
  exist on disk"*. This file is a third carrier of the same phantom. It is P3 rather than P2 precisely
  because it is already documented as a known defect elsewhere — but that also means it has now survived
  three separate documentation passes.

## F‑6 · [[COMPONENT_CATALOG]] §6 — layouts and pages

- **Claim** "Layouts: `layouts/PublicLayout.astro`, `AdminLayout.astro`, `POSLayout.astro`. Pages:
  marketplace home (`index.astro`), `/camps`, `/camp/[id]/`, tenant pages, admin SPA host
  (`admin/[...rest]/`), POS SPA host (`pos/[...rest]/`)."
- **Expected** three layouts, the named pages present.
- **Actual** `ls app/src/layouts/` → exactly `AdminLayout.astro`, `POSLayout.astro`,
  `PublicLayout.astro`. `app/src/pages/admin/[...rest]/index.astro` and
  `app/src/pages/pos/[...rest]/index.astro` both exist (and both carry `client:only` at `:7` and `:16`).
- **Class** MATCHED · **Severity** P3 · **Action** none

## F‑7 · [[COMPONENT_CATALOG]] §7 — stories · **all eight named stories do not exist** · **P2**

- **Claim** "`stories/` mirrors the UI primitives — **8 new a11y stories were added with the T9 expansion
  (Checkbox, Radio, Switch, Textarea, FormField, Separator, Tooltip, Accordion)** alongside the
  pre-existing set."
- **Expected** 8 story files for those 8 components.
- **Actual** `find app -name "*.stories.*" -not -path "*/node_modules/*"` → **10 files** in
  `app/src/stories/`: `Badge`, `Button`, `Card`, `DataTable`, `EmptyState`, `Input`, `LoadingSpinner`,
  `Modal`, `StatCard`, `Toast`. **Not one of the eight named components has a story** — and per **F‑1**,
  none of the eight even has a source file, so a story for them could not exist. Every real story belongs
  to a component that *does* have a file.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** the claim has a specific shape — a named PR-era deliverable with an exact
  component list — and every element of that shape is wrong. It also inverts the catalog's own honest §1
  finding ("these 9 have no file") by then claiming stories for them.

## F‑8 · [[COMPONENT_CATALOG]] §4 — public components + E2E dev-mode note

- **Claim** "Zone-aware landing/browsing surfaces: `TenantLanding`, `MarketplaceHome`, `CampsSection`,
  `ZoneGuard`, `CampBooking`, `ReservationSummary`, `TenantMenu`, `BookPage`, `MenuPage`,
  `CampDetail`/`CampCard`, contact forms. Tenant pages hang on `load` in dev (logo/favicon → dead
  `localhost:8001`) — E2E uses `waitUntil: 'domcontentloaded'`."
- **Expected** all named files present.
- **Actual** All named components present under `app/src/components/public/` (verified against the
  directory listing while checking the `client:*` census in A‑8 and A‑11). `ZoneGuard.astro` and
  `TenantOutagePage.astro` are both there. The dev-hang note matches the repo's own operational
  guidance in `AGENTS.md`.
- **Class** MATCHED · **Severity** P3 · **Action** none

---

## P‑1 · [[PERF_BASELINE]] header vs §Status — the TBT threshold contradicts itself · **FALSE**

- **Source** `docs/03-frontend/PERF_BASELINE.md`, header block and the `**Status**:` paragraph
- **Claim** (header) "TBT threshold is **300ms** in harness (`tests/lighthouse/run.ts`), **not 200ms**."
  vs (Status) "Active enforcement now lives in `app/budget.json` + `npm run lighthouse` (T15, 2026-08-13) —
  the same targets (**CLS < 0.1, LCP < 2.5 s, TBT < 200 ms**, resource sizes) are enforced there against a
  live preview URL."
- **Expected** the two paragraphs to agree.
- **Actual** Three separate facts, none matching the Status paragraph. (1) `tests/lighthouse/run.ts:52`
  `const LIGHTHOUSE_TARGETS = { cls: 0.1, lcpMs: 2500, tbtMs: 300, enforced: false };` — **300 ms**, and
  **`enforced: false`**. (2) `app/budget.json` (33 lines) contains **no CLS, LCP or TBT target at all** —
  only Lighthouse *resource* budgets: `script` 300, `stylesheet` 100, `image` 1500, `font` 400, `total`
  2500, all `metric: "transferSize"`. There is no 200 ms anywhere in `budget.json`. (3) The committed
  `tests/lighthouse/lighthouse-baseline.json` records `"targets":{"cls":0.1,"lcpMs":2500,"tbtMs":300,
  "enforced":false}` and `"note":"Dev/preview server baseline … Not enforced this pass."`
- **Class** FALSE · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity rationale** "Active enforcement now lives in app/budget.json" is the sentence that tells an
  operator where the perf gate *is*. It is wrong about which metrics live there, wrong about the TBT
  number (200 vs the actual 300, which the same file's header corrects two paragraphs earlier), and wrong
  about `enforced: false` being "active". The file's own header is the accurate one — the doc contradicts
  itself, which is worse than either version being merely stale.

## P‑2 · [[PERF_BASELINE]] — the eager/lazy classification method and result

- **Claim** "`rollup-plugin-visualizer`'s `imported` edges conflate static and dynamic imports (**1095 of
  1096** modules appear 'statically reachable'), so the lazy/eager split must be read off the **emitted
  chunks** … Result: **5 chunks / 10.6 KiB** are statically reachable from the Astro island entries; the
  other **108 chunks / 2166.8 KiB** are dynamic-import-only. `client.*` is initial-load despite having no
  static edge."
- **Expected** 113 chunks total (5 + 108) and the reasoning.
- **Actual** Total chunk count checks out: `ls app/dist/client/_astro/*.js | wc -l` → **113**
  (P‑4). The method claim is independently corroborated by the structure of `app/astro.config.mjs`, which
  wires the visualizer as a rollup plugin (which can only see static edges). The `client.*` reasoning is
  confirmed by `client.D3SnGAPC.js` existing as a real emitted file (176.4 KiB, P‑4).
- **Class** MATCHED (structure and totals) · **Severity** P3 · **Action** none
- **UNVERIFIED (P3)** the exact module counts (1095/1096) and KiB split (10.6 / 2166.8) require a fresh
  `ANALYZE=1 npm run build` with a graph walk; not re-run. The *totals* they must sum to are verified by
  P‑4.

## P‑3 · [[PERF_BASELINE]] — "Three questions" investigation

- **Claim** "**Duplicate React: none.** `react/index.js`, `react-dom/index.js` and `react-dom/client.js` each
  appear in exactly one emitted chunk (`react.*` 8.4 KiB, `react-dom.*` 3.5 KiB, and the `react-dom/client`
  build bundled inside `client.*`) … pulled only by `recharts`' internals (`flushSync`) and by the
  `@astrojs/react` renderer; no `app/src` file imports `react-dom` directly (verified by grep)."
- **Expected** no duplicated react chunks in `dist/client/_astro/`; no direct `react-dom` import in source.
- **Actual** `grep -rn "react-dom" app/src --include=*.ts{,x} --include=*.astro` → **0 hits**, so the
  "no direct import" half is confirmed. The emitted-chunk half needs the `ANALYZE` treemap to be read
  properly; the file-level check that a duplicate would show — more than one chunk whose name starts
  `react` — can be done directly and comes back clean.
- **Class** UNVERIFIED (the per-module attribution) / MATCHED (the grep half) · **Severity** P3 ·
  **Action** VERIFY-RUNTIME
- **Credit** the *conclusion* ("Nothing to fix") is well argued and the reasoning about
  `react-dom/client` vs `react-dom` being different entry points rather than a duplicate is correct on its
  face. Only the attribution evidence needs a re-run.

## P‑4 · [[PERF_BASELINE]] — the 2026-10-02 bundle snapshot · **verifiable, and verified**

- **Claim** "## Historical snapshot 2026-10-02 (HEAD `921e871`, `ANALYZE=1`) … JS chunks **113** · Total JS
  (minified) **2168.8 KiB** (2,229,607 B raw / **582,829 B gzip**) · CSS 2 files, 106.8 KiB · Largest chunk
  **503.7 KiB** — `_astro/transformers.web.*.js` · Largest chunk, gzip 146,499 B" and the top-10 table
  (503.7 / 344.3 / 194.9 / 176.4 / 37.2 / 34.3 / 31.5 / 31.3 / 28.6 / 23.7).
- **Expected** the committed `app/dist/client/_astro/` to match, since the build output is in the tree.
- **Actual** Measured directly from `app/dist/client/_astro/`: **113** `.js` files; summed on-disk size
  **2,229,607 B** — **byte-exact**; largest chunk `transformers.web.D7wza9ne.js` at **503.7 KiB**;
  `RechartsLine.CM2YhkQa.js` **344.3 KiB**; `html2canvas.BIYKDK-B.js` **194.9 KiB**;
  `client.D3SnGAPC.js` **176.4 KiB**; `BookingCalendar.B66sQ4i4.js` **37.2 KiB**; **2** `.css` files at
  **106.9 KiB**. Top-5 sizes match the table to 0.1 KiB.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **One arithmetic nit (STALE, P3)** the raw figure 2,229,607 B equals **2177.4 KiB**, not the stated
  2168.8 KiB — an 8.6 KiB gap. The doc explains it (`The bundle-size-report plugin prints chunk.code.length
  (post-minify); the visualizer's renderedLength (pre-minify) is ~1.77× larger`), i.e. its KiB total is a
  different measurement from its byte total. Both are honest; stating them without the delta invites a
  reader to compute a contradiction. **Action** UPDATE-DOC.
- **This is the strongest evidence in the audit that the perf doc was measured rather than recalled.**

## P‑5 · [[PERF_BASELINE]] — 2026-09-22 and 2026-08-07 historical tables

- **Claim** "JS chunks | 54 | 106 | +52" and "Total JS | 501.2 KiB (~118 KiB gzip est.) | 2114.3 KiB
  (~620 KiB gzip)" for 2026-08-07 → 2026-09-22; the 2026-09-22 "Largest 15 client chunks" table topped by
  `transformers.web` 503.7 KiB.
- **Expected** historical snapshots to be labelled as historical.
- **Actual** Both are under `## Historical snapshot 2026-08-07 (retained …)` and the 2026-09-22 total sits
  under `## Totals`. No build from those dates exists in the tree, and the doc says so: "re-run with
  `ANALYZE=1 npm run build` / `npx tsx tests/lighthouse/run.ts` before quoting".
- **Class** UNVERIFIED (unreproducible by construction; correctly labelled) · **Severity** P3 ·
  **Action** DEFER
- **Reason for DEFER not UPDATE-DOC** these are explicitly snapshot-labelled and the doc instructs the
  reader not to quote them. That is the correct handling of an un-rotting number.

## P‑6 · [[PERF_BASELINE]] — storefront island sizes

- **Claim** "Storefront islands stay small (all code-split per route): `StorefrontCheckout` 5.8 KiB,
  `ShopCatalog` 3.6 KiB, `StorefrontCart` 3.3 KiB, `StorefrontConfirmation` 2.7 KiB."
- **Expected** four small chunks in `dist`.
- **Actual** The four directive sites exist (**A‑8**). Chunk presence in `dist` is confirmed for the three
  named suspects but the storefront chunks were not individually sized here.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME

## P‑7 · [[PERF_BASELINE]] — the "all heavy vendors are lazy" diagram

- **Claim** "each big chunk is referenced by exactly one `import()` site: `transformers.web ← await
  import('./transformers.web.*.js') in AIPanel.*` · `RechartsLine ← import('./RechartsLine.*.js') in
  LineChart → SystemHealthPanel` · `html2canvas ← await import('html2canvas') in DebugFeedbackWidget (only
  when a screenshot is taken)`"
- **Expected** all three dynamic edges present in source.
- **Actual** All three confirmed in source. `app/src/lib/browser-ai.ts:237`
  `const { pipeline: createPipeline } = await import('@huggingface/transformers');`;
  `app/src/components/ui/LineChart.tsx:12` `const RechartsLine = lazy(() => import('./RechartsLine'));`;
  `app/src/components/debug/DebugFeedbackWidget.tsx:111` `const mod = await import('html2canvas');`.
  LineChart.tsx also carries an explanatory comment at `:9-11` about the empty-state branch staying
  synchronous.
- **Class** MATCHED · **Severity** P3 · **Action** none

## P‑8 · [[PERF_BASELINE]] — `RechartsLine` size, vendor breakdown, and the four sparklines

- **Claim** "`RechartsLine` (344.3 KiB / 100.9 KiB gzip) exists to serve **four** `<LineChart>` sparklines in
  one panel — `SystemHealthPanel.tsx:153,157,165,169`, and `SystemHealthPanel` is the *only* consumer of
  `LineChart` in the codebase. For that it drags in `@reduxjs/toolkit` (26.0), `immer` (19.9),
  `decimal.js-light` (24.8), `es-toolkit` (33.4) and the whole `d3` scale/shape/time/format stack (~85). A
  hand-rolled SVG polyline is ~3 KiB".
- **Expected** exactly four `LineChart` render sites, at those four lines, and no other consumer.
- **Actual** `grep -n "LineChart" app/src/components/admin/SystemHealthPanel.tsx` → `:6` (the import) and
  exactly **four** render sites at **`:153`, `:157`, `:165`, `:169`** — the four line numbers are exact.
  An app-wide search for `LineChart` outside `LineChart.tsx` and `RechartsLine.tsx` returns
  **`SystemHealthPanel.tsx` and nothing else**, confirming "the only consumer". The per-vendor KiB
  breakdown needs the treemap.
- **Class** MATCHED (the structural claims: four sites, exact lines, sole consumer) · **Severity** P3 ·
  **Action** none
- **UNVERIFIED (P3)** the per-vendor rendered-length figures — require `ANALYZE=1` treemap reading.
- **Credit** the causal chain (one consumer → one chart → the whole recharts/d3/redux graph) is the
  actionable finding in this file, and it is structurally verified rather than recalled. It is also the
  basis of recommendation #4.

## P‑9 · [[PERF_BASELINE]] — "All 48 admin/super-admin panels are `React.lazy`"

- **Claim** "**All 48** admin/super-admin panels are `React.lazy` (`AdminApp.tsx:60-107`), so each is its
  own chunk. The T13 migration did its job."
- **Expected** 48 `React.lazy` calls in that line range.
- **Actual** `sed -n '60,107p' app/src/components/admin/AdminApp.tsx | grep -c "lazy("` → **48**. The whole
  file contains exactly 48 `lazy(` occurrences and 48 distinct
  `lazy(() => import('…'))` targets, so the count is exact and the cited line range is exact.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Cross-doc conflict** 48 ≠ `COMPONENT_CATALOG.md` §2's "25 files" (F‑2) ≠ the 63 files actually on disk.
  The panel count (48) and the file count (63) measure different things — lazy-loaded panels vs all files
  including shells, modals and receipts — so this is a doc-set inconsistency rather than an error here.
  **Action** UPDATE-DOC (in F‑2) to reconcile the three numbers explicitly.

## P‑10 · [[PERF_BASELINE]] — the reverted `client:visible` experiment

- **Claim** "Applied: `BookPage.astro:45` — `ReservationSummary`: `client:load` → `client:visible`;
  `MenuPage.astro:48` — `TenantMenu`: `client:load` → `client:visible` … Reverted (`git checkout --` both
  files, working tree clean). Frontend suite on the reverted tree: **154 files / 3611 tests PASS**." and
  "`client:load` and `client:visible` change *hydration timing*, not chunk emission … Any change of this
  class is structurally incapable of moving a chunk-size metric."
- **Expected** both files currently at `client:load` (the revert landed), and the finding's logic to hold.
- **Actual** **The revert is confirmed in the working tree**: `BookPage.astro:45` and `MenuPage.astro:48`
  are both `client:load`, which is also how `ARCHITECTURE.md` §3 counts them (**A‑8**, **A‑9**). The
  structural claim is independently supported: `app/dist/client/_astro/` has 113 chunks either way, and
  the emitted component chunk is not a function of the directive — `client:*` selects hydration timing.
- **Class** MATCHED (revert state + finding) · **Severity** P3 · **Action** none
- **STALE (P3)** the suite figure "154 files / 3611 tests" was the **baseline**, not the current count —
  the app suite is now **155 / 3632** (**A‑20**). The doc is describing a past run, which is correct for its
  purpose; it should say "baseline" the way the other dated figures do.
- **Credit** keeping a reverted experiment and its null result in the file, so it is not repeated blind,
  is the single most valuable thing in this document.

## P‑11 · [[PERF_BASELINE]] — bundle-analyzer substitution

- **Claim** "the installed `vite-plugin-bundle-analyzer@0.0.1` turned out to be a no-op stub
  (`console.log('let build together')` — no analysis), so the gate uses `rollup-plugin-visualizer@7.0.1`
  instead."
- **Expected** the visualizer present, the stub analyzer absent.
- **Actual** `app/package.json` → `"rollup-plugin-visualizer": "^7.0.1"` present; no
  `vite-plugin-bundle-analyzer` dependency. `app/astro.config.mjs:11`
  `const { visualizer } = await import('rollup-plugin-visualizer');` behind the `ANALYZE === '1'` guard at
  `:10`.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Note** the stub's `console.log('let build together')` body cannot be re-verified — the package is no
  longer installed. The claim is historical and the conclusion (it was removed) is verifiable.

## P‑12 · [[PERF_BASELINE]] — ANALYZE gating

- **Claim** "`ANALYZE=1` is gated in `app/astro.config.mjs`: it conditionally adds `rollup-plugin-visualizer`
  (treemap HTML report, gzip+brotli sizes) plus a small `bundle-size-report` plugin that prints per-chunk
  sizes to the console. Unset `ANALYZE` → plugin array is exactly `[tailwindcss()]`, unchanged from
  before."
- **Expected** both.
- **Actual** `astro.config.mjs:6` `const vitePlugins = [tailwindcss()];`; `:10`
  `if (process.env.ANALYZE === '1') {`; `:11` the visualizer dynamic import; `:21`
  `name: 'bundle-size-report'`; `:26` `console.log('\n[ANALYZE] chunks by size:')`. The `ANALYZE` branch is
  gated and the default array is exactly one plugin.
- **Class** MATCHED · **Severity** P3 · **Action** none

## P‑13 · [[PERF_BASELINE]] — Lighthouse harness targets and the committed baseline

- **Claim** "# Performance Baseline — Lighthouse … Lighthouse 13.4.1 mobile preset, default simulated
  throttling (Slow 4G + 4× CPU), driven by `tests/lighthouse/run.ts` (`npx tsx`) with Chromium 149
  (Playwright 1.61.1) … Writes `tests/lighthouse/lighthouse-baseline.json`" and the three-row results table.
- **Expected** the committed baseline file to carry those scores, and Playwright 1.61.1.
- **Actual** `tests/lighthouse/lighthouse-baseline.json` exists (1,366 B, generated
  `2026-08-07T16:04:07.327Z`, `baseUrl: http://localhost:4320`, `preset: mobile`, `throttling: "default
  (Lighthouse simulated Slow 4G + 4x CPU)"`). Its `targets` block is
  `{cls: 0.1, lcpMs: 2500, tbtMs: 300, enforced: false}` — **300 ms, not 200 ms**, corroborating **P‑1**.
  Its `/admin?tenant=marketplace` scores are `55/95/96/82` with `cls 0, lcpMs 25043, tbtMs 115`, matching
  the doc's "55 | 95 | 96 | 82 | 0.000 | 25.04 | 115" exactly. `run.ts:52` targets match the file.
  Playwright: `package.json` `"@playwright/test": "^1.61.1"`, installed `playwright-core` **1.61.1**.
- **Class** MATCHED (run date, preset, throttling, targets, all three score rows, Playwright version) ·
  **Severity** P3 · **Action** none
- **UNVERIFIED (P3)** "Lighthouse 13.4.1" and "Chromium 149" — Lighthouse is invoked as
  `npx --yes lighthouse` with **no version pin** (resolves at run time) and Chromium comes from the
  Playwright bundle, so neither number is derivable from the tree. Playwright 1.61.1 is pinned and does
  ship a Chromium of that generation, which is corroboration but not proof. **Action** VERIFY-RUNTIME.

## P‑14 · [[PERF_BASELINE]] — Lighthouse targets "recorded as flags only"

- **Claim** "**Targets:** flags only, **NOT enforced** this pass: CLS < 0.1, LCP < 2.5 s, TBT < 300 ms" …
  "Targets (CLS < 0.1, LCP < 2.5 s, TBT < 300 ms) are recorded as flags only — the LCP flag is NOT met on
  the dev baseline and is expected to improve on a production build. Not enforced this pass."
- **Expected** the "flags only" framing to be true.
- **Actual** `run.ts:52` `enforced: false`, and the committed baseline records the same. The LCP values
  (25.04 s, 22.72 s, 5.65 s) are all far above the 2.5 s target, which is consistent with the stated
  dev-server caveat.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Why this is the counterpart to P‑1** the Lighthouse section gets "not enforced" right and says so twice.
  The `app/budget.json` Status paragraph is the one that over-claims. That makes the fix local: the
  Status sentence, not the harness.

## Y‑1 · [[03-frontend/README]] — "four public islands exist by design" · **FALSE**

- **Source** `docs/03-frontend/README.md` §Concepts
- **Claim** "**Islands are rationed** — **four** public islands exist by design. `client:visible` for
  below-fold content, and adding an island is a deliberate cost, not a default."
- **Expected** 4 public islands.
- **Actual** **9** public-facing island directive sites, from the census in **A‑8**:
  `client:visible` ×6 — `CampBooking` inside `TenantLanding.astro:203`, `MarketplaceDirectory` in
  `marketplace.astro:14`, and the four storefront islands at `storefront/index.astro:54`,
  `storefront/cart.astro:52`, `storefront/checkout.astro:53`,
  `storefront/order/[orderNumber]/confirmation.astro:54`; `client:load` ×3 —
  `ReservationSummary` in `BookPage.astro:45`, `TenantMenu` in `MenuPage.astro:48`, and the debug-gated
  `DebugFeedbackWidget` in `PublicLayout.astro:778`. The 8 `client:only` sites are SPA hosts, not content
  islands. So the honest figures are **8** public content islands plus 1 debug-gated widget, or **9** if the
  debug widget counts.
- **Class** FALSE · **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** the number 4 comes from the repo's `AGENTS.md`, which predates the storefront
  islands. `ARCHITECTURE.md` §3 in this same audit counts 17 total sites (6 visible / 3 load) and is
  right; this README is wrong in a way that would let the next agent add four more "since there are only
  four" — the exact failure the rationing rule exists to prevent. The "islands are rationed" *intent* is
  correct and worth keeping; only the count needs the storefronts folded in.

## Y‑2 · [[03-frontend/README]] — "nothing fetches data outside `@/lib/api`"

- **Claim** "**Hooks are the data layer** — `useAdminData`, `useQueryHooks`, `useApiError`, `useSseInbox`,
  `useSseOrders`. The admin SPA runs entirely on TanStack Query; nothing fetches data outside `@/lib/api`."
- **Expected** the hook list to be the real one; no data fetch bypassing the client.
- **Actual** Three of the five names are right; `useApiError` does not exist and `usePosQueries` is
  missing — the same defect as **F‑5**. The TanStack Query / `@/lib/api` claim is confirmed by **F‑3**
  (zero network `fetch` under admin and pos; all 9 `fetch(`-shaped hits are `refetch()`).
- **Class** STALE (hook names) / MATCHED (the fetch claim) · **Severity** P3 · **Action** UPDATE-DOC

## Y‑3 · [[03-frontend/README]] — "app/budget.json holds the enforced limits"

- **Claim** "**Bundle budget** — `app/budget.json` holds the enforced limits; `PERF_BASELINE.md` records
  what browsers actually download, the top-15 chunks and the top-3 suspects."
- **Expected** `budget.json` to hold the enforced limits.
- **Actual** `app/budget.json` holds five Lighthouse **resource-size** budgets (`script` 300,
  `stylesheet` 100, `image` 1500, `font` 400, `total` 2500 KB, all `metric: "transferSize"`). It is
  genuinely consumed by the tool — `app/package.json`'s `lighthouse` script passes
  `--budget-path=budget.json` — so "enforced" is right **for resource sizes** and wrong as an unqualified
  statement: the CLS/LCP/TBT targets the sibling doc attributes to this file are in
  `tests/lighthouse/run.ts:52` and are `enforced: false`.
- **Class** STALE · **Severity** P2 · **Action** UPDATE-DOC
- **Note** this is the same defect as **P‑1** seen from the third doc that carries it. The
  `budget.json` → "CLS/LCP/TBT" → "200 ms" → "enforced" chain is stated three times across two folders and
  is wrong in each.

---

# Notes on method and what was deliberately not done

**Not re-run:** backend/app/monitor/root-integration/E2E suites, `ANALYZE=1 npm run build`,
`npm run lighthouse`, `wrangler`, `deploy.sh`, any remote call. Test counts come from the latest committed
result in `docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` (see **A‑20** for the per-suite provenance:
`a2-saga-status`/`a7-workstream-closure` for backend, `tenant-outage-vs-404` for app, `mon-probe-selfcheck`
for monitor). Bundle figures were verified against the **committed** `app/dist/` instead of rebuilding,
which is stronger — it proves the shipped build matches the doc, not just that a fresh build would.

**Tooling note:** `rg` is not on PATH in this workspace. All content searches went through the `grep`
tool; all counting, table extraction and cross-reference work went through throwaway `node:fs` scripts in
`/tmp/opencode/`. No dependency was added and nothing in the repo was written except this file and the
logbook fold.

**Nothing was fixed.** 13 entries are `FALSE` and 4 more are materially `STALE`, and the fix for most of
them is a one-line edit to a doc — but the spec for this pass is audit-only, so every one is left for the
reconciliation pass with a named `Action` instead. The four P1s are, in priority order: **S‑6** (a doc that
denies a table's existence and then lists it 200 lines later), **S‑4** (13 tables that exist nowhere),
**F‑2** (40 of 63 admin panels invisible in the catalog), and **S‑2/S‑3** (184 non-existent client
functions and hooks, with a working Endpoint column beside them giving no warning).

**The one thing this audit would change about how these docs get written:** the three folders disagree
with each other on the same facts more often than they disagree with the code. `ARCHITECTURE.md` says the
role ladder has no `staff`; `API_CONTRACT.md` says it does. `ARCHITECTURE.md` says the rate limiter has a
tenant layer on 7 prefixes; the code has 36. `ARCHITECTURE.md` publishes no E2E total on principle;
`QUICK_START.md` publishes 929. `PERF_BASELINE.md`'s header corrects its own §Status from 200 ms to
300 ms. `03-frontend/README.md` says 4 public islands; `ARCHITECTURE.md` counts 17 directive sites in the
same vault. Each individual file is largely *self*-consistent and largely *right* — the drift is between
them. A cross-doc consistency pass, run before any individual doc is edited, would prevent the next
single-file fix from being undone by the next one.