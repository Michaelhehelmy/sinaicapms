# SinaiCamps — API Contract

## 1. The contract lives in the client

The **single source of truth** for the frontend↔backend contract is `app/src/lib/api.ts` — a typed client with **113 exported functions** covering every endpoint the frontend uses. The backend mirrors it: every route registered in `backend/src/routes/registry.js` and every handler in `backend/src/api/**` / `backend/src/routes/pos/**`.

**Rule**: if a frontend feature needs data, add a function to `api.ts` (or extend one), and make the backend handler match its shape. Never inline raw `fetch` calls in components (the admin SPA migration to TanStack Query removed the last ones).

## 2. Generated types + OpenAPI

- `backend/openapi.json` — generated OpenAPI 3 document describing the API surface.
- `npm run gen:openapi` (in `backend/`) — regenerate it via `vite-node scripts/generate-openapi.js`.
- `npm run gen:types` (in `app/`) — regenerate `app/src/lib/api-types.ts` from `openapi.json` via `openapi-typescript`.

Live document: the Worker serves the schema at `/api/openapi.json`.

## 3. Auth model

Two distinct token worlds:

| World | Token | Header | Scope |
| --- | --- | --- | --- |
| Admin dashboard | JWT (`env.JWT_SECRET`) | `Authorization: Bearer <jwt>` | Admin/owner panel, RBAC hierarchy: `admin` > `staff` |
| POS terminal | `pos_token` (per organization) | `Authorization: Bearer <pos_token>` | POS routes: products, cart, orders, shifts |

- `env.JWT_SECRET` has **no fallback** — the Worker throws immediately if unset. Set it in `wrangler.toml` `[vars]` (dev) and as a secret (prod).
- Registration (`/api/auth/register`) + login issue JWTs; POS login issues `pos_token`s.
- Tenant resolution happens in middleware (`backend/src/middleware/tenant.js`); frontend zone resolution in `app/src/lib/routeZones.ts`.

## 4. Response envelope

Success responses are camelCased JSON (keys converted via `toCamel` in `backend/src/utils/response.js`):

```json
{ "id": 1, "campName": "Bedouin Star", "isActive": true }
```

Error responses use a stable envelope:

```json
{ "success": false, "error": "Human-readable message", "errors": [{ "field": "name", "message": "Required" }] }
```

- `errors` (Zod field errors) is appended only when present.
- Public reads are cached at the HTTP layer: `Cache-Control: public, max-age=300, stale-while-revalidate=600` (availability checks use 60s). This is header-level only — **no KV caching**, so it does not consume the free-plan KV write quota.

## 5. Key endpoint groups

| Group | Base path | Notes |
| --- | --- | --- |
| Auth | `/api/auth/*` | register, login, refresh, reset |
| Camps | `/api/camps*` | listing, detail, search; admin CRUD |
| Tenants | `/api/tenant/*`, `/api/tenants*` | branding, home data, settings |
| Categories / Meals | `/api/categories*`, `/api/meals*` | marketplace + tenant menu |
| Orders | `/api/orders*`, `/api/availability*` | booking orders, room availability |
| Admin | `/api/admin/*` | dashboard, reports, staff, settings |
| POS | `/api/pos/*` | login, products, cart, checkout, shift |
| System | `/api/openapi.json`, `/api/health` | schema + health |

Exact paths, methods, and payloads: see `backend/openapi.json` (source of truth) and the route registry in `backend/src/routes/registry.js`.

## 6. Contract rules (enforced by review)

1. All request/response field names **snake_case on the wire for requests**, camelCase in responses (`toCamel` handles the mapping; `toSnake` for incoming params).
2. Response helpers add the security headers (nosniff, X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy, CSP) — do not bypass them.
3. Never set CORS headers in response helpers — `hono/cors` in `index.js` is the single source of truth.
4. Public endpoints must remain cache-safe; anything user-specific must use `private`/`no-store` semantics if caching is added.
5. Frontend components must render user data through `escHtml()` (in `app/src/lib/utils.ts`).
