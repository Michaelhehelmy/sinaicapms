-- Migration 0043: Seed E2E test POS user
-- Creates a cashier user for E2E POS login tests (identifier: cashier, password: pass123)

INSERT OR IGNORE INTO pos_users (
  tenant_id, email, username, role, first_name, last_name,
  password_hash, is_active, organization_id, created_at
) VALUES (
  'tenant_1',
  'cashier@test.com',
  'cashier',
  'cashier',
  'Test',
  'Cashier',
  '$2b$10$jtCiVW3wumKdchMEJO.GrO0HG.33cL1ZYZWkSPdmLoMdg65vT79cC',
  1,
  1,
  CURRENT_TIMESTAMP
);
