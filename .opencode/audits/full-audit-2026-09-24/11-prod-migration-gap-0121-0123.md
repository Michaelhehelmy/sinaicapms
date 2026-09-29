# Prod migration gap — 0121-0123

- Date: 2026-09-29 UTC
- Spec: `.opencode/agents/tmp/2026-09-29-gap.md` (task `prod-gap-0121-0123`)
- Baseline confirmed: `f0bd684` (`git rev-parse HEAD` == `f0bd684903071105cd6455416e45b3778e3a020e`; `git log --oneline -1` == `f0bd684 docs(audit): production-ready closure report (R2)`; tracked tree clean apart from pre-existing untracked spec/scratch)
- Scope: this doc (NEW) + `AGENT_LOGBOOK.md` fold, one commit. No source, no migrations, no prod writes, no `deploy.sh`.

## 1. Ledger facts (read-only, no prod contact)

- Prod D1 `campmaster-db`: ledger head **0120**, migration count **34**, user tables **109**, `tip_amount` present on `pos_transactions` (per spec-stated prod facts; no prod ledger read performed this step — tmp agents forbidden from `deploy.sh`).
- Staging D1 `campmaster-db-staging`: ledger head **0123** (per spec).
- Filesystem: `ls -la backend/migrations/012[1-3]*.sql`:
  - `-rw-rw-r-- 1 michael michael 2563 Sep 27 19:09 backend/migrations/0121_add_cart_items_project_id.sql`
  - `-rw-rw-r-- 1 michael michael 3321 Sep 27 19:38 backend/migrations/0122_add_storefront_order_items_project_id.sql`
  - `-rw-rw-r-- 1 michael michael 7319 Sep 28 00:06 backend/migrations/0123_storefront_order_items_fk_pos_products.sql`
- Pending on prod: **[0121, 0122, 0123]** (3 files; prod head 0120 → deploy applies 3, verify head 0123).

## 2. Per-file one-liners

- `0121_add_cart_items_project_id.sql` / Phase-5 step 5a — cart_items.project_id (nullable, schema-only) / forward-only (ADD COLUMN; rollback = NEW migration `ALTER TABLE cart_items DROP COLUMN project_id`) / backfill no.
- `0122_add_storefront_order_items_project_id.sql` / Phase-5 step 5c — storefront_order_items.project_id (nullable, schema-only) / forward-only (ADD COLUMN; rollback = NEW migration `ALTER TABLE storefront_order_items DROP COLUMN project_id`) / backfill no.
- `0123_storefront_order_items_fk_pos_products.sql` / retarget storefront_order_items.product_id FK products(id) → pos_products(id) via single-table rebuild / forward-only (rebuild; rollback = restore-from-backup, no down-migration) / backfill no (plain fail-closed copy-ALL; legacy mirror-only rows survive as grandfathered rows, reads unaffected).

## 3. Verbatim heads (`head -40` each)

### 3a. `backend/migrations/0121_add_cart_items_project_id.sql` (lines 1–40)

```sql
-- Migration 0121: Phase-5 step 5a — cart_items.project_id (nullable, schema-only).
--
-- WHAT: adds a nullable `project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`
-- column to cart_items plus a matching lookup index. Zero behavior change:
-- nullable, no backfill, no NOT NULL, no data touched. Writers stamp it
-- server-side from the owning pos_products.project_id
-- (backend/src/api/storefront.js POST /cart/items); legacy rows stay NULL.
--
-- NUMBERING: filesystem head was 0120_add_tip_amount_to_pos_transactions.sql.
-- 0109 is RESERVED-but-absent (0110:20-25 — destructive camp-column drops, must
-- not be consumed by any other task), so 0121 is the next free slot. Verified
-- at commit time: no 0109 file present, no 0121 file present before this one.
--
-- SCOPE: this file touches cart_items ONLY. carts.project_id already exists
-- since 0103 (nullable + idx_carts_project); checkout/order paths are owned by
-- steps 5b/5c and are NOT touched here. No POS, no Paymob, no record-payment.
--
-- IDEMPOTENCY: SQLite/D1 has no `ADD COLUMN IF NOT EXISTS`, so the ADD COLUMN
-- below is intentionally bare — same established pattern as
-- 0100_add_project_id_nullable.sql / 0103_add_carts_project_id.sql (plain ALTER,
-- applied once by the d1_migrations ledger). The companion index uses
-- `CREATE INDEX IF NOT EXISTS` (mirrors 0082_ecommerce_cms.sql
-- idx_cart_items_cart on this same table, plus 0100/0103).
--
-- FK PRECISION: inline `REFERENCES projects(id) ON DELETE SET NULL` follows the
-- project ADD COLUMN precedent (0069_restaurant_tables.sql:46,54;
-- 0090_marketplace_payouts.sql:34; 0100; 0103) and is recorded as the logical
-- scope link; full FK enforcement/backfill is deferred (mirrors how camp_id FKs
-- arrived via later rebuilds, e.g. 0066/0091).
--
-- ROLLBACK SAFETY (hard rule 7): ADD COLUMN is forward-only. Rollback = a NEW
-- migration with `ALTER TABLE cart_items DROP COLUMN project_id` (SQLite 3.35+);
-- optionally `DROP INDEX IF EXISTS idx_cart_items_project` for hygiene.
--
-- VERIFY (post-apply, read-only):
-- SELECT name FROM pragma_table_info('cart_items') WHERE name = 'project_id';
-- -- expect exactly one row: project_id | TEXT | 0 | 0 | 0 |
-- SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_cart_items_project';
-- -- expect exactly one row.
--
```

### 3b. `backend/migrations/0122_add_storefront_order_items_project_id.sql` (lines 1–40)

```sql
-- Migration 0122: Phase-5 step 5c — storefront_order_items.project_id (nullable, schema-only).
--
-- WHAT: adds a nullable `project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`
-- column to storefront_order_items plus a matching lookup index. Zero behavior
-- change: nullable, no backfill, no NOT NULL, no data touched. Writers stamp it
-- server-side from the cart line's project (backend/src/api/storefront.js POST
-- /checkout — ci.project_id authoritative per 5a, pos_products.project_id as
-- the legacy-NULL fallback); legacy rows stay NULL.
--
-- NUMBERING: filesystem head was 0121_add_cart_items_project_id.sql (5a).
-- 0109 is RESERVED-but-absent (0110:20-25 — destructive camp-column drops, must
-- not be consumed by any other task), so 0122 is the next free slot. Verified
-- at commit time: no 0109 file present, no 0122 file present before this one.
--
-- SCOPE: this file touches storefront_order_items ONLY.
-- storefront_orders.project_id already exists since 0100 (nullable +
-- idx_storefront_orders_project); the 5c checkout header INSERT is left
-- untouched on purpose — a mixed-origin unified order (room + meal from
-- different projects) has no single header project, and line-level scoping
-- (5e filter, 5f profit split) reads the LINES, not the header. Rewriting the
-- header into orders/ would balloon into booking semantics (room_id NOT NULL
-- FK, order_state_id NOT NULL, check_in/out NOT NULL, guarded INSERT, customer
-- upsert) + webhook paid-state transition + record-payment payment_records —
-- all FORBIDDEN for 5c. No POS, no Paymob, no record-payment touched here.
--
-- IDEMPOTENCY: SQLite/D1 has no `ADD COLUMN IF NOT EXISTS`, so the ADD COLUMN
-- below is intentionally bare — same established pattern as
-- 0100_add_project_id_nullable.sql / 0103_add_carts_project_id.sql /
-- 0121_add_cart_items_project_id.sql (plain ALTER, applied once by the
-- d1_migrations ledger). The companion index uses `CREATE INDEX IF NOT EXISTS`
-- (mirrors 0010_storefront.sql idx_storefront_order_items_order on this same
-- table, plus 0100/0103/0121).
--
-- FK PRECISION: inline `REFERENCES projects(id) ON DELETE SET NULL` follows the
-- project ADD COLUMN precedent (0069_restaurant_tables.sql:46,54;
-- 0090_marketplace_payouts.sql:34; 0100; 0103; 0121) and is recorded as the
-- logical scope link; full FK enforcement/backfill is deferred (mirrors how
-- camp_id FKs arrived via later rebuilds, e.g. 0066/0091).
--
-- ROLLBACK SAFETY (hard rule 7): ADD COLUMN is forward-only. Rollback = a NEW
```

### 3c. `backend/migrations/0123_storefront_order_items_fk_pos_products.sql` (lines 1–40)

```sql
-- Migration 0123: retarget storefront_order_items.product_id FK products(id) → pos_products(id).
--
-- WHAT: rebuilds storefront_order_items changing ONLY the product_id FK target
-- from `REFERENCES products(id)` (stale, 0010_storefront.sql:87) to
-- `REFERENCES pos_products(id)`. Every other column, default, FK target/action,
-- and both indexes are preserved verbatim (order_id → storefront_orders
-- CASCADE; project_id → projects SET NULL from 0122).
--
-- WHY (writer/reader matrix, verified 2026-09-27 at HEAD 7f301ff):
-- Writers of storefront_order_items (grep `INSERT INTO storefront_order_items`
-- backend/src — exactly ONE production site):
--   1. backend/src/api/storefront.js:336 POST /checkout — binds
--      item.product_id, which flows from cart_items.product_id, which is
--      validated at cart-add time against pos_products
--      (storefront.js:197-199 `SELECT ... FROM pos_products WHERE id = ?`;
--      checkout line SELECT LEFT JOINs pos_products at :309). Id-space =
--      pos_products, ALWAYS. No writer inserts products-mirror ids.
-- Readers/joins of storefront_order_items in backend/src: NONE — no
--   SELECT FROM / JOIN anywhere (paymob-webhook reads only the
--   storefront_orders header). No reader depends on products(id).
-- products mirror direction (design §2 row 5: quasi-dead shim, write-only FK
--   mirror, zero `FROM products` reads in backend/src, DO NOT EXTEND; removal
--   needs 0056-header sign-off): writers that maintain the mirror are
--   rooms_new flows (camps.js:800,993 ensureProductInProductsTable) +
--   tenant-import ONLY — POST /api/products and the storefront checkout never
--   mirror. An insert-side fix (mirroring every checkout product into
--   `products`) is REJECTED per the dead-shim rule.
-- Both-spaces-live? NO — only the pos_products space is live for this table
--   (staging mirror holds exactly one stale row {prod_tent}; zero writers
--   emit mirror ids here). Schema-side fix is safe; NOT a BLOCKED case.
-- Failure it fixes: staging checkout with an API-created meal product 500s
--   `D1_ERROR: FOREIGN KEY constraint failed` (0 orders, cart intact) because
--   the meal id exists in pos_products but not in the `products` mirror. The
--   5c gate suite could never catch it: its stub declares
--   `product_id TEXT` with NO REFERENCES and no `products` table.
--
-- NUMBERING: filesystem head is 0122_add_storefront_order_items_project_id.sql
-- (5c). 0109 is RESERVED-but-absent (destructive camp-column drops, must not
-- be consumed), so 0123 is the next free slot. Verified at commit time: no
-- 0109 file present, no 0123 file present before this one.
```

## 4. Deploy note (owner-gated, no agent action)

- No agent may run `./deploy.sh`. At owner deploy time: apply the 3 pending migrations (0121, 0122, 0123), run `PRAGMA foreign_key_check` pre-deploy per the `49d7ce1` note (grandfathered mirror-only rows survive reads; only future writes re-validate), then verify prod ledger head is `0123`.
- Rollback = revert single commit (this doc + logbook fold only; no source/migration touched).
