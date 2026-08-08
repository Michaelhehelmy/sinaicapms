-- Migration 0020: Unify products/inventory into pos_products
-- Merges the main backend `inventory`, `meals`, `meal_ingredients` tables
-- into the richer `pos_products` + `pos_recipe_ingredients` system.
-- Old tables are dropped after data migration.

-- 1. Add camp_id to pos_products for camp-scoped items (ingredients, supplies)
ALTER TABLE pos_products ADD COLUMN camp_id TEXT;

-- 2. Create recipe_ingredients table to replace meal_ingredients
CREATE TABLE IF NOT EXISTS pos_recipe_ingredients (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,        -- the meal/menu product
    ingredient_id TEXT NOT NULL,     -- the ingredient product
    quantity REAL NOT NULL,
    unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES pos_products(id),
    FOREIGN KEY (ingredient_id) REFERENCES pos_products(id)
);

-- 3. Migrate inventory items into pos_products as type='retail'
INSERT OR IGNORE INTO pos_products (
    id, tenant_id, camp_id, name, sku, selling_price, cost_price,
    stock_quantity, unit, min_stock_level, reorder_level,
    category, type, is_active, created_at, updated_at
)
SELECT
    id,
    tenant_id,
    camp_id,
    item_name,
    'ING-' || id,
    0,
    COALESCE(cost_per_unit, 0),
    CAST(quantity AS INTEGER),
    COALESCE(unit, 'pcs'),
    CAST(min_quantity AS INTEGER),
    CAST(min_quantity AS INTEGER),
    COALESCE(category, 'Kitchen'),
    'retail',
    1,
    COALESCE(last_updated, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM inventory
WHERE id NOT IN (SELECT id FROM pos_products);

-- 3.5. Migrate meals into pos_products as type='menu'
INSERT OR IGNORE INTO pos_products (
    id, tenant_id, name, sku, selling_price, cost_price,
    stock_quantity, unit, min_stock_level, reorder_level,
    category, type, is_active, created_at, updated_at
)
SELECT
    id,
    tenant_id,
    name,
    'MEAL-' || id,
    selling_price,
    0,
    9999,
    'serving',
    0,
    0,
    COALESCE(category, 'Meals'),
    'menu',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM meals;

-- 4. Migrate meal_ingredients into pos_recipe_ingredients
INSERT OR IGNORE INTO pos_recipe_ingredients (id, tenant_id, product_id, ingredient_id, quantity, unit, created_at)
SELECT
    mi.id,
    mi.tenant_id,
    mi.meal_id,
    mi.ingredient_id,
    mi.quantity,
    mi.unit,
    CURRENT_TIMESTAMP
FROM meal_ingredients mi;

-- 5. Drop old tables
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS meal_ingredients;
DROP TABLE IF EXISTS meals;

-- 6. Index for recipe lookups
CREATE INDEX IF NOT EXISTS idx_recipe_product
    ON pos_recipe_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredient
    ON pos_recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_camp
    ON pos_products(camp_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_type
    ON pos_products(type);
