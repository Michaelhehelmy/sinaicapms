# Astro Deploy Cutover — Pages → Workers (`campmaster-marketplace`)

This document is the **deploy-time** checklist for repointing the frontend from
Cloudflare **Pages** (`campmaster-marketplace`, Astro 5) to Cloudflare **Workers**
(`campmaster-marketplace`, Astro 7 → `@astrojs/cloudflare` SSR). All code/config
changes ship on `feat/astro-7`; only the steps below are manual dashboard/DNS work.

> ℹ️ **Where the deploy actually runs:** `./deploy.sh` runs `npx wrangler deploy`
> from `app/`. Wrangler auto-redirects to the adapter-generated
> `app/dist/server/wrangler.json` (main `entry.mjs`, assets `./client`, bindings
> `ASSETS`, `SESSION`, `IMAGES`, `API_BACKEND`). Manual dashboard steps below match
> that generated config. Staging variant: `--env staging` → `campmaster-marketplace-staging`.

---

## 0. Prereqs / safety

- [ ] All gates green in `app/`: `npm run build`, `wrangler deploy --dry-run`, `npx vitest run` (3419 ✓), `tsc --noEmit` (only pre-existing `tests/unit/` errors), `npm audit` (no HIGH astro/cloudflare).
- [ ] Old Pages project `campmaster-marketplace` **NOT deleted** — kept as a zero-downtime rollback (repoint domain back to Pages if the Worker is never promoted).
- [ ] `wrangler` + `@cloudflare/vite-plugin` versions consistent in `app/` (`wrangler@4.129.0` satisfies the `@astrojs/cloudflare@14` peer `^4.125.0`).

## 1. Provision & validate the Worker first (no domain change yet)

1. Deploy the Worker to its `.workers.dev` subdomain first (do **not** attach the custom domain yet):
   ```bash
   ./deploy.sh --frontend        # prod: campmaster-marketplace
   # or
   ./deploy.sh --staging         # staging: campmaster-marketplace-staging
   ```
2. Smoke-test on `https://campmaster-marketplace.<account>.workers.dev`:
   - `/` → 200 marketplace HTML (SSR, correct `<title>`).
   - `/camps` → 200; `/pos` on apex → **404** (branded tenant-only guard, ZoneGuard).
   - `/sitemap.xml`, `/robots.txt` → 200 (served from `dist/client` assets).
   - On-demand image via `/_image` and a `SafeImage` page → 200 (IMAGES binding).
   - An API-backed page (`/camps`, marketplace directory) → data loads **through the
     `API_BACKEND` service binding**; confirm no same-zone `fetch()` error 1042 in the
     Worker logs.
3. If `/api/*` fetch fails with Cloudflare error 1042 (same-host fetch to `sinaicamps.com/api/*`),
   confirm the middleware binding path is active (see §5). `env.API_BACKEND` must be
   populated — the generated `dist/server/wrangler.json` shows
   `"services":[{"binding":"API_BACKEND","service":"campmaster-backend"}]`.

## 2. Custom-domain cutover (downtime window)

Cloudflare enforces **one host / one origin** — the custom domains must be moved OFF
the Pages project and ONTO the Worker. Do this in a single maintenance window.

1. **In the Pages project** (`campmaster-marketplace` → Settings → Custom domains / domains):
   Remove `www` / `sinaicamps.com` (apex) and every tenant host (e.g. `acaciacamp.com`)
   so the hostnames are freed for the Worker.
2. **In Worker routes / Custom domains** (`campmaster-marketplace` → Settings → Domains & Routes):
   - Add `sinaicamps.com` (apex) → route all traffic to this Worker.
   - Add `www.sinaicamps.com` (redirect or direct) as desired.
   - Add each tenant host (e.g. `acaciacamp.com`) → same Worker. Because the app is
     zone-aware (tenant middleware resolves by Host), a single Worker serves every host.
   - For staging: `staging.sinaicamps.com` → `campmaster-marketplace-staging`.
3. **Backend routes must remain on `campmaster-backend`** — `/api/*` and `*.sinaicamps.com/api/*`.
   The `API_BACKEND` service binding replaces same-zone fetch; do **not** route `/api/*`
   to the frontend Worker.

> **DNS note:** Because the app is served by Worker routes on the same zone, the
> `sinaicamps.com` DNS itself is unchanged (A/AAAA stays as proxied Cloudflare records).
> Only the *route/origin* binding (Pages → Worker) changes. If an apex host is attached
> to the Worker via CNAME flattening for a non-Cloudflare-hosted zone, update the CNAME
> target to the Worker's `.workers.dev` / `proxy.<zone>.workers.dev` per Cloudflare docs.

## 3. Post-cutover verification

- [ ] HTTPS works on apex, `www`, and a tenant host; cert auto-provisions (no Cloudflare-issued domain failed state).
- [ ] `/admin` SPA serves and reaches the API (TanStack Query, through the binding).
- [ ] `/pos` serves the SPA on a tenant host (`acaciacamp.com/pos`) and branded 404 on `sinaicamps.com/pos`.
- [ ] Reproduction of **E2E suite** against the live Worker (not just local `wrangler dev`).
- [ ] `nginx`-free: static assets from `ASSETS` (immutable `/_astro/*` Cache-Control injected by adapter; security `_headers` applied — "Parsed 2 valid header rules").
- [ ] Check Worker logs (Workers Observability) for a handful of requests; confirm `env.API_BACKEND` path and no `No such module "node:module"` startup failures (would indicate missing `nodejs_compat`).

## 4. Rollback (emergency)

Prefer **fixing forward** on the Worker (the Astro 7 upgrade also removes the HIGH
`npm audit` advisories). If a hard rollback is required:

1. Repoint the custom domains from the Worker back to the **Pages project**
   (`campmaster-marketplace`, Astro 5 artifact — still deployed unless cleaned).
2. `git revert feat/astro-7` restores Astro 5 + adapter 12 + Pages `deploy.sh`.

> ⚠️ Rolling back reverts the security fixes. Use only as a bridge while a forward fix lands.

## 5. Deployment-affecting config (summary of what changed)

| Area | Astro 5 / Pages | Astro 7 / Workers |
| --- | --- | --- |
| Frontend runtime | Cloudflare Pages build | Worker SSR (`@astrojs/cloudflare` adapter) |
| Backend call | same-zone `fetch(https://sinaicamps.com/api/*)` | `API_BACKEND` **service binding** + `global_fetch_strictly_public` |
| `env` access | `Astro.locals.runtime.env` (removed) | `import { env } from 'cloudflare:workers'` |
| Deploy target | `wrangler pages deploy` | `wrangler deploy` (from `app/`) |
| Worker config | Pages `_routes.json` | `app/wrangler.toml` → `dist/server/wrangler.json` |
| Node-compat | — | **`nodejs_compat` REQUIRED** (Rolldown emits `node:module` in a chunk) |
| Staging binding | pages staging project | `API_BACKEND` → `campmaster-backend` (backend keeps its name in `[env.staging]`) |

## 6. Open items carried forward

- **Staging `API_BACKEND` target unverified live** — configured as `campmaster-backend`
  (deviation from plan's earlier guess of `-staging`). Confirm the backend
  `[env.staging]` actually deploys as `campmaster-backend` on the first `--staging` deploy.
- **`astro dev` sandbox crash** — `Missing field moduleType` in the workerd runner during
  Rolldown dep optimization (host-environment/tooling). Not a deploy blocker; production
  path validated via `wrangler dev --local` on the built worker.
- **`brace-expansion` HIGH** (transitive, dev tooling) + **`uuid` moderate** (via
  `@storybook/addon-essentials`) still open in `npm audit`; non-blocking follow-ups.
