# SinaiCamps — Multi-Tenant Camp Management Platform

A full-stack serverless SaaS platform for managing summer camps, wilderness lodges, and outdoor adventure facilities. Each camp runs an SEO-optimized public website with WhatsApp booking, backed by a unified admin dashboard and POS terminal.

**Production:** [sinaicamps.com](https://sinaicamps.com) · **Repo:** [Michaelhehelmy/campmaster](https://github.com/Michaelhehelmy/campmaster) (private)

**Docs:** [Architecture](docs/ARCHITECTURE.md) · [API Contract](docs/API_CONTRACT.md) · [Component Catalog](docs/COMPONENT_CATALOG.md) · [Migration Guide](docs/MIGRATION_GUIDE.md) · [Quick Start](docs/QUICK_START.md) · [Testing](docs/TESTING.md) · [Developer Roadmap](docs/DEVELOPER_ROADMAP.md) · [Performance Baseline](docs/PERF_BASELINE.md)

---

## Architecture: Isolated but Connected

SinaiCamps is built as **four independent layers that are isolated from each other and connected only through a strict contract**. Each layer can be developed, tested, scaled, and deployed on its own — but none of them can touch the others' internals.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (end user)                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. FRONTEND  (app/ — Astro 5 + React 19 + Tailwind v4)             │
│     • Renders UI only (public marketplace, tenant sites, admin, POS)│
│     • SSR for public pages + React islands (client:*) where needed  │
│     • NEVER talks to the database directly                          │
│     • Only connection to the outside world: the HTTP API            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP JSON (fetch via app/src/lib/api.ts)
                                │ same-origin /api/* (proxied in dev)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. API + BACKEND (backend/ — Hono on Cloudflare Workers)           │
│     • The ONLY entry point to business logic and data               │
│     • Auth (JWT + pos_token), RBAC, tenant scoping, rate limiting   │
│     • Route handlers in src/api + src/routes/pos                    │
│     • SSE broadcast via Durable Object (BROADCASTER)                │
│     • Never renders UI                                               │
└───────────┬──────────────────────────────────┬──────────────────────┘
            │ D1 binding (env.DB)              │ KV / R2 bindings
            ▼                                  ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│  3. DATABASE              │   │  4. CACHE / RATE LIMITING     │
│     Cloudflare D1 (SQLite)│   │     Cloudflare KV + R2        │
│     • Only the backend    │   │     • RATE_LIMIT_KV (toggle)  │
│       worker may query it │   │     • KV_CACHE (bound; read   │
│     • Migrations only via │   │       caching via Cache-      │
│       backend/migrations/ │   │       Control headers)        │
│     • 53 numbered files   │   │     • R2 MEDIA_BUCKET (uploads│
└───────────────────────────┘   │       — media images)         │
                                │     • Never read by frontend  │
                                └───────────────────────────────┘
```

### The Isolation Contract

| Layer | What it does | What it is NOT allowed to do | How it connects |
|---|---|---|---|
| **1. Frontend** (`app/`) | Render UI, collect input, call API, zone routing | ❌ Never import backend code · ❌ Never query D1/KV · ❌ Never hold secrets | → API via `app/src/lib/api.ts` (unified typed client, 100+ functions) over HTTP JSON |
| **2. API + Backend** (`backend/`) | Auth, business logic, validation, data access, rate limiting, SSE | ❌ Never render UI · ❌ Never expose D1/KV/R2 bindings to the outside | → D1 via `env.DB` binding (prepared statements) · → KV via `RATE_LIMIT_KV`/`KV_CACHE` · → R2 via `MEDIA_BUCKET` · → Durable Object `BROADCASTER` |
| **3. Database** (Cloudflare D1) | Persist all data (SQLite at the edge) | ❌ No public access — reachable only inside the Worker runtime | ← backend only, via `.prepare().bind().all()` |
| **4. Cache / Rate Limiting** (Cloudflare KV + R2) | Distributed rate-limit state + media storage | ❌ Not an API surface · ❌ Never a source of truth | ← backend only, via Worker bindings |

### How they are physically connected

- **Frontend ↔ Backend**: In production both live on the same zone (`sinaicamps.com`). Cloudflare **Worker routes** send `/api/*` to the `campmaster-backend` Worker; everything else is served by the Pages build of the frontend. In dev, Astro's dev server proxies `/api/*` to `wrangler dev` on `:8787`. The API client (`app/src/lib/api.ts`) is the single shared contract — one function per endpoint, typed responses (`app/src/lib/api-types.ts` regenerated from `backend/openapi.json`).
- **Backend ↔ Database**: D1 binding `env.DB` (`campmaster-db`) declared in `backend/wrangler.toml`. Every schema change is a numbered migration in `backend/migrations/` (currently **53**, head `0053_camp_ownership.sql`) applied with `wrangler d1 migrations apply`. No ORM — parameterized SQL.
- **Backend ↔ KV / R2 / DO**: `RATE_LIMIT_KV` (rate limiting), `KV_CACHE` (bound; read caching is done with `Cache-Control` headers on public responses — no KV writes), `MEDIA_BUCKET` (R2 uploads), and `BROADCASTER` (Durable Object for SSE) — all declared in `backend/wrangler.toml`. Rate limiting is **KV-backed with an in-memory fallback** (see [Rate Limiting & KV](#rate-limiting--kv-free-plan-warning)).
- **Tenant isolation is enforced twice**: `app/src/middleware/tenant.ts` resolves the tenant/zone for rendering, and `backend/src/middleware/` re-validates tenant context + JWT on every API call. The frontend can never bypass the backend's checks.

---

## Directory Structure

```
sinaicamps/
├── app/                        Layer 1 — Unified frontend (Astro + React + Tailwind)
│   └── src/
│       ├── components/         React components
│       │   ├── admin/          Admin dashboard panels (18 panels + SPA host)
│       │   ├── pos/            POS terminal views (8 views)
│       │   ├── public/         Public components (ZoneGuard, TenantLanding, CampsSection…)
│       │   ├── ui/             Shared UI primitives (26 components)
│       │   ├── feedback/       Toast notifications
│       │   ├── forms/          Form components
│       │   └── tables/         Table components
│       ├── layouts/            Astro layouts (Public, Admin, POS)
│       ├── pages/              Route pages
│       │   ├── index.astro     Marketplace home (zone-aware)
│       │   ├── camps.astro     Marketplace /camps listing
│       │   ├── camp/[id]/      Camp detail (index, book, menu)
│       │   ├── book|menu|rooms|about|contact|faq|gallery.astro   Tenant / public pages
│       │   ├── admin/[...rest]/  Admin SPA host
│       │   └── pos/[...rest]/    POS SPA host
│       ├── lib/                Shared modules
│       │   ├── api.ts          Unified API client (100+ functions) — THE contract
│       │   ├── api-types.ts    Generated response/request types (from openapi.json)
│       │   ├── routeZones.ts   Zone model (marketplace | tenant) — single source of truth
│       │   ├── auth.tsx        React auth context + role hierarchy
│       │   ├── sse.ts          SSE client (admin inbox/orders via Durable Object)
│       │   ├── theme.ts / posUrl.ts / plausible.ts
│       │   └── utils.ts        escHtml, formatCurrency, cn, …
│       ├── hooks/              React hooks (useAdminData, useApiError, useQueryHooks,
│       │                       useSseInbox, useSseOrders)
│       ├── middleware/         Astro middleware (tenant resolution, zone)
│       └── styles/             Global Tailwind CSS
│
├── backend/                    Layer 2 — Cloudflare Worker API (Hono + D1 + KV + R2 + DO)
│   └── src/
│       ├── index.js            Hono app entry (CORS, routes, middleware, catch-all auth)
│       ├── api/                Route handlers (auth, camps, tenants, reservations, …)
│       ├── routes/pos/         POS routes (products, orders, shifts, customers, …)
│       ├── middleware/         Auth, RBAC, rate limiting, tenant
│       ├── services/           Business logic
│       └── utils/              Response helpers, error handling
│   └── migrations/             Layer 3 — D1 schema migrations (53 numbered files)
│
├── tests/                      All test suites
│   ├── unit/                   Backend unit tests
│   ├── pos/                    POS integration tests
│   ├── e2e/                    Playwright E2E specs (marketplace, tenant, admin, pos,
│   │                           auth, cross-cutting, routing, production)
│   └── *.test.js               Integration tests
│
├── docs/                       Architecture, API contract, component catalog, guides
├── deploy.sh                   Single-command deployment
├── playwright.config.ts        E2E configuration (local)
└── playwright.prod.config.ts   E2E configuration (production)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **1. Frontend** | Astro 5.18.x + React 19.2.x + Tailwind CSS v4 (TypeScript); `sharpImageService()` image pipeline with `SafeImage.astro` |
| **2. API / Backend** | Hono on Cloudflare Workers (JavaScript); SSE via Durable Object `BROADCASTER` |
| **3. Database** | Cloudflare D1 (SQLite) — `campmaster-db` (+ isolated `campmaster-db-staging`) |
| **4. Cache / Rate Limiting** | Cloudflare KV (`RATE_LIMIT_KV`, `KV_CACHE`) + R2 (`MEDIA_BUCKET`) |
| **Auth** | JWT (HS256) + bcrypt password hashing; POS uses a separate `pos_token` |
| **Unit Tests** | Vitest (backend 1082 · frontend 1465 · integration 169) |
| **E2E Tests** | Playwright (566 total — 552 gate passing · 14 env-skipped in CI mode) |
| **Deployment** | Cloudflare Pages (frontend) + Cloudflare Workers (API) via `deploy.sh` (`--staging` supported) |

---

## Features

### Zone Model (marketplace vs tenant)
Every request resolves to a **zone** (`marketplace` or `tenant`) via `app/src/lib/routeZones.ts`. The zone decides which routes exist:

| Route | Marketplace zone | Tenant zone |
|---|---|---|
| `/` (tenant landing) | marketplace home | tenant home |
| `/camps`, `/camp/*` | ✅ camps directory | ❌ branded 404 |
| `/book`, `/menu`, `/rooms` | ❌ branded 404 | ✅ tenant pages |
| `/pos`, `/pos/*` | ❌ branded 404 | ✅ POS SPA |
| `/about`, `/contact`, `/faq`, `/gallery` | ✅ | ✅ |
| `/admin`, `/api/*`, `/auth/*`, `/register`, `/login` | system prefixes — never forbidden | same |

Custom domains (e.g. `acaciacamp.com`) resolve to their tenant zone automatically; unknown/missing tenants render branded 404s.

### Public Marketplace (`/`, `/camps`)
- Browse registered camps with search and filters (location, capacity, activities)
- Camp detail pages with JSON-LD structured data (`CollectionPage`/`ItemList` on `/camps`, `Campground`/`LodgingBusiness` on home + tenant landing) and SEO meta tags
- Self-serve camp onboarding registration form

### Camp Tenant Portals (`/`, `/book`, `/menu`, `/rooms`, `/about`, …)
- SEO-optimized pages with camp-specific branding (colors, logo, description)
- WhatsApp booking lead generator with real-time pricing (`CampBooking` island, `client:visible`)
- JSON-LD `Campground` structured data

### Admin Dashboard (`/admin`)
- Hash-routed React SPA with **18 management panels** (TanStack Query for all data — zero raw `fetch` data loads)
- Camps, Rooms, Rate Plans, Reservations/Orders, Staff, Inventory, Meals, Planning, Reports, Settings, Super Admin mode
- Live updates via SSE (inbox + orders) through the `BROADCASTER` Durable Object

### POS Terminal (`/pos`)
- React SPA (hosted inside the unified app at `/pos`), tenant-zone only — `sinaicamps.com/pos` is a branded 404 by zone design
- Products, Orders, Customers, Inventory, Staff, Reports, Shifts; cashier shift open/close; cart/checkout with local payment methods (e-wallet, Instapay, cash — recorded pending, manager verifies)
- Role-based access (cashier, staff, manager, admin) via `pos_token`

### Internationalization (status)
- The frontend is **intentionally hard-coded English LTR**. Arabic RTL was planned (T11) and **cancelled** as a deliberate product decision — there is no `app/src/i18n/`, no locale middleware, no `sc_lang` cookie. See `docs/DEVELOPER_ROADMAP.md` for the reasoning.

---

## Getting Started

Full setup: [`docs/QUICK_START.md`](docs/QUICK_START.md).

### Prerequisites
- Node.js 20+, npm
- `wrangler` (installed per-package) + a Cloudflare login for remote D1/KV
- `JWT_SECRET` for the backend (no fallback — auth throws immediately if unset)

### 1. Start the Backend API (Layer 2)

```bash
cd backend
npm install

# Apply local database migrations (Layer 3)
npx wrangler d1 migrations apply campmaster-db --local

# Start the dev worker on port 8787
npx wrangler dev --port 8787
```

### 2. Start the Frontend (Layer 1)

```bash
cd app
npm install
npm run dev        # http://localhost:4321 (Astro default), proxies /api/* → :8787
```

> Playwright's E2E webServer boots its own Astro instance on `:4320` — plain `npm run dev` stays on `:4321`.

### 3. Run Tests

```bash
# Backend unit + POS integration tests (1082 tests / 36 files)
cd backend && npx vitest run

# Frontend app unit tests (1465 tests / 74 files)
cd app && npx vitest run

# Root integration tests (169 tests / 10 files)
npx vitest run

# E2E tests (566 total — 552 gate passing · 14 env-skipped in CI mode; boots wrangler dev + astro dev)
CI=true npx playwright test
```

---

## Deployment

```bash
./deploy.sh            # full deploy: D1 backup → migrations → backend → frontend
./deploy.sh --backend  # backend Worker + migrations only
./deploy.sh --frontend # frontend build + Pages deploy only
./deploy.sh --staging  # staging environment (validates [env.staging] first)
./deploy.sh --no-health  # skip health checks (emergency)
```

**What deploys where (the isolation in action):**

| Artifact | Goes to | Serves |
|---|---|---|
| `backend/` | Cloudflare **Worker** `campmaster-backend` | `sinaicamps.com/api/*` + `*.sinaicamps.com/api/*` (Worker routes) |
| `app/` (build) | Cloudflare **Pages** project `campmaster-marketplace` | everything else on the zone + custom domains |
| D1 migrations | `campmaster-db` (remote) | only reachable inside the Worker |

**Output URLs:**
- Frontend / marketplace: `https://sinaicamps.com`
- Admin: `https://sinaicamps.com/admin`
- POS (tenant-only): `https://acaciacamp.com/pos` (sinaicamps.com/pos is a branded 404 by zone design)
- **API: `https://sinaicamps.com/api/*`** (same-origin; not a separate subdomain)

---

## API Endpoints

> The API is the **only** connection between frontend and backend. All routes are under `/api/*` and are rate-limited; public read routes are allowlisted, everything else requires JWT + tenant context (enforced by the catch-all in `backend/src/index.js`).
> The authoritative machine-readable contract is `backend/openapi.json` (regenerate with `cd backend && npm run gen:openapi`; typed client with `cd app && npm run gen:types`). See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login (email/password) |
| POST | `/api/auth/register` | Self-service staff registration |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset with token |
| POST | `/api/auth/change-password` | Change password (authenticated) |
| GET | `/api/me` | Get current user profile |
| GET | `/api/auth/me` | Admin user data (JWT required) |

### Public Data (allowlisted GET)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tenants` | List camps/tenants |
| GET | `/api/tenants/:slug` | Tenant details (SSR fetches this for tenant pages) |
| GET | `/api/camps` | List camps with details |
| GET | `/api/products` | List products |
| GET | `/api/rooms` | List rooms |
| GET | `/api/rateplans` | List rate plans |
| GET | `/api/availability` | Check room availability |
| GET | `/api/meals` | List meals |
| GET | `/api/categories` | List product categories |
| GET | `/api/meal-categories` | List meal categories |
| GET | `/api/orders/status/:id` | Order status |
| GET | `/api/orders/calculate-price` | Calculate order price |
| POST | `/api/leads` | Submit a booking lead |
| POST | `/api/contact` | Contact form |
| POST | `/api/orders` | Create order |

### Admin (JWT required)
CRUD for `/api/camps/*`, `/api/rooms/*`, `/api/rateplans/*`, `/api/reservations/*`, `/api/staff/*`, `/api/expenses/*`, `/api/inventory/*`, `/api/meals/*`, `/api/meal-schedules/*`, `/api/meal-categories/*`, `/api/categories/*`, `/api/plans/*`, `/api/financial/*`, `/api/reports/*`, plus `/api/payments/create-intent`, `/api/payments/confirm`, `/api/payments/webhook`.

### POS (`pos_token` required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pos/auth/login` | POS login |
| GET | `/api/pos/dashboard` | POS dashboard |
| GET/POST | `/api/pos/products`, `/api/pos/orders`, `/api/pos/shifts/*` | POS operations |

---

## Database

One Cloudflare D1 database (`campmaster-db`, **53 numbered migrations** in `backend/migrations/`, head `0053_camp_ownership.sql`). Only the backend Worker touches it. Key tables:

| Table | Purpose |
|-------|---------|
| `tenants` | Camp organizations with branding |
| `camps` | Individual camp locations |
| `products`, `rooms`, `rate_plans`, `categories`, `meal_categories` (+ `_lang`) | Catalog / pricing tables |
| `pos_users` | All users (admins, staff, cashiers) — `name` is GENERATED (`first_name || ' ' || last_name`) |
| `pos_transactions` / `pos_transaction_items` | POS sales and line items (staff ref is `cashier_id`) |
| `pos_shifts` | Cashier shift open/close records |
| `orders` | Guest bookings (replaces legacy `reservations`) |
| `leads` | Booking lead captures |
| `plans_new` | Activity planning records |

Gotchas and migration workflow: [`docs/MIGRATION_GUIDE.md`](docs/MIGRATION_GUIDE.md) or the `db-migration` skill.

---

## Rate Limiting & KV (Free-Plan Warning)

- Rate limiting is distributed by default via the `RATE_LIMIT_KV` namespace (1 KV write per request).
- The Cloudflare **free plan caps KV writes at 1,000/day** — sustained API traffic exhausts it, and the limiter fails **closed** (`429 Rate limit check failed`) until the quota resets. This hit production on 2026-08-03.
- A toggle `RATE_LIMIT_KV_ENABLED` (`backend/wrangler.toml` `[vars]`) switches to the **in-memory per-isolate fallback** (zero KV writes). It is currently set to `"false"`; set it to `"true"` only after upgrading to **Workers Paid** (1M writes/day) or otherwise eliminating the quota constraint.
- `KV_CACHE` is bound but **never written** — read caching for public marketplace responses is done with `Cache-Control` headers (`cachedJsonResponse` in `backend/src/utils/response.js`), which costs no KV writes.

---

## Credentials

Production admin credentials are **not stored in this repository** — they live in the owner's vault (rotated 2026-08-13). The two production accounts are:

| Account | Role |
|---------|------|
| `admin@sinaicamps.com` | Super Admin |
| `admin@acaciacamp.com` | Tenant Admin (Acacia Camp) |

Dev-only seed accounts (e.g. `sinairoot`/`superoot`/`sinaiadmin` defaults) are created by the seed migration for local testing — never use them in production.

---

## License

Private — SinaiCamps / CampMaster Pro
