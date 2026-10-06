# Astro 7 Upgrade Plan — SinaiCamps (`app/`)

**Branch:** `feat/astro-7` (currently at `538abf7`)
**Current versions (installed):** `astro ^5.18.2`, `@astrojs/cloudflare ^12.6.13`, `@astrojs/react ^4.4.2`, vite `^6.4.3` (devDep, used by vitest/storybook tooling), Node v22.22.3 (local), CI Node 22.
**Prepared by:** research agent (read-only audit of the worktree; no files in `app/` were modified)
**Scope:** Upgrade the unified frontend app to Astro v7 + Cloudflare adapter v14 to remediate the two remaining HIGH `npm audit` production advisories. This plan is the deliverable: exact version targets, the repo-specific breaking-change inventory, ordered steps, and verification gates.

---

## 1. Vulnerabilities being fixed

### `astro <=7.0.9` — HIGH (8 advisories, fixed in `astro@7.3.1`)
| Advisory | Issue | Repo relevance |
| --- | --- | --- |
| GHSA-j687-52p2-xcff | XSS via `define:vars` (incomplete `</script>` sanitization) | unused but blocks patch |
| GHSA-xr5h-phrj-8vxv | Server-island encrypted params → cross-component replay | unused |
| GHSA-jrpj-wcv7-9fh9 | XSS via unescaped attribute names in spread props | general risk |
| GHSA-f48w-9m4c-m7f5 | XSS via unescaped spread attribute names (incomplete fix of CVE-2026-54298) | general risk |
| GHSA-7pw4-f3q4-r2p2 | XSS via unescaped `transition:*` directive values | unused |
| GHSA-4g3v-8h47-v7g6 | Reflected XSS via View Transition animation properties | unused |
| GHSA-2pvr-wf23-7pc7 | Host-header SSRF in prerendered error-page fetch | repo has no prerendered pages (`output: 'server'`) |
| GHSA-8hv8-536x-4wqp | Reflected XSS via unescaped slot name | general risk |

`npm audit fix --force` offers `astro@7.3.1` (semver-major, so a planned upgrade, not a patch).

### `@astrojs/cloudflare <=13.1.9` — HIGH (fixed in `@astrojs/cloudflare@14.3.0`)
- **GHSA-88gm-j2wx-58h6** — SSRF via redirect following through the `image-binding-transform` endpoint. Directly relevant: this app runs `output: 'server'` on the Cloudflare adapter with remote HTTPS images / an image pipeline.

### Also still flagged (follow-up, not blocking)
- `brace-expansion <=1.1.17 || 2.0.0–2.1.3` (HIGH, DoS) — transitive through dev/build tooling.
- Minor/patch gaps in `AUDIT_TS_DEPS_FINDINGS.md` (wrangler 4.114→4.129, hono, vitest, etc.) — out of scope here.

---

## 2. Target version matrix (verified against npm peerDependencies)

| Package | Target | Peer-dep evidence (checked via `npm view`) |
| --- | --- | --- |
| `astro` | `^7.3.1` (latest) | peers `{ "@astrojs/markdown-remark": "^7.3.0" }` — relaxed, no blocking peers |
| `@astrojs/cloudflare` | `^14.3.0` (latest) | 14.x peers `astro ^7.2.0`; wrangler peer `^4.125.0` (since 14.2.5); deps include `vite ^8.0.13` + `@cloudflare/vite-plugin ^1.53.0` (Vite 8 world). 13.x required `astro ^6.y` — SKIP 13.x entirely |
| `@astrojs/react` | `^6.0.5` (latest) | peers only react/react-dom/@types — **no** astro peer; compatible with React 19 (repo has 19.2) |
| `@tailwindcss/vite` | keep `^4.3.3` | peers `vite ^5.2.0 || ^6 || ^7 || ^8` — already Vite-8 compatible, **no change** |
| `wrangler` | **add** to app devDeps `^4.125.0` | required peer of `@astrojs/cloudflare@14`. NOTE: wrangler is currently NOT in app devDeps (only installed under `backend/`); the app needs it as a peer + for `wrangler types` / `wrangler deploy` |
| `vite` (devDep) | keep `^6.4.3` or bump | Astro 7 bundles Vite 8 internally. The app's direct `vite` dep only feeds the **separate** vitest/storybook toolchain; vitest 4.1.10 satisfies Astro v6's `getViteConfig ≥ v3.2` requirement. App `vitest.config.ts` does not use `getViteConfig` — no change needed |
| Node | ≥ 22 required (v6/v7) | already satisfied (local 22.22.3, CI 22) |

**Install command (in `app/`):**
```bash
npm install astro@^7.3.1 @astrojs/cloudflare@^14.3.0 @astrojs/react@^6.0.5
npm install -D wrangler@^4.125.0
```
(Alternative: `npx @astrojs/upgrade` in `app/`, but pin to 7.3.1/14.3.0/6.0.5 and exclude unrelated libs.)

---

## 3. Repo-specific breaking-change inventory

Every item below was verified against this worktree. Only **one** runtime code change is required — everything else is config/deploy.

### 3.1 REQUIRED CODE CHANGE — `Astro.locals.runtime` removed
**`app/src/middleware/tenant.ts:197`**
```ts
const runtimeEnv = context.locals.runtime?.env as Record<string, unknown> | undefined;
```
`Astro.locals.runtime` was **removed** in Astro 6 / adapter v13+ ("Removed: Astro.locals.runtime API"). Replacement (official migration):
```ts
import { env } from 'cloudflare:workers';   // static top-level import; works in middleware
// ...
const binding = env.API_BACKEND as ApiBackendBinding | undefined;
```
`resolveApiFetcher` (tenant.ts:78, 81, 198) keeps its shape but its `runtimeEnv` argument becomes the `env` from `cloudflare:workers` instead of `context.locals.runtime?.env`. This is the **only** `locals.runtime` usage in `app/src` (verified by grep — no other occurrences).

Also verified **not used** anywhere in the repo (no change needed): `Astro.request.cf`, `Astro.locals.cfContext`, `cloudflareModules`, `platformProxy`, `workerEntryPoint`, `createExports`, `Astro.glob`, `emitESMImage`, legacy content collections, `<ViewTransitions />`, `@astrojs/sitemap`, content/config Zod schemas.

### 3.2 DEPLOYMENT CHANGE — Cloudflare Pages support REMOVED
Adapter v13+ no longer supports Cloudflare Pages. The frontend currently deploys to Pages:
- `app/wrangler.toml:3` → `pages_build_output_dir = "dist"` (legacy Pages key)
- `deploy.sh:367-373` → `npx wrangler pages deploy dist --project-name=$PAGES_PROJECT --branch=main --commit-dirty=true`
- `deploy.sh:274/277` → `PAGES_PROJECT="campmaster-marketplace"` / `...-staging`

Post-migration the frontend is a **Workers project with static assets** (deploy via `wrangler deploy`). Full detail in §4.4–4.5. This is the largest operational change in the upgrade; **not** a code change.

### 3.3 DEV SERVER NOW RUNS IN `workerd`
`astro dev` / `astro preview` use the Cloudflare Vite plugin (`@cloudflare/vite-plugin`) and run in `workerd`, not Node. Consequences for this repo:
- Node-only code in dev no longer silently works. Audit: repo is `output: 'server'`, all routes on-demand, no `node:` imports in runtime paths → expected no impact, but the E2E harness (`wrangler dev` :8787 + `astro dev` :4320) should be re-validated.
- `prerenderEnvironment` (default `'workerd'`) only affects prerendered routes; repo has none (no `prerender` anywhere, no `getStaticPaths`) → ignore.

### 3.4 WRANGLER ENTRYPOINT — `main` changed
Adapter v14 expects `main` in the app's wrangler config to be `@astrojs/cloudflare/entrypoints/server` (unified dev+prod entrypoint) instead of `dist/_worker.js/index.js`.

### 3.5 IMAGE SERVICE DEFAULT CHANGED `'compile'` → `'cloudflare-binding'`
The adapter's `imageService` default changed. The repo explicitly configures `service: sharpImageService()` (`astro.config.mjs:46`) + `remotePatterns: [{ protocol: 'https' }]` (`astro.config.mjs:47`). Sharp is not `workerd`-compatible at runtime, so the adapter auto-falls back to **`cloudflare-binding`** (auto-provisioned `IMAGES` binding) for on-demand image transforms (`/_image`). Since all routes are on-demand, `getImage`/`_image` will go through the Cloudflare Images binding; build-time prerender fallback uses Sharp (via the existing `sharp >=0.35.0` override).
→ Default behavior should be acceptable with **zero config change**; verify images in dev/preview. If problems, pick an explicit mode:
```js
adapter: cloudflare({ imageService: { build: 'cloudflare-binding', runtime: 'cloudflare-binding' } })
// or compile-at-build + binding-at-runtime:
adapter: cloudflare({ imageService: { build: 'compile', runtime: 'cloudflare-binding' } })
```

### 3.6 ASTRO 7 RUST COMPILER — whitespace collapsing
Astro 7 ships a native (oxc/Lightning-CSS) `.astro` compiler. Whitespace between elements is now collapsed following JSX conventions. Cosmetic-only risk on SSR markup spacing; review the tenant/public pages after build (no functional impact expected).

### 3.7 VITE 8 SURFACE IN `astro.config.mjs`
- `vite.build.target: 'es2022'` (astro.config.mjs:55) — valid, keep.
- `vite.esbuild.target` (astro.config.mjs:58) and `optimizeDeps.esbuildOptions.target` (astro.config.mjs:62) — legacy Vite options; under Vite 8/Rolldown they may warn or error. **If so, drop the `esbuild`/`optimizeDeps.esbuildOptions` blocks only — `build.target` alone is sufficient.**
- `rollup-plugin-visualizer` (astro.config.mjs:11; gated behind `ANALYZE=1`, dev-only): Rollup-specific → may not work under Vite 8. **Non-blocking** (diagnostic only). If broken, replace with Rolldown-compatible alternative or drop.

### 3.8 COMPATIBILITY FLAG & SERVICE BINDING (keep)
- `app/wrangler.toml` already carries `[env.production]` with `compatibility_flags = ["global_fetch_strictly_public"]` and the `API_BACKEND` service binding → `campmaster-backend` (SSR API fetches avoid Cloudflare error 1042 on `sinaicamps.com/api/*`). **Keep both** in the Workers config (flatten to top-level `compatibility_flags` + `services`; see §4.4).

---

## 4. Ordered migration steps

### 4.1 Preflight
- [ ] Confirm local Node ≥ 22 and a clean `feat/astro-7` commit (`538abf7`).
- [ ] Inspect `app/public/` for Pages-specific scaffolding: `_routes.json`, `_worker.js`, `_headers`, `_redirects`. `_headers`/`_redirects` are supported by Workers **assets** (adapter copies them) — keep. Adding `.assetsignore` for `_worker.js` only if the build emits one.
- [ ] Confirm the staging backend Worker name (from `backend/wrangler.toml` `[env.staging]` — likely `campmaster-backend-staging`) to point the app's staging service binding at.
- [ ] Check repo-root `wrangler.toml` purpose before/while migrating (ensure it isn't the app's production config).

### 4.2 Dependency upgrade (`app/`)
- [ ] `npm install astro@^7.3.1 @astrojs/cloudflare@^14.3.0 @astrojs/react@^6.0.5`
- [ ] `npm install -D wrangler@^4.125.0`
- [ ] `npm install` clean; run `npm audit` and confirm zero HIGH on `astro`/`@astrojs/cloudflare`.

### 4.3 The one code change — middleware (`app/src/middleware/tenant.ts`)
- [ ] Line 197: replace `context.locals.runtime?.env` with `env` imported via `import { env } from 'cloudflare:workers';` (top-level static import).
- [ ] Thread `env` into `resolveApiFetcher` (lines 78/81/198) — signature keeps `Record<string, unknown> | undefined` shape or narrows to the typed `Env`.
- [ ] Run `npx wrangler types` (app dir) to regenerate `.wrangler/types/runtime.d.ts`; wire it into `app/tsconfig.json` `include` (or copy to `worker-configuration.d.ts`) so `env.API_BACKEND` is typed.

### 4.4 Migrate `app/wrangler.toml` (Pages → Workers)
```toml
# name stays "campmaster-marketplace"
name = "campmaster-marketplace"
compatibility_date = "2026-07-08"
compatibility_flags = ["global_fetch_strictly_public"]
main = "@astrojs/cloudflare/entrypoints/server"
assets = { directory = "./dist", binding = "ASSETS" }

[services]          # was [[env.production.services]]
API_BACKEND = "campmaster-backend"

# staging variant (mirrors backend [env.staging]):
# [env.staging]
# name = "campmaster-marketplace-staging"
# services.API_BACKEND = "campmaster-backend-staging"
```
Replace `pages_build_output_dir` with `assets.directory`; drop `--branch/--commit-dirty` semantics (no longer meaningful).

### 4.5 Update `deploy.sh` — `deploy_frontend()` (lines 352–375)
- [ ] Replace the Pages upload with `npx wrangler deploy $ENV_FLAG` (run from `app/`, uses `app/wrangler.toml`).
- [ ] Replace `PAGES_PROJECT` (lines 273–278) with the Worker names above.
- [ ] Staging: pass `--env staging` (already computed at line 268) — verify it targets the staging Worker + staging backend binding.
- [ ] Keep the health checks as-is (they're URL-based and deployment-agnostic).

### 4.6 Infrastructure cutover (custom domains → Worker)
- [ ] Attach custom domains / routes to the Worker: `sinaicamps.com`, `staging.sinaicamps.com`, tenant domains (e.g. `acaciacamp.com`). Routes: `sinaicamps.com/api/*` must continue to map to the **backend** `campmaster-backend` Worker (per `backend/wrangler.toml` routes) — verify no route collision after the frontend moves off Pages.
- [ ] Cloudflare typically allows a hostname on only one origin: switch the domain from the Pages project to the Worker, or remove from Pages first. Keep the Pages project (and its build artifact) as rollback until the Worker is smoke-tested.
- [ ] After cutover, optionally archive/delete the Pages project.

### 4.7 Verification gates (all in `app/`)
```bash
npx tsc --noEmit
npx vitest run                        # frontend unit suite
npm run lint
npm run build                          # astro build (cloudflare adapter) → dist client+server (+ assets)
npx wrangler deploy --dry-run          # validates wrangler.toml + entrypoint before any real deploy
npm audit                              # expect: no HIGH astro / @astrojs/cloudflare
```
- [x] `npx tsc --noEmit` — 0 errors in `src/`; **11 pre-existing errors in `tests/unit/`** (HTMLSelectElement casts + endpoints.test.ts body typing, all in unmodified test files). Gate unmet on baseline — **deviation**, not upgrade-caused.
- [x] `npx vitest run` — **3419/3419 passed (132 files)**, incl. `middleware-tenant.test.ts` (fixed by adding a `cloudflare:workers` test stub + vitest alias).
- [x] `npm run lint` — exits 0; **13 pre-existing errors** in unmodified admin/public/hook files (duplicate imports + a rule-not-found config issue) + 124 warnings. My changes add only warnings. **Deviation**, not upgrade-caused.
- [x] `npm run build` — succeeds via `@astrojs/cloudflare` adapter. Emits split `dist/client/` + `dist/server/` (**no `dist/_worker.js`** — resolves §6 open item 4); `nodejs_compat` was REQUIRED (Rolldown emits `node:module` in a chunk; without it the Worker fails to start with `No such module "node:module"`).
- [x] `npx wrangler deploy --dry-run` + **`wrangler dev --local` runtime smoke** — dry-run valid (60 modules, 99 assets from `dist/client`, bindings SESSION/API_BACKEND/IMAGES/ASSETS). Local runtime: `/`=200 (marketplace), `/camps`=200, `/pos`=404 (branded tenant-only on apex), `/sitemap.xml`=200, `/robots.txt`=200. `cloudflare:workers` `env` import resolves at runtime.
- [x] `npm audit` — HIGH astro + @astrojs/cloudflare advisories **gone**. Remaining: 1 HIGH `brace-expansion` (pre-anticipated, `npm audit fix` available) + 3 moderate via `uuid`/@storybook (dev-only tooling). 4 vulns total.
- [ ] Dev sanity (`npm run dev`) — `astro dev` crashes in this sandbox with workerd `Missing field moduleType` during Rolldown dep re-optimization (runner-worker host issue). Production path verified instead via `wrangler dev --local` on the built worker. **Deferred/deviation.**
- [ ] E2E gate: `npx playwright test` (boots both servers; follow AGENT_LOGBOOK workerd-crash caveats — run per-project when under load).
- [ ] `ANALYZE=1 npm run build` — confirm visualizer still runs under Vite 8 (non-blocking if not).
- [ ] Visual/whitespace review of public+tenant pages (Rust compiler §3.6).

### 4.8 Documentation follow-ups
- [ ] Update `AUDIT_MASTER_FINDINGS.md` (D2 row: astro 7.x; mark remediated) and `AUDIT_TS_DEPS_FINDINGS.md` version table + README deployment rows.
- [ ] Record in `AGENT_LOGBOOK.md` (implementer): Pages→Workers deploy change, `cloudflare:workers` env import, `wrangler types` wiring, `prerenderEnvironment` note, and any Vite-8 esbuild/visualizer removals.

---

## 5. Risks & rollback

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Deployment target change (Pages→Workers)** — new deploy path, routes/domains, service binding naming | High | Migrate in `feat/astro-7`; validate `wrangler deploy --dry-run` + staging first; keep old Pages project + artifact as zero-downtime rollback (repoint domain back); run full E2E before cutover |
| `imageService` → `cloudflare-binding` fallback changes runtime image handling / new auto-provisioned `IMAGES` binding | Med | Default (fallback) should match current behaviour for on-demand pages; if not, pin explicit mode (§3.5); verify `/_image` and SafeImage `.astro` fallback in dev+preview |
| Vite 8 rejects `vite.esbuild.target` / `optimizeDeps.esbuildOptions`; visualizer breaks | Low | Drop the `esbuild`/`optimizeDeps` blocks (`build.target` suffices); visualizer is `ANALYZE=1`-only diagnostics |
| Oxc compiler whitespace collapsing alters rendered spacing | Low | Cosmetic; visual review (no snapshot/charm tests in repo on markup) |
| `astro dev` on workerd changes E2E/SSR dev behaviour (Node-only deps no longer work; documented workerd crash under load) | Low | Repo has no Node-only runtime code; run E2E per-project; follow AGENT_LOGBOOK 2026-09-06 guidance |
| `wrangler types` / `cloudflare:workers` typing gap → tsc errors | Low | Add generated types to tsconfig include; `env.API_BACKEND` cast to `ApiBackendBinding` |

**Rollback path:** git revert of `feat/astro-7` restores Astro 5 + adapter 12 + Pages deploy (`deploy.sh` unchanged) — but the security fixes are then reverted. Prefer fixing forward on the Worker; only repoint the custom domain back to Pages as an emergency fallback.

---

## 6. Open items to confirm during implementation (not resolvable statically)
1. ✅ **`env` typing shape of `cloudflare:workers`** — `wrangler types` generates `app/worker-configuration.d.ts` (`interface Env extends __BaseEnv_Env {}`), auto-included via astro base tsconfig `include: ["${configDir}/**/*"]`; `env` is cast `as unknown as Record<string, unknown> | undefined` when passed to `resolveApiFetcher`. `src/` types clean.
2. ❗ **Domains on Pages→Workers cutover** — Cloudflare one-host-one-origin rule; see `ASTRO_DEPLOY_CUTOVER.md`. **Not executed (deploy-time step).**
3. ❗ **Staging backend worker name** — `backend/wrangler.toml [env.staging]` does NOT override `name`, so staging backend = `campmaster-backend` (NOT `-staging`). App staging `API_BACKEND` binding = `campmaster-backend`. **UNVERIFIED in live deploy** — flag for validation on first `--staging` deploy.
4. ✅ **`dist/_worker.js`?** — No. With `main = "@astrojs/cloudflare/entrypoints/server"`, build emits split `dist/client/` + `dist/server/`; `wrangler deploy` auto-redirects to generated `dist/server/wrangler.json` (assets `../client`, `main entry.mjs`). `.assetsignore` auto-generated. No `_worker.js` to strip.
5. ✅ **`global_fetch_strictly_public` + `API_BACKEND` service binding on Workers host** — kept the flag; `wrangler dev` local smoke on `/` (marketplace, which calls `resolveApiFetcher`) returned 200 with the binding wired (`env.API_BACKEND (campmaster-backend)`). Same-zone `/api/*` fetch avoidance preserved. **Requires live deploy confirmation of error 1042 avoidance.**
6. ✅ **`nodejs_compat` REQUIRED** (new, not in §6) — Rolldown (Vite 8) emits `node:module` imports in a generated runtime chunk (`console_*.mjs`); without `nodejs_compat` the Worker fails at startup: `No such module "node:module"`. Added to both top-level and `[env.staging]` compat flags.
7. ✅ **`[services]` binding syntax** — new-style mapping object is rejected by wrangler (`The field "services" should be an array`); must use `[[services]] binding=… service=…` table form (both top-level and `[[env.staging.services]]`).