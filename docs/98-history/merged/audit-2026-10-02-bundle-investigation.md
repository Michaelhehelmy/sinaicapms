---
title: "Frontend Bundle Investigation — 2026-10-02"
aliases:
tags:
  - type/audit
  - audience/developer
  - audience/historian
  - domain/performance
  - domain/audit
  - status/merged
created: 2026-10-02
updated: 2026-10-06
superseded-by: "[[03-frontend/PERF_BASELINE]]"
relates-to:
  - "[[98-history/merged/README]]"
  - "[[03-frontend/PERF_BASELINE]]"
  - "[[AUDIT_PERFORMANCE_FINDINGS]]"
code-references:
  - "app/src/components/ui/LineChart.tsx"
  - "app/src/components/admin/AdminApp.tsx:60-107"
  - "app/src/components/public/BookPage.astro:45"
  - "app/src/components/public/MenuPage.astro:48"
  - "app/src/lib/browser-ai.ts:237"
  - "deploy.sh"
  - "package.json"
  - "package-lock.json"
verified: never
---
# Frontend Bundle Investigation — 2026-10-02

Task: `.opencode/agents/tmp/2026-10-02-a6.md` (`ws-a6-bundle`). Method: measured baseline →
investigation → **one** candidate → re-measure → commit the change only if the largest chunk
shrank ≥5%, otherwise revert and commit this report.

**Outcome: report.** The candidate was applied, measured at **0.00%** largest-chunk change, and
reverted. No application code is changed by this task.

Reproduce with `cd app && ANALYZE=1 npm run build`. Numbers below are from HEAD `921e871`.

---

## 1. Baseline (HEAD `921e871`, `ANALYZE=1`)

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

## 2. Investigation — the three questions the spec asked

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

## 3. The candidate that was applied and reverted

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

## 4. Why ≥5% needs a bigger refactor

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

## 5. Reproducing the eager/lazy classification

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

## 6. Constraints honoured

`ANALYZE=1 npm run build` + `npx vitest run` only. No `wrangler` invocation of any kind (no
`wrangler d1 *`), no `deploy.sh`, no `curl`, no D1/KV/R2 writes, no remote writes other than the
final push. No pre-existing dirty file (`app|backend|monitor` `package.json`/`package-lock.json`,
untracked tmp specs/audits/`scripts-recon.js`) was staged or modified.