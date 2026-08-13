# Performance Baseline — Bundle Analysis

> **Status**: snapshot of the 2026-08-07 build. Active enforcement now lives in `app/budget.json` + `npm run lighthouse` (T15, 2026-08-13) — the same targets (CLS < 0.1, LCP < 2.5 s, TBT < 200 ms, resource sizes) are enforced there against a live preview URL.

- **Build date:** 2026-08-07
- **App:** `sinaicamps/app` — Astro 5.18.2, Vite 6.4.3, React 19.2.8, output: `server` (Cloudflare Workers adapter)
- **Measured from:** `app/dist/_astro/` (browser-facing client assets)

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
| JS chunks | 54 |
| CSS files | 2 |
| **Total JS** | **501.2 KiB** (uncompressed; ~118 KiB gzip est.) |
| **Total CSS** | **95.0 KiB** (uncompressed) |
| Largest single chunk | 180.4 KiB |

Server-side SSR worker (NOT downloaded by browsers) is emitted separately to
`dist/_worker.js/` (`.mjs` chunks, incl. a ~518 KiB astro-renderers chunk and a
~225 KiB astro/server chunk).

## Largest 15 client chunks

| # | Size (KiB) | Chunk |
| --- | --- | --- |
| 1 | 180.4 | `_astro/client.DqHUFLln.js` |
| 2 | 31.5 | `_astro/index.astro_astro_type_script_index_0_lang.BdGRyCkc.js` |
| 3 | 29.5 | `_astro/LoadingSpinner.CHp5Rir5.js` |
| 4 | 15.0 | `_astro/useQueryHooks.Bv9yTGCg.js` |
| 5 | 12.8 | `_astro/TenantMenu.OeD0MdAO.js` |
| 6 | 12.2 | `_astro/RoomsPanel.BnSxzqyj.js` |
| 7 | 10.6 | `_astro/CampBooking.BhDEpgic.js` |
| 8 | 9.9 | `_astro/BookingCalendar.FI4Vevwq.js` |
| 9 | 9.8 | `_astro/ReservationSummary.C9KSVqz9.js` |
| 10 | 9.3 | `_astro/PlanningPanel.6MJrSbI6.js` |
| 11 | 8.9 | `_astro/MealsPanel.Dju3aG4K.js` |
| 12 | 8.1 | `_astro/MenuPanel.q9ZNxriN.js` |
| 13 | 7.9 | `_astro/DataTable.UDSAww8O.js` |
| 14 | 7.8 | `_astro/index.D-Pb_x6I.js` |
| 15 | 7.7 | `_astro/SuperTenantsPanel.Dxj8zpzV.js` |

## Top-3 suspects

1. **`client.DqHUFLln.js` (180.4 KiB)** — the vendor entry chunk. Bundle report
   confirms it contains `react` (`react.production.js`), `react-dom`
   (`react-dom.production.js` + `react-dom-client.production.js`) and
   `@astrojs/react` client runtime. This single chunk is **~36% of all JS**.
2. **`index.astro_astro_type_script_index_0_lang.BdGRyCkc.js` (31.5 KiB)** — inline page script from the index page (likely a shared data/config script).
3. **`LoadingSpinner.CHp5Rir5.js` (29.5 KiB)** — a UI primitive with an outsized
   footprint; worth checking for accidental heavy imports (icons/etc.) inside a
   shared loading component.

## Notes / next steps

- LoadingSpinner at 29.5 KiB is suspiciously large for a spinner — audit its
  imports (possible transitive vendor code pulled in).
- React/react-dom dominate: consider `react.lazy`/code-splitting for non-POS
  routes or an alternate render strategy if the 180 KiB vendor chunk matters.
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
