---
title: "Gaps triage B+C — unimplemented.md + unverified.md"
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-06
source-spec: ".opencode/agents/tmp/2026-10-06-trBC.md"
source-notes:
  - "docs/99-gaps/unimplemented.md"
  - "docs/99-gaps/unverified.md"
baseline: "9131635"
relates-to:
  - "[[99-gaps/README]]"
  - "[[99-gaps/unimplemented]]"
  - "[[99-gaps/unverified]]"
  - "[[99-gaps/code-vs-docs]]"
---

# Gaps triage B+C — `unimplemented.md` (10) + `unverified.md` (15)

Mission: one triage row per entry of both notes — **25 rows**. Read-only pass: no file under `docs/`,
no source file, and no `docs/99-gaps/*` note was edited. The only file this task creates is this one.

## Census — found vs triaged

| Bucket | Count | How |
|---|---|---|
| `###` headings, `unimplemented.md` | **10** | structural scan; `A‑11 A‑18 C‑9 C‑11 S‑10 S‑11 D‑13 G‑24 R‑17 N‑14` |
| `###` headings, `unverified.md` | **15** | structural scan; `Q‑5 Q‑6 P‑2 P‑3 P‑5 P‑6 P‑8 P‑13 T‑13 O‑7 O‑12 O‑13 S‑18 G‑18 G‑20` |
| **Rows in this audit** | **25** | matches the mission's expected 25 |

`F‑4`, which `unimplemented.md` mentions in prose, is **not** one of its 10 — it is filed in
`code-vs-docs.md` and was already triaged as `FIX-DOC` in
[`.opencode/audits/gaps-triage-A-2026-10-06.md`](gaps-triage-A-2026-10-06.md) (POS views 8 → **11**).
It is deliberately **not** given a second row here.

## Classification rules applied (same five as triage A)

- **FIX-DOC** — the code is correct, the doc is wrong. This is where an `unimplemented.md`
  (`UNDOCUMENTED`) entry lands whenever the code half is real: the thing exists, nobody documents it.
  It is also where an `unverified.md` claim lands when reading the tree *disproves* it.
- **IMPLEMENT** — genuinely absent **and** users need it; requires a prior `git log -S` check.
- **DEFER** — nothing to build: a correctly-labelled snapshot, a manual checklist, a process gate,
  or a claim that turned out to be **true** (nothing to fix).
- **REJECT** — the alleged thing does not exist as alleged.
- **UNKNOWN** — cannot be decided from the tree. *"Cannot verify locally" is UNKNOWN, never IMPLEMENT.*

Severity is assigned to `IMPLEMENT` only. **No row is `IMPLEMENT`, so no severity appears anywhere in
the table below** — the `severity` column is uniformly `—`.

## Method notes that changed a classification

| Technique | What it decided |
|---|---|
| Parse `openapi.json` **and** the `createRoute` calls in `backend/src/routes/registry.js` and set-compare | `openapi.json` is **not** stale — it is a faithful 1:1 render of a deliberately partial registry (**0 drift in both directions**, 128 pairs each). So **C‑9** is a doc-truth defect, not a missing build. |
| Resolve every `` `Endpoint` `` row of `API_SURFACE_MAP.md` against `openapi.json` (`:id` → `{id}`) | real coverage is **95 / 310** method-pairs and **64 / 214** paths — *not* the note's "199 of 268" |
| `git show af1d69b^:<file>` vs `af1d69b:<file>` + a balanced-paren `escHtml(…)` unwrapper + whitespace-normalised set membership over all 12 touched files | the **S‑18** "byte-identical" property is **false for 4 of 46 lines** |
| Run the Playwright-pinned Chromium binary (`chromium-1228/… --version`) instead of reasoning about it | **P‑13**'s "Chromium 149 is not derivable" is false — it prints `149.0.7827.55` |
| Read dependency `engines` (`astro` 7.3.1 → `>=22.12.0`) | **Q‑6**'s "Node.js 20+" is not merely unenforced, it is **wrong** |
| Cloudflare developer docs (retrieval, not recall) for the plan ceilings | **O‑12**'s two limits + the midnight-UTC reset are **confirmed**; only the `[code: 7500]` token is unsourced |

`rg` is not on PATH; every search above used `grep`/`git grep`/`git log -S`.

## Class totals

| Class | unimplemented.md | unverified.md | Total |
|---|---|---|---|
| FIX-DOC | 9 | 6 | **15** |
| DEFER | 0 | 6 | **6** |
| REJECT | 1 | 0 | **1** |
| UNKNOWN | 0 | 3 | **3** |
| IMPLEMENT | **0** | **0** | **0** |
| **Rows** | **10** | **15** | **25** |

---

# Part B — `docs/99-gaps/unimplemented.md` (10)

These are `UNDOCUMENTED` entries: the file's own premise is "real code that **no doc in scope
claims**". The mission's instruction is therefore inverted relative to triage A — **check whether
the code half is real; if it is, the class is `FIX-DOC` (write the doc), and `git log -S` is only
reached when the code half turns out to be absent.**

| id | source file | claim | code evidence | class | severity |
|---|---|---|---|---|---|
| `A‑11` | `unimplemented.md` · [[ARCHITECTURE]] §3 — a **fourth** `window.__API_BASE` site | `app/src/middleware/securityHeaders.ts` is a fourth cross-file data global alongside `CampsSection.astro` / `MarketplaceHome.astro` | **the only occurrence is prose.** `securityHeaders.ts:16` sits inside the module's opening JSDoc block (`/**` at `:4` → `*/` at `:40`) — the CSP-rationale sentence "`script-src 'self' 'unsafe-inline'` … Fast Refresh preamble, `window.__API_BASE` bootstrap". No read and no write of the global exists anywhere in the file. `git log -S 'window.__API_BASE' -- app/src/middleware/securityHeaders.ts` → single commit `b164048`, and its diff adds the line as `+ *` (comment) from the start. The three public globals §3 names are exactly right: set at `CampsSection.astro:186` (`__API_BASE`), read at `CampsSection.astro:251` + `MarketplaceHome.astro:247`, `__SSR_RENDERED` at `CampsSection.astro:190`, `__galleryImages` at `gallery.astro:141` | REJECT | — |
| `A‑18` | `unimplemented.md` · [[ARCHITECTURE]] §4 — two unnamed response helpers | `ok(data, status)` and `created(id, status)` exist in `backend/src/utils/response.js` and no doc names them | `response.js:96` `export function ok(data, status = 200)` → thin wrapper over `jsonResponse`; `:104` `export function created(id, status = 201)` → `{ success: true, id }` (the note's line number `:103` is off by one). Live surface is thin and asymmetric: `created()` has exactly **one** production caller (`api/pos-tables.js:160`); `ok()` has **zero** production callers repo-wide and is exercised only by `backend/tests/response.test.js:128‑140`. §4's list of three helpers is incomplete | FIX-DOC | — |
| `C‑9` | `unimplemented.md` · [[API_CONTRACT]] §1/§5 — "the backend mirrors it" + "openapi.json (source of truth)" | "~199 of the 268 documented endpoints have no OpenAPI registration at all", incl. no `/api/projects` path | **qualitatively true, quantitatively wrong, and the wrong half to fix.** Resolving every backticked row of `API_SURFACE_MAP.md` (`:id`→`{id}`) against `openapi.json`: **95 of 310** method-pairs and **64 of 214** distinct paths resolve — the map has **310** endpoint rows / **214** paths, not 268. `openapi.json` holds **88 paths / 128 methods** and contains **no** `/api/projects*` path (only `/api/camps`, `/api/camps/{id}`). Crucially the artefact is **not stale**: parsing all `createRoute` calls in `routes/registry.js` (`:1‑8` self-describes as "the single source of truth") yields **exactly 128** method-pairs and set-differencing against `openapi.json` gives **0 missing / 0 extra in both directions**. So `openapi.json` faithfully renders a deliberately partial definition layer; the wrongness is §1's "the backend mirrors it" + §5's "source of truth". Fix the two sentences (and the counts), not the registry | FIX-DOC | — |
| `C‑11` | `unimplemented.md` · [[API_SURFACE_MAP]] §5 cross-note — raw `fetch` framing | three raw `fetch` calls in `app/src/lib/api.ts` outside `apiFetch`, against the map's blanket framing | **exact, and three.** `api.ts:1273` `fetch(\`${API_BASE}/upload\`, {method:'POST', body: FormData…})` (rationale in the JSDoc `:1257‑1262`: apiFetch forces `Content-Type: application/json`, which breaks the multipart boundary), `:1558` `fetch(\`${API_BASE}/admin/audit/export…\`)` (`:1546` "Mirrors upload()'s raw-fetch pattern"), `:2688` `fetch(\`${API_BASE}/admin/performance/export?format=…\`)`. The `:150`/`:207`/`:230` fetches are *inside* `apiFetch` (the documented refresh path) and are correctly not counted | FIX-DOC | — |
| `S‑10` | `unimplemented.md` · [[API_SURFACE_MAP]] §Upload & Media | `DELETE /api/media/*` appears in no row of the surface map | `api/upload.js:191` `mediaRoutes.delete('*', async (c) => {…})`, introduced by `845a39d` *"fix(media): purge R2 object on media DELETE — Wave 3.6a (F‑A17‑01)"*; the map's Upload & Media section (`:510‑513`) carries only `POST /upload` and `GET /media/*`, and even the file header's `code-reference` (`:30`) names only `GET /api/media/*` | FIX-DOC | — |
| `S‑11` | `unimplemented.md` · [[security-guide]] §Authentication — a **second** POS login entry | `POST /api/auth/pos-login` is a POS credential path the guide never mentions | `backend/src/index.js:211` `app.post('/api/auth/pos-login', (c) => handlePosLoginRequest(c.req.raw, c.env))`, handler imported at `:60` from `routes/pos/index.js` (the same handler behind `pos.post('/auth/login', …)` at `:278`). **Narrower than filed: one carrier already exists** — `API_SURFACE_MAP.md:442` documents `` `/auth/pos-login` `` as "POS cashier login via admin host (no hook found)". `grep -n 'pos-login' docs/06-security/security-guide.md` → **0 hits**, which is the real gap | FIX-DOC | — |
| `D‑13` | `unimplemented.md` · [[migrations]] §1 — the pending-apply caveat | no doc in `docs/07-data` states that `0127` is committed but **not applied**, nor that `0124`/`0126`/`0127` post-date the guide | `0127_meals_tenant_composite_pk.sql:4‑6` "⚠️ PENDING-APPLY. This file is committed but NOT applied to any database." + the owner-only apply command. `grep -rn 'PENDING-APPLY\|not applied' docs/07-data/*.md` → **0 hits**; `migrations.md:29` still reads "Current head: `0123_…` (37 files total)" (already filed as `D‑1`/`D‑2` in triage A) and `:37` still tells the reader to author `0124_<slug>.sql`. `07-data/README.md:64‑68` carries the head-drift warning but **not** the applied-vs-committed distinction, and `tenant-import-schema.md` reasons *about* `0127` as landed ("Reusable across tenants since 0127") | FIX-DOC | — |
| `G‑24` | `unimplemented.md` · `docs/08-guides/README.md` — the honesty-marker convention | the guides' method of declaring absences in-line is not recorded as the folder's standard anywhere | The markers are real and load-bearing: `08-guides/README.md:32‑48` §Concepts has **7** bullets and **none** names the convention — `:39` is "Status lifecycles are the load-bearing concept", a different idea. Marker census across the five guides: `camp-guide.md` 3, `service-guide.md` 3, `supermarket-guide.md` 2, `restaurant-guide.md` 1, `analytics-guide.md` 1 (`:69` "live values: cash\|card\|split"). The convention is the folder's real asset and is undocumented, so a future guide author writing confidently-by-default would break a standard nothing records | FIX-DOC | — |
| `R‑17` | `unimplemented.md` · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §1 vs [[FINAL_IMPLEMENTATION_PLAN_v3_waves]] — the G-numbering collision | `G1`–`G4` mean governance incidents in the appendices and deploy gates in the waves plan | Both live and real: appendices `:40` `### G1 — A1 created migrations 0100 and 0101 during the audit`, `:103` `### G2 — A22 applied a production code fix into the tree`, `:130` `### G3 — M1 was committed without a definition`, `:175` `### G4 — A17 probed the live R2 bucket`; waves `:43‑45` "Wave 1 … ← deploy gate G1", "Wave 2 … ← deploy gate G2", "Wave 3 … ← deploy gate G3" and `:49` "Wave 6.5 staging validation ← deploy gate G6.5". `docs/09-plans/README.md:40,:42` already disambiguates correctly ("**Deploy gates G1–G6.5**" vs "**Governance incidents G1–G4** are closure records"), so only the two files collide | FIX-DOC | — |
| `N‑14` | `unimplemented.md` · [[tenant-import-appendix]] — duplicated §6 | `## 6. Export CLI` appears twice with a duplicated body | `tenant-import-appendix.md:174` `## 6. Export CLI + round-trip losses` and `:190` `## 6. Export CLI + what round-trips vs what drops`; the three-paragraph intro and the three ```bash lines (`node scripts/export-tenant.mjs acaciacamp --staging …`, `--out /tmp/acacia-local.json`, `--staging --jwt "$TOKEN"`, `npm run validate-manifest …`) are **verbatim identical** between them. The round-trip ledger that follows at `:211` §"The round-trip ledger as of 2026-10-02" appears once, under the second heading | FIX-DOC | — |

---

# Part C — `docs/99-gaps/unverified.md` (15)

Honesty rule applied literally: an entry that **cannot** be settled from the tree is `UNKNOWN`.
Three of the fifteen are exactly that. One (`G‑20`) was left "unverified rather than failed" and
turned out to be **true**, which is `DEFER` (nothing to fix), not `IMPLEMENT`.

| id | source file | claim | code evidence | class | severity |
|---|---|---|---|---|---|
| `Q‑5` | `unverified.md` · [[QUICK_START]] §6 — staging requirement | "Staging requires `staging.sinaicamps.com` → Workers DNS to be created in Cloudflare first (human action)" | the code half holds — `deploy.sh:39‑40` sets `DEPLOY_ENV="staging"` on `--staging` and `backend/wrangler.toml:92` `[env.staging]` exists with its own `d1_databases`/`kv_namespaces`/`r2_buckets`/`durable_objects`/`migrations` blocks (`:124‑149`). Whether the DNS record exists is a Cloudflare-console fact and this pass issued **no** network probes → not decidable here | UNKNOWN | — |
| `Q‑6` | `unverified.md` · [[QUICK_START]] Prerequisites — "Node.js 20+ and npm" | "Node.js 20+" is the documented floor and it is enforced nowhere | **unenforced *and* wrong**, which is stronger than the note's own finding. `engines` is `null` in all three manifests (`package.json`, `app/package.json`, `backend/package.json`). But the dependency tree sets a higher floor than the doc: **`astro` 7.3.1 declares `engines.node ">=22.12.0"`** (`app/node_modules/astro/package.json`) and root `vite` 8.1.5 declares `"^20.19.0 || >=22.12.0"` — a Node 20 machine cannot build this app at all. Local interpreter is `v22.22.3`, and `AGENT_LOGBOOK.md:133` documents a second 22-only path (`node:sqlite` `DatabaseSync` for local migration replay). The suggested fix ("say Node 22+") is directionally right but understates it: the floor is **22.12+** | FIX-DOC | — |
| `P‑2` | `unverified.md` · [[PERF_BASELINE]] §"Reproducing the eager/lazy classification" | 1095/1096 modules, 5 chunks / 10.6 KiB static vs 108 chunks / 2166.8 KiB dynamic | the **totals corroborate exactly** against the on-disk build: `ls app/dist/client/_astro/*.js \| wc -l` → **113** = 5 + 108, and the emitted JS sums to **2177.4 KiB** = 10.6 + 2166.8 to the decimal. The method claim is also corroborated structurally — `app/astro.config.mjs` wires `rollup-plugin-visualizer` (a rollup plugin, static edges only), and `client.D3SnGAPC.js` exists as a real 176.4 KiB emitted file, confirming the "island renderer referenced by URL" reasoning. The **module-level** 1095/1096 split still needs a fresh `ANALYZE=1 npm run build` + graph walk, and `app/dist` is gitignored (`.gitignore:2 dist/`) and currently one `app/src` commit behind (`88f307a`). Also note the doc contradicts itself elsewhere: §Totals says `JS chunks 106 / Total JS 2114.3 KiB` | DEFER | — |
| `P‑3` | `unverified.md` · [[PERF_BASELINE]] "Three questions" §1 — duplicate React | "no `app/src` file imports `react-dom` directly (verified by grep)" | **false.** `app/src/components/ui/Modal.tsx:2` `import { createPortal } from 'react-dom';` — and it did so at the doc's own measurement HEAD: `git show 921e871:app/src/components/ui/Modal.tsx` line 2 is the same import (added `b164048`). The *size* half of the claim is exact: `app/dist/client/_astro/` holds exactly one `react.*` chunk (`react.BupeQ4KJ.js`, 8.4 KiB) and one `react-dom.*` chunk (`react-dom.C-fbJg5y.js`, 3.5 KiB), matching the doc's "8.4 KiB / 3.5 KiB" verbatim; `client.D3SnGAPC.js` (176.4 KiB) carries `react-dom/client`. So the conclusion ("nothing to fix") survives; the supporting evidence does not | FIX-DOC | — |
| `P‑5` | `unverified.md` · [[PERF_BASELINE]] — 2026-08-07 / 2026-09-22 historical tables | chunk/total figures for two past dates | correctly handled as a dated artifact: the 08-07 table is under `## Historical snapshot 2026-08-07 (retained …)` and the doc instructs "re-run with `ANALYZE=1 npm run build` / `npx tsx tests/lighthouse/run.ts` before quoting". No build artefact from either date exists in the tree (`app/dist` is gitignored), so this is unreproducible **by construction** — the correct treatment of a number that should not rot. Nothing to build | DEFER | — |
| `P‑6` | `unverified.md` · [[PERF_BASELINE]] — storefront island sizes | `StorefrontCheckout` 5.8 KiB · `ShopCatalog` 3.6 · `StorefrontCart` 3.3 · `StorefrontConfirmation` 2.7 | the **structural** half verifies: all four directive sites exist and are `client:visible` — `storefront/checkout.astro:53`, `cart.astro:52`, `index.astro:54`, `order/[orderNumber]/confirmation.astro:54` — and all four chunks are emitted. The **KiB figures do not reproduce** against the only build in the tree: raw 6.00 / 3.94 / 3.63 / **6.17** KiB, gzip 2.13 / 1.53 / 1.30 / 2.20 KiB. Three of four are within ~0.3 KiB of the claim (consistent with ordinary build drift on an uncommitted, unpinned artefact), but `StorefrontConfirmation` is **2.7 → 6.17**, a 2.3× gap no drift explains. Because `app/dist` is gitignored and its provenance is not recorded, I cannot say *which* number is wrong → undecidable from the tree | UNKNOWN | — |
| `P‑8` | `unverified.md` · [[PERF_BASELINE]] — `RechartsLine` size, vendor breakdown, four sparklines | `RechartsLine` 344.3 KiB / 100.9 KiB gzip, serving exactly four `<LineChart>` sparklines, sole consumer of `LineChart` | every structural claim verifies **exactly**: `SystemHealthPanel.tsx` has the import at `:6` and render sites at precisely **`:153`, `:157`, `:165`, `:169`**; a repo-wide search for `LineChart` outside `LineChart.tsx`/`RechartsLine.tsx` returns `SystemHealthPanel.tsx` and nothing else; the emitted `RechartsLine.CM2YhkQa.js` is 352 520 B = **344.26 KiB** ✓. **One figure is a unit slip**: the prose at `:291` says "100.9 KiB gzip" but the doc's own table at `:209` records **100,859 B**, which is **98.5 KiB**, and a local `zlib.gzipSync` of the chunk gives 99.10 KiB — so the prose converted bytes as if kilobytes were kibibytes. The per-vendor rendered-length split (`renderedLength`, pre-minify) still needs the treemap | FIX-DOC | — |
| `P‑13` | `unverified.md` · [[PERF_BASELINE]] header — Lighthouse 13.4.1 / Chromium 149 are "not derivable from the tree" | both tool versions unresolvable because Lighthouse is `npx --yes` unpinned and Chromium comes from the Playwright bundle | **both halves of that premise are false.** Lighthouse is a **pinned devDependency**: root `package.json` `"lighthouse": "^13.4.1"`, installed `node_modules/lighthouse` = **13.4.1**, and `tests/lighthouse/run.ts:30` does `import lighthouse from 'lighthouse'` — it is never shelled out to `npx`. Chromium **149** is derivable and *correct*: `node_modules/playwright-core/browsers.json` pins `chromium` revision **1228** for `playwright-core` **1.61.1**, and executing that exact binary (`~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome --version`) prints **`Google Chrome for Testing 149.0.7827.55`**. Everything else the entry called unverifiable checks out verbatim: `lighthouse-baseline.json` targets `{cls:0.1, lcpMs:2500, tbtMs:300, enforced:false}` = `run.ts:54`, and its `/admin?tenant=marketplace` row `55/95/96/82 · cls 0 · lcp 25043 · tbt 115` matches the doc's table exactly. **The `PERF_BASELINE.md` claim is correct; it is this entry's "cannot verify" framing that needs correcting** (and the sibling `200 ms` vs `300 ms` contradiction is already filed as `P‑1` in triage A) | FIX-DOC | — |
| `T‑13` | `unverified.md` · [[TESTING]] §"Cross-cutting concerns (manual steps 32–34)" | 7 + 5 + 4 = 16 manual actions across three procedures | the counts are exact: `grep -cE '^\| 32\.[0-9]' TESTING.md` → **7**, `33.x` → **5**, `34.x` → **4**, and the section header at `:80` is verbatim "Cross-cutting concerns (manual steps 32–34)". Manual by construction, and `04-testing/README.md` states the risk correctly ("Not automatable, and skipped silently is the same as passed unless you do them"). The steps are consistent with the auth model (`app/src/lib/session.ts` localStorage JWT). Nothing to build | DEFER | — |
| `O‑7` | `unverified.md` · [[RUNBOOK]] §5 — post-deploy smoke | five `curl -sS … -w "\nHTTP %{http_code}\n"` probes; "expect 200/400-guard, never 000/500" | the code half verifies: `backend/src/index.js:626` `app.route('/api/me', meRoutes)` behind `meScope` (`:620‑624`) and `app.use('/api/me/*', tenantAwareLimiter())` (`:625`), so `/api/me` is a real mounted family. The five probes are `RUNBOOK.md:129‑133` verbatim. **This pass issued no `curl`** against `sinaicamps.com` / `acaciacamp.com` / `michaelshouse.sinaicamps.com`, so the live status codes — the only part of the claim in question — remain undecided | UNKNOWN | — |
| `O‑12` | `unverified.md` · [[RUNBOOK]] §9a — the two-limit table | KV writes 1,000/day → `429 Rate limit check failed`; D1 rows read → operator-side refusal, remedy "wait for midnight UTC" or upgrade; "The D1 one is an **operator** outage only" | **now externally confirmed** (Cloudflare developer docs, retrieved not recalled). KV: Free plan "Keys written **1,000 / day**" and "All limits reset daily at **00:00 UTC**" ✓. D1: Free plan "Rows read **5 million / day**", enforcement live since the 2026-09-01 changelog, error text *"Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait for tomorrow (midnight UTC) to continue"* — which is the runbook's quoted string ✓. Code side ✓: `rateLimit.js:211`/`:246` return `429 Rate limit check failed`, and `wrangler.toml:56`/`:97` keep `RATE_LIMIT_KV_ENABLED = "false"` so the KV branch is unreachable in normal operation. **One residue:** the runbook's `[code: 7500]` appears nowhere in Cloudflare's published error text (which quotes a message, not a numeric code); it may be a wrangler-CLI-side code, which the tree cannot confirm | DEFER | — |
| `O‑13` | `unverified.md` · [[RUNBOOK]] §10 + §9a — the 24-hour watch window | five things to watch for 24h post-deploy, incl. recording both §4a version ids; "Never debug handler behavior on a stale staging" | process, not code — a human gate that no repository can answer, and `05-operations/README.md`'s premise ("a deploy that passes smoke in the first five minutes is not a deploy that passed") is the right framing. Each item maps to a failure mode documented elsewhere in the same file (§5 chunk 404s, §9 KV write rate, §9 auth). Nothing to build | DEFER | — |
| `S‑18` | `unverified.md` · [[security-guide]] — the pinned fix/regression SHAs | "Fix commit `af1d69b` unwrapped all **46 A/B/E call sites** (inner expressions **byte-identical**)"; regression test `app/tests/unit/tenant-name-escape.test.tsx` (commit `09ff710`) | both SHAs resolve and the test exists (`af1d69b` "fix(app): remove double-escape in Astro/React expressions", 13 files/59+/70‑; `09ff710` "test(app): tenant name renders without double-escape", +96 lines); the "18 `escHtml` hits remain" figure is exact (`grep -rn escHtml app/src` → 18, concentrated in `CampsSection.astro` 12, `HRPanel.tsx` 4, `MarketplaceHome.astro` 1, `lib/utils.ts` 1). **The "46 call sites / byte-identical" half is wrong on both counts.** Diffing `af1d69b^`→`af1d69b` across all 12 touched files and unwrapping every balanced `escHtml(…)`: **46 lines** lost a wrapper (matching the inventory's own wording "46 **lines** (A+B+E)") but they carried **50 call sites**, not 46. And of those 46 lines only **42** have their inner expression byte-identical in the child — **4 gained required parentheses**: `CampsSection.astro:137` (`t.customDomain ? (t.customDomain as string) : \`${(t.subdomain as string)}…\``) and `TenantLanding.astro:225/227/228` (`"{(r.text as string)}"`, `{(r.author as string)}`, `{(r.date as string)}`). Semantically equivalent, but not byte-identical | FIX-DOC | — |
| `G‑18` | `unverified.md` · [[service-guide]] §Custom Fields (JSON Schema) | services support `fields[]` custom fields via a JSON schema that "drives the dynamic booking form on the public portal" | **half real, half invented — and the invented half is the load-bearing sentence.** Real: the column exists (`0011_services.sql:15` `fields_schema JSON NOT NULL DEFAULT ('[]')`), it is accepted and persisted (`api/services.js:32` `fields_schema: z.any().optional()`, INSERT at `:101‑103`, UPDATE at `:121‑122`), it is served to the public catalog (`services.js:454` SELECT, `:482` JSON.parse), and the frontend carries the type (`app/src/lib/api.ts:1641 fieldsSchema: unknown`). Invented: **no renderer consumes it** — `grep -rn 'fieldsSchema\|fields_schema' app/src/components app/src/pages` → **0 hits** outside that one type declaration; **no public services page has ever existed** (`git log --all --diff-filter=A -- 'app/src/pages/service*'` → nothing); and `bookingCreateSchema` (`services.js:50‑56`) has **no** field for custom values, so a booking cannot carry them. The only public-portal wrapper, `getPublicServiceCatalog`, was **deleted** in `5599675` ("prune dead exports … zero production/test callers") — deliberate. Fix the doc: document the column/route that exist, drop the "drives the dynamic booking form" sentence | FIX-DOC | — |
| `G‑20` | `unverified.md` · [[supermarket-guide]] §Promotions — "only the best eligible promotion applies per line item (no stacking)" | three promo types (BOGO fixed-2 · percentage · fixed) and one-best-per-line, no stacking | **verified correct — the entry was over-cautious, and there is nothing to fix.** The engine is `backend/src/routes/pos/index.js:565‑635`, comment `:566` "Best promo per item wins; discounts are applied BEFORE tax". Eligibility filter `:579‑585` (day_of_week, start/end date, `min_purchase`). Single-winner selection `:610‑616`: `if (discount > 0 && (!best \|\| discount > best.discount)) best = {…}` — exactly one winner per line, and one `discountRows` entry per line, so **no stacking**. Types `:597‑605`: `percentage` = `unitPrice×qty×value/100`, `fixed` = `min(value, unitPrice)×qty`, `bogo` = `floor(quantity/2) × unitPrice` — i.e. **every 2nd item free, hard-coded 2, not configurable X/Y** ✓. The identical engine is mirrored in the preview path (`api/promotions.js:285‑315`) and the type enum is `z.enum(['percentage','fixed','bogo'])` at `promotions.js:36` | DEFER | — |

---

## Result

- **IMPLEMENT: 0.** No severity is assigned anywhere in this audit. Nothing in either note turned
  out to be a missing feature that users hit — every `unimplemented.md` code half is real (so the
  work is documentation), and every `unverified.md` claim that the tree could settle was either
  correct (`DEFER`) or wrong about the code (`FIX-DOC`).
- **The one `REJECT` (`A‑11`) is a comment, not a site.** It is the only entry in either note whose
  alleged artefact is prose: `securityHeaders.ts:16` sits inside the module's opening JSDoc. Had it
  been read as code it would have produced a doc edit describing a global that does not exist.
- **The three `UNKNOWN` are honestly unknown** (`Q‑5` Cloudflare DNS, `O‑7` five live status codes,
  `P‑6` four island sizes against an unpinned gitignored artefact). None was promoted to `IMPLEMENT`
  on the strength of "cannot check it here".
- **Two entries were left unresolved by their own authors and resolved here against the code**:
  `P‑13`'s "not derivable" premise is refuted by a pinned `lighthouse@13.4.1` and a Chromium binary
  that prints its own version, and `G‑20`'s promotion engine — left "unverified rather than failed" —
  matches the guide clause for clause.
- **Counting caveat carried forward from triage A:** entry IDs are unique *within* each note but not
  across notes (`S‑10`/`S‑11`/`D‑13`/`G‑24`/`R‑17`/`N‑14` vs `S‑18`/`G‑18`/`G‑20`), and every ID here is
  prefixed by its source note in the Part B / Part C headings, so no id is reused across this audit.
