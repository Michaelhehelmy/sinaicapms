---
title: "SinaiCamps — Quick Start"
aliases:
  - QUICK_START
  - Quick Start
tags:
  - type/quickstart
  - audience/newcomer
  - audience/developer
  - domain/operations
  - status/current
created: 2026-08-13
updated: 2026-10-06
relates-to:
  - "[[ARCHITECTURE]]"
  - "[[01-architecture/README]]"
  - "[[TESTING]]"
  - "[[RUNBOOK]]"
  - "[[API_CONTRACT]]"
  - "[[migrations]]"
code-references:
  - "backend/wrangler.toml:56-97"
  - "backend/wrangler.toml:21-39"
  - "playwright.config.ts:98-116"
  - "deploy.sh:39-66"
  - "deploy.sh:292-297"
  - "backend/package.json:24"
  - "app/package.json:13-15"
  - "app/package-lock.json:6396-6397,6459-6460 (astro 7.3.1 → engines.node >=22.12.0)"
  - "package-lock.json:4031-4032,4047-4048 (root vite 8.1.5 → engines.node ^20.19.0 || >=22.12.0)"
  - "backend/scripts/generate-openapi.js:1-11"
  - "app/src/lib/routeZones.ts:46-69"
  - "docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md"
  - "endpoint: GET /api/openapi.json → backend/src/index.js:477"
verified: never
---

# SinaiCamps — Quick Start

## Prerequisites

- Node.js **22.12+** and npm — the locked `astro` **7.3.1** declares `engines.node: ">=22.12.0"` (`app/package-lock.json:6396-6397,6459-6460`) and the root `vite` **8.1.5** declares `"^20.19.0 || >=22.12.0"` (`package-lock.json:4031-4032,4047-4048`), so a Node 20 machine cannot build this app. The floor is **not** enforced by this repo: `engines` is absent from all three manifests (`package.json`, `app/package.json`, `backend/package.json`) — it comes from the dependency tree.
- A Cloudflare account + `wrangler` login (`npx wrangler login`)
- For local backend: `JWT_SECRET` set (see below)

## 1. Install

```bash
npm install          # root (Playwright, integration tests)
cd app && npm install
cd backend && npm install
```

## 2. Environment

Required secrets/vars:

| Var | Where | Required |
| --- | --- | --- |
| `JWT_SECRET` | backend | **Yes** — no fallback; auth throws immediately if unset |
| `RATE_LIMIT_KV_ENABLED` | `backend/wrangler.toml` `[vars]` | Keep `"false"` (free-plan KV quota) unless on a paid plan |

See `backend/wrangler.toml` for D1/KV/R2 bindings and `[env.staging]`. `wrangler dev` applies `[vars]` automatically; for prod secrets use `npx wrangler secret put JWT_SECRET --config backend/wrangler.toml`.

## 3. Run locally

```bash
# Backend API (Hono on Workers, port 8787)
cd backend && npx wrangler dev

# Frontend (Astro, port 4321 — Astro default) — in another terminal
cd app && npm run dev
```

> Playwright's E2E webServer boots its own Astro instance on `:4320` (`playwright.config.ts`) — plain `npm run dev` stays on `:4321`.

Zone behavior: `localhost:4321` is the marketplace zone by default. To exercise a tenant zone, use a tenant host (e.g. `acaciacamp.com` via hosts file / local DNS) — `app/src/lib/routeZones.ts` is the single source of truth.

## 4. Tests

```bash
cd backend && npx vitest run      # backend unit: 2743 tests / 127 files
cd app && npx vitest run          # frontend unit: 3632 tests / 155 files
npx vitest run                    # root integration: 255 tests / 37 files
CI=true npx playwright test       # E2E: 919 gate passed / 0 failed / 15 env-skipped (2026-09-06)
```

Counts are the latest **committed** full runs, recorded in
`docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md` — not re-measured for this line, so re-run the
suite before quoting a number. `ARCHITECTURE.md` §7 carries the same table with the producing
commit on each row.

E2E notes (see `TESTING.md`): port hygiene first (`ss -tlnp | grep -E '4320|8787'`); tenant pages hang on `load` in dev → specs use `waitUntil: 'domcontentloaded'`.

## 5. Performance baseline (optional)

```bash
cd app && npm run build && npm run preview
# then, against the preview URL:
cd app && npm run lighthouse      # audits http://localhost:4321 against budget.json
```

## 6. Deploy

```bash
./deploy.sh               # production: Worker + D1 migrations + Workers frontend
./deploy.sh --staging     # staging: validates [env.staging] in backend/wrangler.toml first
```

Staging requires `staging.sinaicamps.com` → Workers DNS to be created in Cloudflare first (human action).

## 7. Generated API types

```bash
cd backend && npm run gen:openapi   # regenerate backend/openapi.json
cd app && npm run gen:types         # regenerate app/src/lib/api-types.ts from openapi.json
```

See `docs/API_CONTRACT.md` and `docs/ARCHITECTURE.md` for the full picture.
