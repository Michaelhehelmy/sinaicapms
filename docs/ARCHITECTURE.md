# SinaiCamps — Architecture

> This document describes the **current** architecture. If it disagrees with prose elsewhere in the repo, trust this file (it is verified against code) and update the other prose.
>
> Verified against `dbcb382` on 2026-10-02. Where a number can rot (§7 test counts, §5 migration head), it is stated **with the commit that produced it** and with the rule for re-deriving it — so a stale number is visible rather than authoritative.

> **File head ≠ applied ledger.** `0127_meals_tenant_composite_pk.sql` is
> committed and its code half is merged, but the migration is **PENDING-APPLY**
> on every database. A migration that re-keys a table and the code written
> against its new column list are two halves that must be ordered, and the
> wrong order fails at runtime rather than at boot.

## 1. The four-layer contract

SinaiCamps is built as **four isolated layers** connected by a strict, one-directional contract:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1 — Frontend (app/)                                   │
│   Astro pages + React islands. UI only. Never touches D1/KV.│
└───────────────┬─────────────────────────────────────────────┘
                │  HTTP only — app/src/lib/api.ts
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2 — API (backend/src/, Hono on Cloudflare Workers)    │
│   The ONLY entry point for all data. Auth + RBAC + rate     │
│   limiting live here.                                       │
└───────────────┬─────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3 — Database (D1, SQLite)   Layer 4 — Cache (KV)      │
│   backend/migrations/*.sql        Rate-limit storage only.  │
└─────────────────────────────────────────────────────────────┘
```

**Rules that must never be broken**

1. The frontend **never** imports or queries D1/KV directly — it only talks to `/api/*` on the Worker.
2. The API client in `app/src/lib/api.ts` is the single frontend↔backend contract (see `API_CONTRACT.md`).
3. CORS is handled **only** by the global `hono/cors` mount in `backend/src/index.js` (an **async** origin allowlist, not an array — see §4) — no route, response helper or Durable Object may set `Access-Control-*` itself.
4. `pos_users.name` is a **generated column** (`first_name || ' ' || last_name`): INSERT with `first_name`/`last_name` only.
5. `pos_users.organization_id` is `INTEGER NOT NULL` — every INSERT must include it.

## 2. Zone model (multi-tenant routing)

Every request hostname resolves to exactly one **zone** (`app/src/lib/routeZones.ts` is the single source of truth):

| Zone | Hosts | Routes |
| --- | --- | --- |
| `marketplace` | `sinaicamps.com`, `localhost` (default) | `/camps`, `/camp`, `/camp/*` (marketplace-only); system prefixes + `/`, `/about`, `/contact`, `/faq`, `/gallery` (both zones) |
| `tenant` | `x.sinaicamps.com`, custom domains (e.g. `acaciacamp.com`) | `/pos`, `/pos/*`, `/menu`, `/book`, `/rooms`, `/storefront`, `/storefront/*` (tenant-only); system prefixes + both-zones pages |

- System prefixes (`/admin`, `/api`, `/auth`, `/register`, `/login`, `/robots.txt`, `/sitemap.xml`, `/404`, `/_astro`, `/favicon`) are **never forbidden**.
- Forbidden routes render a branded 404 (`ZoneGuard`) — exact-path matching only (siblings like `/bookings` are NOT forbidden).
- POS is an operations app: `sinaicamps.com/pos` renders a branded 404; tenant hosts serve the SPA.

**Astro guard gotcha**: zone guards must be template ternaries (`{ forbidden ? <ZoneGuard /> : (...) }`), never a frontmatter `return` of JSX, and never `return Astro.redirect('/404')` before the guard renders.

## 3. Frontend (app/)

- **Astro 7** pages under `app/src/pages/` — static prerendering by default, zone-aware.
- **React 19 islands** only where interactivity is required (`client:*` directives). Audited 2026-09-22 (F-A20-02), re-counted 2026-10-02: **17 directive sites** — 8× `client:only="react"` full-page hosts with no SSR fallback (`admin/[...rest]`→AdminShell, `pos/login`, `pos/[...rest]`→PosShell ×2, `onboarding`→OnboardingWizard, `register`, `signup`, `forgot-password`, `reset-password`; cannot defer), 6× `client:visible` deferred content islands (`TenantLanding`'s `CampBooking` rooms section, `marketplace.astro`'s `MarketplaceDirectory`, and the 4 storefront islands `ShopCatalog`/`StorefrontCart`/`StorefrontCheckout`/`StorefrontConfirmation`), 3× `client:load` above-fold primary content (`BookPage`'s `ReservationSummary` booking form, `MenuPage`'s `TenantMenu`, and `PublicLayout`'s debug-gated `DebugFeedbackWidget`). (A raw `grep client:` over `app/src` reports 23 hits; 6 are code-comment mentions inside `Storefront*.tsx` / `PosShell.tsx` / `AdminShell.tsx`, not directives.) Discipline: default `client:visible` for content islands; `client:load` only for above-fold primary interactive content; `client:only` only for full-page SPA hosts; add islands sparingly.
- **Widget fix 2026-09-22 (real bug, walkthrough):** `DebugFeedbackWidget` moved `client:visible` → `client:load` (PublicLayout only; Admin/PosShell mount it directly). SSR renders null until the debug flag/session resolves, so a visibility-gated island never intersected and never hydrated — the public `?debug=1` button could never appear. This is why the split is **6 visible / 3 load** and not 7/2.
- **TanStack Query** for all admin data (`useQueryHooks`, `useAdminData`, `usePosQueries`). The admin SPA was fully migrated off raw `fetch` — verified 2026-10-02: zero `window.*` data globals anywhere under `components/admin/` or `components/pos/`. The **public marketplace** components are the exception and are not part of that migration: `CampsSection.astro` still sets/reads `window.__API_BASE` and `window.__SSR_RENDERED` (`MarketplaceHome.astro` reads `__API_BASE`) and `gallery.astro` uses `window.__galleryImages` — each set and read **inside its own file**, so none of them is a cross-file channel.
- **Design system**: 20 primitives in `app/src/components/ui/` (see `COMPONENT_CATALOG.md`), Tailwind CSS v4 tokens, `cn()` util.
- **Images**: `astro.config.mjs` uses `sharpImageService()` with `image.remotePatterns: [{ protocol: 'https' }]`. `SafeImage.astro` normalizes URLs, runs `getImage`, and falls back to a plain `<img>` on any error so pages never 500 on remote fetch failure.
- **i18n**: there is NO i18n system — the frontend is hard-coded English LTR (deliberate decision; see `DEVELOPER_ROADMAP.md`).
- **AI is split**: deterministic math (`/api/ai/dynamic-price`, `/api/ai/forecast`, `/api/ai/anomaly`, rules/predictions CRUD) stays server-side (D1-backed); model inference (embeddings, sentiment, text generation via Transformers.js) runs client-side in the admin browser only (`app/src/lib/browser-ai.ts`, loaded lazily on the AI panel — never in the main bundle). `/api/ai/workers-ai/*` and `/api/ai/state/*` remain honest 503 stubs; no `AI`/`STATE_DO` binding exists.

## 4. Backend (backend/)

- **Hono on Cloudflare Workers** (`backend/src/index.js`): CORS, routes, middleware, auth catch-all.
- Route modules: `backend/src/api/` (camps, categories, tenants, orders, …) + `backend/src/routes/pos/` (POS: auth, products, cart, shifts, …).
- **Auth**: JWT (`env.JWT_SECRET` — no fallback, throws immediately if unset); POS uses a separate `pos_token` realm. The frontend role ladder is `ROLE_HIERARCHY` in `app/src/lib/rbac.ts` — `super_admin` 100 > `admin` 80 > `manager` 50 > `cashier` 30, and `roleAtLeast()` treats any unknown role (including undefined) as failing.
- **RBAC / rate limiting**: `backend/src/middleware/`. The limiter is a ~20-entry ordered policy table keyed `${cf-connecting-ip}:${path}` (first match wins) with per-entry env dials, plus a tenant-scoped second layer on 7 prefixes; it keys on `cf-connecting-ip` only (not spoofable) and **fails closed** (429 on KV error). `RATE_LIMIT_KV_ENABLED="false"` forces the in-memory fallback — see `MIGRATION_GUIDE.md` for the KV free-plan quota reason and `security-guide.md` for the full policy table.
- **CORS is an async allowlist, not an array** — wildcard regexes plus a 5-minute-cached tenant custom-domain lookup (`backend/src/index.js:123–141`). See `security-guide.md`.
- **Responses**: `jsonResponse` / `cachedJsonResponse` / `errorResponse` in `backend/src/utils/response.js`. All data is camelCased (`toCamel`) on the way out; the registry (`routes/registry.js`) documents the contract.

## 5. Database & migrations

- **D1 (SQLite)** — schema lives in `backend/migrations/`. At `dbcb382` that is
  **40 top-level `.sql` files**, head
  `0127_meals_tenant_composite_pk.sql`. It is *not* a contiguous range:
  `0001`–`0014`, then `0100`–`0127`.
- **The head is "the highest-numbered file present", not "N files after 0001".**
  Two slots are deliberately absent and D1 does not require contiguity:
  `0109` is **reserved-but-absent** (documented in `0110`'s header — the slot
  belonged to a workstream that would have added cascading deletes, and it was
  skipped so no later migration consumes it), and `0125` was verified free and
  deliberately skipped when the D3 mission took `0126`. A gap in the ledger is
  normal and is not drift; §8's parity check is what actually proves the ledger
  matches the files.
- `legacy/` (99 files, incl. the never-applied `0076_sanitize_user_data.sql`)
  and `SCHEMA_DIRECTION_PLAN.md` sit alongside but are **excluded** from the
  lineage — `scripts/check-deploy-parity.sh` inventories top-level `*.sql` only.
- One numbered `.sql` file per migration, applied in order via `wrangler d1
  migrations apply` (see `MIGRATION_GUIDE.md` and the `db-migration` skill).
- KV holds **only** rate-limit state (`RATE_LIMIT_KV`); `KV_CACHE` is bound but
  never written — public-read caching uses `Cache-Control` headers via
  `cachedJsonResponse` (no KV writes, free-plan safe). R2 (`MEDIA_BUCKET` =
  `campmaster-media`) holds uploads (wired in staging + prod). SSE is broadcast
  through the `BROADCASTER` Durable Object (admin inbox/orders).

### 5a. The second Worker: `monitor/`

`campmaster-monitor` is a **separate Worker with its own bindings** and is not
part of the four-layer contract above — it reads the public API, it does not
call `/api/*` with a tenant JWT, and it never touches `campmaster-db`.

| Item | Value |
|---|---|
| Worker | `campmaster-monitor` (`monitor/wrangler.toml`) |
| D1 | `campmaster-monitor-db`, `migrations_dir = migrations` |
| Cron | `*/5 * * * *` — a scheduled handler that probes the configured targets |
| Targets | 5 public URLs, listed **in code** (`monitor/src/targets.js`), not in the DB. **No self-check target**: a Worker fetching a Worker through the same zone is answered with 522 at the edge, so the monitor probing its own hostname reported a false outage — watch the panel from outside the zone instead (see the comment in `monitor/src/targets.js`) |
| Retention | cron-written tables are pruned (`checks` 14d, `reports` 30d, orphaned `alert_state`) |

It exists because the free-tier KV/D1 write quotas make a KV-backed health
cache impossible (§5), so its short TTLs are **per-isolate, in-memory** and
best-effort: a cold isolate simply queries. Adding a monitor deployment is a
separate decision from the app's deploy path — `deploy.sh` does **not** ship it.

## 6. Deployment

`./deploy.sh` — deploys the backend Worker + D1 migrations, then builds/deploys the frontend to Cloudflare Workers (one-host-one-origin).
`./deploy.sh --staging` — same flow against the staging environment (validates `[env.staging]` in `backend/wrangler.toml` first). See `QUICK_START.md`.

## 7. Tests

**Five** suites. Counts are stated with the run that produced them, because a
bare number rots silently:

| Suite | Command | Files | Tests | Last verified |
| --- | --- | --- | --- | --- |
| Backend unit | `cd backend && npx vitest run` | **124** | **2701** | `3f66503` (`saga-rollback`) |
| Frontend unit | `cd app && npx vitest run` | **154** | **3611** | `09ff710` (`tenant-name-escape`) |
| Monitor unit | `cd monitor && npx vitest run` | **7** | **72** | `921e871` (`perf-d-retention`) |
| Root integration | `npx vitest run --config vitest.integration.config.ts` | **37** | **255** registered | 2026-09-28; see the caveat below |
| E2E (Playwright) | `CI=true npx playwright test` | **96** specs, 8 projects | not re-run for this pass | see below |

Two honest caveats, because the alternative is a number that looks verified
and is not:

- **E2E has no current gate number.** The last full gate recorded in
  `AGENT_LOGBOOK.md` is 919 passed / 0 failed / 15 env-skipped (2026-09-06,
  per-project). `tests/e2e/` now holds 96 spec files across 8 Playwright
  projects (`marketplace`, `tenant`, `admin`, `auth`, `cross-cutting`, `pos`,
  `public`, `routing`). Run the gate; do not quote a remembered number, and do
  not debug on a stale server (`docs/RUNBOOK.md` §8).
- **The root integration suite is environment-dependent and currently red in a
  bare workspace**: `tests/globalSetup.ts` boots `wrangler dev` and never
  applies migrations, so a fresh `.wrangler/state` is a blank DB and the suite
  500s on `no such table`. That is pre-existing and documented, not a
  regression — confirm with `git stash` before attributing it to your diff.

`docs/TESTING.md` carries the day-to-day commands; it is refreshed separately
and its counts lag this file.
