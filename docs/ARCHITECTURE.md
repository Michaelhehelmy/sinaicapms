# SinaiCamps — Architecture

> This document describes the **current** architecture. If it disagrees with prose elsewhere in the repo, trust this file (it is verified against code) and update the other prose.

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
3. CORS is handled **only** by `hono/cors` in `backend/src/index.js` — response helpers must not set CORS headers.
4. `pos_users.name` is a **generated column** (`first_name || ' ' || last_name`): INSERT with `first_name`/`last_name` only.
5. `pos_users.organization_id` is `INTEGER NOT NULL` — every INSERT must include it.

## 2. Zone model (multi-tenant routing)

Every request hostname resolves to exactly one **zone** (`app/src/lib/routeZones.ts` is the single source of truth):

| Zone | Hosts | Routes |
| --- | --- | --- |
| `marketplace` | `sinaicamps.com`, `localhost` (default) | `/`, `/camps`, `/camp/*`, `/admin/*`, auth pages |
| `tenant` | `x.sinaicamps.com`, custom domains (e.g. `acaciacamp.com`) | `/`, `/camp/*` detail, `/book`, `/menu`, `/rooms`, `/pos/*` |

- System prefixes (`/admin`, `/api`, `/auth`, `/register`, `/login`, `/robots.txt`, `/sitemap.xml`, `/404`, `/_astro`, `/favicon`) are **never forbidden**.
- Forbidden routes render a branded 404 (`ZoneGuard`) — exact-path matching only (siblings like `/bookings` are NOT forbidden).
- POS is an operations app: `sinaicamps.com/pos` renders a branded 404; tenant hosts serve the SPA.

**Astro guard gotcha**: zone guards must be template ternaries (`{ forbidden ? <ZoneGuard /> : (...) }`), never a frontmatter `return` of JSX, and never `return Astro.redirect('/404')` before the guard renders.

## 3. Frontend (app/)

- **Astro 5** pages under `app/src/pages/` — static prerendering by default, zone-aware.
- **React 19 islands** only where interactivity is required (`client:*` directives). Currently just 3 public islands: `CampBooking` (`client:visible`), `ReservationSummary` (`client:load`), `TenantMenu` (`client:load`).
- **TanStack Query** for all admin data (`useQueryHooks`, `useAdminData`). The admin SPA was fully migrated off raw `fetch` — no `window.*` cross-file globals remain.
- **Design system**: 26 primitives in `app/src/components/ui/` (see `COMPONENT_CATALOG.md`), Tailwind CSS v4 tokens, `cn()` util.
- **Images**: `astro.config.mjs` uses `sharpImageService()` with `image.remotePatterns: [{ protocol: 'https' }]`. `SafeImage.astro` normalizes URLs, runs `getImage`, and falls back to a plain `<img>` on any error so pages never 500 on remote fetch failure.
- **i18n**: there is NO i18n system — the frontend is hard-coded English LTR (deliberate decision; see `DEVELOPER_ROADMAP.md`).

## 4. Backend (backend/)

- **Hono on Cloudflare Workers** (`backend/src/index.js`): CORS, routes, middleware, auth catch-all.
- Route modules: `backend/src/api/` (camps, categories, tenants, orders, …) + `backend/src/routes/pos/` (POS: auth, products, cart, shifts, …).
- **Auth**: JWT (`env.JWT_SECRET` — no fallback, throws immediately if unset), role hierarchy admin > staff; POS uses a separate `pos_token`.
- **RBAC / rate limiting**: `backend/src/middleware/`. Rate limiter keys on `cf-connecting-ip` only (not spoofable) and **fails closed** (429 on KV error). `RATE_LIMIT_KV_ENABLED="false"` forces the in-memory fallback — see `MIGRATION_GUIDE.md` for the KV free-plan quota reason.
- **Responses**: `jsonResponse` / `cachedJsonResponse` / `errorResponse` in `backend/src/utils/response.js`. All data is camelCased (`toCamel`) on the way out; the registry (`routes/registry.js`) documents the contract.

## 5. Database & migrations

- **D1 (SQLite)** — schema lives in `backend/migrations/` (currently **53 migrations**, latest `0053_camp_ownership.sql`).
- One numbered `.sql` file per migration, applied in order via `wrangler d1 migrations apply` (see `MIGRATION_GUIDE.md` and the `db-migration` skill).
- KV holds **only** rate-limit state (`RATE_LIMIT_KV`); `KV_CACHE` is bound but never written — public-read caching uses `Cache-Control` headers via `cachedJsonResponse` (no KV writes, free-plan safe). R2 (`MEDIA_BUCKET` = `campmaster-media`) holds uploads (wired in staging + prod). SSE is broadcast through the `BROADCASTER` Durable Object (admin inbox/orders).

## 6. Deployment

`./deploy.sh` — deploys the backend Worker + D1 migrations, then builds/deploys the frontend to Cloudflare Pages.
`./deploy.sh --staging` — same flow against the staging environment (validates `[env.staging]` in `backend/wrangler.toml` first). See `QUICK_START.md`.

## 7. Tests

Four suites — see `TESTING.md` for exact counts and commands:

| Suite | Location | Count |
| --- | --- | --- |
| Backend unit | `backend/` | 1082 tests / 36 files |
| Frontend unit | `app/` | 1465 tests / 74 files |
| Root integration | repo root | 169 tests / 10 files |
| E2E (Playwright) | `tests/e2e/` | 566 total / 552 gate (14 env-skipped) |
