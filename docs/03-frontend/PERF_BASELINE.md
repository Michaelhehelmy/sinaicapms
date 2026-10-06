---
title: "Performance Baseline — Bundle Analysis"
aliases:
  - PERF_BASELINE
  - Performance Baseline
tags:
  - type/baseline
  - audience/developer
  - domain/frontend
  - status/snapshot
created: 2026-10-02
updated: 2026-10-06
relates-to:
  - "[[COMPONENT_CATALOG]]"
  - "[[ARCHITECTURE]]"
  - "[[docs/03-frontend]]"
  - "[[TESTING]]"
  - "[[QUICK_START]]"
code-references:
  - "app/astro.config.mjs:8-26"
  - "app/budget.json:1-14"
  - "app/src/lib/browser-ai.ts:237"
  - "app/src/components/admin/BrowserAIPanel.tsx:18"
  - "app/src/components/admin/SystemHealthPanel.tsx:153-169"
  - "app/src/components/ui/RechartsLine.tsx:19-22"
  - "app/src/components/debug/DebugFeedbackWidget.tsx:111-113"
  - "app/src/components/public/BookPage.astro:45"
  - "app/src/components/public/MenuPage.astro:48"
  - "tests/lighthouse/run.ts:52"
verified: never
---

# Performance Baseline — Bundle Analysis

> Snapshot 2026-09-22 (current; a newer 2026-10-02 bundle measurement is retained below) — re-run with `ANALYZE=1 npm run build` / `npx tsx tests/lighthouse/run.ts` before quoting. TBT threshold is 300ms in harness (`tests/lighthouse/run.ts`), not 200ms. The 2026-08-07 snapshot is retained below as historical reference. **Measure + update this file on every major islands change** (new `client:*` site, new heavy dep, new admin panel) — stale baselines understate the bundle ~4× (F-A20-01).

> **Status**: snapshot of the 2026-09-22 build. Active enforcement now lives in `app/budget.json` + `npm run lighthouse` (T15, 2026-08-13) — the same targets (CLS < 0.1, LCP < 2.5 s, TBT < 200 ms, resource sizes) are enforced there against a live preview URL.

- **Build date:** 2026-09-22
- **App:** `sinaicamps/app` — Astro 7.3.1 (installed), Vite 6.4.3, React 19.2.8, output: `server` (Cloudflare Workers adapter)
- **Measured from:** `app/dist/client/_astro/` (browser-facing client assets; the Cloudflare adapter emits `dist/client/` + `dist/server/`)

## How to reproduce

```bash
cd app
npm run build            # normal build (no analyzer; zero behavior change)
ANALYZE=1 npm run build  # emits dist/bundle-analysis.html report + prints per-chunk sizes to console
```

`ANALYZE=1` is gated in `app/astro.config.mjs`: it conditionally adds
`rollup-plugin-visualizer` (treemap HTML report, gzip+brotli sizes) plus a small
`bundle-size-report` plugin that prints per-chunk sizes to the console. Unset
`ANALYZE` → plugin array is exactly `[tailwindcss()]`, unchanged from before.

> Note: the installed `vite-plugin-bundle-analyzer@0.0.1` turned out to be a
> no-op stub (`console.log('let build together')` — no analysis), so the gate
> uses `rollup-plugin-visualizer@7.0.1` instead.

### Reproducing the eager/lazy classification (2026-10-02)

`rollup-plugin-visualizer`'s `imported` edges conflate static and dynamic imports (1095 of 1096
modules appear "statically reachable"), so the lazy/eager split must be read off the **emitted
chunks**, not the treemap:

```bash
cd app && ANALYZE=1 npm run build
# per chunk, static `from "..."` edges vs dynamic `import("...")` edges,
# then BFS from the three *.astro_astro_type_script* island entries.
```

Result: 5 chunks / 10.6 KiB are statically reachable from the Astro island entries; the other
108 chunks / 2166.8 KiB are dynamic-import-only. `client.*` is initial-load despite having no
static edge (Astro references it by URL from `<astro-island component-url>`).

`docs/PERF_BASELINE.md` is **not** updated by this task — no islands change, no new heavy
dependency, and its 2026-09-22 largest-chunk figure (503.7 KiB, `transformers.web`) is confirmed
still accurate. Total JS moved 2114.3 → 2168.8 KiB since that snapshot (+54.5 KiB, +2.6%), which
is worth recording there on the next islands change rather than silently folding into a
no-op task.

## Totals (client bundle — what browsers download)

| Metric | Value |
| --- | --- |
| JS chunks | 106 |
| CSS files | 2 |
| **Total JS** | **2114.3 KiB** (uncompressed; ~620 KiB gzip) |
| **Total CSS** | **106.4 KiB** (uncompressed) |
| Largest single chunk | 503.7 KiB (`transformers.web` — lazy-loaded, AI panel only; not in the initial payload) |

Server-side SSR (NOT downloaded by browsers) is emitted separately to
`dist/server/` (`.mjs` chunks).

## Largest 15 client chunks

| # | Size (KiB) | Chunk |
| --- | --- | --- |
| 1 | 503.7 | `_astro/transformers.web.CauubI-C.js` |
| 2 | 344.3 | `_astro/RechartsLine.CM2YhkQa.js` |
| 3 | 194.9 | `_astro/html2canvas.BIYKDK-B.js` |
| 4 | 176.4 | `_astro/client.D3SnGAPC.js` |
| 5 | 36.4 | `_astro/BookingCalendar.CL8gs5pr.js` |
| 6 | 34.3 | `_astro/CampsPanel.CQmRn6Ic.js` |
| 7 | 31.5 | `_astro/CRMPanel.Bjhpb3r3.js` |
| 8 | 29.4 | `_astro/api.DOuOnCCm.js` |
| 9 | 28.6 | `_astro/AIPanel.BeRnwrdC.js` |
| 10 | 23.4 | `_astro/useQuery.D4bfLZSU.js` |
| 11 | 22.4 | `_astro/AdminShell.CkmIDdpM.js` |
| 12 | 21.6 | `_astro/SuperTenantsPanel.j6hByht6.js` |
| 13 | 21.3 | `_astro/SupplyPanel.3C2WUWEa.js` |
| 14 | 20.9 | `_astro/useQueryHooks.BPntfxud.js` |
| 15 | 20.7 | `_astro/HRPanel.CQoPLCg4.js` |

Storefront islands stay small (all code-split per route): `StorefrontCheckout`
5.8 KiB, `ShopCatalog` 3.6 KiB, `StorefrontCart` 3.3 KiB,
`StorefrontConfirmation` 2.7 KiB.

## Top-3 suspects

1. **`transformers.web` (503.7 KiB, ~24% of all JS)** — the Transformers.js/ONNX
   runtime for client-side browser AI. It is a separate chunk reached only via
   lazy `import()` in `app/src/lib/browser-ai.ts` (admin AI panel), so it is
   NOT part of any initial page payload — but confirm no initial route imports
   it statically before quoting the total as user-facing.
2. **`RechartsLine` (344.3 KiB)** — charts library pulled into the shared
   bundle; check whether it can be route-split to the analytics surface only.
3. **`html2canvas` (194.9 KiB)** — screenshot/export dependency; same
   route-split question as recharts.

### Investigation — the three questions (2026-10-02, HEAD `921e871`)

**Duplicate React: none.** `react/index.js`, `react-dom/index.js` and `react-dom/client.js` each
appear in exactly one emitted chunk (`react.*` 8.4 KiB, `react-dom.*` 3.5 KiB, and the
`react-dom/client` build bundled inside `client.*`). The 3.5 KiB `react-dom` top-level entry is not
a duplicate of `client.*` — it is a *different entry point*, pulled only by `recharts`' internals
(`flushSync`) and by the `@astrojs/react` renderer; no `app/src` file imports `react-dom`
directly (verified by grep). Nothing to fix.

**Vendor leaking into the admin chunk: none.** `AdminShell.*` is 23.2 KiB minified / 31.7 KiB
rendered and is **100% `src/components`** — no `node_modules` at all except React and
`@tanstack/react-query`. **All 48** admin/super-admin panels are `React.lazy`
(`AdminApp.tsx:60-107`), so each is its own chunk. The T13 migration did its job.

**Non-POS routes pulling React eagerly: yes, but unavoidably.** `client.*` (176.4 KiB / 56.2 KiB
gzip) is Astro's `@astrojs/react` island renderer — it contains `react-dom/client` + `scheduler`
and is loaded by URL from the `<astro-island>` `component-url` attribute, so it is in the initial
payload of every page that has a React island. There is no static-import edge to it, which is why
it looks "unreferenced" in a naive static-graph scan; it is genuinely initial-load. This is the
floor for an islands architecture, not a defect.

The public islands are already `client:visible` (`CampBooking`, `MarketplaceDirectory`,
`TenantLanding`, all 4 storefront views). The **only two remaining eager public islands** are
`ReservationSummary` (`BookPage.astro:45`) and `TenantMenu` (`MenuPage.astro:48`), both
`client:load`.

**All heavy vendors are already behind a dynamic import.** Verified in the emitted output, not
just the source — each big chunk is referenced by exactly one `import()` site:

```
transformers.web  ← await import(`./transformers.web.*.js`)  in AIPanel.*        (AIPanel is React.lazy from AdminApp ⇒ 2 hops)
RechartsLine      ← import("./RechartsLine.*.js")           in LineChart → SystemHealthPanel
html2canvas       ← await import("html2canvas")             in DebugFeedbackWidget (only when a screenshot is taken)
```

The T13/T15 work already did the code-splitting this task was chartered to look for. There is
nothing left to move.

---

## Historical snapshot 2026-08-07 (retained — predates storefront islands + admin panels)

| Metric | 2026-08-07 | 2026-09-22 | Δ |
| --- | --- | --- | --- |
| JS chunks | 54 | 106 | +52 |
| Total JS | 501.2 KiB (~118 KiB gzip est.) | 2114.3 KiB (~620 KiB gzip) | ~4.2× |
| Total CSS | 95.0 KiB | 106.4 KiB | +11.4 KiB |
| Largest single chunk | 180.4 KiB (`client.*`, react vendor) | 503.7 KiB (`transformers.web`, lazy) | — |

2026-08-07 top-3 were `client.*` vendor (180.4 KiB, react/react-dom +
`@astrojs/react` runtime, ~36% of JS then), an inline index page script
(31.5 KiB), and `LoadingSpinner` (29.5 KiB — suspiciously large for a spinner;
its imports were never audited). The growth to 2114 KiB comes from the admin
panels, recharts/html2canvas, and the lazy browser-AI runtime — not from the
storefront islands (all < 6 KiB each).

## Historical snapshot 2026-10-02 (HEAD `921e871`, `ANALYZE=1`)

| Metric | Value |
| --- | --- |
| JS chunks | 113 |
| Total JS (minified) | **2168.8 KiB** (2,229,607 B raw / **582,829 B gzip**) |
| CSS | 2 files, 106.8 KiB |
| Largest chunk | **503.7 KiB** — `_astro/transformers.web.*.js` |
| Largest chunk, gzip | 146,499 B |

Build env notes: `output: 'server'` with the Cloudflare adapter, so `ANALYZE` reports **client**
chunks from `dist/client/_astro/` (SSR chunks live in `dist/server/` and are never downloaded).
The `bundle-size-report` plugin prints `chunk.code.length` (post-minify); the visualizer's
`renderedLength` (pre-minify) is ~1.77× larger and is what the treemap shows. Both are quoted
below where relevant. Console output prints the chunk list three times — Astro builds the client
graph, the SSR graph and the worker graph; only the third block is the client bundle.

### Top 10 client chunks

| # | KiB | gzip B | Chunk | Reached via |
| --- | --- | --- | --- | --- |
| 1 | 503.7 | 146,499 | `transformers.web.*` | dynamic `import()` in `AIPanel` (2 hops lazy) |
| 2 | 344.3 | 100,859 | `RechartsLine.*` | dynamic `import()` in `LineChart.tsx` ← `SystemHealthPanel` |
| 3 | 194.9 | 45,474 | `html2canvas.*` | dynamic `import()` in `DebugFeedbackWidget` (screenshot only) |
| 4 | 176.4 | 56,231 | `client.*` | Astro island renderer (`react-dom/client` + scheduler) |
| 5 | 37.2 | — | `BookingCalendar.*` | `React.lazy` in `AdminApp` |
| 6 | 34.3 | — | `CampsPanel.*` | `React.lazy` in `AdminApp` |
| 7 | 31.5 | — | `CRMPanel.*` | `React.lazy` in `AdminApp` |
| 8 | 31.3 | — | `api.*` | shared client (`lib/api.ts`) |
| 9 | 28.6 | — | `AIPanel.*` | `React.lazy` in `AdminApp` |
| 10 | 23.7 | — | `useQueryHooks.*` | shared hooks |

Composition of the top 4 (visualizer `renderedLength`, pre-minify):

| Chunk | Breakdown (rendered) |
| --- | --- |
| `transformers.web` 891.1 | `@huggingface/transformers` 720.1 · `onnxruntime-web` 146.3 · `onnxruntime-common` 24.7 · **app code 0.0** |
| `RechartsLine` 752.9 | `recharts` 502.5 · `es-toolkit` 33.4 · `d3-scale` 27.0 · `@reduxjs` 26.0 · `decimal.js-light` 24.8 · `immer` 19.9 · `d3-shape` 19.8 · `d3-time-format` 17.3 · `d3-time` 11.0 · `d3-format` 10.2 |
| `client.*` 457.4 | `react-dom` 444.7 · `scheduler` 9.0 · `@astrojs` 3.7 |
| `html2canvas` 319.9 | `html2canvas` 319.9 |

---

## Notes / next steps

- Recharts + html2canvas (~539 KiB combined) are the largest *eager* payload
  after the react vendor chunk — route-splitting them off the shared bundle is
  the cheapest next win.
- `transformers.web` must stay behind the lazy `import()` in `browser-ai.ts`
  (never top-level) so the ONNX runtime stays out of initial payloads; do NOT
  add KV/cache writes for model downloads (free-plan quota).
- Full interactive treemap is available at `app/dist/bundle-analysis.html` after
  an `ANALYZE=1 npm run build`.

### The `client:visible` candidate that was applied and reverted (2026-10-02)

The highest-leverage remaining local lever named by the spec is a **`client:visible` move**, and
the only two targets left are the two eager public islands above. Applied:

- `app/src/components/public/BookPage.astro:45` — `ReservationSummary`: `client:load` → `client:visible`
- `app/src/components/public/MenuPage.astro:48` — `TenantMenu`: `client:load` → `client:visible`

Re-measured with `ANALYZE=1 npm run build`:

| | Baseline | Candidate | Δ |
| --- | --- | --- | --- |
| JS chunks | 113 | 113 | 0 |
| Total JS (min) | 2168.8 KiB | 2168.8 KiB | 0 |
| **Largest chunk** | **503.7 KiB** | **503.7 KiB** | **0.00%** (gate: ≥5%) |

**Byte-identical.** This is expected and is the finding worth recording: `client:load` and
`client:visible` change *hydration timing*, not chunk emission. Astro emits the component chunk
identically either way; the directive only decides when the island hydrates. Any change of this
class is structurally incapable of moving a chunk-size metric, so it cannot be used to claim a
bundle win.

Reverted (`git checkout --` both files, working tree clean). Frontend suite on the reverted tree:
**154 files / 3611 tests PASS, 0 failed.**

---

### Why a ≥5% largest-chunk win needs a bigger refactor

The gate cannot be met by any *local* change, because **the largest chunk contains no
application code at all**. `transformers.web` is 891.1 KiB rendered of pure
`@huggingface/transformers` + `onnxruntime-web` + `onnxruntime-common`, emitted from exactly one
line — `app/src/lib/browser-ai.ts:237`, `await import('@huggingface/transformers')`. There is no
util to split, no modal to lazy-load, and no island to re-directive. −5% of 503.7 KiB is ≈25 KiB
of a pinned third-party library.

The routes to a real reduction, with honest costs:

1. **Move Browser AI inference off the client** (drop the Browser AI tab; or proxy it to a real
   backend endpoint). Removes 503.7 KiB / 146.5 KiB gzip outright. This is a product decision,
   not an optimization — AGENTS.md also forbids reintroducing a stub `AI` binding, so there is no
   honest "just use Workers AI" shortcut today.
2. **Alias `onnxruntime-web/webgpu` → `onnxruntime-web/wasm`** in Vite. Saves ≈40 KiB rendered
   (≈8 KiB minified, **≈1.6%** of the chunk) and **removes WebGPU acceleration** — a feature
   regression for ~1/3 of the gate. Rejected.
3. **`manualChunks` to split the transformers vendor graph in two.** This relabels the largest
   chunk as `RechartsLine` (344.3 KiB) and would *read* as a 31% "win" while removing **zero
   bytes** and adding a request. That is metric gaming, not optimization, and it is not what
   this task should ship. Explicitly rejected.
4. **Replace `recharts` for the one chart that uses it.** This is the real target, and it is much
   bigger than #1. `RechartsLine` (344.3 KiB / 100.9 KiB gzip) exists to serve **four
   `<LineChart>` sparklines in one panel** — `SystemHealthPanel.tsx:153,157,165,169`, and
   `SystemHealthPanel` is the *only* consumer of `LineChart` in the codebase. For that it drags in
   `@reduxjs/toolkit` (26.0), `immer` (19.9), `decimal.js-light` (24.8), `es-toolkit` (33.4) and
   the whole `d3` scale/shape/time/format stack (~85). A hand-rolled SVG polyline is ~3 KiB —
   a **≈99% cut of that chunk** and it drops the largest chunk from 503.7 → 344.3 KiB in one
   move. The cost is a cross-cutting visual change to the System Health panel plus visual
   regression coverage, and it must be judged on whether a sparkline is worth a charting
   dependency at all. It deserves its own scoped workstream, not a drive-by inside a
   bundle-size task.

**Recommendation:** take #4 as the next bundle workstream (largest real byte win, no product
change), and treat #1 as a separate product decision. Do not spend further effort on
`client:*` directive moves or util splits — §3 measured them at exactly 0.

---

# Performance Baseline — Lighthouse

- **Run date:** 2026-08-07
- **App:** `sinaicamps` unified frontend — Astro dev server on `:4320` + backend
  `wrangler dev --local` on `:8787` (same webServers as `playwright.config.ts`)
- **Measured from:** Lighthouse 13.4.1 mobile preset, default simulated throttling
  (Slow 4G + 4x CPU), driven by `tests/lighthouse/run.ts` (`npx tsx`) with
  Chromium 149 (Playwright 1.61.1)
- **Targets:** flags only, **NOT enforced** this pass: CLS < 0.1, LCP < 2.5 s, TBT < 300 ms

## How to reproduce

```bash
# 1. Boot the stack (same commands Playwright's webServer uses):
cd backend && npx wrangler dev --port 8787 --local
cd app && npx astro dev --port 4320 --host

# 2. Run the harness (logs into admin as seed super-admin, seeds tenant if missing):
npx tsx tests/lighthouse/run.ts
```

Writes `tests/lighthouse/lighthouse-baseline.json` (scores + CLS/LCP/TBT per URL)
and prints a summary table. Env overrides: `LIGHTHOUSE_BASE_URL` (default
`http://localhost:4320`), `LIGHTHOUSE_CHROME_PORT` (default `9222`),
`CHROME_PATH` (default Playwright Chromium).

## Results

| URL | Performance | Accessibility | Best Practices | SEO | CLS | LCP (s) | TBT (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin?tenant=marketplace` (authed) | 55 | 95 | 96 | 82 | 0.000 | 25.04 | 115 |
| `/camp/acaciacamp` | 56 | 98 | 100 | 92 | 0.000 | 22.72 | 102 |
| `/` (marketplace home) | 64 | 100 | 100 | 91 | 0.000 | 5.65 | 152 |

## Reading the numbers

- This is a **dev-server baseline** (Astro dev + workerd local): LCP is inflated
  by dev-mode compilation/hydration bundles, not representative of the deployed
  production build. Re-run against a production preview for real-world LCP.
- CLS is 0.000 on every URL; TBT stays under the 300 ms flag everywhere.
- Scores are below the 0.9 bar mainly on Performance (large vendor JS, see bundle
  section above); Accessibility / Best Practices are strong except the authed
  admin SEO 82.
- Targets (CLS < 0.1, LCP < 2.5 s, TBT < 300 ms) are recorded as flags only —
  the LCP flag is NOT met on the dev baseline and is expected to improve on a
  production build. Not enforced this pass.
