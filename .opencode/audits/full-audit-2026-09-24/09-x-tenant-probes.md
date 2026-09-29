# Step 3 — Cross-Tenant Leak Probes (staging, read-only)

- Date: 2026-09-28 / 2026-09-29 UTC
- Spec: `.opencode/agents/tmp/2026-09-28-xtenant.md` (task `x-tenant-probes`)
- Baseline: `7a486c5` confirmed pushed (`git rev-parse HEAD` == `git ls-remote origin main` == `7a486c5d6c34ede1648334a476771bdc926e82bb`; `git branch -r --contains 7a486c5` → `origin/main`)
- Target: `https://staging.sinaicamps.com` (staging reachability: `GET /api/openapi.json` → 200)
- Reads only: 2 logins (auth, not data writes) + 8 GETs. No source touched, no data writes, no deploy.sh.
- Credentials: acacia admin JWT + acacia POS JWT obtained via login, used from
  `chmod 600` files, never printed, **shredded after** (`rm /tmp/acacia_*`; no token
  appears in this file — login bodies below are redacted to status + user only).

## Staging tenant census (determines what "foreign" means)

`GET https://staging.sinaicamps.com/api/tenants` (public) → exactly **1 active tenant**:

- `tenant_a2d040ea-3b1` / subdomain `acaciacamp` / name "Sinai Palms"

**`michaelshouse` does NOT exist on staging** (single-tenant state post-reset, per the
spec's anticipated branch). Therefore foreign-tenant probes use foreign-formatted
**nonexistent ids** with the acacia JWT (expect 404), plus a cross-tenant-header
variant — and every probe's exact target is stated below.

## Auth (token-validity setup)

- `POST /api/auth/login` `{email: admin.test@acaciacamp.com, tenantId: acaciacamp}` → **HTTP 200**,
  user `{"id":"adm_291a0396-a73","name":"Test Admin","email":"admin.test@acaciacamp.com","role":"admin","tenantId":"tenant_a2d040ea-3b1"}`
  (token + refreshToken received, redacted here, shredded after).
- `POST /api/auth/pos-login` `{identifier: testpos}` → **HTTP 200**,
  user `{id: 3, username: testpos, organizationId: 1, role: cashier}`
  (token received, redacted here, shredded after).

## Validity controls (prove both tokens work — all 200)

1. `GET /api/orders?limit=2` + admin JWT + `x-tenant-id: acaciacamp` → **HTTP 200**:

```json
{"data":[{"id":"30d9da91-48d5-4b11-8c3e-aaa7bb7bd520","tenantId":"tenant_a2d040ea-3b1","campId":null,"roomId":null,"customerId":null,"orderStateId":"pending","checkInDate":null,"checkOutDate":null,"numberOfPeople":null,"totalAmount":1550,"amountPaid":null,"paymentStatus":"pending","reference":"ORD-6SJU3V","createdAt":"2026-09-28 14:25:36","customerFirstName":null,"customerLastName":null,"roomName":null,"stateName":"pending","source":"storefront"},{"id":"2cb3872d-52b4-453e-90b0-033fade38e54","tenantId":"tenant_a2d040ea-3b1","campId":null,"roomId":null,"customerId":null,"orderStateId":"pending","checkInDate":null,"checkOutDate":null,"numberOfPeople":null,"totalAmount":1550,"amountPaid":null,"paymentStatus":"pending","reference":"ORD-6S4R6R","createdAt":"2026-09-27 22:23:17","customerFirstName":null,"customerLastName":null,"roomName":null,"stateName":"pending","source":"storefront"}],"total":2,"page":1,"pageSize":50,"hasMore":false}
```

2. `GET /api/orders/30d9da91-48d5-4b11-8c3e-aaa7bb7bd520` (own order ORD-6SJU3V) + admin JWT + `x-tenant-id: acaciacamp` → **HTTP 200**:

```json
{"source":"storefront","id":"30d9da91-48d5-4b11-8c3e-aaa7bb7bd520","tenantId":"tenant_a2d040ea-3b1","customerId":null,"reference":"ORD-6SJU3V","sessionId":"t40walk-1790605484-a1b2c3","projectId":null,"totalAmount":1550,"currency":"EGP","status":"pending","paymentStatus":"pending","notes":"Storefront checkout","createdAt":"2026-09-28 14:25:36","updatedAt":"2026-09-28 14:25:36","customerFirstName":null,"customerLastName":null,"customerEmail":null,"customerPhone":null,"items":[{"id":"724d1bf2-f9d1-41bd-b39b-d5fe0d5b9fe6","orderId":"30d9da91-48d5-4b11-8c3e-aaa7bb7bd520","productId":"prod_tent","productName":"Beach Tent","quantity":1,"unitPrice":1500,"totalPrice":1500,"createdAt":"2026-09-28 14:25:36","projectId":"proj_27709a3f-f50"},{"id":"7f98f9ad-54a3-4053-a51d-5942e03fb190","orderId":"30d9da91-48d5-4b11-8c3e-aaa7bb7bd520","productId":"prod_224d3862-ba2","productName":"P5 Restaurant Meal","quantity":1,"unitPrice":50,"totalPrice":50,"createdAt":"2026-09-28 14:25:36","projectId":"camp_e323b315-725"}]}
```

3. `GET /api/pos/orders?limit=2` + POS JWT → **HTTP 200**:

```json
{"data":[{"id":"ord_ae05afe6-04b","orderNumber":"ORD-MUJOT2R7","status":"completed","subtotal":15,"taxAmount":1.5,"totalAmount":16.5,"paymentMethod":"cash","paymentStatus":"completed","tableId":null,"kitchenStatus":"pending","createdAt":"2026-09-27 10:40:05","cashierName":"testpos"}],"total":1,"page":1,"pageSize":100,"hasMore":false}
```

## Probes (raw outputs verbatim)

### PROBE-1 — booking orders: foreign id with acacia admin JWT → 404

`GET /api/orders/ord_michaelshouse_foreign_0000` + admin JWT + `x-tenant-id: acaciacamp`
(probed: nonexistent foreign-formatted order id; michaelshouse has no staging rows) → **HTTP 404**:

```json
{"success":false,"error":"Order not found"}
```

Handler predicate `orders WHERE tenant_id=? AND id=?` (`backend/src/api/orders.js:692`) holds — no foreign row disclosed.

### PROBE-2 — POS orders: foreign id with acacia POS JWT → 404

`GET /api/pos/orders/pot_michaelshouse_foreign_0000` + POS JWT
(probed: nonexistent foreign-formatted POS transaction id under acacia cashier scope) → **HTTP 404**:

```json
{"success":false,"error":"Order not found"}
```

Handler predicate `pos_transactions WHERE id=? AND tenant_id=?` (`backend/src/routes/pos/index.js:985-987`) holds — no foreign row disclosed.

### PROBE-3 — products: cross-tenant header with acacia admin JWT → 200, zero foreign rows

`GET /api/products` + admin JWT + `x-tenant-id: michaelshouse` → **HTTP 200** with
**4 rows, all `tenantId: tenant_a2d040ea-3b1`** (ids `prod_tent`, `prod_1f8824b0-dab`,
`p4test_55D6EA4F0CDD`, `prod_224d3862-ba2`), **0 rows of any other tenant**:

```json
[{"id":"prod_tent","tenantId":"tenant_a2d040ea-3b1","categoryId":null,"sku":"TENT-01","name":"Beach Tent","description":"Premium 4-person beach-facing tent with a private terrace.","shortDescription":"4-person beachfront tent","basePrice":1500,"capacity":4,"imageUrl":"https://cdn.example.com/products/beach-tent.jpg","isActive":1,"createdAt":"2026-09-27 04:39:11","updatedAt":"2026-09-27 20:35:03","campIds":["proj_27709a3f-f50"]},{"id":"prod_1f8824b0-dab","tenantId":"tenant_a2d040ea-3b1","categoryId":null,"sku":"PROD-PROD_1F8824B0-DAB","name":"Family Tent","description":null,"shortDescription":null,"basePrice":2500,"capacity":6,"imageUrl":null,"isActive":1,"createdAt":"2026-09-27 04:40:06","updatedAt":"2026-09-27 20:35:06","campIds":[]},{"id":"p4test_55D6EA4F0CDD","tenantId":"tenant_a2d040ea-3b1","categoryId":null,"sku":"P4TEST","name":"P4 Test Item","description":null,"shortDescription":null,"basePrice":5,"capacity":1,"imageUrl":null,"isActive":1,"createdAt":"2026-09-27 04:40:06","updatedAt":"2026-09-27 10:40:05","campIds":[]},{"id":"prod_224d3862-ba2","tenantId":"tenant_a2d040ea-3b1","categoryId":null,"sku":"P5MEAL","name":"P5 Restaurant Meal","description":"P5 walkthrough meal (staging only)","shortDescription":null,"basePrice":50,"capacity":1,"imageUrl":null,"isActive":1,"createdAt":"2026-09-27 20:34:49","updatedAt":"2026-09-27 20:35:08","campIds":["camp_e323b315-725"]}]
```

Note on the 200 (not 403): `GET /api/products` is method-branched **public**
(`backend/src/index.js:643-648` — GET→public scope, token ignored), so a 403 is
inapplicable by design; the isolation property is that **zero foreign rows** are
disclosed, which holds (4/4 own-tenant). No `michaelshouse` rows exist to leak
(single-tenant staging census above).

### BONUS — orders list with nonexistent-tenant header → 401 fail-closed, no data

`GET /api/orders?limit=2` + admin JWT + `x-tenant-id: michaelshouse` → **HTTP 401**:

```json
{"success":false,"error":"Unauthorized: missing tenant context"}
```

`getTenant` resolves the hint to nothing (no such staging tenant) → `requireTenantHint`
fails closed before any row access (`backend/src/middleware/resolveScope.js:233-237`).
A 403 `scopeDenied` would require a second *existing* tenant (claim≠hint via
`requireAuth.js:204-207`); on single-tenant staging the fail-closed 401 is the
correct deny — no data either way.

## Verdict: PASS

| Probe | Code | Disclosed foreign rows |
|---|---|---|
| PROBE-1 booking order foreign id | **404** | 0 |
| PROBE-2 POS order foreign id | **404** | 0 |
| PROBE-3 products cross-tenant header | **200, 4/4 own-tenant** | 0 |
| BONUS orders cross-tenant header | **401 fail-closed** | 0 |
| Controls (admin list, admin detail, POS list) | **200/200/200** | — (own rows, tokens valid) |

No cross-tenant data disclosed on any of the three surfaces. Both JWTs shredded.
Mutations performed: zero (logins + GETs only).
