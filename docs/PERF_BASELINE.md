# Performance Baseline — Bundle Analysis

> Snapshot 2026-09-22 (current) — re-run with `ANALYZE=1 npm run build` / `npx tsx tests/lighthouse/run.ts` before quoting. TBT threshold is 300ms in harness (`tests/lighthouse/run.ts`), not 200ms. The 2026-08-07 snapshot is retained below as historical reference. **Measure + update this file on every major islands change** (new `client:*` site, new heavy dep, new admin panel) — stale baselines understate the bundle ~4× (F-A20-01).

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

## Notes / next steps

- Recharts + html2canvas (~539 KiB combined) are the largest *eager* payload
  after the react vendor chunk — route-splitting them off the shared bundle is
  the cheapest next win.
- `transformers.web` must stay behind the lazy `import()` in `browser-ai.ts`
  (never top-level) so the ONNX runtime stays out of initial payloads; do NOT
  add KV/cache writes for model downloads (free-plan quota).
- Full interactive treemap is available at `app/dist/bundle-analysis.html` after
  an `ANALYZE=1 npm run build`.

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
