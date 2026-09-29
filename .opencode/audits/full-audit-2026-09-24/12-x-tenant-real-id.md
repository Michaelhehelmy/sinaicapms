# Step 3 R3 — Cross-Tenant Real-ID Probe (staging, two live tenants)

- Date: 2026-09-29 UTC
- Spec: `.opencode/agents/tmp/2026-09-29-xreal.md` (task `x-tenant-real`)
- Baseline: `a914934` confirmed pushed (`git rev-parse HEAD` == `git ls-remote origin main` == `a914934f03afbe76d57b737326eee4112fca5c8a`; `git branch -r --contains a914934` → `origin/main`)
- Target: `https://staging.sinaicamps.com` (staging reachability: `GET /api/openapi.json` → 200)
- Scope: staging only. 2 logins (auth, not data writes) + 7 GETs. **Zero data writes** — the testb "Test Room" seed already exists, so the spec's single allowed write was NOT needed. No source touched, no deploy.sh.
- Credentials: acacia admin JWT + testb admin JWT obtained via login, used from
  `chmod 600` files, never printed, **shredded after** (`rm /tmp/tok_a /tmp/tok_b /tmp/acacia_login.json /tmp/testb_login.json`; zero `eyJ` strings in this file — login bodies below are redacted to status + user only).

## Staging tenant census (two live tenants — real-ID branch)

`GET https://staging.sinaicamps.com/api/tenants` (public) → exactly **2 active tenants**:

- `tenant_a2d040ea-3b1` / subdomain `acaciacamp` / name "Sinai Palms"
- `tenant_aa7b29b4-a06` / subdomain `testb` / name "Test Tenant B"

Both tenants have live rows, so all four probes use **real cross-tenant IDs** (stronger than the 09/10 nonexistent-id probes).

## Auth (token-validity setup)

- `POST /api/auth/login` `{email: admin.test@acaciacamp.com, tenantId: acaciacamp}` → **HTTP 200**,
  user `{"id":"adm_291a0396-a73","name":"Test Admin","email":"admin.test@acaciacamp.com","role":"admin","tenantId":"tenant_a2d040ea-3b1"}`
  (token received, redacted here, shredded after).
- `POST /api/auth/login` `{email: admin@testb.com, tenantId: testb}` → **HTTP 200**,
  user `{"id":"adm_a02e2374-5fd","name":"Test Admin","email":"admin@testb.com","role":"admin","tenantId":"tenant_aa7b29b4-a06"}`
  (token received, redacted here, shredded after).

## Captured real IDs (no write needed)

- testb product: `GET /api/products?limit=50` + testb JWT + `x-tenant-id: testb` → **HTTP 200**, 1 row:
  `prod_3d0abde9-e96` ("Test Room", `tenantId: tenant_aa7b29b4-a06`, `campIds: ["proj_d826aa31-3e1"]`).
  The manifest "Test Room" seed already exists on staging — **the single allowed API write was NOT used; mutations performed: zero**.
- acacia product (control reference): same list shape under acacia scope returns 4 rows, all
  `tenantId: tenant_a2d040ea-3b1` — `prod_tent` ("Beach Tent"), `prod_1f8824b0-dab`, `p4test_55D6EA4F0CDD`, `prod_224d3862-ba2`.

## Probes (raw outputs verbatim)

### PROBE-1 — acacia → testb product (real ID) → 405

`GET /api/products/prod_3d0abde9-e96` + acacia JWT + `x-tenant-id: acaciacamp` → **HTTP 405**:

```json
{"success":false,"error":"Method not allowed"}
```

Reason: `productsRoutes` defines NO `GET /:id` handler (`backend/src/api/camps.js:476-747` — GET `/` list only; PUT/DELETE `/:id`; `all('*')` → 405). There is no per-product GET route for ANY caller, own or foreign — nothing disclosed.

### PROBE-2 — acacia → testb tenant row (real ID) → 200 (public directory, not a leak)

`GET /api/tenants/tenant_aa7b29b4-a06` + acacia JWT + `x-tenant-id: acaciacamp` → **HTTP 200**:

```json
{"id":"tenant_aa7b29b4-a06","name":"Test Tenant B","subdomain":"testb","type":"camp","customDomain":null,"logoUrl":null,"faviconUrl":null,"primaryColor":"#0f766e","footerText":null,"location":null,"whatsappNumber":null,"phone":null,"email":"admin@testb.com","description":null,"heroImageUrl":null,"galleryImages":null,"aboutText":null,"faqItems":null,"reviews":null,"mapEmbedUrl":null,"activities":null,"capacity":50,"currency":"EGP","status":"active","menuConfig":null}
```

Disambiguation (same run, no auth): `GET /api/tenants/tenant_aa7b29b4-a06` with NO `Authorization` header → **HTTP 200, byte-identical body** (verified `B == public`, equal length 470). The tenant directory (list + detail) is **public by design** — the marketplace needs tenant profiles, and the anonymous `GET /api/tenants` list discloses the same row. This 200 is not a JWT-scoped leak: an unauthenticated stranger receives exactly the same bytes.

### PROBE-3 — testb → acacia product (real ID) → 405

`GET /api/products/prod_tent` + testb JWT + `x-tenant-id: testb` → **HTTP 405**:

```json
{"success":false,"error":"Method not allowed"}
```

Symmetric with PROBE-1 — no per-product GET route exists; nothing disclosed in either direction.

### CONTROL — testb → own product (real ID) → 405 (NOT 200)

`GET /api/products/prod_3d0abde9-e96` + testb JWT + `x-tenant-id: testb` → **HTTP 405**:

```json
{"success":false,"error":"Method not allowed"}
```

The control does NOT return 200 on this surface because the route does not exist for anyone — symmetric 405 for own and foreign alike (proves absence of the surface, not absence of isolation on an existing one).

## Verdict: FAIL (against the spec's strict status rule — NOT a data-leak finding)

| Probe | Code | Disclosed private foreign rows |
|---|---|---|
| PROBE-1 acacia → testb product (real ID) | **405** (no GET route) | 0 |
| PROBE-2 acacia → testb tenant row (real ID) | **200, byte-identical to anonymous** | 0 private (public directory by design) |
| PROBE-3 testb → acacia product (real ID) | **405** (no GET route) | 0 |
| CONTROL testb → own product (real ID) | **405** (≠ 200) | — |

Spec rule: PASS iff foreign all 403/404 AND control 200. Actual: foreign = 405/200/405; control = 405. **Verdict FAIL.**

Interpretation (read carefully — FAIL ≠ vulnerability):

1. The 405s disclose nothing in either direction. A per-product GET endpoint simply does not exist; the only product reads are the public marketplace list (which intentionally shows all tenants' catalog rows — verified no-auth: 5 rows across both tenants) and admin-scoped mutations (out of scope: writes forbidden by this spec).
2. The tenant-row 200 is the intentional public marketplace directory, proven JWT-independent (anonymous GET returns byte-identical body). No private cross-tenant data (orders, POS transactions, admin-scoped fields) was disclosed by any probe.
3. Real tenant-scoped isolation (403/404 on foreign, 200 on own) remains proven on the order surfaces per `09-x-tenant-probes.md` / `10-x-tenant-probes-r2.md` (tenant-bound predicates `orders.js:692`, `pos/index.js:985-987`); this R3 spec's chosen surfaces (product detail, tenant directory) are a 405-absent route and a public route respectively, so its strict status rule cannot pass on them. A future real-ID PASS on products would need either a tenant-scoped GET-by-id route (does not exist today) or the order-detail surface with a live testb order id.

Both JWTs shredded. Mutations performed: zero (2 logins + 7 GETs only).
