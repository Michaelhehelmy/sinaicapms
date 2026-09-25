# 03-u-011-followup — Probe: NULL-tenant admins (tenant-delete detach)

Task: `probe-null-admins` (`.opencode/agents/tmp/2026-09-24-probe-null-admins.md`) — U-fix follow-up 2026-09-24.
Method: read-only. Local miniflare D1 copy opened `mode=ro` via Python `sqlite3` (zero writes);
remote prod/staging via `wrangler d1 execute --remote` SELECT-only (meta confirms `rows_written: 0`).
No source, D1, or deploy touched.

## 1. Baseline

`fix(orders): apply customer upsert` commit `8534795` confirmed pushed before probing:

```
$ git log --oneline -3
8534795 fix(orders): apply customer upsert to the orders path — U-002 follow-up
4ae505a fix(customers): unique email per tenant + upsert on reservation — audit U-002
cb3927c fix(schema): rooms_new.tenant_id NOT NULL + FK + backfill — audit U-011
$ git ls-remote origin HEAD
853479590b45cbbb504ab83dfcc39babb110f761  HEAD   (= local HEAD)
```

## 2. Local census (miniflare D1, mode=ro)

File: `backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9212c2d93a7c1f389c84044f61f98a63279538cbc21123f36266d12a4326d1d8.sqlite`

Raw output:

```
TOTAL: [(84,)]
NULL-tenant COUNT: [(16,)]
NON-NULL COUNT: [(68,)]
--- NULL-tenant rows (id, email, role, is_active, created_at, updated_at) ORDER BY created_at ---
('superadmin', 'admin@sinaicamps.com', 'super_admin', 1, '2026-09-05 07:40:08', None)
('adm_32cf9189-c54', 'e2e-crud-admin-1788595145034@test.com', 'admin', 1, '2026-09-05 07:59:15', None)
('adm_bcd7f1c4-ff6', 'e2e-crud-admin-1788611971014@test.com', 'admin', 1, '2026-09-05 12:39:43', None)
('adm_12cdae12-418', 'e2e-crud-admin-1788672144702@test.com', 'admin', 1, '2026-09-06 05:22:37', None)
('adm_83b9465f-b36', 'e2e-crud-admin-1788674727934@test.com', 'admin', 1, '2026-09-06 06:05:40', None)
('adm_8cb82f54-d97', 'e2e-crud-admin-1788678394940@test.com', 'admin', 1, '2026-09-06 07:06:54', None)
('adm_8fa8c614-d03', 'e2e-crud-admin-1788681551743@test.com', 'admin', 1, '2026-09-06 07:59:24', None)
('adm_c06af668-338', 'e2e-crud-admin-1788683163342@test.com', 'admin', 1, '2026-09-06 08:26:15', None)
('adm_f38364e2-671', 'e2e-crud-admin-1788698725159@test.com', 'admin', 1, '2026-09-06 12:45:37', None)
('adm_f5d765d2-65b', 'e2e-crud-admin-1788828467969@test.com', 'admin', 1, '2026-09-08 00:48:12', None)
('adm_03af6dfd-4a0', 'e2e-crud-admin-1788829519030@test.com', 'admin', 1, '2026-09-08 01:05:44', None)
('adm_d3be7e2f-9d2', 'e2e-crud-admin-1788937244088@test.com', 'admin', 1, '2026-09-09 07:01:08', None)
('adm_ff16946f-c25', 'e2e-crud-admin-1788986959073@test.com', 'admin', 1, '2026-09-09 20:49:43', None)
('adm_69b308e7-ad6', 'e2e-crud-admin-1789016533052@test.com', 'admin', 1, '2026-09-10 05:02:37', None)
('adm_4c20bc15-5bd', 'e2e-crud-admin-1789021330913@test.com', 'admin', 1, '2026-09-10 06:22:35', None)
('adm_9b77b6ca-b9b', 'e2e-crud-admin-1789027229135@test.com', 'admin', 1, '2026-09-10 08:00:52', None)
--- role x is_active breakdown of NULL-tenant rows ---
('admin', 1, 15)
('super_admin', 1, 1)
```

Attribution of the 15 orphans (source read, not detach): `tests/e2e/specs/admin/super-admin-crud.spec.ts:31`
`const TEST_ADMIN_EMAIL = \`e2e-crud-admin-${TS}@test.com\`` with `TEST_ADMIN_PASSWORD = 'TestPass123!'`
(known, committed password). The spec's delete tests only assert the confirm dialog exists / cancel
dismisses (`:287-311`) — no test ever confirms a delete and there is no `afterEach`/`afterAll` cleanup,
so each E2E run that reaches the create test leaves one row behind (form posts without a tenant →
`POST /admin/admins` binds `tenant_id || null`, admin.js:306). 15 runs over 2026-09-05…09-10 → 15 rows.
**Zero of the 16 NULL rows came from tenant-delete detach** (see §4: the cascade deletes tenant admins).

## 3. Remote prod + staging (credentials EXIST — SELECT-only, rows_written: 0)

No "unavailable" — both `wrangler d1 execute --remote` calls succeeded.

Prod (`campmaster-db`, `1008d7ef-…`):

```
--- NULL-tenant rows ---
id: superadmin | email: admin@sinaicamps.com | role: super_admin | is_active: 1
created_at: 2026-07-15 18:17:39 | updated_at: 2026-08-22 06:28:16
--- totals --- total: 3 | (admin,1): 2 | (super_admin,1): 1
```

Staging (`campmaster-db-staging`, `4a9e6e45-…`, `--env staging`):

```
--- NULL-tenant rows ---
id: superadmin | email: admin@sinaicamps.com | role: super_admin | is_active: 1
created_at: 2026-09-22 05:35:01 | updated_at: null
--- totals --- total: 2 | (admin,1): 1 | (super_admin,1): 1
```

Prod and staging each contain exactly ONE NULL-tenant row: the `superadmin` seed. Zero orphan admins remotely.

## 4. Detach-behavior evidence

Schema DDL (verbatim, `SELECT sql FROM sqlite_master WHERE name='admins'`):

```sql
CREATE TABLE admins (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    ...
```

So the DB-level fallback is DETACH (`ON DELETE SET NULL`), but the app path never lets it fire:

`buildTenantCascadeStmts` (`backend/src/api/admin.js:63-78`, verbatim) explicitly destroys tenant
admins BEFORE the tenants row, and both delete paths use it — single `DELETE` (:255-257) and bulk
`delete` (:166-173):

```js
function buildTenantCascadeStmts(env, tid) {
  return [
    env.DB.prepare("DELETE FROM orders WHERE tenant_id = ?").bind(tid),
    ...
    env.DB.prepare("DELETE FROM admins WHERE tenant_id = ?").bind(tid),
    ...
  ];
}
```

`ON DELETE SET NULL` therefore fires only on out-of-band deletes that bypass the cascade (raw SQL,
foreign tooling) — a real but narrow stranding path.

Grep `UPDATE admins SET tenant_id` (`grep -rn`, backend/src): exactly ONE hit —

```
backend/src/api/admin.js:299:
  "UPDATE admins SET tenant_id = ?, password_hash = ?, role = ?, ... WHERE id = ?"
```

— the `POST /admin/admins` create-or-update path rebinding `tenant_id || null` (:306, super_admin-guarded
at :290-292). It is a (re)assignment, not a detach. Corroborating grep: zero `SET tenant_id = NULL` /
`SET tenant_id=NULL` updates anywhere in `backend/src/`.

Orphans ARE removable: `DELETE FROM admins WHERE id = ? AND role != 'super_admin'` (admin.js:315).

## 5. Login-path NULL handling (`backend/src/api/auth.js:136-184`, verbatim reads)

```js
// Super admins (tenant_id IS NULL) can login without a tenantId
const admin = targetTenant
  ? await env.DB.prepare(
      "SELECT ... FROM admins WHERE email = ? AND (tenant_id = ? OR tenant_id IS NULL) AND is_active = 1"
    ).bind(email, tenantId).first()
  : await env.DB.prepare(
      "SELECT ... FROM admins WHERE email = ? AND tenant_id IS NULL AND is_active = 1"
    ).bind(email).first();
...
{ sub: admin.id, userId: admin.id, tenantId: admin.tenant_id || tenantId, ... }  // :161-162, :167, :183
```

Both branches have **no role gate**: ANY active NULL-tenant row matches — including a `role='admin'`
orphan. With a caller-supplied `tenantId`, the orphan matches via the `OR tenant_id IS NULL` arm and
is minted `tenantId: NULL || tenantId` = the caller-supplied tenant's scope. I.e. a stranded active
orphan authenticates cross-tenant (password still required — locally that password is the committed
`TestPass123!`). Refresh/me paths (`:212`, `:268`) select by id and propagate
`admin.tenant_id || decoded.tenantId` — consistent, no independent NULL hole. No other
`tenant_id IS NULL` readers touch `admins` (remaining hits are `categories.js` scoping, unrelated).

## 6. Per-row classification + counts

| Class | Local (84) | Prod (3) | Staging (2) |
|---|---|---|---|
| super_admin expected (seed `superadmin`, active) | 1 | 1 | 1 |
| orphan-ACTIVE dangerous (`role='admin'`, `is_active=1`, NULL tenant) | **15** (e2e-crud litter, known pw shape) | 0 | 0 |
| orphan-inactive benign | 0 | 0 | 0 |
| properly tenanted | 68 | 2 | 1 |

## 7. Verdict: FIX-NEEDED (latent — login hardening; no active breach)

- DATA: SAFE everywhere. No NULL row in any environment came from tenant-delete detach (cascade
  deletes admins first); prod/staging hold only the seed superadmin; the 15 local orphans are dev-only
  E2E litter, deletable via `DELETE /admin/admins/:id`.
- CODE: FIX-NEEDED. `auth.js:140`'s `(tenant_id = ? OR tenant_id IS NULL)` branch (and `:143`) has no
  role gate, so any future stranded active orphan — via the out-of-band `ON DELETE SET NULL` path —
  logs into an arbitrary tenant scope. Recommended hardening (not applied — probe is read-only):
  gate the `OR tenant_id IS NULL` arm to `role='super_admin'` (detached `admin` rows → 401), and/or
  deactivate-on-detach; plus E2E hygiene (tenant default + cleanup in `super-admin-crud.spec.ts`).
- Counts: 18 NULL-tenant rows classified across 3 envs — 3 expected, 15 orphan-active, 0 orphan-inactive.

## 8. Rollback

Revert single commit (new audit file + logbook lines only).
