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
  - "[[code-vs-code]]"
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
  - "app/src/components/ui/Modal.tsx"
  - "app/src/components/admin/SystemHealthPanel.tsx"
  - "backend/src/middleware/rateLimit.js"
  - "backend/wrangler.toml"
  - "tests/core/migration-integrity.test.js"
  - "deploy.sh"
  - "backend/src/api/services.js"
  - "backend/src/api/promotions.js"
verified: 2026-10-06
---
# Code vs docs — UNVERIFIED claims

Claims that **could not be checked from the tree** — because the check needs an expensive run, a
build, a live host, or a Cloudflare console — plus the few where the audit's own check was sound but
the claim sits outside what any repository can answer. **15 entries.**

## Status as of 2026-10-06

These are not defects and are not filed as such. They are the honest boundary of an audit that ran
read-only, and they are what a later pass with a runtime would pick up. Fifteen entries, **two** of
which are still open; the rest closed or parked on 2026-10-06.

| Status | Count | Entries |
|---|---|---|
| `RESOLVED-DOC` | **7** | `Q‑6`, `P‑3`, `P‑8`, `P‑13`, **`O‑7`**, `S‑18`, `G‑18` — the tree settled them and the cited doc was wrong |
| `DEFERRED` | **6** | `P‑2`, `P‑5`, `T‑13`, `O‑12`, `O‑13`, `G‑20` — correct as labelled, or a human gate no repo can answer |
| `OPEN` | **2** | **`Q‑5`**, **`P‑6`** — still undecidable, and **no probe was authorised for either** |
| `RESOLVED-REJECTED` | **0** | |
| `RESOLVED-CODE` | **0** | the owner chose FIX DOCS ONLY, so not one closed by changing source |
| **Total** | **15** | |

**The one entry that changed class rather than closed is `O‑7`, and the direction matters.** It was
`UNKNOWN (external)` because no audit pass had ever issued its five `curl`s. Five owner-approved GETs
were issued (`e731b11`) and **all five returned `200` — 5 / 5 MATCH, 0 DIFFERS**, no `000`, no `500`.
So it closes as `RESOLVED-DOC`, and the finding is *positive*: the runbook's smoke contract holds
against production on every host. The only imprecision was the §5 heading's `expect 200/400-guard`
wording, because `GET /api/me` is **public by design** and a `4xx` was never the expected answer
(`backend/src/index.js:616-617`). That phrasing was tightened in `b06990c`. **It is recorded here as
a documentation imprecision, not a defect**, and the runbook quotes the probe rather than restating a
guard that would mislead the next deploy.

**Neither `OPEN` entry was promoted to a finding on the strength of "cannot check it here."** That
rule is the reason this note is small: `Q‑5` is a Cloudflare-console DNS fact the owner chose to
confirm himself rather than have probed, and `P‑6` is four byte figures against a gitignored,
unpinned build artefact. `edb07db` **removed** the `P‑6` figures and recorded why they cannot be
verified, keeping the structural half (four `client:visible` storefront islands) which is checkable
from source. Recording a number nobody can reproduce would have been worse than recording its absence.

Split by why:

| Why it could not be verified | Entries |
|---|---|
| Needs a build or a bundle re-run (`ANALYZE=1 npm run build`, the Lighthouse harness) | **P‑2**, **P‑3**, **P‑5**, **P‑6**, **P‑8**, **P‑13** |
| External state — a live host, a Cloudflare plan limit, a console DNS record | **Q‑5**, **O‑7**, **O‑12** |
| Process, not code — a manual checklist or a human gate | **T‑13**, **O‑13** |
| A claim that needs diffing against a pinned SHA, or tracing one call path further | **S‑18**, **G‑18**, **G‑20** |

Two of these are worth reading for the wrong reason: **P‑5** is a claim that is *correct* precisely
because it is labelled a snapshot, and **Q‑6** was the only entry in this note whose action was
`UPDATE-DOC` — "Node.js 20+" is documented in one place, unenforced everywhere (`engines` is absent
from all three `package.json` files), *and* wrong: `astro` 7.3.1 declares `engines.node
">=22.12.0"`, so the real floor is Node **22.12**+, and the logbook's own `node:sqlite` local-replay
path needs Node 22. `3b753e4` corrected it.

Each entry below reproduces its source audit's text verbatim. `Class` is the audit's; where the entry
also matched something, the Class line names both. The **Status** line above each entry is this
note's, added 2026-10-06, and is the only line not from the audit.

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

> ### Status — `OPEN` 2026-10-06, and it stays open by choice.
>
> **No probe was issued.** The code half was re-verified and holds: `deploy.sh:39-40` sets
> `DEPLOY_ENV="staging"` on `--staging`, and `backend/wrangler.toml:92` `[env.staging]` exists with
> its own `d1_databases` / `kv_namespaces` / `r2_buckets` / `durable_objects` / `migrations` blocks
> (`:124-149`). What remains unverified is the one thing the tree cannot hold: **whether the
> `staging.sinaicamps.com` DNS record exists in the Cloudflare dashboard.** That is a console fact
> about a control plane, and the owner elected to confirm it directly rather than have it probed.
>
> **This is the correct state for an `UNVERIFIED` entry and the reason the class exists.** The
> temptation was to promote it on the reasoning that a staging deploy is the riskiest single step in
> `deploy.sh` — but *"important"* is not *"measurable from here"*, and `VERIFY-RUNTIME` means exactly
> what it says. A wrong `200` here would be a fabricated finding; a wrong `OPEN` here costs one
> console lookup.
>
> **To close it:** one DNS check — `dig +short staging.sinaicamps.com`, or the record in the
> Cloudflare dashboard's DNS page — confirming the record resolves to the staging Worker route. The
> note's own `Claim` needs no edit either way: it already says "(human action)", which is the
> honest labelling of a step the repository cannot perform.

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

> **`RESOLVED-DOC` 2026-10-06 (`3b753e4`) — and the finding got *stronger*, not weaker.** The
> audit recorded the floor as unenforced; re-derivation showed it is also **wrong**. `engines` is
> absent from all three manifests (`package.json`, `app/package.json`, `backend/package.json` →
> `undefined` in all three), *and* the dependency tree sets a higher floor than the doc does:
> **`astro` 7.3.1 declares `engines.node ">=22.12.0"`** (`app/node_modules/astro/package.json`)
> and root `vite` 8.1.5 declares `"^20.19.0 || >=22.12.0"`. A Node-20 machine cannot build this
> app at all, so "Node.js 20+" was not merely aspirational — it was false. `QUICK_START.md`
> Prerequisites now say **Node 22.12+** and explain both sources. `engines` was deliberately
> **not** added to any manifest: that is a code change and the owner chose FIX DOCS ONLY.

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

> **`DEFERRED` 2026-10-06 — the totals corroborate exactly; the module-level split still needs a
> build.** `ls app/dist/client/_astro/*.js | wc -l` → **113** = 5 + 108, and the emitted JS sums
> to **2177.4 KiB** = 10.6 + 2166.8 to the decimal. The *method* claim is corroborated
> structurally: `app/astro.config.mjs` wires `rollup-plugin-visualizer` as a rollup plugin, which
> can only see static edges, and `client.D3SnGAPC.js` exists as a real 176.4 KiB emitted file,
> confirming the "island renderer referenced by URL" reasoning. What remains unverified is the
> **module-level** 1095/1096 split, which needs a fresh `ANALYZE=1 npm run build` plus a graph
> walk — and `app/dist` is gitignored and currently one `app/src` commit behind. **Also noted, not
> fixed:** the doc contradicts itself elsewhere — §Totals says `JS chunks 106 / Total JS 2114.3
> KiB`. That self-contradiction is the strongest argument for the defer: a build is what settles
> it, and guessing would settle it wrongly.

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

> **`RESOLVED-DOC` 2026-10-06 (`8b01b00`) — the *conclusion* was right and the *evidence* was
> false.** "No `app/src` file imports `react-dom` directly (verified by grep)" does not hold:
> `app/src/components/ui/Modal.tsx:2` is `import { createPortal } from 'react-dom';` — and it did
> so at the doc's own measurement HEAD (`git show 921e871:app/src/components/ui/Modal.tsx`, line
> 2, added `b164048`). The size half is exact and unaffected: `app/dist/client/_astro/` holds
> exactly one `react.*` chunk (8.4 KiB) and one `react-dom.*` chunk (3.5 KiB), and
> `client.D3SnGAPC.js` (176.4 KiB) carries `react-dom/client` — so the reasoning that
> `react-dom/client` and `react-dom` are different entry points rather than a duplicate stands,
> and **"Nothing to fix" survives**. Only the supporting sentence was corrected, because a grep
> claim in a perf doc is the kind of sentence a reader re-runs and cites.

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

> **`DEFERRED` 2026-10-06 — no edit, deliberately.** These are correctly-handled dated artefacts:
> the 08-07 table sits under `## Historical snapshot 2026-08-07 (retained …)`, the 2026-09-22
> total under `## Totals`, and the doc instructs "re-run with `ANALYZE=1 npm run build` / `npx tsx
> tests/lighthouse/run.ts` before quoting". No build from either date exists in the tree
> (`app/dist` is gitignored), so the figures are **unreproducible by construction** — and that is
> the correct treatment of a number that should not rot. Rewriting them to today's build would
> convert a dated record into a false one. This is the source entry's own `Action`: `DEFER`.

### P‑6 · [[PERF_BASELINE]] — storefront island sizes

- **Origin** audit A entry `P‑6` · baseline `dee3124` · source `docs/03-frontend/PERF_BASELINE.md`
- **Source** `docs/03-frontend/PERF_BASELINE.md` — the section named in the heading above
- **Claim** "Storefront islands stay small (all code-split per route)", followed by four per-island
  byte sizes. **The four figures were removed from `PERF_BASELINE.md` in `edb07db`; the qualitative
  claim and the structural evidence below are what remains.**
- **Expected** four small chunks in `dist`.
- **Actual** The structural half verifies and is kept: **all four storefront islands are
  `client:visible`** — `app/src/pages/storefront/checkout.astro:53`, `cart.astro:52`, `index.astro:54`,
  `order/[orderNumber]/confirmation.astro:54` — and a chunk is emitted for each. That half is
  derivable from source and re-verified in `edb07db`; it is the part of the claim worth keeping.
- **Class** UNVERIFIED · **Severity** P3 · **Action** VERIFY-RUNTIME
- **Severity** P3 · **Action** VERIFY-RUNTIME

> ### Status — `OPEN`, 2026-10-06. The byte figures are gone; the question is not answered.
>
> **`edb07db` removed the four figures** (`StorefrontCheckout`, `ShopCatalog`, `StorefrontCart`,
> `StorefrontConfirmation`) from `PERF_BASELINE.md` rather than restating or defending them, and
> added the reason to the file: **byte figures unverifiable against unpinned `dist/`**. `app/dist` is
> gitignored (`.gitignore:2`) and its build provenance is not recorded, so any measurement taken from
> it describes exactly one unreproducible build.
>
> **Why that is the honest outcome and not a dodge.** Measured for the record against the only tree
> artefact (113 chunks, `stat -c%s`): raw **6.00 / 3.94 / 3.63 / 6.17 KiB** for Checkout / ShopCatalog
> / Cart / Confirmation. **Three of the four land within ~0.3 KiB of the removed figures and one is
> off by 2.3×.** That pattern is the argument for removal rather than for picking a winner: the three
> close values establish that **the build has drifted**, which makes the outlier as likely to be a
> real regression as a different build. With no recorded provenance there is no way to say *which*
> number is wrong, and a doc that picks one is making an unverifiable claim in the act of fixing an
> unverifiable one.
>
> **To close this entry, someone has to make a build reproducible first** — record the commit a
> `dist` was built from, or quote the figures from a CI run that pins both. Until then:
>
> - the four `client:visible` directive sites are **verified** and stay in the doc;
> - the per-island byte sizes are **withdrawn**, and any later reader wanting them must produce them
>   from a pinned build;
> - a tenant or an owner reading `PERF_BASELINE.md` for a size budget today gets the structural claim
>   and an honest "not measured here", which is strictly better than the previous state — a confident
>   number that cannot be reproduced.

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

> **`RESOLVED-DOC` 2026-10-06 (`8b01b00`) — every structural claim verifies exactly; one figure
> was a unit slip.** `SystemHealthPanel.tsx` has the import at `:6` and render sites at precisely
> **`:153`, `:157`, `:165`, `:169`**; a repo-wide search for `LineChart` outside
> `LineChart.tsx`/`RechartsLine.tsx` returns `SystemHealthPanel.tsx` and nothing else; the emitted
> `RechartsLine.CM2YhkQa.js` is 352 520 B = **344.26 KiB** ✓. The prose at `:291` said "100.9 KiB
> gzip" while the doc's own table at `:209` records **100 859 B** = **98.5 KiB** — the prose
> converted bytes as if kilobytes were kibibytes. Still needing the treemap: the per-vendor
> `renderedLength` split, which is **pre-minify** and therefore not comparable to any KiB figure
> in the doc.

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

> **`RESOLVED-DOC` 2026-10-06 (`8b01b00`) — both halves of the "not derivable" premise were
> false.** Lighthouse is a **pinned devDependency**: root `package.json` `"lighthouse":
> "^13.4.1"`, installed `node_modules/lighthouse` = **13.4.1**, and `tests/lighthouse/run.ts:30`
> does `import lighthouse from 'lighthouse'` — it is never shelled out to `npx`, which is where
> the "unpinned" reading came from. Chromium **149** is derivable *and correct*:
> `node_modules/playwright-core/browsers.json` pins chromium revision **1228** for
> `playwright-core` **1.61.1**, and that exact binary
> (`~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome --version`) prints **`Google Chrome
> for Testing 149.0.7827.55`**. Everything else the entry called unverifiable checks out verbatim,
> including `lighthouse-baseline.json`'s `targets` and its `/admin?tenant=marketplace` row
> `55/95/96/82 · cls 0 · lcp 25043 · tbt 115`. **`PERF_BASELINE.md`'s claim is correct; the
> entry's "cannot verify" framing was what needed correcting.** The sibling `200 ms` vs `300 ms`
> contradiction is `P‑1` in [[code-vs-docs]].

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

> **`DEFERRED` 2026-10-06 — counts verified exactly; a manual checklist is not a finding.** `grep
> -cE '^\| 32\.[0-9]' TESTING.md` → **7**, `33.x` → **5**, `34.x` → **4**, and the section header
> at `:80` is verbatim "Cross-cutting concerns (manual steps 32–34)". The steps are consistent
> with the auth model (`app/src/lib/session.ts` localStorage JWT). Manual by construction, and
> `04-testing/README.md` already states the risk correctly — "Not automatable, and skipped
> silently is the same as passed unless you do them" — which is precisely why this is not a
> defect. **Nothing to build.**

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

> ### Status — `RESOLVED-DOC` 2026-10-06 (`e731b11`, `b06990c`)
>
> **Both halves are now settled, and the live half settled *positively*.** Five owner-approved GETs —
> the budget was spent in full, no sixth request, no response bodies, no `deploy.sh`, no D1/KV/R2, no
> non-GET method — returned:
>
> | endpoint (`RUNBOOK.md:129-133`) | documented | actual | verdict |
> |---|---|---|---|
> | `https://sinaicamps.com/` | `200` | **`200`** | **MATCH** |
> | `https://sinaicamps.com/api/me` | `200` / `400`-guard | **`200`** | **MATCH** |
> | `https://acaciacamp.com/` | `200` | **`200`** | **MATCH** |
> | `https://acaciacamp.com/admin` | `200` | **`200`** | **MATCH** |
> | `https://michaelshouse.sinaicamps.com/` | `200` | **`200`** | **MATCH** |
>
> **5 / 5 MATCH, 0 DIFFERS.** No probe produced `000` or `500`, so the §5 contract holds against
> production on every host. Probe record: `.opencode/audits/O7-probe-2026-10-06.md`, commit
> `e731b11`.
>
> **The one imprecision was in the doc's wording, not in the service — this is not a defect.** The
> §5 heading read `expect 200/400-guard`, a *disjunction* that invited a `4xx` on `/api/me`. But
> `GET /api/me` is **public by design**: `backend/src/index.js:616-617` states it in the source —
> *"Mixed visibility: GET is public (R-9 — graceful 200 without tenant context), PUT/PATCH are
> tenant-admin only"* — with `meScope` (`:619-624`) routing `GET` to `resolveScope({ public: true })`
> (`:618`) and every other method to the admin resolver. A `200` there is the designed answer, so
> `b06990c` tightened `RUNBOOK.md` §5 to state the expected code outright (`## 5. Post-deploy Smoke
> (expect 200, never 000/500)`), kept the `000`-vs-`500` distinction it was already making, and
> recorded the probe result. **`05-operations/README.md` carried the same phrase and was tightened
> identically.**
>
> **Two things the runbook now says that a status code alone would not have earned**, both worth
> keeping so a future reader does not re-derive them:
>
> 1. The `200` on `/api/me` did **not** come from a static-asset fallback swallowing an unrouted
>    `/api/*` path. `app/public/_routes.json` explicitly `exclude`s `/api/*` from the `/*` include,
>    so the request reached the SSR function and its backend service binding (`API_BACKEND`,
>    `app/wrangler.toml`). Without this, a `200` on an `/api/*` path would have been an ambiguous
>    row — the classic "did it work or did it fall through?" artifact.
> 2. `acaciacamp.com/admin` answering `200` unauthenticated is consistent with the SPA host serving
>    its shell. The runbook's follow-up instruction — open `/admin` and confirm the Settings panel
>    loads with no chunk `404` — is a **browser** check that **no status code can satisfy**, and it
>    remains unverified. It is *not* closed by this entry, and closing it is the one piece of §5 that
>    still needs a human with a browser.
>
> **Class as it now stands: `MATCHED`.** The audit's `UNVERIFIED (external)` was an artefact of a
> read-only pass, not a property of the claim.

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

> **`DEFERRED` 2026-10-06, with the one residue closed (`b06990c`) — externally confirmed, not
> recalled.** Cloudflare's published Free-plan limits were retrieved: KV "Keys written **1,000 /
> day**" ✓ and "All limits reset daily at **00:00 UTC**" ✓; D1 "Rows read **5 million / day**" ✓,
> enforced since the 2026-09-01 changelog, with error text *"Upgrade to a paid plan or wait for
> tomorrow (midnight UTC) to continue"* — which **is** the runbook's quoted sentence ✓. Code side
> ✓: `rateLimit.js:211`/`:246` return `429 Rate limit check failed`, and `wrangler.toml:56`/`:97`
> keep `RATE_LIMIT_KV_ENABLED = "false"`, so the KV row is unreachable in normal operation. **The
> residue:** the runbook's `[code: 7500]` appears **nowhere** in Cloudflare's published text,
> which quotes a sentence and no numeric code. `b06990c` replaced both cells with the real figures
> and added a callout to match the *sentence* rather than a code no upstream documents.

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

> **`DEFERRED` 2026-10-06 — no edit, and marking it "not implemented" would have been the opposite
> of true.** Process, not code: a human gate no repository can answer. Each of §10's five items
> maps to a failure mode documented elsewhere in the same file (§5 chunk 404s, §9 KV write rate,
> §9 auth), and `05-operations/README.md`'s premise — "a deploy that passes smoke in the first
> five minutes is not a deploy that passed" — is the right framing for an owner-facing runbook.
> **It is implemented, by a person.**

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

> **`RESOLVED-DOC` 2026-10-06 (`ff264db`) — the "byte-identical" property is false for 4 of 46
> lines.** Both SHAs resolve and the test exists (`af1d69b`, `09ff710`), and the "18 `escHtml`
> hits remain" figure is exact. Diffing `af1d69b^` → `af1d69b` across all 12 touched files and
> unwrapping every balanced `escHtml(…)`: **46 lines** lost a wrapper (matching the inventory's
> own wording "46 **lines** (A+B+E)") but they carried **50 call sites**, not 46 — and of those 46
> lines only **42** have their inner expression byte-identical in the child. **4 gained required
> parentheses**: `CampsSection.astro:137` and `TenantLanding.astro:225/227/228`. Semantically
> equivalent, **not** byte-identical. The doc's security claim is unaffected; the sentence that
> asserted an exact property is what was corrected, because "byte-identical" is a claim a reviewer
> will trust rather than check.

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

> **`RESOLVED-DOC` 2026-10-06 (`0f0c09a`) — half real, half invented, and the invented half was
> the load-bearing sentence.** Real: the column exists (`service_definitions.fields_schema JSON
> NOT NULL DEFAULT ('[]')`), is accepted and persisted (`api/services.js:32` zod `fields_schema:
> z.any().optional()`, INSERT at `:101-103`, UPDATE at `:121-122`), is served to the public
> catalog (SELECT `:454`, `JSON.parse` `:482`), and the frontend carries the type
> (`app/src/lib/api.ts:1641 fieldsSchema: unknown`). Invented: **no renderer consumes it** — `grep
> -rn 'fieldsSchema\|fields_schema' app/src/components app/src/pages` → **0 hits**; **no public
> services page has ever existed** (`git log --all --diff-filter=A -- 'app/src/pages/service*'` →
> nothing); and `bookingCreateSchema` (`services.js:50-56`) has no field for custom values, so a
> booking cannot carry them. The only public-portal wrapper, `getPublicServiceCatalog`, was
> **deleted** in `5599675` ("prune dead exports … zero production/test callers") — deliberate. The
> doc now documents the column and route that exist and drops the "drives the dynamic booking
> form" sentence.

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

> **`DEFERRED` 2026-10-06 — verified correct, so there was never anything to fix.** The entry was
> over-cautious and the tree settles it clause by clause. Engine:
> `backend/src/routes/pos/index.js:565-635`, comment `:566` "Best promo per item wins; discounts
> are applied BEFORE tax"; eligibility filter `:579-585` (day_of_week, start/end date,
> `min_purchase`); single-winner selection `:610-616` (`if (discount > 0 && (!best || discount >
> best.discount)) best = {…}`) — exactly one winner per line and one `discountRows` entry per
> line, so **no stacking** ✓. Types `:597-605`: `percentage` = `unitPrice×qty×value/100`, `fixed`
> = `min(value, unitPrice)×qty`, `bogo` = `floor(quantity/2) × unitPrice` — i.e. **every 2nd item
> free, hard-coded 2, not configurable X/Y** ✓. The identical engine is mirrored in the preview
> path (`api/promotions.js:285-315`) and the type enum is `z.enum(['percentage','fixed','bogo'])`
> at `promotions.js:36`. This is the note's cleanest example of why "left unverified rather than
> failed" is the right default: it was right.
