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
--
-- SCOPE: this file touches storefront_order_items ONLY. Parents
-- (storefront_orders, pos_products, projects, products) are NOT rebuilt.
-- No triggers reference this table (grep `TRIGGER.*storefront` EMPTY); no
-- other table REFERENCES storefront_order_items; dropping this CHILD fires
-- no FK actions on any other table, so no guard save/restore is needed
-- (unlike 0111's multi-table rebuild).
--
-- REBUILD IDIOM (precedent 0106/0107/0111, replicated):
-- `PRAGMA defer_foreign_keys = true` → CREATE real (non-TEMP — D1 blocks
-- temp tables) staging table → plain fail-closed INSERT copy (no OR IGNORE:
-- column drift aborts loudly; D1 applies each migration atomically so reruns
-- are safe) → DROP old → RENAME (SQLite rewrites the staging FK clauses to
-- the final names; parents are unrebuilt so targets are unchanged) →
-- recreate BOTH pre-existing indexes → `PRAGMA defer_foreign_keys = false` +
-- `PRAGMA foreign_key_check`. Never `foreign_keys=OFF` (D1 ignores it).
-- No GENERATED columns on this table (nothing excluded from the copy list).
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is
-- no down-migration. Rollback = restore-from-backup ("locker") procedure.
--
-- VERIFY (post-apply, read-only):
-- SELECT tbl_name, sql FROM sqlite_master WHERE type = 'table' AND name = 'storefront_order_items';
-- -- expect product_id line: `product_id TEXT REFERENCES pos_products(id) ON DELETE SET NULL`
-- SELECT id AS fk_id, "table" AS target, "from" AS col FROM pragma_foreign_key_list('storefront_order_items') ORDER BY fk_id;
-- -- expect product_id → pos_products (was: products)
-- PRAGMA foreign_key_check;
-- -- expect zero rows on staging (0 storefront_orders ⇒ 0 items ⇒ applies
-- -- clean — the walkthrough path). GRANDFATHER NOTE (verified 2026-09-27 on
-- -- SQLite 3.45-class engine): the `PRAGMA defer_foreign_keys = false` tail
-- -- (0111 idiom) means a legacy item row whose product_id is a mirror-only
-- -- id (in `products`, not in pos_products) does NOT abort the apply — the
-- -- row survives as a grandfathered row and fk_check reports it. Grandfathered
-- -- reads are unaffected (SQLite checks on write, not retroactively); only
-- -- future INSERTs/UPDATEs touching product_id re-validate against
-- -- pos_products. Do NOT "fix" orphans by mirroring into pos_products
-- -- (dead-shim rule) — null/map them in a deliberate triage step if they
-- -- matter. D1 applies each migration atomically.
--
-- No KV writes (free-plan 1,000 writes/day quota).

PRAGMA defer_foreign_keys = true;

-- ── PHASE A: staging CREATE (0010 DDL + 0122 project_id, verbatim except the
-- product_id FK target products(id) → pos_products(id)) ─────────────────────
CREATE TABLE storefront_order_items_new (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES pos_products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- ── PHASE B: copy-ALL (plain INSERT — fail-closed on column drift) ──────────
INSERT INTO storefront_order_items_new (
  id, order_id, product_id, product_name, quantity, unit_price, total_price,
  created_at, project_id
)
SELECT
  id, order_id, product_id, product_name, quantity, unit_price, total_price,
  created_at, project_id
FROM storefront_order_items;

-- ── PHASE C: drop old ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS storefront_order_items;

-- ── PHASE D: rename to final name ───────────────────────────────────────────
ALTER TABLE storefront_order_items_new RENAME TO storefront_order_items;

-- ── PHASE E: recreate ALL pre-existing indexes (the DROP destroyed them) ────
-- 0010 set + 0122 set, all IF NOT EXISTS so both envs converge without error.
CREATE INDEX IF NOT EXISTS idx_storefront_order_items_order ON storefront_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_storefront_order_items_project ON storefront_order_items(project_id);

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (incl. the retargeted product_id → pos_products).
PRAGMA foreign_key_check;
