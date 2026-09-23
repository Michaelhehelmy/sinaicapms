-- Migration 0057: Quasi-dead cleanup + index additions (Unified Architecture Plan — Phase 2 / DB-B2)
--
-- 1. DROP pos_categories
--    Its single backend consumer — the low-stock listing LEFT JOIN in
--    backend/src/api/inventory.js (`LEFT JOIN pos_categories pc ON pc.id = p.category_id`)
--    — has been removed from the code in the same change set (the endpoint now emits
--    `category: null`, which is what the LEFT JOIN already returned in practice: no
--    pos_categories rows exist anywhere). The mirrored test fixture
--    (backend/tests/inventory-low-stock.test.js) was updated too.
--    pos_categories has zero inbound FKs from surviving tables (only its own parent_id
--    self-reference) and zero rows.
--
-- 2. Index additions per plan §6.5 / DB audit §6.2 ("verify then add").
--    Verified against the live schema on 2026-08-23:
--      ✓ customers(tenant_id, email)   — MISSING → added (find-or-create runs on every order)
--      ✓ customers(tenant_id, phone)   — MISSING → added
--      ✓ pos_transaction_items(transaction_id) — MISSING → added (receipt/detail fetch)
--      – pos_recipe_ingredients(product_id)    — ALREADY COVERED by idx_recipe_product(product_id)
--        and idx_recipe_tenant_product(tenant_id, product_id): adding another would be pure bloat.
--      – pos_recipe_ingredients(ingredient_product_id) — NO SUCH COLUMN; the ingredient column is
--        `ingredient_id` and is already indexed (idx_recipe_ingredient).
--    The two recipe entries below are kept as documentation of the verification result.

PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS pos_categories;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_transaction ON pos_transaction_items(transaction_id);

-- Already covered (no-op, intentionally NOT created):
-- CREATE INDEX ... ON pos_recipe_ingredients(product_id);            -- exists: idx_recipe_product
-- CREATE INDEX ... ON pos_recipe_ingredients(ingredient_product_id); -- column does not exist;
--                                                                    -- ingredient_id covered by idx_recipe_ingredient

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
