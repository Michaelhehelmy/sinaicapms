-- Migration 0024: Add performance indexes for commonly queried paths
CREATE INDEX IF NOT EXISTS idx_pos_products_tenant_type ON pos_products(tenant_id, type, is_active);
CREATE INDEX IF NOT EXISTS idx_pos_products_deleted ON pos_products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_status ON reservations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_users_tenant_role ON pos_users(tenant_id, role, deleted_at);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_camps_tenant ON camps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_tenant ON financial_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_tenant ON financial_accounts(tenant_id);
