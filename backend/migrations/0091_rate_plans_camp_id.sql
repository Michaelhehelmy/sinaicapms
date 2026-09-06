-- 0091: Rate-plan camp scoping — rate_plans_new gains camp_id, season CHECK removed
-- WHAT: each rate plan now binds to the camp that owns its product via camp_id,
-- mirroring rooms_new.camp_id (REFERENCES projects(id) ON DELETE SET NULL). The
-- admin shell's project scoping filters rate plans by camp through the wire
-- `campId` (jsonResponse/toCamel), and the "Camp" column in RatePlansPanel
-- resolves.
-- WHY REBUILD (two birds, one migration):
--   1. add camp_id — SQLite can't ADD COLUMN with a non-constant default, and a
--      table rebuild is the project's established pattern (see 0054).
--   2. the current DDL still carries CHECK (season IN ('summer','winter','all')),
--      but the admin UI writes season 'all' | 'peak' | 'off' — every save of
--      'peak'/'off' violates the CHECK today. The rebuild drops the CHECK so
--      UI values are legal.
-- BACKFILL: camp_id = pos_products.camp_id (the declared source of truth, 0053).
-- No inbound FK references rate_plans_new, so drop+rename is safe.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Rebuild rate_plans_new with camp_id and no season CHECK
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE rate_plans_new_v3 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
    camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    season TEXT DEFAULT 'all',
    start_date TEXT,
    end_date TEXT,
    price_per_night REAL NOT NULL,
    min_stay INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

INSERT INTO rate_plans_new_v3 (
    id, tenant_id, product_id, camp_id, name, season, start_date, end_date,
    price_per_night, min_stay, is_active, created_at, updated_at
)
SELECT
    rp.id, rp.tenant_id, rp.product_id, p.camp_id, rp.name, rp.season,
    rp.start_date, rp.end_date, rp.price_per_night, rp.min_stay, rp.is_active,
    rp.created_at, rp.updated_at
FROM rate_plans_new rp
LEFT JOIN pos_products p ON p.id = rp.product_id;

DROP TABLE IF EXISTS rate_plans_new;
ALTER TABLE rate_plans_new_v3 RENAME TO rate_plans_new;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Indexes — mirror the current set + new camp_id lookup
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_tenant ON rate_plans_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_product ON rate_plans_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_camp ON rate_plans_new(camp_id);