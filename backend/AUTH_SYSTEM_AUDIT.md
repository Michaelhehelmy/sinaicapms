# Authentication System Audit — Unifying Admin & POS Auth

**Date:** 2026-08-22
**Author:** tmp audit agent (@security-auditor track)
**Scope:** The two parallel JWT systems (`admins` panel auth vs `pos_users` terminal auth), all backend gates, frontend session handling, and a phased unification plan.
**Companion doc:** `backend/DATABASE_SCHEMA_AUDIT.md` (§D6 already rules the schema split *intentional* — this audit covers everything above the schema).

---

## TL;DR

There are **not really two auth systems — there are two user stores and one shared JWT engine**, wrapped in ~11 hand-copied authorization gates that disagree with each other in dangerous ways:

| Dimension | Admin system | POS system |
|---|---|---|
| Signer | `@tsndr/cloudflare-worker-jwt` HS256 | **same** |
| Secret | `env.JWT_SECRET` (throws if unset) | **same** |
| Access TTL | 24h | **same (24h)** |
| Refresh token | yes (7d, stateless rotate-without-revoke) | **none** |
| User store | `admins` (id TEXT, tenant_id TEXT NULL) | `pos_users` (id INTEGER, org INTEGER NOT NULL) |
| Domain marker | *absence* of a claim (no `posType`) | `posType: 'pos'` |
| Role namespace | `super_admin`, `admin` | `cashier`, `manager`, `admin` ← **collision** |
| Active-check per request | inconsistent (5 gates yes, 4 no) | yes, every request |

The unification therefore does **not** require merging tables or secrets. It requires: (1) one canonical token contract with an explicit `userType` claim, (2) **one** `requireAuth()` choke point replacing the 11 inline gates (which fixes a real bug: deactivated accounts keep working on payments/meal-schedules/pos-users/SSE until their 24h token expires), and (3) one frontend session module replacing the dual `localStorage` namespaces. Physical table merge is explicitly **not recommended** (it was tried in migration 0019 and reversed in 0028).

---

## 1. Current Auth Analysis

### 1.1 Token structure side-by-side

Both systems call the exact same primitives in `backend/src/middleware/sharedAuth.js`:
`generateToken()` (sharedAuth.js:50) stamps `{ ...payload, type, iat, exp }`; `verifyToken()` (sharedAuth.js:67) checks signature then expiry manually.

#### Admin access token — issued at `api/auth.js:154`

```js
{
  sub:      "<admins.id>",        // TEXT, e.g. "adm_a1b2c3d4e5f6"
  userId:   "<admins.id>",        // duplicate of sub (legacy compat)
  tenantId: "<tenants.id>|null",  // TEXT; null ⇒ platform super-admin scope
  email:    "admin@example.com",
  role:     "super_admin" | "admin",
  type:     "access",
  iat, exp                        // exp − iat = 24h
}
```

#### Admin refresh token — issued at `api/auth.js:160`

```js
{ sub, userId, tenantId, type: "refresh", iat, exp }   // 7d; deliberately NO role/email
```

#### POS access token — issued at `routes/pos/index.js:107`

```js
{
  sub:            "<String(pos_users.id)>",  // INTEGER id stringified!
  userId:         "<same>",
  tenantId:       "<resolved TEXT>",          // via tenant_org_mapping at login
  organizationId: 42,                         // INTEGER — the REAL POS scope key
  storeId:        7 | null,
  role:           "cashier" | "manager" | "admin",
  posType:        "pos",                      // ← the ONLY domain discriminator
  type:           "access",                   // implicit: generateToken default
  iat, exp                                    // 24h
}
```

#### Structural deltas that matter

1. **Asymmetric domain detection.** "Is this a POS token?" = `decoded.posType === 'pos'`. "Is this an admin token?" = *nothing positive* — just the absence of `posType` plus a role claim. Every one of the 11 gates must remember to test the negative case. A future route that forgets the `posType` check lets POS sessions into admin surfaces (the role collision below makes this worse than it sounds).
2. **ID type mismatch.** `admins.id` is TEXT (`adm_*`); `pos_users.id` is INTEGER stringified into the JWT. Any unified lookup keyed on `sub` must know which table to hit.
3. **Claim drift.** Admin tokens carry `email`; POS tokens don't. POS tokens carry `organizationId/storeId/taxRate-context`; admin tokens never do. A generic consumer can't assume any optional claim exists.
4. **Role-string collision.** `'admin'` means *tenant administrator* in `admins.role` and *store administrator* in `pos_users.role`. Backend hierarchy (`ROLE_HIERARCHY`, sharedAuth.js:30) knows only `super_admin:10, admin:4`; POS roles silently rank **0**. The only thing keeping a POS `role:'admin'` out of admin routes today is the hand-coded `posType` check in each gate — nothing structural.
5. **Refresh asymmetry.** Admin sessions self-renew for up to 7 days (stateless rotation, no revocation — documented T7 trade-off at `api/auth.js:186`). POS sessions die hard at ≤24h with no renewal: a cashier mid-shift gets logged out and must re-enter credentials on the terminal.

### 1.2 User stores side-by-side

| | `admins` (migration 0028) | `pos_users` (migration 0010 + 0016/0019/0023 patches) |
|---|---|---|
| PK | `TEXT` (`adm_` + uuid12, crypto-generated at auth.js:306) | `INTEGER AUTOINCREMENT` |
| Scope key | `tenant_id TEXT NULL` (NULL = super-admin, `ON DELETE SET NULL`) | `organization_id INTEGER NOT NULL` FK `pos_organizations`; `tenant_id TEXT` added 0019 (nullable, informational) |
| Bridge to tenants | direct `tenant_id` | `tenant_org_mapping` junction (migration 0041, UNIQUE both sides) |
| Login identity | `email` UNIQUE | `email` OR `username` (both UNIQUE) |
| Name | `first_name` + `last_name`, plain columns | `first_name`/`last_name` NOT NULL **plus GENERATED `name` column** (`first_name || ' ' || last_name`) — INSERTs must never target it |
| Role constraint | `CHECK(role IN ('super_admin','admin'))` | none at DB level; `DEFAULT 'cashier'`, values constrained only in Zod (`POS_USER_ROLES`, api/pos-users.js:7) |
| Soft delete | none (`is_active` only) | `deleted_at DATETIME` (checked in every POS query) |
| Password hashing | bcrypt cost 12; legacy `$sha256$` verified timing-safely and **auto-rehashed on login** (`rehashIfNeeded`) | same bcrypt; `$sha256$` verified — but `rehashIfNeeded` is hardcoded to `UPDATE admins` (sharedAuth.js:139), so legacy POS hashes are **never upgraded** |
| Session artifacts | `password_reset_tokens` (real table) | `password_reset_token/expires` columns exist but **no endpoint uses them**; `pos_user_sessions` table (0010) has zero code references — dead schema |
| Extras | `last_login TEXT` | salary/commission/department/hire_date, `permissions JSON`, `two_factor_*` (unused), `login_attempts/locked_until` (unused), tax-rate/timezone live on `pos_organizations` |

### 1.3 History you must not repeat

- **Migration 0019_unify_users.sql** merged the G1 `users` table **into `pos_users`** (with `$sha256$`-prefixed hashes and `COALESCE(role,'tenant_admin')`) and dropped `users`. That was attempt #1 at unification — *into the POS table*.
- **Migration 0028** reversed course, creating a dedicated `admins` table whose header comment says *"Simple admin users (replaces pos_users for auth)"*. Attempt #2 — *split back out*, because `pos_users` baggage (NOT NULL org, generated name, retail columns, integer IDs) made it a poor general identity store.
- Conclusion encoded in `DATABASE_SCHEMA_AUDIT.md` §D6: **keep both tables; unify at the middleware/service layer.** This audit independently reaches the same verdict (see §5, Q2).

---

## 2. Auth Flow Analysis

### 2.1 Login

| | Admin — `POST /api/auth/login` (auth.js:106) | POS — `POST /api/pos/auth/login` (routes/pos/index.js:52) |
|---|---|---|
| Validation | Zod `loginSchema` `.strip()` (camelCase-native — do **not** wrap in `toSnake`, logbook T3 lesson) | manual destructure (no Zod!) |
| Identity | `email` only; optional `tenantId` resolved against `tenants.id/subdomain/custom_domain` (auth.js:118) | single `identifier` matched against `email OR username` |
| Super-admin path | `tenantId` omitted → query `WHERE tenant_id IS NULL` (auth.js:136). With `tenantId` → `(tenant_id = ? OR tenant_id IS NULL)` — i.e. a super-admin may log in through any tenant's door | n/a |
| Deactivation | folded into the WHERE (`is_active = 1` → generic "Invalid email or password" 401) | explicit 403 `"Account deactivated"` after row found |
| Tenant scoping | token gets `admin.tenant_id || requested tenantId` | org→tenant resolved via `tenant_org_mapping`; **fallback `String(organization_id)`** (routes/pos/index.js:82-93) fabricates a pseudo-tenant like `"1"` that will never match any real partition — silent mis-scoping risk |
| Extras | `rehashIfNeeded` legacy-hash upgrade; `last_login` update | reads `pos_organizations.tax_rate` so the terminal renders server-driven tax; `last_login_at` update |
| Response | `{ success, token, refreshToken, user{id,name,email,role,tenantId} }` | `{ success, token, user{id,username,email,firstName,lastName,role,organizationId,storeId,taxRate} }` — **no refreshToken** |
| Rate limit | `/api/auth/*` bucket: 30/min/IP (index.js:104) | dedicated bucket 15/min (index.js:175); other `/api/pos/*` 60/min |

### 2.2 Register / provisioning

- **Admin self-register** (`POST /api/auth/register`, auth.js:283): tenant required, per-(email,tenant) uniqueness, inserts `role='admin', is_active=0` — "pending administrator approval". There is no approval endpoint visible in this file (approval happens via super-admin admin management).
- **POS staff creation**: no self-service. Tenant admins/super-admin create cashiers through `/api/pos-users` (admin-JWT-gated, index.js:230-257), which also **auto-provisions** the tenant's org + store + mapping row via `ensureTenantOrg()` (api/pos-users.js:84). Remember the gotchas: INSERT must include `organization_id` and use `first_name`/`last_name` only.
- Asymmetry: admins get forgot/reset/change-password flows; POS staff have **no self-service password reset** despite the dormant columns — reset is admin-mediated only (`resetPasswordSchema` in pos-users.js:35).

### 2.3 Forgot / reset / change password (admin-only surface)

- **Forgot** (auth.js:328): enumeration-safe response; in-process per-IP limiter 5/15 min keyed on `cf-connecting-ip` only (S-C3); purges prior unused tokens; caps 5 active tokens/user; 1-hour expiry; `password_reset_tokens` ensured via runtime `CREATE TABLE IF NOT EXISTS` (now also a real migration table).
- **Reset** (auth.js:395): validates unused + unexpired, swaps hash, marks used. ⚠️ Does **not** invalidate existing JWT sessions — a stolen access token survives a password reset for up to 24h (consequence of stateless design; see §6/Q6).
- **Change** (auth.js:430): Bearer-authenticated, verifies current password. Same no-revocation caveat.
- **POS**: none of these exist. An admin resets a cashier's password via the pos-users API.

### 2.4 Refresh & logout

- **Admin refresh** (`POST /api/auth/refresh`, auth.js:190): rejects anything whose `type !== 'refresh'` (so POS/access/reset tokens are refused as refresh material ✅). Re-reads the admin row and enforces `is_active` — so deactivation kills refresh within ≤24h even though outstanding access tokens linger. Reissues **both** tokens (fresh iat/exp). Because revocation doesn't exist (DB frozen per T7), an old refresh token remains valid until its own 7-day expiry — acceptable for stateless design but worth revisiting (Q6).
- **Logout** (auth.js:245): stateless no-op `{success:true}` — client-side discard only. POS has no logout endpoint at all (client discards `pos_token`).

### 2.5 Whoami

- `GET /api/auth/me` (auth.js:250): Bearer → verify → `admins` lookup by `decoded.sub` → `is_active` check → profile. Note: no explicit `posType` guard — a POS token falls through to a 404 ("Admin not found") because its integer-string id won't match `admins.id`. Harmless, but another place relying on accidental type mismatch instead of an explicit check.

---

## 3. Auth Middleware Analysis

### 3.1 The paradox: a "single source of truth" nobody calls

`sharedAuth.js` exports `authMiddleware` (sharedAuth.js:182) as *the* Hono gate: verifies Bearer, demands a `role` claim, rejects `posType==='pos'` with 403, re-checks `is_active` in DB, sets `c.set('user')`. **It has zero callers.** Every protected surface re-implements its own gate inline. `middleware/auth.js` is a pure backward-compat re-export shim.

### 3.2 Full inventory of protection sites (11 gates)

| # | Surface | File:line | Checks performed | Missing / divergent |
|---|---|---|---|---|
| G1 | `/api/payments/create-intent` | index.js:123 | tenant→404 · Bearer · verify · posType→403 · `super_admin ∨ tenantId==tenant` else 403 | **no is_active check** |
| G2 | `/api/payments/create-checkout` | index.js:138 | identical to G1 | **no is_active check** |
| G3 | `/api/payments/confirm` | index.js:153 | identical to G1 | **no is_active check** |
| G4 | `/api/meal-schedules` | index.js:192 | tenant→404 · Bearer · verify · posType→403 · tenant partition else 403 | **no is_active check** |
| G5 | `/api/meal-schedules/*` | index.js:210 | copy of G4 | copy of G4's gaps |
| G6 | `/api/pos-users` | index.js:230 | Bearer · verify · posType→403 · role ∈ {super_admin, admin} → 403 · tenant unless super | **no is_active check**; handler re-scopes via `scopeTenant()` |
| G7 | `/api/pos-users/*` | index.js:244 | copy of G6 | copy of G6's gaps |
| G8 | `/api/stream/orders` (SSE) | index.js:270 | `?tenantId=` required · token from header **or `?token=` query** (EventSource can't set headers) · posType→403 · role ∈ {admin, super_admin} · tenant match unless super | **no is_active check**; unique dual-source token extraction |
| G9 | catch-all `/api/*` | index.js:316 | public-path allowlist → else tenant→401 · Bearer · verify · **DB is_active (against `admins`!)** · posType→403 · tenant partition else 403 · sets `user` | check-order quirk: active-check runs **before** posType rejection, so a valid POS token gets misleading `401 Account deactivated` (admins row miss) instead of the intended 403 |
| G10 | `/api/admin/*` (handleAdminRoute) | api/admin.js:53 | Bearer · verify · `posType ∨ role!=='super_admin'` → 403 `"Unauthorized: Super Admin access required"` · DB is_active | error text says *Unauthorized* with a 403 |
| G11 | all `/api/pos/*` post-login (`posAuth`) | routes/pos/index.js:29 | Bearer · verify · **requires** `posType==='pos'` else 401 `"Invalid POS session"` · DB check `is_active ∧ deleted_at IS NULL` **every request** · sets `posUser` | no role enforcement anywhere inside POS routes — cashier ≡ manager ≡ admin functionally |

### 3.3 What this patchwork means

1. **Deactivation gap (real bug).** `is_active` is enforced in G9/G10/G11 + `/auth/me` + refresh, but **not** in G1–G8. Set `is_active=0` on a rogue tenant admin and their still-valid 24h token keeps working against payment intents, meal schedules, POS-staff management, and SSE streams. G11 (POS) is ironically the strictest gate in the codebase.
2. **Error-contract entropy.** Same failure, different shapes: 401 vs 403 ordering varies; message strings differ (`"Forbidden: POS sessions cannot access admin routes"` ×3 variants, `"Invalid POS session"`, `"Unauthorized: Super Admin access required"`). Tests pin several of these strings — consolidation must preserve them or update tests atomically.
3. **Context-key split.** Admin gates set `c.set('user', …)` (either the raw `decoded` payload in G9 or the enriched DB row in `authMiddleware`); POS sets `c.set('posUser', decoded)`. Handlers read different keys with different enrichment levels — a unified context shape is prerequisite to merging handlers.
4. **Role logic triplicated.** `hasRolePermission()` (numeric hierarchy), raw string comparisons (`decoded.role !== 'super_admin' && decoded.tenantId !== tenantId`), and `scopeTenant()` (super-admin `?tenantId=` override semantics) coexist. Only `scopeTenant` implements drill-down scoping correctly.
5. **Rate-limit topology** (all fail-closed per logbook): `/api/auth/*` 30/min · `/api/admin/*` 20/min · `/api/payments/*` 20/min · `/api/pos/auth/login` 15/min · other `/api/pos/*` 60/min · catch-all 100/min · forgot-password extra 5/15min in-process. Any path moves during unification must preserve bucket boundaries.

### 3.4 Tenant resolution feeding the gates

`getTenant()` (middleware/tenant.js:5): `?tenant_id` query → `x-tenant-id` header → hostname (strip `www.`, localhost/127.* → null) → exact match on `tenants.id/subdomain/custom_domain`. The Hono `tenantMiddleware` wrapper exists but the main app calls `getTenant()` per-route instead; the 404 skip-list exempts `/api/tenants`, `/api/auth`, `/admin`. Frontend mirrors this resolution client-side (`getTenantId()` in api.ts:65) and sends `x-tenant-id` everywhere — the two implementations agree today but are maintained separately.

---

## 4. Frontend Auth Integration

### 4.1 Admin SPA — React context + silent refresh (`app/src/lib/auth.tsx`, `lib/api.ts`)

- **Storage:** `sinaicamps_token` / `sinaicamps_refresh_token` / `sinaicamps_user` (localStorage).
- **Session bootstrap:** `AuthProvider` lazily restores the cached user, then validates once via `GET /auth/me`; failure wipes all three keys (auth.tsx:57-88).
- **Login:** `login(email, password)` pulls `tenantId` from `getTenantId()` (host → subdomain; `sinaicamps.com` → synthetic `'marketplace'`; `?tenant=` override; super-admin drill-down `_tenantScopeOverride` wins first — T9) and persists token+refresh+user.
- **Silent refresh (T7):** `apiFetch` intercepts 401 on non-POS, non-refresh endpoints, runs a **single-flight** `_refreshPromise` so concurrent 401s share one refresh call, retries the original request once with the new token, and only then falls through to hard-logout storage clearing (api.ts:165-195).
- **RBAC mirror:** `ROLE_HIERARCHY` duplicated in TS (auth.tsx:12) — `super_admin:10, admin:4` — powering `hasRole()`. Drift-prone: adding a backend role requires editing two files.
- **Dual-token plumbing:** `apiFetch` sniffs the endpoint prefix (`endpoint.startsWith('/pos/')`) to choose between `pos_token` and `sinaicamps_token` (api.ts:135-137). The fetch layer knows about both worlds — the main coupling point between the SPAs.

### 4.2 POS SPA — bare useState, no refresh (`app/src/components/pos/POSApp.tsx`, `views/LoginView.tsx`)

- **Storage:** separate namespace `pos_token` / `pos_user`.
- **No context/provider:** two `useState` hooks hydrate from localStorage; navigation between tabs is a **full page load** (`window.location.href = posUrl('/pos/'+view)`), so the session re-hydrates from localStorage on every view change.
- **Guard:** effect redirects to `/pos/login` whenever `user`/`token` is missing (POSApp.tsx:129-135).
- **Login:** `posLogin(identifier, password)` → persist both keys → callback flips app state. No refresh flow anywhere: any 401 makes `apiFetch` wipe the `pos_*` keys and throw → hard logout. Combined with the 24h non-renewable token, a long shift can terminate mid-sale.
- **Tax nuance:** the login response's `taxRate` (from `pos_organizations`) is consumed by the terminal — any response-shape change to POS login breaks checkout pricing.

### 4.3 Shared quirks

- Tokens live in localStorage (XSS-exfiltrable by design choice; consistent across both SPAs; E2E security spec asserts they are *not* cookies).
- Both SPAs treat 401 as "wipe everything," which during the unification rollout would cause a fleet-wide logout if key names change without a migration reader (see R4).
- Stale test debt: `tests/e2e/specs/auth/tenant-admin-login.spec.ts` still expects tenant-admin sessions under `pos_token` — written in the pre-0028 era when tenant admins lived in `pos_users`. These specs describe the *old* world and will actively fight a unification unless audited first.

---

## 5. Answers to the Six Key Questions

### Q1 — Can admin and POS JWTs share the same structure?

**Yes — they already share the hard parts** (signer, algorithm, secret, access TTL, `type` claim machinery). What's needed is one canonical claim contract with an **explicit, positive** domain marker:

```js
{
  sub,                    // canonical user id (string)
  userType: 'platform'    // NEW: 'platform' | 'org'   (replaces absence-vs-posType)
            | 'org',
  tenantId,               // TEXT canonical scope, resolved AT ISSUE TIME for org users
  role,                   // namespaced (see Q3)
  // org-only extras:
  organizationId,         // INTEGER
  storeId,                // INTEGER|null
  // lifecycle:
  type,                   // 'access' | 'refresh'
  jti,                    // optional now — enables revocation later (Q6)
  iat, exp
}
```

Migration rule: issuers add `userType` immediately; verifiers accept **both** `userType` and legacy `posType==='pos'` for one release window; then `posType` is retired. Keep `userId` alongside `sub` until every reader is migrated (G9 binds `decoded.userId || decoded.sub`). Keep `email` in platform tokens for now; trim later.

### Q2 — Can admin and POS share the same users table?

**Not the physical tables, and history proves it.** Merging *into* `pos_users` was attempted (0019) and reverted (0028, "replaces pos_users for auth"): the POS table's baggage — `organization_id INTEGER NOT NULL`, generated `name` column, retail/HR columns, integer PKs — is exactly what a general identity store must not carry. `DATABASE_SCHEMA_AUDIT.md` §D6 independently concluded "intentional split — keep both."

**Recommendation: unify identity logically, not physically.**

- **Phase 1 (now):** a thin `resolveIdentity(identifier, domainHint)` service in `sharedAuth.js` that encapsulates "which table, which lookup" behind one interface. Both logins call it. Zero data migration, zero risk.
- **Phase 3+ (only if product demands):** a *clean new* `users` table (never `pos_users`) with `user_type` discriminator plus a `memberships(user_id, tenant_id, organization_id, store_id, role)` child — enabling true cross-domain identities (a camp manager who also works a POS shift, one SSO). Do this only when a concrete feature needs it; until then the bridge (`tenant_org_mapping`) already joins the domains where required.

Email uniqueness note if Phase 3+ ever lands: `admins.email` is globally UNIQUE while `pos_users.email` is UNIQUE too — cross-table duplicates exist today (an admin and a cashier sharing an address), so a merged table needs composite uniqueness `(email, tenant/org scope)` planning, not a naive UNIQUE.

### Q3 — How should RBAC work in a unified system?

Two problems to fix: the **name collision** and the **scattered enforcement**.

1. **One hierarchy, extended** — extend `USER_ROLES`/`ROLE_HIERARCHY` (sharedAuth.js:24-33) to include org roles, and generate/mirror the constant to the frontend from one source (even a tiny build-time copy or served `/api/meta` beats two hand-edited maps):

   ```
   super_admin: 100   (platform)
   admin:        80   (platform/tenant)
   manager:      50   (org)
   cashier:      30   (org)
   ```

2. **Domain pairing, mechanically enforced.** Never compare a bare role string across domains. The unified `requireAuth(c, { domains: ['platform'], roles: [...] })` helper must reject when `userType ∉ domains` **before** evaluating roles — making it structurally impossible for a POS `role:'admin'` to satisfy a platform check even if a caller forgets.
3. **Optional rename** (deferred): migrating POS `'admin'` → `'owner'`/`'store_admin'` removes the ambiguity at the data level (one D1 migration + `POS_USER_ROLES` enum + UI labels). Nice-to-have; the mechanical pairing above removes the security exposure regardless.
4. **Keep numeric hierarchy over permission strings.** `pos_users.permissions JSON` exists but is unread by auth; permission strings are a bigger refactor with no current requirement. Numeric levels match the existing frontend `hasRole()` mental model.
5. **POS-internal roles stay un-enforced short-term** (today cashier ≡ manager functionally), but the unified middleware gives you the hook to start gating e.g. shift-close or price overrides by role later.

### Q4 — How should tenant scoping work for admin vs POS users?

Adopt one canonical rule: **every identity resolves to exactly one `tenantId` (TEXT) at token issuance; per-request authorization compares that canonical value against the host/header/query-resolved tenant.**

- **Platform users (`admins.tenant_id NULL`):** token carries `tenantId: null`; they present an explicit scope per request (existing `?tenantId=` / `x-tenant-id` / host resolution; `scopeTenant()` semantics generalized). Marketplace operations use the synthetic `'marketplace'` tenant row. Preserve T9 drill-down behavior.
- **Org users:** `tenantId` is derived at login via `tenant_org_mapping` (already done) and stamped into the token alongside `organizationId`. Two changes required:
  1. **Kill the silent fallback** `String(organization_id)` (routes/pos/index.js:82-93). An unmapped org should either fail login with a clear error or be auto-provisioned through the existing `ensureTenantOrg()` — never minted a fake pseudo-tenant like `"1"`.
  2. **Data-layer duality stays** for now (schema audit §5): queries filter by whichever key the table actually has — `organization_id` for catalog/products, `tenant_id` for transactions/shifts. Document it; don't try to normalize the physical keys.
- **Super-admin bypass matrix** stays: super passes tenant checks everywhere; plain admins are hard-scoped to their token tenant (with the existing exception that a super-admin *may* log in through any tenant door — auth.js:132).

### Q5 — What is the migration path from current to unified?

Five phases, each independently shippable and revertible. Nothing here requires downtime; D1 migrations are additive.

**Phase 0 — Baseline & guardrails (½ day)**
- Snapshot current suite counts (`backend`: 1082 tests/36 files; root integration 169; E2E 552 passing).
- Add contract tests pinning the behaviors you intend to *change* (deactivated-account responses on G1–G8) and the ones you intend to *preserve* (exact error strings/status codes listed in §3.2).
- Audit stale E2E auth specs (tenant-admin-login expecting `pos_token`) — decide rewrite-vs-delete before touching prod code.

**Phase 1 — One choke point on the backend (2–3 days)**
1. Add `userType` claim to both issuers (auth.js login/refresh; routes/pos/index.js login). Verifiers accept `userType` **or** `posType`.
2. Implement `requireAuth(c, opts)` in `sharedAuth.js` (Bearer extract → verify → domain check → role check via extended hierarchy → tenant-partition check with `scopeTenant` semantics → DB active check → set a **unified** `c.set('auth', {...})` context).
3. Replace G1–G10 inline blocks with `requireAuth` calls **preserving current response strings/codes byte-for-byte** (tests pin them). Fix deliberately, as flagged changes: add the missing is_active checks to G1–G8; reorder G9 so `posType` is rejected before the admins active-lookup.
4. Keep `authMiddleware`/`middleware/auth.js` shims exporting the new helper so import sites don't break.

**Phase 2 — Session-lifecycle parity (1–2 days)**
1. Issue refresh tokens to POS sessions (`type:'refresh'`, same 7d policy initially; optionally longer, see Q6). Extend response: `{ success, token, refreshToken, user }`.
2. Add `POST /api/pos/auth/refresh` mirroring the admin handler (verify type → re-read `pos_users` incl. `deleted_at IS NULL ∧ is_active` → reissue pair). Rate-limit within the existing `/api/pos/*` bucket.
3. Optionally drop POS access TTL to something shorter (e.g. 8h) once refresh exists — improves stolen-token windows without hurting terminals.

**Phase 3 — Frontend session unification (2 days)**
1. New `app/src/lib/session.ts` owning ALL storage: one namespaced scheme, e.g. `sinaicamps_session` blob `{ token, refreshToken, userType, user }` (or keep two key-pairs but owned by one module — blob preferred; it makes "read legacy keys" trivial).
2. `session.ts` seeds itself from legacy keys (`sinaicamps_*` AND `pos_*`) on boot → writes new scheme → deletes legacy keys. Deploy-window users keep their sessions; no mass logout.
3. `apiFetch` stops prefix-sniffing: attach the stored token regardless of endpoint; server-side domain checks are authoritative anyway. Silent refresh becomes userType-aware (POS gains the single-flight refresh flow).
4. `POSApp` adopts `session.ts` (can keep its useState rendering; only source-of-truth changes). `auth.tsx` becomes a thin adapter over `session.ts`.
5. Regenerate `api-types.ts` from `openapi.json` after envelope changes (`PosLoginResponse` gains `refreshToken`).

**Phase 4 — RBAC consolidation (1 day)**
- Extend `ROLE_HIERARCHY` with org roles; expose ONE source to frontend (generated constant or meta endpoint). Replace remaining raw role-string comparisons in handlers with `requireAuth` options. Optional: POS `'admin'` rename migration.

**Phase 5 (optional, product-driven) — Physical identity merge**
- Only if cross-domain identities become a requirement: clean `users` + `memberships` tables, backfill from `admins`+`pos_users`, dual-write period, view-based compat, cut FKs over. Explicitly *not* scheduled — see Q2 history.

### Q6 — How should refresh tokens work in a unified system?

**Current state:** admin-only, stateless, rotate-on-use **without revocation** — old refresh tokens remain valid until their own 7-day expiry (documented T7 trade-off since the DB was frozen for writes). Consequences: password reset / deactivation cannot kill an outstanding refresh family instantly; theft window = full 7 days.

**Unified recommendation — evolve in two steps:**

1. **Step 1 (Phase 2 above): parity.** Both domains issue `{access, refresh}` pairs; rotation stays stateless. This is zero-new-schema and matches today's semantics — POS simply gains what admin already has.
2. **Step 2 (recommended follow-up): D1-backed revocable refresh.**
   - Table `refresh_tokens(id, user_type, user_id, tenant_id, token_hash, jti, expires_at, revoked_at, replaced_by_jti, created_at)`.
   - Store only a SHA-256 hash of the token. Rotation marks the old row `replaced_by_jti`; presenting a rotated (already-replaced) token ⇒ treat as theft ⇒ revoke the whole family.
   - Write frequency ≈ once per rotation per session (≤1/7d per device) — negligible against the free-plan KV quota concern, because this is **D1**, not KV.
   - Wire revocation triggers that exist today as no-ops: password reset/change (admin flow), `is_active=0`, POS soft-delete (`deleted_at`), and a real logout that revokes rather than no-ops.
   - POS-specific tuning: terminals tolerate offline windows — consider refresh TTL 30d for org users and keep access short (post-Phase-2). Device-binding (per-terminal `jti` allowlist) is a later hardening, not a launch requirement.
   - Retire `pos_user_sessions` (dead since Track C) rather than resurrecting it — the new table supersedes it.

---

## 6. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Role-name collision bites mid-migration**: a gate rewritten during Phase 1 drops its `posType` check; POS `role:'admin'` passes a platform role check | Med | High (cross-domain privilege) | Domain check is *inside* `requireAuth` and runs before role evaluation (Q3.2); contract tests asserting POS-token→admin-route = 403 for every surface |
| R2 | **Contract breakage**: tests assert exact strings/codes (`"Invalid POS session"`, `"Forbidden: Access denied to this tenant partition"`, 403-vs-401 ordering) | High | Med (red CI, masked regressions) | Byte-preserving refactor in Phase 1; change messages only in a dedicated commit with coordinated test updates |
| R3 | **Behavior tightening surprises**: adding is_active checks to G1–G8 starts returning 401 for deactivated users who previously passed | Certain (intended) | Low-Med (support tickets) | Ship as a flagged security fix in release notes; Phase 0 tests document before/after |
| R4 | **Mass logout during rollout**: localStorage key scheme changes; every active session dies at once | Med | Med (UX, support load) | Legacy-key seeding reader in `session.ts` (Phase 3.2); deploy during low-traffic window; POS terminals especially |
| R5 | **POS response-shape change** (adding `refreshToken`) breaks `LoginView` assertions or downstream consumers reading positional fields | Med | Med | Additive field only; update Zod-less POS login consumer + regenerate types + E2E pos-login spec in same PR |
| R6 | **tenant_org_mapping fallback removal** logs out cashiers on unmapped orgs (currently "working" with pseudo-tenant `"1"`) | Med | Med-High for affected tenants | Pre-flight script listing orgs missing mappings; auto-provision via `ensureTenantOrg()` before removing fallback |
| R7 | **Super-admin flow regressions**: no-tenant login, `'marketplace'` pseudo-tenant, T9 drill-down scope, SSE `?token=` query-param auth | Med | High (platform admin lockout) | Dedicated regression tests for all four before Phase 1; SSE dual-source extraction preserved verbatim inside `requireAuth` options (`allowQueryToken: true` scoped to that route only) |
| R8 | **G9 check-order change** alters observed status for edge cases (POS token on admin API currently 401 "Account deactivated" → becomes 403) | High | Low | Intended fix; cover in contract tests; confirm no client branches on the 401 body text |
| R9 | **Schema gotchas in any new write path**: `pos_users.name` generated column, `organization_id NOT NULL`, camelCase-native schemas in auth.js/POS routes (blanket `toSnake` breaks them — logbook T3) | Med | Med | Reuse existing creators (`ensureTenantOrg`, pos-users INSERT patterns); never blanket-normalize auth/POS payloads |
| R10 | **Secret strategy temptation**: introducing per-domain JWT secrets would invalidate cross-checks (payments/SSE rejecting POS via claims) and double config | — | — | Decision: keep ONE secret; domain separation lives in claims (`userType`), not keys |
| R11 | **Stale E2E auth specs fight the migration** (tenant-admin-login expects `pos_token` world) | High | Med | Phase 0 spec audit; rewrite or archive pre-migration |
| R12 | **OpenAPI/type drift**: envelope changes (`PosLoginResponse`, refresh endpoints) desync `openapi.json`/`api-types.ts` | High | Low-Med | `npm run gen:types` mandatory in Phases 2–3 PRs; openapi-doc test already pins 8 auth paths — extend it |
| R13 | **Rate-limit topology shifts** if endpoints move (e.g., unified `/auth/token`) → stricter/looser buckets than clients expect | Low | Low | Keep paths stable through Phase 3; preserve bucket boundaries; revisit only in a dedicated cleanup |
| R14 | **Revocation table write pressure** (if Step 2 of Q6 lands carelessly, e.g. writing per-request) | Low | Med (D1 quota/latency) | Writes only on login/rotate/revoke events; never per-request validation reads beyond indexed PK/hash lookups |

### Residual risks accepted

- Stateless access tokens mean password-reset/deactivation cannot evict an already-issued access token until TTL (≤24h, or less post-Phase-2). Mitigated by shortening TTL once refresh exists and by Step-2 revocation.
- localStorage token storage remains XSS-exposed (pre-existing product decision, consistent across SPAs; E2E asserts non-cookie placement).
- In-process rate limiters reset per isolate (pre-existing, documented).

---

## 7. Consolidated Verdict

| Question | Verdict |
|---|---|
| Shared JWT structure? | **Yes** — same engine already; add `userType`, retire `posType` after transition window |
| Shared users table? | **No** — logical identity service now; physical merge only if product demands (history: 0019→0028 reversal) |
| Unified RBAC? | Extended numeric hierarchy + mechanical `userType∧role` pairing inside ONE middleware; optional POS-role rename later |
| Unified tenant scoping? | Canonical `tenantId` stamped at issue time; super-admin = null + explicit per-request scope; delete the `String(orgId)` fallback |
| Migration path? | 5 phases: baseline → backend choke point → refresh parity → frontend session module → RBAC cleanup (+optional physical merge) |
| Refresh tokens? | Parity first (POS gains stateless refresh), then D1-backed hashed+rotatable revocable tokens for both domains |

**Highest-value single change:** collapsing the 11 inline gates into `requireAuth()` — it simultaneously closes the deactivation-enforcement gap (R3/§3.3.1), eliminates the collision exposure (R1), and makes every subsequent phase safe to attempt.

---

## Appendix A — File inventory (audited)

| File | Role |
|---|---|
| `backend/src/api/auth.js` (467 ln) | Admin login/refresh/logout/me/register/forgot/reset/change-password |
| `backend/src/routes/pos/index.js` (748 ln) | POS login + `posAuth` + products/orders/shifts/dashboard |
| `backend/src/middleware/sharedAuth.js` (233 ln) | JWT engine, password utils, role constants, uncalled `authMiddleware` |
| `backend/src/middleware/auth.js` (21 ln) | Backward-compat re-export shim |
| `backend/src/index.js` (414 ln) | Route mounting, CORS, rate limits, inline gates G1–G9 |
| `backend/src/middleware/tenant.js` (40 ln) | `getTenant()` resolution (query → header → host) |
| `backend/src/api/admin.js` | Gate G10 (super-admin) |
| `backend/src/api/pos-users.js` (352 ln) | POS staff CRUD, `scopeTenant`, `ensureTenantOrg` |
| `app/src/lib/auth.tsx` (171 ln) | Admin `AuthProvider`, `useAuth`, `hasRole` |
| `app/src/lib/api.ts` (870 ln) | `apiFetch` dual-token plumbing, silent refresh, `getTenantId` |
| `app/src/components/pos/POSApp.tsx` (236 ln) | POS session state, redirect guard, view routing |
| `app/src/components/pos/views/LoginView.tsx` (89 ln) | POS credential form → `pos_token`/`pos_user` |
| Migrations 0010 / 0019 / 0028 / 0041 | `pos_users` creation · failed merge-in · `admins` split-out · `tenant_org_mapping` bridge |
