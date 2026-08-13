# SinaiCamps — Quick Start

## Prerequisites

- Node.js 20+ and npm
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
cd backend && npx vitest run      # backend unit: 1082 tests / 36 files
cd app && npx vitest run          # frontend unit: 1465 tests / 74 files
npx vitest run                    # root integration: 169 tests / 10 files
CI=true npx playwright test       # E2E: 566 total / 552 gate (14 env-skipped)
```

E2E notes (see `TESTING.md`): port hygiene first (`ss -tlnp | grep -E '4320|8787'`); tenant pages hang on `load` in dev → specs use `waitUntil: 'domcontentloaded'`.

## 5. Performance baseline (optional)

```bash
cd app && npm run build && npm run preview
# then, against the preview URL:
cd app && npm run lighthouse      # audits http://localhost:4321 against budget.json
```

## 6. Deploy

```bash
./deploy.sh               # production: Worker + D1 migrations + Pages frontend
./deploy.sh --staging     # staging: validates [env.staging] in backend/wrangler.toml first
```

Staging requires `staging.sinaicamps.com` → Pages DNS to be created in Cloudflare first (human action).

## 7. Generated API types

```bash
cd backend && npm run gen:openapi   # regenerate backend/openapi.json
cd app && npm run gen:types         # regenerate app/src/lib/api-types.ts from openapi.json
```

See `docs/API_CONTRACT.md` and `docs/ARCHITECTURE.md` for the full picture.
