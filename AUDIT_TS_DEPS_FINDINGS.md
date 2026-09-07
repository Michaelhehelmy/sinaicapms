# SinaiCamps — TypeScript & Dependency Audit Findings

**Audit type:** READ-ONLY (no source changes made)
**Date:** 2026-09-05
**Scope:** TypeScript compiler health (`app/`), npm dependency security/currency (root, `backend/`, `app/`), type-safety escape hatches (`app/src/`), tsconfig strictness.

---

## (a) `tsc --noEmit` Error Analysis

Command: `cd app && npx tsc --noEmit` (captured to `/tmp/opencode/tsc-output.txt`)

### Total count: **426 TypeScript errors** (665 lines of compiler output)

### Error distribution by directory

| Directory | Errors | Share |
|---|---|---|
| `src/` (app source) | **97** | 22.8% |
| `tests/` (app unit tests, incl. `tests/unit/`) | **329** | 77.2% |
| `stories/` (top-level) | **0** | 0% |

Within `src/` (97): `src/components/` = 86, `src/hooks/` = 5, `src/stories/` = 7. The errors are concentrated almost entirely in test files; only 6 source components contribute real volume.

### Top files by error count (all dirs)

| File | Errors | Notes |
|---|---|---|
| `tests/unit/api-extended.test.ts` | 81 | `opts` possibly undefined (60) |
| `tests/unit/api-bulk.test.ts` | 38 | TS2345/2554 |
| `tests/unit/useQueryHooks-extra.test.tsx` | 25 | `any`/`unknown` in mock results |
| `tests/unit/useQueryHooks-extra2.test.tsx` | 25 | `result.current` unknown (13) |
| `src/components/admin/TenantPerformancePanel.tsx` | 22 | implicit any (17) |
| `tests/unit/DashboardPanel.test.tsx` | 20 | `never`-type subject (18) |
| `src/components/admin/SystemHealthPanel.tsx` | 20 | TS2339 property access (14) |
| `tests/unit/admin/PhotosStep.test.tsx` | 19 | Mock type mismatch (18) |
| `tests/unit/useQueryHooks-cov-push.test.tsx` | 13 | |
| `src/components/admin/SuperReportsPanel.tsx` | 10 | implicit any (6) |

### Top-10 error patterns (grouped by message text after `error TSxxxx:`)

| # | Error code + message pattern | Count | Representative files |
|---|---|---|---|
| 1 | **TS18048** `'opts' is possibly 'undefined'.` | **67** | `tests/unit/api-extended.test.ts` (60), `tests/unit/lib/api-refresh.test.ts` (10) |
| 2 | **TS2345** `Argument of type '(row: Record<string, unknown>, i: number) => React.JSX.Element' is not assignable to type '(value: unknown, index: number, array: unknown[]) => Element'.` | **19** | `tests/unit/DashboardPanel.test.tsx`, `tests/unit/components/admin/system.test.tsx`, `tests/unit/components/admin/supply-storefront.test.tsx` |
| 3 | **TS18046** `'result.current' is of type 'unknown'.` | **21** | `tests/unit/useQueryHooks-extra2.test.tsx` (13), `tests/unit/useQueryHooks-extra.test.tsx` |
| 4 | **TS2322** `Type 'Mock<Procedure \| Constructable>' is not assignable to type '(photos: WizardPhoto[]) => void'.` | **18** | `tests/unit/admin/PhotosStep.test.tsx` |
| 5 | **TS2786** `'BrokenComponent' cannot be used as a JSX component.` | **13** | `tests/unit/ErrorBoundary.test.tsx` (9), `tests/unit/error-boundary.test.tsx` (4) |
| 6 | **TS2571** `Object is of type 'unknown'.` | **13** | `tests/unit/admin/MealsPanel.test.tsx` (6), `tests/unit/components/admin/hr-financial.test.tsx` (5) |
| 7 | **TS2339** `Property 'fn' does not exist on type 'number'.` | **10** | `tests/unit/utils-extended.test.ts` |
| 8 | **TS7006** `Parameter 't' implicitly has an 'any' type.` | **9** (code total 33) | `src/components/admin/SystemHealthPanel.tsx`, `src/components/admin/TenantPerformancePanel.tsx`, `src/components/admin/SuperReportsPanel.tsx` |
| 9 | **TS2322** `Type '{ id: string; name: string; stockQuantity: number; … }' is not assignable to type 'never'.` | **7** (all `'never'`-subject: 48) | `tests/unit/DashboardPanel.test.tsx` (18), `tests/unit/useQueryHooks-extra.test.tsx` |
| 10 | **TS2554** `Expected 1 arguments, but got 0.` | **6** (code total 11) | `tests/unit/api-bulk.test.ts` (7), `tests/unit/endpoints.test.ts` |

> Note on #9: the 48 "not assignable to type 'never'" errors all stem from the SAME root cause — the test-framework `map()`/DataTable row-mapping subjects are being inferred as `never` (empty-array `.map()` on a tighter type), so any data shape is rejected. This is a *test typing artifact*, not an app defect.

### Error totals by TS code (for context)

TS2322=85, TS18048=70, TS2345=62, TS2339=44, TS7006=33, TS2352=30, TS18046=25, TS2786=13, TS2571=13, TS2353=12, TS2554=11, TS2790=5, TS2739=5, TS2561=4, TS2532=4, TS2783 / TS2741 / TS2740 / TS2367=2 each, TS2551 / TS2304=1 each.

### `src/lib/api-types.ts` verdict: **CLEAN** ✅

Zero errors appear for `app/src/lib/api-types.ts` in the tsc output. The generated OpenAPI types (from `backend/openapi.json` via `openapi-typescript`) typecheck cleanly. (The 3 `any` matches counted in §Type-safety below are the word "any" inside `/** @description */` JSDoc prose, not code.)

### Notable observations

- The compiler run emits **only the 426 errors — zero warnings** (e.g. no missing-`skipLibCheck` noise).
- The errors are heavily skewed to tests (77%). The likely root causes: `apiRequest`/`apiFetch` overloads returning `unknown`, untyped `opts` parameters in helper utilities, and DataTable row callbacks typed as `Record<string, unknown>[]` conflicting with tighter test fixtures.
- Only 5 app source files with >9 errors: `TenantPerformancePanel.tsx` (22), `SystemHealthPanel.tsx` (20), `SuperReportsPanel.tsx` (10), `SubscriptionsPanel.tsx` (9), `AuditLogPanel.tsx` (7) — all in `src/components/admin/`, all TS7006/TS2339 (implicit any / property access) issues.

---

## (b) npm audit Summary (per manifest)

### Root (`campmaster-integration-tests`) — `npm audit --json`

**0 critical · 2 high · 3 moderate · 5 total**

| Package | Severity | Direct? | Advisory title |
|---|---|---|---|
| `nanoid` | high | no | custom generators can loop indefinitely when size is zero (GHSA-2v37-7h3g-55p8), `<3.3.18` |
| `undici` | high | no | cross-user info disclosure & parse-time crash; degenerate cache directives (GHSA-4cwx-7wf7-3272), +5 more, `7.0.0–7.28.0` (via `miniflare`) |
| `miniflare` | moderate | no | via `undici` (dev-only) |
| `postcss` | moderate | no | attacker-controlled sourceMappingURL reads arbitrary `.map` files (GHSA-fxqj-rqcc-2cmp) |
| `wrangler` | moderate | **yes** | via `miniflare`; range `4.36.0–4.119.0`+ |

### Backend (`campmaster-backend`) — `npm audit --json`

**0 critical · 2 high · 4 moderate · 6 total**

| Package | Severity | Direct? | Advisory title |
|---|---|---|---|
| `hono` | moderate | **yes (prod!)** | ReDoS in CORS via `Access-Control-Request-Headers` (GHSA-8j4g-w8fx-2239); `memo()` SSR output retained across requests → cross-user data disclosure (GHSA-f23p-vx2j-j53r); Algorithmic DoS in Language middleware (GHSA-54fx-42gc-7vw4) — all fixed in `>=4.12.34` |
| `nanoid` | high | no | same as root |
| `undici` | high | no | same as root (via `miniflare`, dev-only) |
| `miniflare` | moderate | no | via `undici` (dev-only) |
| `postcss` | moderate | no | same as root |
| `wrangler` | moderate | **yes** | via `miniflare` |

### App (`sinaicamps-app`) — `npm audit --json`

**0 critical · 7 high · 7 moderate · 14 total**

| Package | Severity | Direct? | Advisory title |
|---|---|---|---|
| `astro` | high | **yes (prod!)** | 9 advisories incl. Host-header SSRF in prerendered error page (GHSA-2pvr-wf23-7pc7, high); Reflected XSS via unescaped slot name (GHSA-8hv8-536x-4wqp, high); XSS via `define:vars` / spread props / transition directives; fix is a **major bump to 7.3.1** |
| `@astrojs/cloudflare` | moderate | **yes** | SSRF via redirect following through image-binding-transform endpoint (GHSA-88gm-j2wx-58h6); fix is major 14.3.0 |
| `@redocly/openapi-core` | high | no | via `js-yaml` (build tooling) |
| `js-yaml` | high | no | Quadratic CPU in `!!omap` resolution (GHSA-5p4m-2wfm-xmqj), `4.0.0–4.3.0` |
| `brace-expansion` | high | no | DoS via unbounded expansion → OOM (GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895) |
| `undici` | high | no | ~17 advisories incl. WebSocket decompression DoS, request smuggling, cache-disclosure (via `miniflare`) |
| `nanoid` | high | no | same as root |
| `ws` | high | no | uninitialized memory disclosure + memory-exhaustion DoS (via `miniflare`) |
| `miniflare` / `postcss` / `wrangler` / `uuid` / `@storybook/addon-actions` / `@storybook/addon-essentials` | moderate | essence only | dev/build tooling |

 **Key takeaways (same for all three manifests):** zero CRITICAL findings. Nearly all transitive high-severity findings route through **`miniflare` → `undici`/`ws`** (dev tooling pulled by `wrangler`), the two `nanoid` instances, and CI `postcss`. The only **production** exposures are `hono` (backend, needs `>=4.12.34`, currently `4.12.31`) and `astro` (app, needs major `7.x` — **UPGRADED to `7.3.1` on `feat/astro-7`**, resolving its HIGH advisories). All findings have `fixAvailable: true`. The `astro`/`@astrojs/cloudflare` fixes are semver-major, so remediation is a planned upgrade, not a drop-in patch.

---

## (c) npm outdated — outdated MAJOR versions per manifest

(Minor/patch gaps like `wrangler 4.114→4.129`, `@playwright/test`, `axe-core`, `tsx`, `@testing-library/user-event`, `rollup-plugin-visualizer`, `@typescript-eslint/parser`, `@tanstack/react-query`, `@testing-library/react`, `hono 4.12→4.13`, `@tsndr/cloudflare-worker-jwt` are available but not majors.)

### Root
| Package | Current | Latest | Major bump |
|---|---|---|---|
| `vitest` | 4.1.10 | 5.0.0 | yes |

### Backend
| Package | Current | Latest | Major bump |
|---|---|---|---|
| `@asteasolutions/zod-to-openapi` | 7.1.0 | 9.1.0 | yes |
| `@hono/zod-openapi` | 0.19.0 | 1.6.3 | yes |
| `better-sqlite3` | 12.11.1 | 13.0.3 | yes |
| `vitest` | 4.1.10 | 5.0.0 | yes |
| `zod` | 3.25.76 | **4.5.4** | yes (major) |

### App
| Package | Current | **On `feat/astro-7`** | Major bump |
|---|---|---|---|
| `astro` | 5.18.2 | **7.3.1** ✅ upgraded | yes (also the unfixed-advisory fix) |
| `@astrojs/cloudflare` | 12.6.13 | **14.3.0** ✅ upgraded | yes |
| `@astrojs/react` | 4.4.2 | **6.0.5** ✅ upgraded | yes |
| `vite` | 6.4.3 | 8.2.2 | yes (Astro 7 bundles Vite 8 internally; direct `vite` dep only feeds vitest/storybook tooling) |
| `wrangler` | (app: absent) | **4.129.0** ✅ added | — (required peer of `@astrojs/cloudflare@14`) |
| `@vitejs/plugin-react` | 4.7.0 | 6.1.1 | yes |
| `typescript` | 5.9.3 | **7.0.2** | yes (major) |
| `storybook` + 3 addons | 8.6.18 | 10.6.0 | yes |
| `eslint` | 9.39.5 | 10.10.0 | yes |
| `jsdom` | 25.0.1 | 30.0.1 | yes |
| `vitest` | 4.1.10 | 5.0.0 | yes |
| `@testing-library/jest-dom` | 6.9.1 | 7.0.1 | yes |
| `@types/react` / `@types/react-dom` | 18.3.x | 19.2.x | yes (lingers on React 18 types) |

---

## Manifests review (`app/package.json`, `backend/package.json`, `package.json`)

- **Version ranges:** every dependency across all three manifests uses caret ranges (`^`) — there are zero exact pins. (Notable: `wrangler` is `^4.112.0` in root + backend, `^1.61.1` Playwright etc.) The only non-caret ranges are the three `overrides`.
- **React duplicate check (app):** single copy — runtime `react@19.2.8` + `react-dom@19.2.8`, **no nested/duplicate react** in `node_modules`. ✅
- **React version mismatch (app):** runtime is React **19.2.8** but `@types/react`/`@types/react-dom` are **18.3.31 / 18.3.7**, and `npm outdated` shows the types "stuck" at 18 (latest 19.2.x). React 19 runtime running on React 18 typings — the typing surface is a full major behind the runtime. Flagged.
- **`overrides` section (identical in all 3 manifests):**
  ```json
  "overrides": { "sharp": ">=0.35.0", "esbuild": ">=0.25.0" }
  ```
  Both are floor/minimum ranges (`>=`), not pins and not upper-bounded — they force resolution to ≥ these versions anywhere in the tree (security/known-bug mitigation for Astro/R2-native sharp and vite/esbuild). No other override keys exist.

---

## (d) Type-safety escape hatches (`app/src`, .ts + .tsx)

### Raw `any` occurrences
- **107 matches** for `grep -rn "any"` (substring match; includes words like "many/any" in prose/strings, so true typed `any` is lower).

### 10 worst files by `any` count

| File | `any` count |
|---|---|
| `src/components/admin/HRPanel.tsx` | **36** |
| `src/components/admin/SupplyPanel.tsx` | 10 |
| `src/components/admin/FinancialPanel.tsx` | 10 |
| `src/lib/api.ts` | 9 |
| `src/components/admin/CampsPanel.tsx` | 7 |
| `src/components/admin/DynamicForm.tsx` | 5 |
| `src/components/admin/SuperCRMPanel.tsx` | 4 |
| `src/lib/api-types.ts` | 3 (JSDoc prose only — not code) |
| `src/stories/Modal.stories.tsx` | 2 |
| `src/lib/theme.ts` / `src/lib/routeZones.ts` / `src/lib/navigation.ts` | 2 each |

`HRPanel.tsx` alone accounts for **34%** of all `any` matches — the dominant concentration of loose typing in app source. Next tier (SupplyPanel, FinancialPanel, api.ts) are each ~9%.

### Explicit escape hatches & lint suppressions

| Directive | Count |
|---|---|
| `@ts-ignore` | **0** |
| `@ts-expect-error` | **0** |
| `@ts-nocheck` | **0** |
| `eslint-disable` | **3** |

The 3 `eslint-disable` comments:
- `src/components/admin/CampsPanel.tsx:264` → `react-hooks/exhaustive-deps`
- `src/components/admin/CampsPanel.tsx:352` → `@typescript-eslint/no-explicit-any`
- `src/hooks/useAdminData.ts:192` → `react-hooks/exhaustive-deps`

**Assessment:** zero TS-level escape hatches. The team's rule "data never bypasses `@/lib/api`" type-wise dispatches cleanly — no `ts-ignore` crutches exist. The `any` problem is localized and stylistic (`no-explicit-any` would only flag ~1 file's worth), with HRPanel the outlier.

---

## (e) tsconfig strictness assessment

`app/tsconfig.json` (full contents):
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

- **`strict: true` — CONFIRMED.** It inherits from `astro/tsconfigs/strict` (`node_modules/astro/tsconfigs/strict.json` → `extends: ./base.json`, sets `"strict": true`). That enables `strictNullChecks`, `noImplicitAny`, `strictPropertyInitialization`, `noImplicitThis`, `strictBindCallApply`, `strictFunctionTypes`, `useUnknownInCatchVariables`, `exactOptionalPropertyTypes` (per `strict` in this TS major).
- No `strict` overrides (relaxing or tightening) in the local `compilerOptions`.
- Verified the strict flags are **active, not decorative**: the TS7006 `Parameter implicitly has an 'any' type` errors (33) and TS18048 `'opts' is possibly 'undefined'` (70) prove `noImplicitAny` + `strictNullChecks` are firing in real code.
- `skipLibCheck` is presumably inherited from the Astro base (a common default) — not confirmed in the report chain but consistent with zero `lib`/`.d.ts` noise.
- No `checkJs` (backend is JS, intentionally untested by tsc here); no path mapping issues surfaced.

**Gap:** `src/` is strictly typed, but the 97 errors show strictness *is* biting in 6 admin panel components (implicit any in `.map()` callbacks, missing props). Fixing those would take `src/` to ~zero errors; the remaining 329 are test-suite typing debt.

---

## Summary scorecard

| Area | Verdict |
|---|---|
| `tsc --noEmit` total | 426 errors (97 src / 329 tests / 0 stories) — 77% is test debt |
| `src/lib/api-types.ts` | ✅ clean, 0 errors |
| npm audit criticals | 0 across all 3 manifests |
| Prod-critical vulnerabilities | `hono 4.12.31` (≥4.12.34 fixes 4 advisories) · `astro 5.18.2` (9 advisories; fix = major 7.x) |
| Transitive-route vuln pattern | `wrangler → miniflare → undici/ws` in every manifest (dev-only) |
| React types | runtime 19.2.8 vs `@types/react` 18.3.x — one major behind |
| TS escape hatches | 0 × `@ts-*`; 3 `eslint-disable` (2× exhaustive-deps, 1× no-explicit-any) |
| Worst `any` file | `src/components/admin/HRPanel.tsx` (36) |
| tsconfig strict | ✅ `strict: true` (via `astro/tsconfigs/strict`), actively enforcing |
| Pinned vs caret | 100% caret; only overrides are `sharp`/`esbuild` `>=` floors |

*Nothing was modified during this audit.*