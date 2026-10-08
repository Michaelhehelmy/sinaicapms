# SinaiCamps — OpenCode Developer Guidelines

This file is the primary system prompt instruction manual for OpenCode agents working inside this project. Read this thoroughly before analyzing code or proposing changes.

---

## 1. Project Specifications

| Property | Value |
| --- | --- |
| **Project Name** | SinaiCamps |
| **Developer** | Michael Helmy |
| **Github** | private. The configured remote is `https://github.com/Michaelhehelmy/sinaicapms.git` (`git remote get-url origin`) — earlier docs and this table called the repo `campmaster`, which no longer matches the remote. |
| **Production URL** | [sinaicamps.com](https://sinaicamps.com) (staging: `staging.sinaicamps.com` via `./deploy.sh --staging`) |
| **Frontend** | Astro 7.3.1 + React 19.2.x + Tailwind CSS v4 |
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
│       │   ├── admin/      Admin dashboard panels (63 files, 46 nav tabs, + SPA host)
│       │   ├── pos/        POS terminal (11 views under components/pos/views/)
│       │   ├── public/     Public components (ZoneGuard, TenantLanding, CampsSection…)
│       │   ├── ui/         Shared UI primitives (20 files: DataTable, StatCard, SafeImage…)
│       │   ├── feedback/   Toast notifications
│       │   ├── forms/      Form components
│       │   ├── layout/     Layout helpers
│       │   └── tables/     Table components
│       ├── layouts/        Astro layouts (Public, Admin, POS)
│       ├── pages/          Route pages
│       │   ├── index.astro           Marketplace home (zone-aware)
│       │   ├── camps.astro           /camps listing
│       │   ├── camp/[id]/            Camp detail (index, book, menu)
│       │   ├── book|menu|rooms|about|contact|faq|gallery  Tenant/public pages
│       │   ├── admin/[...rest]/      Admin SPA host
│       │   └── pos/[...rest]/        POS SPA host
│       ├── lib/            Shared modules
│       │   ├── api.ts      Unified API client (287 exported functions) — the frontend↔backend contract
│       │   ├── api-types.ts  Generated types (from backend/openapi.json)
│       │   ├── routeZones.ts  Zone model (marketplace|tenant) — single source of truth
│       │   ├── auth.tsx    React auth context + role hierarchy
│       │   ├── sse.ts      SSE client (Durable Object broadcast)
│       │   └── utils.ts    escHtml, formatCurrency, cn, etc.
│       ├── hooks/          React hooks — exactly 5 files: useAdminData, usePosQueries,
                   useQueryHooks, useSseInbox, useSseOrders
│       ├── middleware/     Tenant resolution middleware (+ zone/routeForbidden locals)
│       └── styles/         Global Tailwind CSS
│
├── backend/                Cloudflare Worker API (Layer 2 — Hono + D1 + KV)
│   └── src/
│       ├── index.js        Hono app entry (CORS, routes, middleware, auth catch-all)
│       ├── api/            Route handlers (57 modules — one file per sub-router/service)
│       ├── routes/pos/     POS routes (ONE module, routes/pos/index.js — 10 routes)
│       ├── middleware/      Auth, RBAC, rate limiting, tenant
│       ├── services/       Business logic
│       └── utils/          Response helpers, error handling
│   └── migrations/         D1 schema migrations (40 top-level .sql, head
                       0127_meals_tenant_composite_pk.sql — Layer 3; `legacy/` is excluded
                       archaeology, and 0127 is committed but NOT applied)
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

Read `AGENT_LOGBOOK.md` at the start of every session for the persistent-learnings list — it is
the **reference tier** and holds NO suite results and NO task history. Those moved to
`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` (9,800+ lines) in the 2026-10-06 restructure,
so **the number to quote in a doc lives there**. Critical items:

- **`pos_users.name`** is a GENERATED column (`first_name || ' ' || last_name`). INSERT with `first_name`/`last_name` only.
- **`pos_users.organization_id`** is `INTEGER NOT NULL` — ALL INSERTs must include it.
- **`pos_transactions`** uses `cashier_id` (not `staff_id`) for staff references.
- **JWT Secret** has no fallback — `env.JWT_SECRET` must be set or auth throws immediately.
- **Rate limiter** uses KV storage with `cf-connecting-ip` only (not spoofable `x-forwarded-for`), and **fails closed** (`429 Rate limit check failed`) when KV errors.
- **Free-plan KV quota**: Cloudflare free plan = **1,000 KV writes/day**. A KV write per API request exhausts it → full API outage until reset. `RATE_LIMIT_KV_ENABLED="false"` (current, in `backend/wrangler.toml` `[vars]`) forces the in-memory fallback; set to `"true"` only on a plan with enough KV quota.
- **Response headers** must NOT set CORS — `hono/cors` in `index.js` is the single source of truth.
- **Admin SPA** runs fully on TanStack Query — zero raw `fetch` data loads, zero `window.*` cross-file globals (migrated in T13). Admin "global" scripts are non-module for cross-file access where required, but data never bypasses `@/lib/api`.
- **Hono wildcards** require `/*` syntax, not `/path*` (treats `*` as literal).
- **Zone model** (`app/src/lib/routeZones.ts`): every route resolves to `marketplace` or `tenant`; `/camps /camp/*` are marketplace-only; `/book /menu /rooms` AND `/pos /pos/*` are tenant-only (POS is an operations app — sinaicamps.com/pos renders a branded 404, tenant hosts like acaciacamp.com/pos serve the SPA); system prefixes (`/admin /api /auth /register /login /robots.txt /sitemap.xml /404 /_astro /favicon`) never forbidden; forbidden routes render a branded 404 (ZoneGuard) — exact-path matching (siblings like `/bookings` are NOT forbidden).
- **Astro zone guards** must be template ternaries (`{ forbidden ? <ZoneGuard /> : (...) }`), never a frontmatter `return` of JSX; skip the tenant fetch when a route is forbidden and do NOT `return Astro.redirect('/404')` on `!tenant` before the guard renders.
- **E2E tenant pages** hang on `load` in astro dev (logo/favicon point at dead `localhost:8001`) — zone/E2E specs use `page.goto(url, { waitUntil: 'domcontentloaded' })`.
- **`wrangler tail`** requires `--config backend/wrangler.toml` (plain `wrangler tail campmaster-backend` errors "Pages project").
- **No i18n** — the frontend is hard-coded English LTR (Arabic RTL cancelled as a product decision; there is no `app/src/i18n/`).
- **Read caching is header-only**: `cachedJsonResponse` (backend/src/utils/response.js) sets `Cache-Control: public, max-age=300, stale-while-revalidate=600` (availability uses 60s). `KV_CACHE` is bound but NEVER written — do not add KV writes for caching (free-plan 1,000 writes/day quota).
- **Media lives in R2** (`MEDIA_BUCKET` = `campmaster-media`) and **SSE** broadcasts through the `BROADCASTER` Durable Object (admin inbox/orders) — bindings in `backend/wrangler.toml`.
- **Island discipline — 9 public-facing island sites, not 4** (re-counted 2026-10-06): `client:visible` ×6 (`TenantLanding.astro:203` CampBooking, `marketplace.astro:14` MarketplaceDirectory, and the four storefront pages `index:54` / `cart:52` / `checkout:53` / `order/[orderNumber]/confirmation:54`) + `client:load` ×3 (`BookPage.astro:45` ReservationSummary, `MenuPage.astro:48` TenantMenu, `PublicLayout.astro:778` debug-gated `DebugFeedbackWidget`) = **17 directive sites** in total, including 8 `client:only="react"` full-page SPA hosts. A raw `grep client:` over `app/src` reports 23; the 6 extras are comment mentions in `Storefront*.tsx` ×4, `PosShell.tsx`, `AdminShell.tsx`. **Default `client:visible` for content islands; `client:load` only for above-fold primary interactive content; `client:only` only for full-page SPA hosts. Add islands sparingly** (T15).
- **Browser AI runs client-side** (`app/src/lib/browser-ai.ts`, T15): models (Transformers.js `@huggingface/transformers@^4.2.0`) load in the admin's browser only when the Browser AI tab in the AI & Intelligence panel is used — lazy dynamic `import()` only, never top-level, so the ONNX runtime stays out of the main/admin bundle. Server math endpoints (`/api/ai/dynamic-price`, `/api/ai/forecast`, `/api/ai/anomaly`, rules/predictions CRUD) remain server-side (D1-backed); `/api/ai/workers-ai/*` and `/api/ai/state/*` stay honest 503 stubs (no `AI` or `STATE_DO` binding in `wrangler.toml`). **LaMini-Flan-T5-248M uses `text2text-generation` not `text-generation`** — this T5 encoder-decoder ships split ONNX files; `text-generation` silently fails with no consolidated model. Do NOT add KV/cache writes for model downloads (free-plan quota).
- **Tenant Import manifest** (`POST /api/tenants/import`, T1–T5): one camelCase JSON manifest imports tenant branding + products + rooms + rate plans + menu + POS users in a single admin call. Two modes: existing-tenant (requester's tenant, `admin`+ roles) vs **super-admin `identity` provisioning** — `identity: { name, subdomain, type, email, password (≥8), firstName, lastName, businessType? }` creates tenant + active admin + POS org (via `ensureTenantOrg`) + project in one 201 (403 for non-super-admin; a TRUTHY `identity` from anyone else proves it). `rooms`/`ratePlans` land in the **`rooms_new`/`rate_plans_new`** guarded INSERT…SELECT tables; referenced products MUST exist in the tenant (or 400/404) and may be resolved by `productName` — the handler mirrors them into `products` for the FK via `ensureProductInProductsTable`. Meals reference categories by `categoryName`; `pos_users` inserts are `first_name`/`last_name` ONLY (`name` is GENERATED). Base64 `data:image/(jpg|jpeg|png|webp|gif);base64,…` (≤8 MB) auto-uploads to R2 (`MEDIA_BUCKET`) and stores the returned `/api/media/` URL; `http(s)`/`/api/media/` URLs pass through unchanged; **NEVER add KV writes for import** (free-plan quota). Sample + walkthrough: `docs/examples/tenant-manifest.example.json` + `docs/tenant-import.md`; gate: `cd backend && npx vitest run tests/tenant-import-smoke.test.js`.

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

> **A bare test count rots silently, so every figure below names the run that
> produced it.** `docs/01-architecture/ARCHITECTURE.md` §7 is the canonical table;
> `docs/04-testing/TESTING.md` restates it with the same provenance; and the
> committed run records live in
> **`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md`** — *not* in
> `AGENT_LOGBOOK.md`, which has been the reference tier since the 2026-10-06
> restructure and holds no suite results. **Run the suite; do not quote a
> remembered number.**

| Suite | Command | Files | Tests | Last verified |
| --- | --- | --- | --- | --- |
| Backend unit | `cd backend && npx vitest run` | **127** | **2743** | `9e58dae` |
| Frontend unit | `cd app && npx vitest run` | **155** | **3632** | `88f307a` |
| Root integration | `npx vitest run --config vitest.integration.config.ts` | **37** | **255** registered | 2026-09-28; see the caveat below |
| E2E | `CI=true npx playwright test` | **96** specs, 8 projects | **919 passed / 0 failed / 15 env-skipped** | 2026-09-06, per-project |

```bash
# Frontend unit — file count is verifiable on disk (155); the test count is from 88f307a
cd app && npx vitest run

# Backend unit — coverage gate = `npm run test:coverage` (thresholds 83/72/89/89,
# backend/vitest.config.ts:21-30). Plain `vitest run` does NOT evaluate the gate.
cd backend && npx vitest run

# POS integration tests
cd backend && npx vitest run tests/pos/

# Root integration — the `--config` is REQUIRED: plain `npx vitest run` at the repo
# root uses vitest.config.ts, whose include is tests/unit/** only, a different suite.
# Pre-existing flake: /api/auth's 30-minute login limit answers 429 and takes the
# tail of the run with it. Verify targeted or per-file.
npx vitest run --config vitest.integration.config.ts

# E2E — CI does NOT run the full gate: .github/workflows/e2e.yml runs --grep "@smoke"
# = 10 tests. 919 is the last recorded FULL local gate. Run per-project when wrangler
# dev is under load (documented workerd crash —
# docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md, 2026-09-06).
CI=true npx playwright test
```

Three facts that are not counts and used to be recorded as one:

- **There is no current E2E total.** 919 + 1 flaky + 15 skipped does not reconcile with
  the "~929 total" this section used to print, so the total is gone rather than guessed.
- **CI runs 10 of the 15 env-skipped E2E tests**, and all 10 live in
  `tests/e2e/specs/cross-cutting/mobile-responsive.spec.ts`.
- **The root integration suite is environment-dependent and pre-existing red in a bare
  workspace**: `tests/globalSetup.ts` boots `wrangler dev` and never applies migrations,
  so a fresh `.wrangler/state` is a blank DB and the suite 500s on `no such table`.
  Confirm with `git stash` before attributing it to your diff.

---

## 7. Deployment

```bash
./deploy.sh
```

Deploys backend Worker + D1 migrations, then builds and deploys the unified frontend to Cloudflare Workers (one-host-one-origin; the Pages project was retired at production cutover).

---

## 8. Persistent Memory (`AGENT_LOGBOOK.md`)

- **Read** `AGENT_LOGBOOK.md` at the start of every task.
- **Update** it when you finish a task (date, files changed, lessons learned).
- **Document** recurring gotchas in the "Persistent Learnings" section.
