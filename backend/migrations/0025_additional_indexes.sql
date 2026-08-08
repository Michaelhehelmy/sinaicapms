-- Migration 0025: Additional performance indexes
-- Covers auth lookups, session management, and reporting queries

-- Auth: user lookup by email/username + tenant (login queries)
CREATE INDEX IF NOT EXISTS idx_pos_users_email_username ON pos_users(email, username, tenant_id);

-- Sessions: lookup by user_id + active status (auth middleware)
CREATE INDEX IF NOT EXISTS idx_pos_user_sessions_user_active ON pos_user_sessions(user_id, is_active);

-- Activity logs: lookup by user_id (gamification, staff analytics)
CREATE INDEX IF NOT EXISTS idx_pos_activity_logs_user ON pos_activity_logs(user_id, created_at);

-- Inventory logs: lookup by product_id (stock history)
CREATE INDEX IF NOT EXISTS idx_pos_inventory_logs_product ON pos_inventory_logs(product_id, created_at);

-- Password reset: lookup by reset token column on pos_users (reset flow)
CREATE INDEX IF NOT EXISTS idx_pos_users_password_reset_token ON pos_users(password_reset_token);

-- Transactions: lookup by cashier_id (staff performance reports)
CREATE INDEX IF NOT EXISTS idx_pos_transactions_cashier ON pos_transactions(cashier_id, created_at);

-- Transactions: lookup by customer_id (customer history)
CREATE INDEX IF NOT EXISTS idx_pos_transactions_customer ON pos_transactions(customer_id);

-- Reservations: lookup by room_id + date range (availability checks)
CREATE INDEX IF NOT EXISTS idx_reservations_room_dates ON reservations(room_id, check_in_date, check_out_date);
