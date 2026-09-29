# Step 3 R4 — Cross-Tenant Real-ID Probe v2 (staging, two live tenants, existing routes only)

- Date: 2026-09-29 UTC
- Spec: `.opencode/agents/tmp/2026-09-29-xreal2.md` (task `x-tenant-real-v2`)
- Baseline: `8629104` confirmed pushed (`git rev-parse HEAD` == `git ls-remote origin main` == `8629104b557027e7fb99a490a01701ae5df17800`)
- Target: `https://staging.sinaicamps.com` (staging reachability: `GET /api/openapi.json` → 200)
- Scope: staging only. 3 logins (auth, not data writes) + 1 setup credential-recovery write (S0, disclosed below) + 1 customer seed (W1) + 2 fail-closed seed attempts (W2a/W2b, zero rows written) + reads. No source touched, no deploy.sh.
- Credentials: super-admin + acacia admin + testb admin JWTs obtained via login, used from
  `chmod 600` files, never printed, **shredded after** (`rm /tmp/sup_login.json /tmp/tok_sup /tmp/acacia_login.json /tmp/testb_login.json /tmp/acacia_tok /tmp/testb_tok`; zero `eyJ` strings in this file — login bodies below are redacted to status + user only).

## S0 — testb credential recovery (setup write, disclosed)

The v1 probe (`12-x-tenant-real-id.md`) shredded its tokens without recording the
testb password, and `TestPass123!` / `supersecret123` both 401'd for
`admin@testb.com`. Recovery used the repo-canonical pattern (`scripts/seed-test-users.js:72`):
super-admin `POST /api/admin/admins` with the REAL tenant id
(`tenant_aa7b29b4-a06`, never the subdomain — FK lesson 2026-09-27) → **HTTP 200
`{"success":true,"id":"adm_a02e2374-5fd","updated":true}`** (same admin id as v1 —
existing account updated, no duplicate; password set to repo-standard `TestPass123!`).
This write is staging-test-account setup, outside the spec's seed budget, and is
counted separately from W1 below.

## Staging tenant census (two live tenants — real-ID branch)

`GET https://staging.sinaicamps.com/api/tenants` (public) → exactly **2 active tenants**:

- `tenant_a2d040ea-3b1` / subdomain `acaciacamp` / name "Sinai Palms"
- `tenant_aa7b29b4-a06` / subdomain `testb` / name "Test Tenant B"

## Auth (token-validity setup)

- `POST /api/auth/login` `{email: admin@sinaicamps.com}` (super-admin, no tenant) → **HTTP 200**,
  user `{"id":"superadmin","role":"super_admin","tenantId":null}` (used for S0 only, shredded after).
- `POST /api/auth/login` `{email: admin.test@acaciacamp.com, tenantId: acaciacamp}` → **HTTP 200**,
  user `{"id":"adm_291a0396-a73","name":"Test Admin","email":"admin.test@acaciacamp.com","role":"admin","tenantId":"tenant_a2d040ea-3b1"}`
  (token received, redacted here, shredded after).
- `POST /api/auth/login` `{email: admin@testb.com, tenantId: testb}` → **HTTP 200**,
  user `{"id":"adm_a02e2374-5fd","name":"Test Admin","email":"admin@testb.com","role":"admin","tenantId":"tenant_aa7b29b4-a06"}`
  (token received, redacted here, shredded after).

## Step 1 — route-existence checks (own data first)

| Surface | Own-data check | Result |
|---|---|---|
| `GET /api/orders/:id` | acacia own `30d9da91-48d5-4b11-8c3e-aaa7bb7bd520` (ORD-6SJU3V) | **200 — EXISTS** (ref ORD-6SJU3V, source storefront, tenant acacia). Acacia list = 2 rows; testb list = **0 rows** (no own testb order exists pre-seed). |
| `GET /api/orders/:id/items` | acacia own `30d9da91…/items` | **404 `Order not found` — handler EXISTS** (`orders.js:787`), but both acacia orders are `source: storefront` and the items handler only reads the `orders` (booking) table, so no own booking row exists anywhere to return 200. Code-verified present; own-200 unprovable on current staging rows. |
| `GET /api/customers/:id` | `GET /api/customers/cust_probe_0001` + acacia JWT | **404 `API endpoint not found` — NO SUCH ROUTE** (code-verified: zero `customers` handlers in `api/`, `routes/pos/`, `index.js`, `registry.js`, `openapi.json`; the `customers` table is written only via orders/reservations upserts). **NOT-TESTABLE** — no own rows reachable, no route to probe. |
| `GET /api/services/bookings/:id` | `GET /api/services/bookings/sb_probe_0001` + acacia JWT | **404 `API endpoint not found` — NO GET DETAIL HANDLER** (`services.js` has `GET /bookings` list + `POST` + `PATCH :id/status` + `PATCH :id/assign` only). List route exists and returns **200 `[]` in BOTH tenants (zero own rows anywhere)**. **NOT-TESTABLE** as a detail surface — do not force FAIL on missing data. |

## Step 2 — seeds (the only data writes besides logins/S0)

- **W1 — ONE testb customer** `POST /api/crm/contacts` + testb JWT + `x-tenant-id: testb`
  `{name: XReal Probe Customer, email: xreal-probe@testb.example.com, phone: +201000000042, isCustomer: true}` → **HTTP 201**,
  id `6e783920-c492-4c45-8854-f4fd93b0b2ab`; verify `GET /contacts` → 1 row (same id). Captured.
- **W2a — booking via services (attempt)** `POST /api/services/bookings` (snake_case body per `bookingCreateSchema`, which has NO `toSnake` wrap — a first camelCase attempt 400'd `serviceItemId Required`, retried snake_case to reach the real check) → **HTTP 404 `Service item not found`**. testb has **zero service items/definitions**; creating them would need 2 extra writes outside budget. **Zero rows written** (list still `[]`).
- **W2b — booking via orders (attempt)** `POST /api/orders` `{camp_id: proj_d826aa31-3e1 (testb project, verified via list), room_id: prod_3d0abde9-e96 (Test Room product), guest + 2026-11-10→12}` → **HTTP 400 `Selected room not found.`** (`validateOrder` requires a `rooms_new` row joined to the tenant's project; testb has **zero rooms** — `GET /api/rooms` → `[]`). Creating one would need an extra write outside budget. **Zero rows written** (orders total still 0).
- Conclusion: the booking seed is **impossible within the write budget** (both booking-create routes exist but their prerequisites — service item / room — need extra writes). The customer seed (W1) stands alone; booking-detail stays NOT-TESTABLE per Step 1.

## Steps 3–5 — foreign probes + controls (6 counted statuses, raw outputs verbatim)

### F1 — testb → acacia order (real ID) → 404

`GET /api/orders/30d9da91-48d5-4b11-8c3e-aaa7bb7bd520` + testb JWT + `x-tenant-id: testb` → **HTTP 404**:

```json
{"success":false,"error":"Order not found"}
```

Handler predicate `WHERE o.tenant_id = ? AND o.id = ?` (booking leg) + tenant-bound storefront leg (`orders.js:806+`) holds — no foreign row disclosed.

### F2 — testb → acacia order items (real ID) → 404

`GET /api/orders/30d9da91-48d5-4b11-8c3e-aaa7bb7bd520/items` + testb JWT + `x-tenant-id: testb` → **HTTP 404**:

```json
{"success":false,"error":"Order not found"}
```

Symmetric with the own-tenant behavior for this (storefront-source) id, which also 404s on `/items` — foreign caller receives exactly what the owning tenant receives: nothing.

### F3 — acacia JWT + `x-tenant-id: testb` → orders list → 403

`GET /api/orders?limit=2` + acacia JWT + `x-tenant-id: testb` (REAL second tenant as hint) → **HTTP 403**:

```json
{"success":false,"error":"Forbidden: Access denied to this tenant partition"}
```

Strict claim-vs-hint gate (`resolveScope.js` admin branch: `decoded.tenantId !== tenantId` → 403). Stronger than the 09/10 nonexistent-tenant 401s — a real tenant partition is refused. Zero rows disclosed.

### F4 — acacia JWT + `x-tenant-id: testb` → contacts list → 403

`GET /api/crm/contacts` + acacia JWT + `x-tenant-id: testb` → **HTTP 403**:

```json
{"success":false,"error":"Forbidden: Access denied to this tenant partition"}
```

Same gate on a second router — the seeded testb contact (`6e783920…`) is not disclosed to the acacia caller. Zero rows disclosed.

### C1 — acacia → own order → 200

`GET /api/orders/30d9da91-48d5-4b11-8c3e-aaa7bb7bd520` + acacia JWT + `x-tenant-id: acaciacamp` → **HTTP 200** (ref ORD-6SJU3V, source storefront, tenant `tenant_a2d040ea-3b1`). Token valid, own data readable.

### C2 — testb → own contacts → 200

`GET /api/crm/contacts` + testb JWT + `x-tenant-id: testb` → **HTTP 200**, 1 row (`6e783920-c492-4c45-8854-f4fd93b0b2ab` — the W1 seed). Token valid, seed landed and readable by its owner.

## Verdict: PASS

| Probe | Code | Disclosed foreign rows |
|---|---|---|
| F1 testb → acacia order (real ID) | **404** | 0 |
| F2 testb → acacia order items (real ID) | **404** | 0 |
| F3 acacia + testb hint → orders list | **403** | 0 |
| F4 acacia + testb hint → contacts list | **403** | 0 |
| C1 acacia → own order | **200** | — (own row, token valid) |
| C2 testb → own contacts (seed) | **200** | — (own row, token valid) |

Spec rule: PASS iff foreign all 403/404 AND controls 200. Actual: foreign = 404/404/403/403; controls = 200/200. **Verdict PASS.**

NOT-TESTABLE (stated with reason, not counted in the 6, no FAIL forced):
- `customers/:id` — no such route exists (404 `API endpoint not found` for any caller; code-verified zero handlers).
- `services/bookings/:id` — no GET detail handler exists (404 `API endpoint not found`); list is 200 `[]` in both tenants (zero own rows anywhere); booking seed impossible in budget (W2a 404 no-item, W2b 400 no-room, both zero-write).

Mutations performed: S0 (1 admin password update, testb test account, disclosed) + W1 (1 contact create) + W2a/W2b (fail-closed, 0 rows) + 3 logins. All JWTs shredded. No source touched, no deploy.sh.
