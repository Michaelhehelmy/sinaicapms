-- Migration 0022: Add indexes for product_camps and commonly queried paths
CREATE INDEX IF NOT EXISTS idx_product_camps_product ON product_camps(product_id);
CREATE INDEX IF NOT EXISTS idx_product_camps_camp ON product_camps(camp_id);
