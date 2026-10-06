---
title: "Code vs docs — UNVERIFIED claims"
aliases:
  - unverified
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[99-gaps/README]]"
  - "[[code-vs-docs]]"
  - "[[unimplemented]]"
  - "[[PERF_BASELINE]]"
  - "[[QUICK_START]]"
  - "[[security-guide]]"
  - "[[RUNBOOK]]"
code-references:
  - "tests/lighthouse/run.ts"
  - "tests/lighthouse/lighthouse-baseline.json"
  - "app/budget.json"
  - "app/astro.config.mjs"
  - "app/src/lib/browser-ai.ts"
  - "backend/src/middleware/rateLimit.js"
  - "backend/wrangler.toml"
  - "deploy.sh"
  - "backend/src/api/services.js"
  - "backend/src/api/promotions.js"
verified: 2026-10-06
---
# Code vs docs — UNVERIFIED claims

Claims that **could not be checked from the tree** — because the check needs an expensive run, a
build, a live host, or a Cloudflare console — plus the few where the audit's own check was sound but
the claim sits outside what any repository can answer. **15 entries.**

These are not defects and are not filed as such. They are the honest boundary of an audit that ran
read-only, and they are what a later pass with a runtime would pick up. Split by why:

| Why it could not be verified | Entries |
|---|---|
| Needs a build or a bundle re-run (`ANALYZE=1 npm run build`, the Lighthouse harness) | **P‑2**, **P‑3**, **P‑5**, **P‑6**, **P‑8**, **P‑13** |
| External state — a live host, a Cloudflare plan limit, a console DNS record | **Q‑5**, **O‑7**, **O‑12** |
| Process, not code — a manual checklist or a human gate | **T‑13**, **O‑13** |
| A claim that needs diffing against a pinned SHA, or tracing one call path further | **S‑18**, **G‑18**, **G‑20** |

Two of these are worth reading for the wrong reason: **P‑5** is a claim that is *correct* precisely
because it is labelled a snapshot, and **Q‑6** is the only entry in this note whose action is
`UPDATE-DOC` — "Node.js 20+" is documented in one place, unenforced everywhere (`engines` is absent
from all three `package.json` files), and the logbook's own `node:sqlite` local-replay path needs
Node 22.

Each entry below reproduces its source audit's text verbatim. `Class` is the audit's; where the entry
also matched something, the Class line names both.

# Entries by folder

## docs/01-architecture

<!-- 2 entries from this folder -->

### Q‑5 · §6 — staging requirement

- **Origin** audit A entry `Q‑5` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** "Staging requires `staging.sinaicamps.com` → Workers DNS to be created in Cloudflare first
  (human action)."
- **Expected** a human-action note, unverifiable from the tree.
- **Actual** `deploy.sh:39-40` sets `DEPLOY_ENV="staging"`; `[env.staging]` exists at
  `backend/wrangler.toml:92-149`. The DNS claim is inherently a Cloudflare-console fact.
- **Class** UNVERIFIED (external state) · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Severity** P3 · **Action** VERIFY-RUNTIME

### Q‑6 · Prerequisites — "Node.js 20+ and npm"

- **Origin** audit A entry `Q‑6` · baseline `dee3124` · source `docs/01-architecture/QUICK_START.md`
- **Source** `docs/01-architecture/QUICK_START.md` — the section named in the heading above
- **Claim** "Node.js 20+ and npm"
- **Expected** either a machine-enforced floor or a documented one.
- **Actual** **No `engines` field in any of the three `package.json` files** (`package.json`,
  `app/package.json`, `backend/package.json` → `engines` = null in all three). The floor is documented
  only here. Local interpreter is `node v22.22.3`. This matters beyond pedantry: the repo's own
  `AGENT_LOGBOOK.md` records using `node:sqlite` (`DatabaseSync`, "Node ≥22 ships `node:sqlite` built
  in") for local migration replay — a Node-20-only machine cannot run that verification path.
- **Class** UNVERIFIED · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Suggested** if the doc wants to be honest rather than aspirational, say "Node 22+ — the
  `node:sqlite` local-replay path documented in the logbook needs it" and add `engines` separately.

## docs/03-frontend

<!-- 6 entries from this folder -->

### P‑2 · [[PERF_BASELINE]] — the eager/lazy classification method and result

- **Origin** audit A entry `P‑2` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
- **UNVERIFIED (P3)** the exact module counts (1095/1096) and KiB split (10.6 / 2166.8) require a fresh
  `ANALYZE=1 npm run build` with a graph walk; not re-run. The *totals* they must sum to are verified by
  P‑4.

### P‑3 · [[PERF_BASELINE]] — "Three questions" investigation

- **Origin** audit A entry `P‑3` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
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
- **Severity** P3 · **Action** VERIFY-RUNTIME
  **Action** VERIFY-RUNTIME
- **Credit** the *conclusion* ("Nothing to fix") is well argued and the reasoning about
  `react-dom/client` vs `react-dom` being different entry points rather than a duplicate is correct on its
  face. Only the attribution evidence needs a re-run.

### P‑5 · [[PERF_BASELINE]] — 2026-09-22 and 2026-08-07 historical tables

- **Origin** audit A entry `P‑5` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "JS chunks | 54 | 106 | +52" and "Total JS | 501.2 KiB (~118 KiB gzip est.) | 2114.3 KiB
  (~620 KiB gzip)" for 2026-08-07 → 2026-09-22; the 2026-09-22 "Largest 15 client chunks" table topped by
  `transformers.web` 503.7 KiB.
- **Expected** historical snapshots to be labelled as historical.
- **Actual** Both are under `## Historical snapshot 2026-08-07 (retained …)` and the 2026-09-22 total sits
  under `## Totals`. No build from those dates exists in the tree, and the doc says so: "re-run with
  `ANALYZE=1 npm run build` / `npx tsx tests/lighthouse/run.ts` before quoting".
- **Class** UNVERIFIED (unreproducible by construction; correctly labelled) · **Severity** P3 ·
- **Severity** P3 · **Action** DEFER
  **Action** DEFER
- **Reason for DEFER not UPDATE-DOC** these are explicitly snapshot-labelled and the doc instructs the
  reader not to quote them. That is the correct handling of an un-rotting number.

### P‑6 · [[PERF_BASELINE]] — storefront island sizes

- **Origin** audit A entry `P‑6` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "Storefront islands stay small (all code-split per route): `StorefrontCheckout` 5.8 KiB,
  `ShopCatalog` 3.6 KiB, `StorefrontCart` 3.3 KiB, `StorefrontConfirmation` 2.7 KiB."
- **Expected** four small chunks in `dist`.
- **Actual** The four directive sites exist (**A‑8**). Chunk presence in `dist` is confirmed for the three
  named suspects but the storefront chunks were not individually sized here.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Severity** P3 · **Action** VERIFY-RUNTIME

### P‑8 · [[PERF_BASELINE]] — `RechartsLine` size, vendor breakdown, and the four sparklines

- **Origin** audit A entry `P‑8` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none
  **Action** none
- **UNVERIFIED (P3)** the per-vendor rendered-length figures — require `ANALYZE=1` treemap reading.
- **Credit** the causal chain (one consumer → one chart → the whole recharts/d3/redux graph) is the
  actionable finding in this file, and it is structurally verified rather than recalled. It is also the
  basis of recommendation #4.

### P‑13 · [[PERF_BASELINE]] — Lighthouse harness targets and the committed baseline

- **Origin** audit A entry `P‑13` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
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
- **Severity** P3 · **Action** none / VERIFY-RUNTIME.
  **Severity** P3 · **Action** none
- **UNVERIFIED (P3)** "Lighthouse 13.4.1" and "Chromium 149" — Lighthouse is invoked as
  `npx --yes lighthouse` with **no version pin** (resolves at run time) and Chromium comes from the
  Playwright bundle, so neither number is derivable from the tree. Playwright 1.61.1 is pinned and does
  ship a Chromium of that generation, which is corroboration but not proof. **Action** VERIFY-RUNTIME.

## docs/04-testing

<!-- 1 entry from this folder -->

### T‑13 · [[TESTING]] §Cross-cutting manual steps 32–34 · UNVERIFIED

- **Origin** audit B entry `T‑13` · baseline `ddc63c6` · source `docs/04-testing/TESTING.md`
- **Source** `docs/04-testing/TESTING.md` — the section named in the heading above
- **Claim** Three numbered manual procedures (auth/security, responsive, error handling), 7 + 5 + 4
  actions.
- **Expected** no automatable form.
- **Actual** These are by construction manual checklists; nothing in the tree can confirm or deny
  that step 32.1 redirects to login. The steps themselves are consistent with the zone/auth model
  (`/admin` guarded, JWT in `localStorage` via `app/src/lib/session.ts:52`).
- **Class** UNVERIFIED · **Severity** P3 · **Action** DEFER
- **Severity** P3 · **Action** DEFER
- **Credit** the folder README states the risk correctly — "Not automatable, and skipped silently
  is the same as passed unless you do them" — which is the right framing and the reason this is not
  a defect.

## docs/05-operations

<!-- 3 entries from this folder -->

### O‑7 · [[RUNBOOK]] §5 — post-deploy smoke · UNVERIFIED

- **Origin** audit B entry `O‑7` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
- **Claim** Five `curl -sS …  -w "\nHTTP %{http_code}\n"` probes against `/`, `/api/me`,
  `acaciacamp.com/`, `acaciacamp.com/admin`, `michaelshouse.sinaicamps.com/`; "expect 200/400-guard,
  never 000/500" — `000` means the probe never landed, `500` means it landed and broke.
- **Expected** the endpoints to be real; the live status codes are external.
- **Actual** `/api/me` is a real mounted route family (`index.js` mounts `/api/me/*` with
  `tenantAwareLimiter()`), and the 000-vs-500 distinction is sound. **No `curl` was issued by this
  audit** (mission constraint), so the five URLs' current status codes are unverified.
- **Class** UNVERIFIED (external) · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Severity** P3 · **Action** VERIFY-RUNTIME
- **Credit** the `000` vs `500` framing is the right one — it separates "my probe is wrong" from
  "the deploy is broken", which are different owners.

### O‑12 · [[RUNBOOK]] §9a — the two-limit table · MATCHED (code side) / UNVERIFIED (plan facts)

- **Origin** audit B entry `O‑12` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
- **Claim** Two independent free-tier ceilings: KV writes 1,000/day → every request answers `429
  Rate limit check failed`; D1 rows read → operator-side read commands refuse with
  `[code: 7500]`, remedy is "wait for midnight UTC" or upgrade. "The D1 one is an **operator** outage
  only: the deployed Worker keeps serving."
- **Expected** the code-side halves checkable; the plan limits are Cloudflare facts.
- **Actual** Code side confirmed: `rateLimit.js:211`/`:246` return `429 Rate limit check failed`, and
  `backend/wrangler.toml:56`/`:97` keep the KV branch off so the first row cannot be reached in
  normal operation. The "verify locally, fold counters into one SELECT with scalar subqueries,
  because a `UNION ALL` census is itself capped" advice is real operational knowledge and matches
  the D1 binding reality. The numeric free-tier ceilings and the UTC reset boundary are Cloudflare
  console facts, not tree-derivable.
- **Class** UNVERIFIED (plan limits) / MATCHED (code side) · **Severity** P3 · **Action**
- **Severity** P3 · **Action** VERIFY-RUNTIME
  VERIFY-RUNTIME

### O‑13 · [[RUNBOOK]] §10 + §9a — the 24-hour watch window and the "never" clauses · UNVERIFIED

- **Origin** audit B entry `O‑13` · baseline `ddc63c6` · source `docs/05-operations/RUNBOOK.md`
- **Source** `docs/05-operations/RUNBOOK.md` — the section named in the heading above
- **Claim** §10 lists five things to watch for 24h after a prod deploy, including "Both §4a version
  ids recorded and legible in `versions list` — the rollback lever is only real if you wrote the id
  down." §9a: "Never debug handler behavior on a stale staging."
- **Expected** process, not code.
- **Actual** Not tree-verifiable. The reasoning is sound and each item maps to a real failure mode
  documented elsewhere in the same file (§5 chunk 404s, §9 KV write rate, §9 auth).
- **Class** UNVERIFIED · **Severity** P3 · **Action** DEFER
- **Severity** P3 · **Action** DEFER
- **Credit** "a deploy that passes smoke in the first five minutes is not a deploy that passed" —
  stated as the section's premise in `05-operations/README.md`, which is the right framing for an
  owner-facing runbook.

## docs/06-security

<!-- 1 entry from this folder -->

### S‑18 · [[security-guide]] — the fix/regression SHAs it pins · UNVERIFIED

- **Origin** audit B entry `S‑18` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** "Fix commit `af1d69b` unwrapped all 46 A/B/E call sites (inner expressions
  byte-identical); 18 `escHtml` hits remain, all KEEP" and "Regression test
  `app/tests/unit/tenant-name-escape.test.tsx` (commit `09ff710`)"
- **Expected** both SHAs to resolve and the regression test to exist.
- **Actual** `app/tests/unit/tenant-name-escape.test.tsx` **exists**, and
  `AGENT_LOGBOOK_HISTORY.md:9637-9638` independently records both commits with the exact counts
  ("unwrapped all 46 A/B/E lines per inventory table … 153 files / 3606 passed", then "+1 file/+5 →
  154 files / 3611 passed" for `09ff710`). The remaining-18 figure is re-verified directly
  (**S‑8**). The "byte-identical inner expressions" property cannot be re-derived from the tree
  without diffing against `af1d69b`.
- **Class** UNVERIFIED (the byte-identical claim) / MATCHED (both SHAs and the test) ·
- **Severity** P3 · **Action** DEFER
  **Severity** P3 · **Action** DEFER

## docs/08-guides

<!-- 2 entries from this folder -->

### G‑18 · [[service-guide]] §Custom Fields (JSON Schema) · UNVERIFIED

- **Origin** audit B entry `G‑18` · baseline `ddc63c6` · source `docs/08-guides/service-guide.md`
- **Source** `docs/08-guides/service-guide.md` — the section named in the heading above
- **Claim** Services support custom fields via a JSON schema driving "the dynamic booking form on the
  public portal", with a `fields[]` example using `name` / `type` / `label` / `min` / `max` /
  `options`.
- **Expected** a JSON-Schema column on service definitions plus a renderer.
- **Actual** `backend/src/api/services.js` was read for the routes the doc names (**G‑15**,
  **G‑16**) and does not surface a custom-fields schema in the booking path; `ServiceBookingsPanel.tsx`
  exists as a `code-reference`. The mechanism is plausible and the doc's own framing elsewhere is
  careful, but no code path was pinned that consumes `fields[]`, so this entry is left unverified
  rather than failed.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Severity** P3 · **Action** VERIFY-RUNTIME

### G‑20 · [[supermarket-guide]] §Promotions — "only the best eligible promotion applies per line item (no stacking)" · UNVERIFIED

- **Origin** audit B entry `G‑20` · baseline `ddc63c6` · source `docs/08-guides/supermarket-guide.md`
- **Source** `docs/08-guides/supermarket-guide.md` — the section named in the heading above
- **Claim** Three promotion types (BOGO "every 2nd item free (fixed logic, not configurable X/Y)" ·
  percentage · fixed), and one-best-per-line with no stacking.
- **Expected** three promo kinds and a single-winner selection.
- **Actual** `backend/src/api/promotions.js` exists and both its line-referenced call sites (`:107`,
  `:244`) resolve; `index.js:567` mounts `/api/promotions`. The promotion *engine* that selects one
  winner per line lives in the POS sale path (`routes/pos/index.js:426` onward) and was not traced
  here — the BOGO "fixed X/Y" and "best eligible, no stacking" claims are therefore unverified rather
  than confirmed.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Severity** P3 · **Action** VERIFY-RUNTIME
- **Credit** "fixed logic, not configurable X/Y" and "no stacking" are precisely the claims a reader
  would otherwise have to reverse-engineer; they are stated, dated, and checkable. Given the guide's
  record on negatives elsewhere (**G‑16**), these are likely right.
