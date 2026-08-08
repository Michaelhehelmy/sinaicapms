# FINAL PLAN Backlog — SinaiCamps Modern Multi-Tenant Marketplace

Status as of **2026-08-04** (orchestrator kickoff). Each row = one atomic task. Individual tmp agent files are materialized from this manifest when a task is picked up for execution.

## Phase 1 — Foundations & stack upgrade (DONE — pending E2E spot-check gate)
| # | Task | Status | Notes |
|---|---|---|---|
| T1 | i18n per-request locale (kill module singleton) | ✅ DONE | 66→67 files, 1241→1250 tests; build green; tmp file cleaned |
| T2 | Tenant theme engine (per-tenant CSS vars, derived — DB frozen) | ✅ DONE | +40 tests (1290 total), theme.ts 100% coverage; build green; tmp file cleaned |
| T2.5 | Phase 1 E2E spot-check (/, tenant home, /admin, /pos) | ✅ DONE | 2026-08-04: 4-surface gate ran directly (qa spawn cancelled). Zero T1/T2 regressions. 5 pre-existing `load`-timeout flakes (documented env noise). Fixed 2 pre-existing spec defects: tenant CTA href (`/camp/{id}` → `/book`) + admin mobile-toggle assertion (`isVisible()` ignores transforms → bounding-box x check). tmp file cleaned |
| — | Stack upgrade Astro 4→5 / React 18→19 / Tailwind 3→4 | ✅ DONE | Already live in `app/package.json` (Astro 5.18.2, React 19.2.8, Tailwind 4.3.3, @astrojs/cloudflare 12.6.13, @tailwindcss/vite; no tailwind.config.*) |

## Phase 2 — API contract modernization (IN PROGRESS)
| # | Task | Status |
|---|---|---|
| T3 | response.js envelope rewrite + camelCase DTOs (utils + all 13 `backend/src/api` modules) | ✅ DONE |
| T4 | Structured errors: error catalog + `{ success:false, error, errors:[{field,message}] }` on Zod 400s (keep `error` string compat) | ✅ DONE |
| T5 | PATCH routes: `/me`, `/admin/tenants/:id`, `/admin/admins/:id`, order status | ✅ DONE |
| T6 | Pagination envelopes `{ data, total, page, pageSize, hasMore }` (orders, leads, admin lists) | ✅ DONE |
| T7 | `/auth/refresh` (refresh token already issued, 7d) + client silent-refresh in `app/src/lib/api.ts` | ✅ DONE |
| T8 | OpenAPI 3.0 source of truth: `openapi.yaml` + openapi-typescript typed client + `/api/openapi.json` + spec↔handler contract test; remove `snakeToCamel` from api.ts (typed DTOs replace it) | pending |

## Phase 3 — Design system & component library (NOT STARTED)
| # | Task | Status |
|---|---|---|
| T9 | Tokens/typography/motion audit + `ui/` library rebuild (18 → ~24 a11y-first components) + Storybook stories + visual regression baselines | pending |

## Phase 4 — Public frontend rebuild (NOT STARTED)
| # | Task | Status |
|---|---|---|
| T10 | Marketplace rebuild: home hero/featured camps/search-filter/zone-aware CTA, /camps, /camp/[id]; SEO/OG/JSON-LD, sitemap | pending |
| T11 | Tenant zone rebuild: landing, /rooms, /menu, /book (WhatsApp flow), about/gallery/faq/contact; full AR RTL | pending |
| T12 | Image pipeline: replace passthroughImageService (Astro Image / Cloudflare Images, responsive srcset, normalizeAssetUrl retained) | pending |

## Phase 5 — Admin & POS rebuild (NOT STARTED)
| # | Task | Status |
|---|---|---|
| T13 | Admin typed SPA shell (eliminate `window.*` globals), TanStack Query, 16 lazy panels incl. branding/settings + super-admin; per-tenant theming | pending |
| T14 | POS typed terminal: shift-gate, cart/orders, receipts; token separation (`pos_token` vs `sinaicamps_token`) preserved in client | pending |

## Phase 6 — Performance, docs, deploy (NOT STARTED)
| # | Task | Status |
|---|---|---|
| T15 | Perf pass: caching review (cachedJsonResponse), lazy/hydration tuning, Lighthouse budgets | pending |
| T16 | a11y: axe suite + keyboard-nav specs green | pending |
| T17 | Docs: 7-file `docs/` set (ARCHITECTURE, API_CONTRACT, OPENAPI.yaml, COMPONENT_CATALOG, DEVELOPER_ROADMAP, MIGRATION_GUIDE, QUICK_START) + `examples/minimal/` scaffold | pending |
| T18 | README/AGENTS.md correction pass + logbook + deploy.sh + prod smoke | pending |

## Execution rules (from orchestrator prompt)
- One task = one tmp agent; verifiable done-condition; delete tmp file after done + logbook updated.
- If a subtask fails, STOP and report — do not silently continue.
- Tests green throughout: app 1241 / backend 797 / root 166 / E2E 447 (current baseline).
- Backend DB FROZEN — no migrations; Phase 2 is response-shape/contract only.
