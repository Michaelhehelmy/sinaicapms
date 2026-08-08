# Project Context — SinaiCamps

This document details the architecture, data models, and structures for **SinaiCamps**.

---

## 1. Stack and Environment

- **Frontend Framework**: Astro 4.x + React 18
- **Backend**: Hono on Cloudflare Workers
- **Language**: TypeScript (frontend), JavaScript (backend)
- **Database**: Cloudflare D1 (SQLite on the edge)
- **Cache**: Cloudflare KV
- **Styling**: Tailwind CSS v3
- **Unit Testing**: Vitest
- **E2E Testing**: Playwright
- **Package Manager**: npm
- **Deployment**: `deploy.sh` (wrangler for backend + Cloudflare Pages for frontend)

---

## 2. Core Architecture — Isolated but Connected

SinaiCamps is **four isolated layers connected by a strict contract**. Each layer is independently developed, tested, and deployed; none touches another layer's internals.

| # | Layer | Where | Isolated by | Connected by |
|---|-------|-------|-------------|--------------|
| 1 | **Frontend** | `app/` (Astro + React + Tailwind) | Renders UI only; no DB/KV access | HTTP JSON to the API via `app/src/lib/api.ts` |
| 2 | **API + Backend** | `backend/` (Hono Worker) | The only entry point; no UI | Worker routes: `sinaicamps.com/api/*` + `*.sinaicamps.com/api/*` → `campmaster-backend` |
| 3 | **Database** | Cloudflare D1 (`campmaster-db`) | Reachable only inside the Worker runtime | `env.DB` binding + parameterized SQL (`backend/src/`, migrations in `backend/migrations/`) |
| 4 | **Cache / Rate Limit** | Cloudflare KV (`RATE_LIMIT_KV`, `KV_CACHE`) | Never an API surface; never a source of truth | Worker bindings only (`backend/wrangler.toml`) |

**Rules enforced across the codebase:**
- The frontend NEVER imports backend code and NEVER queries D1/KV directly — every data access goes through `/api/*`.
- The API is the single frontend↔backend contract: one endpoint per operation, typed via the client in `app/src/lib/api.ts`.
- The backend NEVER renders UI; it validates auth (JWT), RBAC, tenant scope, and inputs before touching data.
- Tenant isolation is enforced **twice**: `app/src/middleware/tenant.ts` (rendering zone) and `backend/src/middleware/` (data access).

### Zone Model (marketplace | tenant)

Every route resolves to a zone via `app/src/lib/routeZones.ts` (single source of truth, with unit tests):
- `resolveZone(url, tenantId)` → `'marketplace'` (no/`marketplace` tenant) or `'tenant'` (real tenant).
- `isRouteForbidden`: `/camps /camp /camp/*` forbidden when zone ≠ marketplace; `/book /menu /rooms` forbidden when zone ≠ tenant; `/ /about /contact /faq /gallery` never forbidden; system prefixes (`/admin /pos /api /auth /register /login /robots.txt /sitemap.xml /404 /_astro /favicon`) never forbidden. **Exact-path matching** — siblings like `/bookings`, `/rooms/extra`, `/camps/other` are NOT forbidden.
- Forbidden routes render a branded 404 via `ZoneGuard`; Astro guards are template ternaries, never a frontmatter JSX `return`, and the tenant fetch is skipped when forbidden (no `Astro.redirect('/404')` on `!tenant` before the guard).

### Rate Limiting & KV (production lesson)

`backend/src/middleware/rateLimit.js` is KV-backed (distributed) with an in-memory per-isolate fallback and **fail-closed** behavior on KV errors. The Cloudflare **free plan caps KV writes at 1,000/day** — a KV write per API request exhausts it and every API call returns `429 Rate limit check failed` (this happened in production 2026-08-03). The `RATE_LIMIT_KV_ENABLED` var (`"false"` in `backend/wrangler.toml`) forces the in-memory fallback (zero KV writes). Only set it to `"true"` on a plan with adequate KV quota.

---

## 3. Directory Layout Guidelines

When creating or modifying files, follow the project convention:

```
sinaicamps/
├── app/                    Unified frontend (Layer 1 — UI only)
│   └── src/
│       ├── components/     React components
│       │   ├── admin/      Admin dashboard panels
│       │   ├── pos/        POS terminal pages
│       │   ├── public/     Public components (ZoneGuard, TenantLanding, CampsSection…)
│       │   ├── ui/         Shared UI (DataTable, StatCard, etc.)
│       │   └── ...
│       ├── layouts/        Astro layouts (Public, Admin, POS)
│       ├── pages/          Route pages
│       │   ├── index.astro           Marketplace home (zone-aware)
│       │   ├── camps.astro           /camps listing
│       │   ├── camp/[id]/            Camp detail
│       │   ├── admin/[...rest]/      Admin SPA host
│       │   └── pos/[...rest]/        POS SPA host
│       ├── lib/            Shared modules (api.ts, routeZones.ts, auth.tsx, utils.ts)
│       ├── hooks/          React hooks (useI18n, useAdminData)
│       ├── i18n/           Translations (en.json, ar.json)
│       ├── middleware/     Tenant resolution middleware (+ zone/routeForbidden locals)
│       └── styles/         Global Tailwind CSS
│
├── backend/                Cloudflare Worker API (Layer 2 — Hono + D1 + KV)
│   └── src/
│       ├── index.js        Hono app entry (CORS, routes, middleware, auth catch-all)
│       ├── api/            Route handlers
│       ├── routes/pos/     POS routes
│       ├── middleware/      Auth, RBAC, rate limiting, tenant
│       ├── services/       Business logic
│       └── utils/          Response helpers, error handling
│   └── migrations/         D1 schema migrations (Layer 3)
│
├── tests/                  All test suites
│   ├── unit/               Backend unit tests
│   ├── pos/                POS integration tests
│   ├── e2e/                Playwright E2E specs
│   └── *.test.js           Integration tests
│
├── deploy.sh               Single-command deployment
└── playwright.config.ts    E2E configuration
```

- **Pages/Routes**: `app/src/pages/` (Astro pages, including SPA hosts for admin/pos)
- **Components**: `app/src/components/` (React components organized by feature)
- **Hooks**: `app/src/hooks/` (React hooks)
- **Database Migrations**: `backend/migrations/` (SQL migration files applied via wrangler)
- **E2E Tests**: `tests/e2e/` (Playwright specs)
- **Unit Tests**: `tests/unit/` (backend) and `tests/pos/` (POS integration)

---

## 4. Dynamic Configuration & Auth Architecture

To support the no-hardcoding requirement, the project leverages:
- **Database Configuration Stores**: App settings, branding colors, listing attributes, and copy text reside in Cloudflare D1 tables (e.g., tenant or property tables).
- **Authentication State**: Handled via `app/src/lib/auth.tsx` (React auth context + role hierarchy). JWT-based auth with `env.JWT_SECRET` required. No external auth library — custom middleware in `backend/src/middleware/` validates tokens.
- **API and CRUD Endpoints**: All UI settings are updated by triggering authenticated Hono API endpoints. Verify validation is enforced and queries are properly scoped by tenant ID context.
- **Caching**: Cloudflare KV is used for rate limiting (toggleable via `RATE_LIMIT_KV_ENABLED`) and is reserved for frequently-accessed read data (`KV_CACHE`). The frontend never reads KV directly.
