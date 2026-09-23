-- Migration 0019: Unify users into pos_users
-- Merges the main backend `users` table into the richer `pos_users` table
-- Old `users` table is dropped after data migration

-- 1. Add missing columns to pos_users for tenant-scoped and main-backend support
ALTER TABLE pos_users ADD COLUMN tenant_id TEXT;
ALTER TABLE pos_users ADD COLUMN deleted_at DATETIME;

-- 2. Migrate data from old `users` table into pos_users
-- Passwords are prefixed with $sha256$ so login code can detect algorithm
INSERT INTO pos_users (
    email, password_hash, role, tenant_id, username, first_name, last_name, organization_id, created_at, updated_at
)
SELECT
    email,
    '$sha256$' || COALESCE(password_hash, ''),
    COALESCE(role, 'tenant_admin'),
    tenant_id,
    COALESCE(username, email),
    COALESCE(SUBSTR(name, 1, INSTR(name, ' ') - 1), name, 'Camp'),
    COALESCE(SUBSTR(name, INSTR(name, ' ') + 1), 'Admin'),
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM users
WHERE email NOT IN (SELECT email FROM pos_users WHERE email IS NOT NULL AND email != '');

-- 3. Drop old users table
DROP TABLE IF EXISTS users;

-- 4. Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_pos_users_tenant
    ON pos_users(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pos_users_email_tenant
    ON pos_users(email, tenant_id);

-- 5. Add last_login alias column (code references last_login, schema has last_login_at)
ALTER TABLE pos_users ADD COLUMN last_login DATETIME;

-- 6. Backfill last_login from last_login_at
UPDATE pos_users SET last_login = last_login_at WHERE last_login_at IS NOT NULL;

-- 7. Add status column (code references status, schema has is_active)
ALTER TABLE pos_users ADD COLUMN status TEXT DEFAULT 'active';
UPDATE pos_users SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END;

-- 8. Indexes for auth lookups
CREATE INDEX IF NOT EXISTS idx_pos_users_email ON pos_users(email);
CREATE INDEX IF NOT EXISTS idx_pos_users_username ON pos_users(username);
CREATE INDEX IF NOT EXISTS idx_pos_users_status ON pos_users(status);
