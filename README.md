# SinaiCamps — Multi-Tenant Camp Management Platform

A full-stack serverless SaaS platform for managing summer camps, wilderness lodges, and outdoor adventure facilities. Each camp runs an SEO-optimized public website with WhatsApp booking, backed by a unified admin dashboard and POS terminal.

**Production:** [sinaicamps.com](https://sinaicamps.com) · **Repo:** [Michaelhehelmy/campops-marketplace](https://github.com/Michaelhehelmy/campops-marketplace)

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
│  1. FRONTEND  (app/ — Astro + React + Tailwind)                     │
│     • Renders UI only (public marketplace, tenant sites, admin, POS)│
│     • Performs SSR + client-side rendering                          │
│     • NEVER talks to the database directly                          │
│     • Only connection to the outside world: the HTTP API            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP JSON (fetch via app/src/lib/api.ts)
                                │ same-origin /api/* (proxied in dev)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. API + BACKEND (backend/ — Hono on Cloudflare Workers)           │
│     • The ONLY entry point to business logic and data               │
│     • Auth (JWT), RBAC, tenant scoping, rate limiting, validation   │
│     • Route handlers in src/api + src/routes/pos                    │
│     • Never renders UI                                               │
└───────────┬──────────────────────────────────┬──────────────────────┘
            │ D1 binding (env.DB)              │ KV bindings
            ▼                                  ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│  3. DATABASE              │   │  4. CACHE / RATE LIMITING     │
│     Cloudflare D1 (SQLite)│   │     Cloudflare KV             │
│     • Only the backend    │   │     • RATE_LIMIT_KV (toggle)  │
│       worker may query it │   │     • KV_CACHE (reserved)     │
│     • Migrations only via │   │     • Never read by frontend  │
│       backend/migrations/ │   └───────────────────────────────┘
└───────────────────────────┘
```

### The Isolation Contract

| Layer | What it does | What it is NOT allowed to do | How it connects |
|---|---|---|---|
| **1. Frontend** (`app/`) | Render UI, collect input, call API, i18n, zone routing | ❌ Never import backend code · ❌ Never query D1/KV · ❌ Never hold secrets | → API via `app/src/lib/api.ts` (unified client, 100+ endpoints) over HTTP JSON |
| **2. API + Backend** (`backend/`) | Auth, business logic, validation, data access, rate limiting | ❌ Never render UI · ❌ Never expose D1/KV bindings to the outside | → D1 via `env.DB` binding (prepared statements) · → KV via `RATE_LIMIT_KV`/`KV_CACHE` bindings |
| **3. Database** (Cloudflare D1) | Persist all data (SQLite at the edge) | ❌ No public access — reachable only inside the Worker runtime | ← backend only, via `.prepare().bind().all()` |
| **4. Cache / Rate Limiting** (Cloudflare KV) | Distributed rate-limit state + cache | ❌ Not an API surface · ❌ Never a source of truth | ← backend only, via Worker bindings |

### How they are physically connected

- **Frontend ↔ Backend**: In production both live on the same zone (`sinaicamps.com`). Cloudflare **Worker routes** send `/api/*` to the `campmaster-backend` Worker; everything else is served by the Pages build of the frontend. In dev, Astro's dev server proxies `/api/*` to `wrangler dev` on `:8787`. The API client (`app/src/lib/api.ts`) is the single shared contract — one function per endpoint, typed responses.
- **Backend ↔ Database**: D1 binding `env.DB` (`campmaster-db`) declared in `backend/wrangler.toml`. Every schema change is a numbered migration in `backend/migrations/` applied with `wrangler d1 migrations apply`. No ORM — parameterized SQL.
- **Backend ↔ KV**: `RATE_LIMIT_KV` (rate limiting) and `KV_CACHE` (reserved cache) bindings in `backend/wrangler.toml`. Rate limiting is **KV-backed with an in-memory fallback** (see [Rate Limiting & KV](#rate-limiting--kv-free-plan-warning)).
- **Tenant isolation is enforced twice**: `app/src/middleware/tenant.ts` resolves the tenant/zone for rendering, and `backend/src/middleware/` re-validates tenant context + JWT on every API call. The frontend can never bypass the backend's checks.

---

## Directory Structure

```
sinaicamps/
├── app/                        Layer 1 — Unified frontend (Astro + React + Tailwind)
│   └── src/
│       ├── components/         React components
│       │   ├── admin/          Admin dashboard panels (14 panels)
│       │   ├── pos/            POS terminal pages (8 pages)
│       │   ├── public/         Public components (ZoneGuard, TenantLanding, CampsSection…)
│       │   ├── ui/             Shared UI (DataTable, StatCard, etc.)
│       │   ├── feedback/       Toast notifications
│       │   ├── forms/          Form components
│       │   └── tables/         Table components
│       ├── layouts/            Astro layouts (Public, Admin, POS)
│       ├── pages/              Route pages
│       │   ├── index.astro     Marketplace home (zone-aware)
│       │   ├── camps.astro     Marketplace /camps listing
│       │   ├── camp/[id]/      Camp detail (book, menu, …)
│       │   ├── book|menu|rooms|about|contact|faq|gallery
│       │   ├── admin/[...rest]/  Admin SPA host
│       │   └── pos/[...rest]/    POS SPA host
│       ├── lib/                Shared modules
│       │   ├── api.ts          Unified API client (100+ endpoints) — THE contract
│       │   ├── routeZones.ts   Zone model (marketplace | tenant) — single source of truth
│       │   ├── auth.tsx        React auth context + role hierarchy
│       │   └── utils.ts        escHtml, formatCurrency, cn, …
│       ├── hooks/              React hooks (useI18n, useAdminData)
│       ├── i18n/               Translations (en.json, ar.json)
│       ├── middleware/         Astro middleware (tenant resolution, zone)
│       └── styles/             Global Tailwind CSS
│
├── backend/                    Layer 2 — Cloudflare Worker API (Hono + D1 + KV)
│   └── src/
│       ├── index.js            Hono app entry (CORS, routes, middleware, catch-all auth)
│       ├── api/                Route handlers (auth, camps, tenants, reservations, …)
│       ├── routes/pos/         POS routes (products, orders, shifts, customers, …)
│       ├── middleware/         Auth, RBAC, rate limiting, tenant
│       ├── services/           Business logic
│       └── utils/              Response helpers, error handling
│   └── migrations/             Layer 3 — D1 schema migrations (39 numbered files)
│
├── tests/                      All test suites
│   ├── unit/                   Backend unit tests
│   ├── pos/                    POS integration tests
│   ├── e2e/                    Playwright E2E specs (marketplace, tenant, admin, pos,
│   │                           auth, cross-cutting, routing, production)
│   └── *.test.js               Integration tests
│
├── deploy.sh                   Single-command deployment
├── playwright.config.ts        E2E configuration (local)
└── playwright.prod.config.ts   E2E configuration (production)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **1. Frontend** | Astro 4.x + React 18 + Tailwind CSS v3 (TypeScript) |
| **2. API / Backend** | Hono on Cloudflare Workers (JavaScript) |
| **3. Database** | Cloudflare D1 (SQLite) — `campmaster-db` |
| **4. Cache / Rate Limiting** | Cloudflare KV (`RATE_LIMIT_KV`, `KV_CACHE`) |
| **Auth** | JWT (HS256) + bcrypt password hashing |
| **Unit Tests** | Vitest (backend 797 · frontend 1241 · integration 166) |
| **E2E Tests** | Playwright (447 passing · 10 skipped) |
| **Deployment** | Cloudflare Pages (frontend) + Cloudflare Workers (API) via `deploy.sh` |

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
- Camp detail pages with JSON-LD structured data and SEO meta tags
- Self-serve camp onboarding registration form

### Camp Tenant Portals (`/`, `/book`, `/menu`, `/rooms`, `/about`, …)
- SEO-optimized pages with camp-specific branding (colors, logo, description)
- WhatsApp booking lead generator with real-time pricing
- JSON-LD `Campground` structured data

### Admin Dashboard (`/admin`)
- Hash-routed React SPA with 14 management panels
- Dashboard, Camps, Rooms, Rate Plans, Reservations, Staff
- Expenses, Inventory, Meals, Planning, Reports, Financial, Settings
- Camp filter for multi-camp operators + Super Admin mode

### POS Terminal (`/pos`)
- Standalone React SPA: Products, Orders, Customers, Inventory, Staff, Reports, Shifts
- Collapsible sidebar, dark theme, role-based access (cashier, staff, manager, admin)

### Internationalization
- English and Arabic with RTL layout; language switcher in public, admin, and POS
- 130+ translation keys across 8 domains

---

## Getting Started

### Prerequisites
- Node.js 20+, npm
- `wrangler` (installed per-package) + a Cloudflare login for remote D1/KV

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
npm run dev        # http://localhost:4320, proxies /api/* → :8787
```

### 3. Run Tests

```bash
# Backend unit + POS integration tests (797 tests)
cd backend && npx vitest run

# Frontend app unit tests (1241 tests)
cd app && npx vitest run

# Root integration tests (166 tests)
npx vitest run

# E2E tests (447 passed / 10 skipped — boots wrangler dev + astro dev)
npx playwright test
```

---

## Deployment

```bash
./deploy.sh            # full deploy: D1 backup → migrations → backend → frontend
./deploy.sh --backend  # backend Worker + migrations only
./deploy.sh --frontend # frontend build + Pages deploy only
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

### POS (JWT required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pos/auth/login` | POS login |
| GET | `/api/pos/dashboard` | POS dashboard |
| GET/POST | `/api/pos/products`, `/api/pos/orders`, `/api/pos/shifts/*` | POS operations |

---

## Database

One Cloudflare D1 database (`campmaster-db`, 39 migrations in `backend/migrations/`). Only the backend Worker touches it. Key tables:

| Table | Purpose |
|-------|---------|
| `tenants` | Camp organizations with branding |
| `camps` | Individual camp locations |
| `products` / `rooms_new` | Room types, inventory items, menu items |
| `pos_users` | All users (admins, staff, cashiers) — `name` is GENERATED |
| `pos_transactions` / `pos_transaction_items` | POS sales and line items |
| `pos_shifts` | Cashier shift open/close records |
| `orders` | Guest bookings (replaces legacy `reservations`) |
| `leads` | Booking lead captures |
| `plans_new` | Activity planning records |
| `meal_categories` / `categories` (+ `_lang`) | Localized categories |

---

## Rate Limiting & KV (Free-Plan Warning)

- Rate limiting is distributed by default via the `RATE_LIMIT_KV` namespace (1 KV write per request).
- The Cloudflare **free plan caps KV writes at 1,000/day** — sustained API traffic exhausts it, and the limiter fails **closed** (`429 Rate limit check failed`) until the quota resets.
- A toggle `RATE_LIMIT_KV_ENABLED` (`backend/wrangler.toml` `[vars]`) switches to the **in-memory per-isolate fallback** (zero KV writes). It is currently set to `"false"`; set it to `"true"` only after upgrading to **Workers Paid** (1M writes/day) or otherwise eliminating the quota constraint.
- `KV_CACHE` is bound but currently unused in code.

---

## Default Credentials (Testing)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `superadmin@sinaicamps.com` | `admin123` |
| Camp Admin | `admin1@camp.com` | `admin123` |
| POS Cashier | `cashier@camp.com` | `admin123` |

---

## License

Private — SinaiCamps / CampMaster Pro
