# C.2 — Folio Cross-Tenant Probe (staging, commit 10)

- Date: 2026-09-30 UTC
- Spec: `.opencode/agents/tmp/2026-09-30-fc2.md` (task `folio-c2-xtenant`)
- Baseline: `c32d822` confirmed pushed (`git rev-parse HEAD` == `git ls-remote origin HEAD` == `c32d8227e17b8d0cb4477ee3a750497986565f00`) before any write; tracked tree clean apart from pre-existing untracked spec/scratch.
- Target: `https://staging.sinaicamps.com` (staging reachability: `GET /api/openapi.json` → 200)
- Scope: staging only. 2 logins (auth, not data writes) + 1 seed write (S1, disclosed below) + reads. No source touched, no deploy.sh.
- Credentials: acacia admin + testb admin JWTs obtained via login, used from
  `chmod 600` files, never printed, **shredded after** (`rm /tmp/fc2_acacia_login.json /tmp/fc2_testb_login.json /tmp/fc2_tok_a /tmp/fc2_tok_b`; zero `eyJ` strings in this file — login bodies below are redacted to status + user only).

## Auth (token-validity setup)

- `POST /api/auth/login` `{email: admin.test@acaciacamp.com, tenantId: acaciacamp}` → **HTTP 200**,
  user `{"id":"adm_291a0396-a73","email":"admin.test@acaciacamp.com","role":"admin","tenantId":"tenant_a2d040ea-3b1"}`
  (token received, redacted here, shredded after).
- `POST /api/auth/login` `{email: admin@testb.com, tenantId: testb}` → **HTTP 200**,
  user `{"id":"adm_a02e2374-5fd","email":"admin@testb.com","role":"admin","tenantId":"tenant_aa7b29b4-a06"}`
  (token received, redacted here, shredded after).

## S1 — testb folio seed (the single allowed write, disclosed)

Pre-probe state: `GET /api/folios` + testb JWT + `x-tenant-id: testb` → **HTTP 200**,
`{"folios":[],"counts":{"open":0,"settled":0,"voided":0,"total":0}}` — testb owns
zero folios, so P2 (own-200 control) is unprovable without a seed. Acacia owns 1
folio (`folio_7b1929c1-5ea`, settled — the B.8 walkthrough folio).

Seed: `POST /api/folios` + testb JWT + `x-tenant-id: testb`
`{"notes":"x-tenant probe seed (C.2)"}` → **HTTP 201**:

```json
{"success":true,"id":"folio_f829ea0e-2b7","status":"open","guestId":null,"primaryOrderId":null,"totalAmount":0}
```

No guest, no order link, no charges — a bare open folio. Left in place by design
(the owning tenant's own row; exactly 1 open folio for testb after this run).

## Probes (raw outputs verbatim)

### P1 — acacia → testb folio (real ID) → 404

`GET /api/folios/folio_f829ea0e-2b7` + acacia JWT + `x-tenant-id: acaciacamp` → **HTTP 404**:

```json
{"success":false,"error":"Folio not found"}
```

Tenant-scoped predicate `WHERE tenant_id = ? AND id = ?` (`folios.js` detail
handler) holds — no foreign row disclosed.

### P2 — testb → own folio (seed) → 200

`GET /api/folios/folio_f829ea0e-2b7` + testb JWT + `x-tenant-id: testb` → **HTTP 200**:

```json
{"folio":{"id":"folio_f829ea0e-2b7","tenantId":"tenant_aa7b29b4-a06","guestId":null,"primaryOrderId":null,"status":"open","openedAt":"2026-09-30 06:59:31","closedAt":null,"totalAmount":0,"settledBy":null,"settleMethod":null,"notes":"x-tenant probe seed (C.2)"},"charges":[],"settlements":[]}
```

Token valid, seed landed and readable by its owner.

### P3 — acacia JWT + `x-tenant-id: testb` → folios list → 403

`GET /api/folios?limit=2` + acacia JWT + `x-tenant-id: testb` (REAL second tenant as hint) → **HTTP 403**:

```json
{"success":false,"error":"Forbidden: Access denied to this tenant partition"}
```

Strict claim-vs-hint gate (`resolveScope.js` admin branch) — the seeded testb
folio is not disclosed to the acacia caller. Zero rows disclosed.

### P4 — acacia → POST settle on testb folio → 404

`POST /api/folios/folio_f829ea0e-2b7/settle` + acacia JWT + `x-tenant-id: acaciacamp`
`{"amount":1,"method":"cash"}` → **HTTP 404**:

```json
{"success":false,"error":"Folio not found"}
```

The settle handler loads the folio under the caller's tenant scope BEFORE
parsing/validating the body, so a foreign folio is indistinguishable from a
missing one — and no settlement row is written (testb folio still open, verified
via P2 shape; no settlement attempted under the owning token).

## Verdict: PASS

| Probe | Code | Disclosed foreign rows |
|---|---|---|
| P1 acacia → testb folio (real ID) | **404** | 0 |
| P2 testb → own folio (seed) | **200** | — (own row, token valid) |
| P3 acacia + testb hint → folios list | **403** | 0 |
| P4 acacia → POST settle on testb folio | **404** | 0 (no write) |

Spec rule: PASS iff foreign 404/200/403/404 in order. Actual: **404/200/403/404**. **Verdict PASS.**

Mutations performed: 2 logins + S1 (1 folio create, testb test row, disclosed) + 4 probe reads. All JWTs shredded. No source touched, no deploy.sh.
