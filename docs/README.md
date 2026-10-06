---
title: "SinaiCamps Documentation"
aliases:
tags:
  - type/index
  - audience/developer
  - audience/tenant-admin
  - domain/vault
  - status/live
created: 2026-08-25
updated: 2026-10-06
relates-to:
  - "[[docs/01-architecture/QUICK_START]]"
  - "[[ARCHITECTURE]]"
  - "[[API_CONTRACT]]"
  - "[[camp-guide]]"
  - "[[security-guide]]"
  - "[[migrations]]"
  - "[[TESTING]]"
  - "[[docs/98-history/README]]"
  - "[[tenant-import]]"
  - "[[SinaiCamps Business API Surface]]"
code-references:
  - "app/src/lib/api.ts"
verified: never
---
# SinaiCamps Documentation

Welcome to the SinaiCamps documentation. This guide covers everything from quick setup to detailed user guides for each business module.

> **Restructured 2026-10-06** into an Obsidian-style vault: docs are grouped into numbered folders
> (`01-architecture/` … `10-tenant-import/`) with everything that is history under `98-history/`.
> Each numbered folder has its own `README.md` index. Three documents keep their original path as
> split entry points — `tenant-import.md`, `API_SURFACE.md` — and each links to its siblings.

---

## Table of Contents

### Getting Started
- [Quick Start](01-architecture/QUICK_START.md) — Prerequisites, environment setup, running locally
- [Architecture](01-architecture/ARCHITECTURE.md) — Four-layer contract, isolation rules, data flow
- [API Contract](02-api/API_CONTRACT.md) — Endpoint reference, request/response schemas

### User Guides
- [Camp Management](08-guides/camp-guide.md) — Rooms, bookings, rate plans, room status lifecycle
- [Supermarket / POS](08-guides/supermarket-guide.md) — Products, promotions, inventory management
- [Restaurant Management](08-guides/restaurant-guide.md) — Tables, reservations, kitchen workflow, billing
- [Service Management](08-guides/service-guide.md) — Service definitions, items, bookings, reviews
- [Analytics & Reports](08-guides/analytics-guide.md) — Dashboard tabs, revenue breakdown, customer metrics

### Developer Resources
- [Component Catalog](03-frontend/COMPONENT_CATALOG.md) — UI component reference
- [Migration Guide](07-data/migrations.md) — Database schema changes
- [Testing](04-testing/TESTING.md) — Unit, integration, and E2E test guides
- [Developer Roadmap](09-plans/DEVELOPER_ROADMAP.md) — Feature planning and roadmap
- [Performance Baseline](03-frontend/PERF_BASELINE.md) — Performance metrics and benchmarks
- [Security Guide](06-security/security-guide.md) — Auth, CSRF, XSS, rate limiting, CORS

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Astro 7.3.1 + React 19.2.x + Tailwind CSS v4 (TypeScript) |
| API / Backend | Hono on Cloudflare Workers (JavaScript) |
| Database | Cloudflare D1 (SQLite) |
| Cache / Rate Limiting | Cloudflare KV + R2 |
| Auth | JWT (HS256) + bcrypt |
| Unit Tests | Vitest |
| E2E Tests | Playwright |

---

## Quick Start

### Prerequisites
- Node.js 20+ and npm
- A Cloudflare account + `wrangler` login

### Install Dependencies
```bash
npm install
cd app && npm install
cd backend && npm install
```

### Start the Backend API
```bash
cd backend
npx wrangler d1 migrations apply campmaster-db --local
npx wrangler dev --port 8787
```

### Start the Frontend
```bash
cd app
npm run dev
# → http://localhost:4321
```

### Run Tests
```bash
cd backend && npx vitest run       # Backend unit tests
cd app && npx vitest run           # Frontend unit tests
npx vitest run                     # Root integration tests
CI=true npx playwright test        # E2E tests
```

---

## Architecture Overview

SinaiCamps follows a **four-layer isolated architecture**:

```
Frontend (app/)  →  API (backend/)  →  Database (D1)  +  Cache (KV/R2)
     UI only          Business logic      Persistent data     Rate limiting
```

- **Frontend** renders UI and calls the API via `app/src/lib/api.ts` — never touches D1/KV directly
- **API** handles auth, validation, business logic — the only entry point to data
- **Database** (D1) stores all persistent data — only accessible via the backend Worker
- **Cache** (KV) handles rate limiting and distributed state — never a source of truth

---

## Deployment

```bash
./deploy.sh            # Full deploy (D1 migrations → backend → frontend)
./deploy.sh --staging  # Staging environment
```

**Production URLs:**
- Marketplace: [sinaicamps.com](https://sinaicamps.com)
- Admin: [sinaicamps.com/admin](https://sinaicamps.com/admin)
- POS: `{tenant}.sinaicamps.com/pos` (e.g., acaciacamp.com/pos)
