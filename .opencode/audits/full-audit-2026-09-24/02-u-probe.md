# U-Probe — 4 highest-impact unverified findings (2026-09-24)

Read-only probe. Method: SELECT/PRAGMA against the local miniflare D1 copy
`backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9212c2d93a7c1f389c84044f61f98a63279538cbc21123f36266d12a4326d1d8.sqlite`
opened `mode=ro` via Python `sqlite3` (never written), plus verbatim source reads.
No source/migration modified, no DB writes, no prod writes, no deploy.
Fix-commit baseline: `git log --oneline -6` (local == `origin/main`) shows
`20102c4 fix(payouts)`, `300cff3 fix(orders)`, `b9cb43f fix(payments)`,
`ae94905 fix(reports)` all pushed.

---

## U-001 — Hardcoded store_id=1 in reservation POS-mirror INSERT

**Claim:** `backend/src/api/reservations.js:419` hardcodes `store_id 1` in the
POS-mirror `INSERT INTO pos_transactions`, while the POS sale path resolves the
real store (`routes/pos/index.js:624-629`). On a fresh DB where store 1 does not
exist, the mirror INSERT violates the `store_id` FK.

**Probe (exact):**
1. `git log --oneline -6` + `git log origin/main --oneline -6` (fix baseline).
2. Read `backend/src/api/reservations.js:405-434`.
3. Read `backend/src/routes/pos/index.js:610-639`.
4. Read-only DB:
`python3 -c "import sqlite3; uri='file:backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9212c2d93a7c1f389c84044f61f98a63279538cbc21123f36266d12a4326d1d8.sqlite?mode=ro'; db=sqlite3.connect(uri, uri=True); cur=db.cursor(); [print(r) for r in cur.execute('PRAGMA foreign_key_list(pos_transactions)')]; print(cur.execute('SELECT id FROM pos_stores WHERE id=1').fetchall()); print(cur.execute('SELECT COUNT(*), MIN(id), MAX(id) FROM pos_stores').fetchall())"`

**Raw output (pasted):**
```
=== PRAGMA foreign_key_list(pos_transactions) ===
(0, 0, 'pos_customers', 'customer_id', 'id', 'NO ACTION', 'NO ACTION', 'NONE')
(1, 0, 'pos_stores', 'store_id', 'id', 'NO ACTION', 'NO ACTION', 'NONE')
(2, 0, 'pos_organizations', 'organization_id', 'id', 'NO ACTION', 'NO ACTION', 'NONE')
(3, 0, 'projects', 'project_id', 'id', 'NO ACTION', 'SET NULL', 'NONE')
(4, 0, 'pos_tables', 'table_id', 'id', 'NO ACTION', 'SET NULL', 'NONE')
=== SELECT id=1 exists? ===
[]
=== COUNT pos_stores ===
[(45, 2, 46)]
```
`reservations.js:412-424` (verbatim): `if (organizationId) { posStmts.push(c.env.DB.prepare(`INSERT INTO pos_transactions (id, tenant_id, organization_id, store_id, ...) VALUES (?, ?, ?, 1, ?, ?, 'completed', ...)`).bind('pot_' + ..., tenantId, organizationId, 'MP-' + reference, 'system', lineTotal, lineTotal, ...)); }`
`routes/pos/index.js:619-629` (verbatim): `// Store id 1 was the pre-0051 seed store; on a fresh DB it does not exist // and inserting a transaction against it fails the store_id FK, so when // the cashier has no store assigned look up the tenant's real store. let storeId = posUser.storeId; if (storeId == null) { const { results: orgStores } = await env.DB.prepare('SELECT id FROM pos_stores WHERE organization_id = ? LIMIT 1').bind(organizationId).all(); storeId = orgStores.length > 0 ? orgStores[0].id : 1; }`

**Verdict: CONFIRMED (MED).** The `store_id → pos_stores(id)` FK exists (NO ACTION),
store id 1 is absent locally (ids 2..46, 45 rows), and the reservation mirror path
binds literal `1` with no fallback — unlike the POS sale path which looks up the
tenant's real store. On any fresh-shaped DB (new signup creates an auto-increment
org/store, never id 1) a meal-plan booking's mirror batch fails the FK while the
room `order_items` batch (separate `await c.env.DB.batch`, `:428-429`) already
committed → partial booking. Seeded DBs with store 1 are unaffected.

**Evidence:** `backend/src/api/reservations.js:413-424`; `backend/src/routes/pos/index.js:619-629`; live `PRAGMA foreign_key_list(pos_transactions)` id 1.

---

## U-002 — Customer find-or-create dedupe race (no UNIQUE guard)

**Claim:** `reservations.js:109-151` find-or-create by email then phone has no
UNIQUE guard, so concurrent POSTs with the same email can double-INSERT.

**Probe (exact):**
1. Read `backend/src/api/reservations.js:109-151`.
2. Read-only DB:
`python3 -c "import sqlite3; uri='file:...sqlite?mode=ro'; db=sqlite3.connect(uri, uri=True); cur=db.cursor(); print(cur.execute(\"SELECT sql FROM sqlite_master WHERE name='customers'\").fetchall()[0][0]); [print(r) for r in cur.execute(\"SELECT name, sql FROM sqlite_master WHERE tbl_name='customers' AND type='index'\")]; print(cur.execute('SELECT tenant_id, email, COUNT(*) c FROM customers WHERE email IS NOT NULL GROUP BY tenant_id, email HAVING c>1').fetchall())"`
3. Concurrent-POST analysis only (no prod writes, no test-harness writes this pass).

**Raw output (pasted):**
```
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
)
('sqlite_autoindex_customers_1', None)
('idx_customers_tenant', 'CREATE INDEX idx_customers_tenant ON customers(tenant_id)')
('idx_customers_tenant_email', 'CREATE INDEX idx_customers_tenant_email ON customers(tenant_id, email)')
('idx_customers_tenant_phone', 'CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone)')
customers dup email same tenant: []
```
`findOrCreateCustomer` shape (verbatim, `:120-151`): `SELECT id FROM customers WHERE tenant_id=? AND email=?` → if hit UPDATE+return; else `SELECT ... WHERE tenant_id=? AND phone=?` → if hit UPDATE+return; else `INSERT INTO customers (id, tenant_id, first_name, last_name, email, phone, ...)` — three separate statements, no transaction/batch, no `INSERT...WHERE NOT EXISTS`, no upsert.

**Verdict: CONFIRMED (LOW).** No UNIQUE constraint on `(tenant_id, email)` or
`(tenant_id, phone)` — DDL is plain `TEXT`, all three indexes are non-unique
`CREATE INDEX`. The write path is SELECT-then-INSERT across separate round-trips,
so two concurrent requests with the same new email both miss and both INSERT.
Blast radius is data hygiene (duplicate customer rows splitting history, 0 dupes
locally today), not money loss — bookings still succeed on either row.

**Evidence:** `backend/src/api/reservations.js:109-151`; live `SELECT sql FROM sqlite_master WHERE name='customers'` (no UNIQUE); `idx_customers_tenant_email` / `idx_customers_tenant_phone` non-unique.

---

## U-004 — Onboarding token entropy, PII-on-token, no expiry

**Claim:** `backend/src/api/onboarding.js:148-184` returns email + profile on bare
token knowledge; residual risk is token entropy + expiry + single-use.

**Probe (exact):**
1. Read `backend/src/api/onboarding.js` (full, 314 lines).
2. `grep -n "onboarding_token\|randomUUID\|expires\|expiry\|auto_login" backend/src/api/onboarding.js`.
3. Read-only DB: `SELECT COUNT(*) FROM tenants WHERE onboarding_token IS NOT NULL`.

**Raw output (pasted):**
```
86:    const tid = 'tenant_' + crypto.randomUUID().slice(0, 12);
87:    const adminId = 'adm_' + crypto.randomUUID().slice(0, 12);
88:    const onboardingToken = crypto.randomUUID();
103:          onboarding_token, onboarding_status, primary_color, capacity, currency, created_at, updated_at
133:      onboarding_token: onboardingToken,
155:       FROM tenants WHERE onboarding_token = ?`
199:      'SELECT id, onboarding_status FROM tenants WHERE onboarding_token = ?'
232:      `UPDATE tenants SET onboarding_status = 'completed', status = 'active', onboarding_token = NULL, updated_at = datetime('now') WHERE id = ?`
240:    // C1.1: Generate auto-login token (24-hour expiry) for the tenant's admin
241:    const autoLoginToken = crypto.randomUUID();
242:    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
244:      `UPDATE admins SET auto_login_token = ?, auto_login_expires_at = datetime(?) WHERE tenant_id = ? AND role = 'admin'`
245:    ).bind(autoLoginToken, expiresAt, tenant.id).run();
281:      'SELECT id FROM tenants WHERE onboarding_token = ?'
tenants onboarding_token non-null: [(0,)]
```
Generation (`:88`): `const onboardingToken = crypto.randomUUID()` (UUIDv4, 122-bit).
Status handler (`:148-184`): `GET /onboarding/status/:token`, no auth — token IS the
auth; `SELECT id, name, subdomain, email, status, onboarding_status, location, phone, description, ... WHERE onboarding_token=?` → 404 if miss, else returns `email` + `profile{location,phone,description,...}`. Setup (`:188-233`): rejects unknown token (404) and completed (400), applies whitelisted `tenantUpdateSchema` fields, then burns the token (`onboarding_token=NULL`, `:232`) and activates the admin. Partial-update (`:265-312`): same bare-token lookup. No `expires_at` column for `onboarding_token` in live `tenants` DDL; the only 24h expiry in the file belongs to `auto_login_token` (`:240-245`).

**Verdict: CONFIRMED (LOW).** Entropy is fine (UUIDv4 unguessable) and single-use
burn exists (`:232`), but the onboarding bearer token has NO TTL — a leaked signup
link stays valid indefinitely until the wizard completes (unbounded exposure window
vs 24h for the adjacent auto-login token). Disclosure on token knowledge (business
email + profile PII) is by-design for onboarding links; the residual is the missing
expiry, not guessability. 0 live non-NULL tokens locally, so nothing to expire today.

**Evidence:** `backend/src/api/onboarding.js:88` (generation); `backend/src/api/onboarding.js:148-184` (unauthenticated PII return); `backend/src/api/onboarding.js:232` (single-use burn, no expiry); `backend/src/api/onboarding.js:240-245` (24h expiry exists only for auto_login_token).

---

## U-011 — rooms_new tenant looseness / detached admins / mapping joins / camp_id census

**Claim (4 tails):** tenant delete detaches admins to NULL scope;
`rooms_new.tenant_id` looseness reliance; store readers missing the mapping join;
`camp_id` 43-of-43 NULL.

**Probe (exact):**
1. Read-only DB: `SELECT sql FROM sqlite_master WHERE name='rooms_new'`; `SELECT COUNT(*) FROM rooms_new WHERE tenant_id IS NULL`; `SELECT COUNT(*) FROM rooms_new`; `SELECT tenant_id, COUNT(*) ... GROUP BY tenant_id`; `SELECT COUNT(*), SUM(camp_id IS NULL) FROM orders`; `SELECT COUNT(*), SUM(camp_id IS NULL) FROM pos_users`; `SELECT COUNT(*) FROM admins WHERE tenant_id IS NULL`.
2. `grep -rn "INSERT INTO rooms_new\|INSERT.*rooms_new" backend/src/ backend/migrations/`.
3. Read `backend/src/api/camps.js:770-791` + `backend/src/api/tenant-import.js:300-327`.
4. `grep -rn "rooms_new" backend/src/ --include="*.js"` (all readers — check for direct `rooms_new.tenant_id` filters).

**Raw output (pasted):**
```
CREATE TABLE "rooms_new" (
  id TEXT PRIMARY KEY,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL REFERENCES "pos_products"(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  ...
  tenant_id TEXT,
  ...
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
)
rooms_new NULL tenant count: [(0,)] / total [(161,)]
tenant distribution: [('acaciacamp', 160), ('tenant_aa2392c1-297', 1)]
orders camp NULL: [(24, 0)]
pos_users camp NULL: [(43, 43)]
admins NULL tenant: [(16,)]
INSERT sites: backend/src/api/tenant-import.js:314 + backend/src/api/camps.js:782 (both `INSERT INTO rooms_new (id, camp_id, product_id, name, status, bed_type, max_guests, base_price, floor, notes, is_active, created_at, updated_at) SELECT ... FROM projects c3 WHERE c3.id=? AND c3.tenant_id=? ...` — tenant_id NOT in the column list)
Readers (12 hits, all camp-join scoped, ZERO direct rooms_new.tenant_id filters):
  reservations.js:155, admin.js:67, camps.js:705/738/770/808/816/856/867/884/930/1050, reports.js:34, orders.js:229/277 — every SELECT scopes via `JOIN projects ... c.tenant_id=?` or `camp_id IN (SELECT id FROM projects WHERE tenant_id=?)`
```

**Verdict: CONFIRMED (LOW) with one FALSE-POSITIVE sub-claim.** `tenant_id TEXT`
nullable with no FK: CONFIRMED (live DDL above). Both current writers omit the
column, so every room created via today's API/import lands `tenant_id=NULL` —
CONFIRMED (dead-column write gap; local 0/161 NULL only because seed rows preset
it). Tenant-delete→NULL-admin detach (16 rows) and `pos_users.camp_id` 43/43 NULL:
CONFIRMED (census above; the report's "43 of 43 NULL" is `pos_users.camp_id`, NOT
`orders` — `orders` is 0/24 NULL, re-census corrects the table attribution).
NULL-tenant INVISIBLE room: FALSE POSITIVE — no reader filters on
`rooms_new.tenant_id` (all 12 scope through `camp_id → projects.tenant_id`), so a
NULL-`tenant_id` room stays fully visible; the column is dead weight / misleading,
not an invisibility vector. No cross-tenant bypass via this column.

**Evidence:** live `SELECT sql FROM sqlite_master WHERE name='rooms_new'` (`tenant_id TEXT`, no FK); `backend/src/api/camps.js:782-787`; `backend/src/api/tenant-import.js:314-318`; reader grep (12 sites, all camp-join); `pos_users` 43/43 NULL vs `orders` 0/24 NULL census.
