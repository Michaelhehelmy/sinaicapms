-- Migration 0055: Trigger hygiene (Unified Architecture Plan — Phase 2 / DB-A)
--
-- Drops the three triggers whose subjects/targets are dead tables:
--
--   update_customer_stats_after_order  ON pos_transactions INSERT → UPDATEs dead `pos_customers`
--                                      A pointless dead-table UPDATE executed on EVERY completed
--                                      POS sale — live write-path overhead on an ACTIVE table.
--   update_inventory_after_movement    ON pos_stock_movements INSERT → UPDATEs dead `pos_inventory`
--                                      Also unlocks dropping both tables in migration 0056
--                                      (0047 lesson: drop triggers BEFORE touching their subjects).
--   update_customers_timestamp         ON pos_customers UPDATE — dies with its table anyway.
--
-- KEPT (active triggers on active tables — harmless by design):
--   update_users_timestamp     ON pos_users
--   update_products_timestamp  ON pos_products

DROP TRIGGER IF EXISTS update_customer_stats_after_order;
DROP TRIGGER IF EXISTS update_inventory_after_movement;
DROP TRIGGER IF EXISTS update_customers_timestamp;

PRAGMA foreign_key_check;
