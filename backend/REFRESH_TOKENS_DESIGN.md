# Refresh Token Design — D1-Backed Rotation & Revocation

> Status: **Design** — Phase 5 of `UNIFIED_ARCHITECTURE_PLAN.md` ships the
> stateless re-issue flow; this document specifies the post-plan upgrade to
> stateful, revocable refresh tokens. Do not implement until the plan's
> remaining phases land.

## 1. Current State (Phase 5, shipped)

| Aspect | Behavior |
| --- | --- |
| Issuance | `POST /api/auth/login`, `POST /api/auth/refresh` (admin); `POST /api/pos/auth/login`, `POST /api/pos/auth/refresh` (POS). Login + every refresh return a fresh pair. |
| Format | JWT (`type: 'refresh'`, HS256, 7d TTL) — self-contained, signed with `JWT_SECRET`. |
| Realm tagging | v2 contract: `userType: 'platform' \| 'org'`; legacy `posType: 'pos'` still emitted on POS tokens. |
| Validation on refresh | Signature → realm (`requireAuth({ realm })`) → `is_active ∧ deleted_at` DB probe → `type === 'refresh'`. |
| Transport | `Authorization: Bearer <refresh>` header (preferred) or `{ refreshToken }` JSON body. Header wins. |
| Rotation | **Stateless re-issue**: each call mints a new refresh token; previously issued tokens stay valid until their own expiry. No server-side revocation exists. |
| Rate limits | Admin refresh 30/min, POS refresh 30/min (in-memory limiter while `RATE_LIMIT_KV_ENABLED="false"`). |

The gap: a stolen-but-unused refresh token cannot be invalidated before its
7-day expiry short of rotating `JWT_SECRET` (which logs out everyone).

## 2. Target State

### 2.1 Table — D1 migration

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_type TEXT NOT NULL CHECK (user_type IN ('platform', 'org')),
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the JWT string
  jti TEXT NOT NULL UNIQUE,          -- random UUIDv4 embedded in the JWT
  expires_at TEXT NOT NULL,          -- ISO 8601
  revoked_at TEXT,                   -- set = invalid
  replaced_by_jti TEXT,              -- rotation chain (audit/forensics)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_type, user_id) REFERENCES (admins(id), pos_users(id)) -- see note
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_type, user_id);
CREATE INDEX idx_refresh_tokens_jti ON refresh_tokens(jti);
```

Note: D1/SQLite does not enforce composite foreign keys across two tables;
enforce referential integrity in application code and keep the FK line as
documentation only.

Key decisions:

- **Store hashes, never raw tokens.** A D1 leak must not yield usable
  credentials. SHA-256 of the exact JWT string is sufficient (the JWT itself
  is high-entropy).
- **`jti` is the rotation handle.** The JWT carries the same `jti` claim so a
  single indexed lookup validates both halves.
- **No cleanup job dependency:** expired rows are ignored by validation and
  purged opportunistically (see §2.4).

### 2.2 Issuance changes (both realms)

1. Generate `jti = crypto.randomUUID()`.
2. Embed `jti` in the refresh JWT claims.
3. Insert `(user_type, user_id, tenant_id, sha256(token), jti, expires_at)`.
4. If KV quota allows, cache the latest valid `jti` per user in KV
   (`rt:{userType}:{userId}` → `{ jti, exp }`, no write on read paths) purely
   to skip a D1 round-trip on hot refreshes. KV stays optional; D1 is truth.

### 2.3 Refresh endpoint changes

```
verify signature → verify type=realm → lookup row by jti:
  missing            → 401 Invalid or expired refresh token
  revoked_at ≠ NULL  → 401 + SECURITY AUDIT (possible replay of rotated token)
  expires_at ≤ now   → 401 (+ delete row)
  else               → rotate
rotate:
  new jti' minted, old row: revoked_at=now, replaced_by_jti=jti'
  insert new row, return new pair
replay detection:
  refreshing with an ALREADY-REVOKED token whose replaced_by_jti chain is
  intact ⇒ treat as theft signal: revoke ALL rows for that user
  (family revocation) and force re-login.
```

Family revocation is the industry-standard mitigation for stolen refresh
tokens: replaying a superseded token burns the whole session lineage.

### 2.4 Housekeeping

- Lazy delete: on each successful rotation, `DELETE FROM refresh_tokens WHERE
  expires_at <= datetime('now') AND user_type = ? AND user_id = ?` (bounded,
  index-backed).
- Optional scheduled Worker (`crons`) nightly sweep if table growth becomes
  measurable.

### 2.5 Compatibility

- Old refresh tokens issued pre-migration have no `jti` and no row → they
  fail validation with 401 after deploy. Acceptable: users re-login once.
  Deploy during low traffic; announce via status page.
- Access-token verification is untouched (access tokens never hit the table).

## 3. Why not KV-only?

KV is eventually consistent (up to ~60s propagation): a revocation could lag
long enough for a stolen token to still validate. D1 is strongly consistent —
required for security-critical revocation checks. KV remains an optional
read-through accelerator only.

## 4. Open Items

- [ ] Decide retention window for revoked rows (proposal: 30 days for audit).
- [ ] Add `refresh_tokens` metrics to admin dashboard (active sessions count).
- [ ] Consider binding sessions to device fingerprint at Phase 6+ (session kernel).
