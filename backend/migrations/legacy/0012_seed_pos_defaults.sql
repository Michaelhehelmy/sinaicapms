-- Migration 0012: Seed POS defaults
-- Insert default organization and store to satisfy foreign key constraints

INSERT OR IGNORE INTO pos_organizations (id, name, slug, is_active, created_at, updated_at)
VALUES (1, 'Default Organization', 'default', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO pos_stores (id, organization_id, name, code, address, city, is_active, created_at, updated_at)
VALUES (1, 1, 'Default Store', 'DEFAULT', 'Default Address', 'Default City', 1, datetime('now'), datetime('now'));
