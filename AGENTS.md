# SinaiCamps — OpenCode Developer Guidelines

This file is the primary system prompt instruction manual for OpenCode agents working inside this project. Read this thoroughly before analyzing code or proposing changes.

---

## 1. Project Specifications

| Property | Value |
| --- | --- |
| **Project Name** | SinaiCamps |
| **Developer** | Michael Helmy |
| **Github** | [Michaelhehelmy/campops-marketplace](https://github.com/Michaelhehelmy/campops-marketplace) |
| **Production URL** | [sinaicamps.com](https://sinaicamps.com) (staging: `staging.sinaicamps.com` via `./deploy.sh --staging`) |
| **Frontend** | Astro 5.18.x + React 19.2.x + Tailwind CSS v4 |
| **Backend** | Hono on Cloudflare Workers |
| **Language** | TypeScript (frontend), JavaScript (backend) |
| **Database** | Cloudflare D1 (SQLite) |
| **Cache** | Cloudflare KV |
| **Unit Test Framework** | Vitest |
| **E2E Test Framework** | Playwright |
| **Package Manager** | npm |

---

## 2. Project Structure

> **Architecture rule**: four isolated layers connected by a strict contract — **Frontend** (`app/`, UI only) → **API** (`/api/*` on the backend Worker, the only entry point) → **Database** (D1, backend-only) and **Cache/Rate-Limit** (KV, backend-only). The frontend NEVER touches D1/KV directly. See `README.md` → "Architecture: Isolated but Connected" for the full contract.

```
sinaicamps/
├── app/                    Unified frontend (Layer 1 — UI only)
│   └── src/
│       ├── components/     React components
│       │   ├── admin/      Admin dashboard panels (14 panels)
│       │   ├── pos/        POS terminal pages (8 pages)
│       │   ├── public/     Public components (ZoneGuard, TenantLanding, CampsSection…)
│       │   ├── ui/         Shared UI (DataTable, StatCard, etc.)
│       │   ├── feedback/   Toast notifications
│       │   ├── forms/      Form components
│       │   ├── layout/     Layout helpers
│       │   └── tables/     Table components
│       ├── layouts/        Astro layouts (Public, Admin, POS)
│       ├── pages/          Route pages
│       │   ├── index.astro           Marketplace home (zone-aware)
│       │   ├── camps.astro           /camps listing
│       │   ├── camp/[id]/            Camp detail
│       │   ├── rooms/about/...       Tenant pages
│       │   ├── admin/[...rest]/      Admin SPA host
│       │   └── pos/[...rest]/        POS SPA host
│       ├── lib/            Shared modules
│       │   ├── api.ts      Unified API client (100+ endpoints) — the frontend↔backend contract
│       │   ├── routeZones.ts  Zone model (marketplace|tenant) — single source of truth
│       │   ├── auth.tsx    React auth context + role hierarchy
│       │   └── utils.ts    escHtml, formatCurrency, cn, etc.
│       ├── hooks/          React hooks (useI18n, useAdminData)
│       ├── i18n/           Translations (en.json, ar.json)
│       ├── middleware/     Tenant resolution middleware (+ zone/routeForbidden locals)
│       └── styles/         Global Tailwind CSS
│
├── backend/                Cloudflare Worker API (Layer 2 — Hono + D1 + KV)
│   └── src/
│       ├── index.js        Hono app entry (CORS, routes, middleware, auth catch-all)
│       ├── api/            Route handlers (9 modules)
│       ├── routes/pos/     POS routes (8 modules)
│       ├── middleware/      Auth, RBAC, rate limiting, tenant
│       ├── services/       Business logic
│       └── utils/          Response helpers, error handling
│   └── migrations/         D1 schema migrations (53 files — Layer 3)
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

---

## 3. Key Gotchas & Persistent Learnings

Read `AGENT_LOGBOOK.md` at the start of every session for the full list. Critical items:

- **`pos_users.name`** is a GENERATED column (`first_name || ' ' || last_name`). INSERT with `first_name`/`last_name` only.
- **`pos_users.organization_id`** is `INTEGER NOT NULL` — ALL INSERTs must include it.
- **`pos_transactions`** uses `cashier_id` (not `staff_id`) for staff references.
- **JWT Secret** has no fallback — `env.JWT_SECRET` must be set or auth throws immediately.
- **Rate limiter** uses KV storage with `cf-connecting-ip` only (not spoofable `x-forwarded-for`), and **fails closed** (`429 Rate limit check failed`) when KV errors.
- **Free-plan KV quota**: Cloudflare free plan = **1,000 KV writes/day**. A KV write per API request exhausts it → full API outage until reset. `RATE_LIMIT_KV_ENABLED="false"` (current, in `backend/wrangler.toml` `[vars]`) forces the in-memory fallback; set to `"true"` only on a plan with enough KV quota.
- **Response headers** must NOT set CORS — `hono/cors` in `index.js` is the single source of truth.
- **Admin SPA** uses global JS (no modules) — `window.*` globals for cross-file access.
- **Hono wildcards** require `/*` syntax, not `/path*` (treats `*` as literal).
- **Zone model** (`app/src/lib/routeZones.ts`): every route resolves to `marketplace` or `tenant`; `/camps /camp/*` are marketplace-only; `/book /menu /rooms` AND `/pos /pos/*` are tenant-only (POS is an operations app — sinaicamps.com/pos renders a branded 404, tenant hosts like acaciacamp.com/pos serve the SPA); system prefixes (`/admin /api /auth /register /login /robots.txt /sitemap.xml /404 /_astro /favicon`) never forbidden; forbidden routes render a branded 404 (ZoneGuard) — exact-path matching (siblings like `/bookings` are NOT forbidden).
- **Astro zone guards** must be template ternaries (`{ forbidden ? <ZoneGuard /> : (...) }`), never a frontmatter `return` of JSX; skip the tenant fetch when a route is forbidden and do NOT `return Astro.redirect('/404')` on `!tenant` before the guard renders.
- **E2E tenant pages** hang on `load` in astro dev (logo/favicon point at dead `localhost:8001`) — zone/E2E specs use `page.goto(url, { waitUntil: 'domcontentloaded' })`.
- **`wrangler tail`** requires `--config backend/wrangler.toml` (plain `wrangler tail campmaster-backend` errors "Pages project").

---

## 4. Agent Model — Dynamic Task Decomposition

### Meta-Agents (always available)

- **@orchestrator** — Entry point for non-trivial tasks. Decomposes into atomic subtasks, spawns tmp agents, executes in dependency order.
- **@skill-builder** — Creates reusable skill guides in `.opencode/skills/<category>/`.

### Role Agents

- **@frontend** — Responsive pages, forms, auth-aware rendering, API routes.
- **@backend** — Hono routes, middleware, services, Cloudflare Workers.
- **@db** — Migrations, indexes, schemas, query optimization.
- **@qa** — Test coverage, visual regression, smoke testing.
- **@deploy** — Local builds, environment packaging, server deployment.
- **@security-auditor** — Secrets scanning, vulnerability checks, dependency CVEs.
- **@performance-profiler** — Bundle analysis, Lighthouse, SQL optimization.
- **@docs-generator** — API documentation, OpenAPI specs, project docs.

---

## 5. General Implementation Checklist

1. **Plan**: Analyze the task, read relevant code, use `sequential-thinking` MCP.
2. **Execute**: Modify files following the project design system. Use `escHtml()` for user data.
3. **Verify**: Run `cd app && npx vitest run` (frontend) or `cd backend && npx vitest run` (backend).
4. **Safety**: No credentials, log dirs, or secret tokens left unstaged.

---

## 6. Running Tests

```bash
# Frontend unit tests (1465 tests / 74 files)
cd app && npx vitest run

# Backend unit tests (1082 tests / 36 files)
cd backend && npx vitest run

# POS integration tests
cd backend && npx vitest run tests/pos/

# Root integration tests (169 tests / 10 files)
npx vitest run

# E2E tests (566 total — 14 env-skipped in CI mode; boots both servers)
CI=true npx playwright test
```

---

## 7. Deployment

```bash
./deploy.sh
```

Deploys backend Worker + D1 migrations, then builds and deploys the unified frontend to Cloudflare Pages.

---

## 8. Persistent Memory (`AGENT_LOGBOOK.md`)

- **Read** `AGENT_LOGBOOK.md` at the start of every task.
- **Update** it when you finish a task (date, files changed, lessons learned).
- **Document** recurring gotchas in the "Persistent Learnings" section.
