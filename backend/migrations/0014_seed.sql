-- Baseline 0014_seed.sql: super-admin + reference seeds (from legacy 0029_seed_data.sql).
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Contains ONLY seeds whose tables exist in the canonical schema: the
-- order_return_state block from 0029 is intentionally omitted (table dropped in
-- legacy 0056_drop_dead_tables.sql). All statements are INSERT OR IGNORE
-- (idempotent; safe under re-apply).
-- Tables: languages, order_state, order_state_lang, admins

-- Languages
INSERT OR IGNORE INTO languages (code, name, is_default) VALUES
    ('en', 'English', 1),
    ('ar', 'Arabic', 0);

-- Order States (QloApps-style)
INSERT OR IGNORE INTO order_state (id, color, logable, shipped, invoice, paid, deleted, position) VALUES
    ('pending',    '#ffa500', 1, 0, 0, 0, 0, 1),
    ('confirmed',  '#4a7c4f', 1, 0, 1, 1, 0, 2),
    ('checked_in', '#2196f3', 1, 1, 1, 1, 0, 3),
    ('checked_out','#9e9e9e', 1, 1, 1, 1, 0, 4),
    ('cancelled',  '#f44336', 1, 0, 0, 0, 1, 5);

-- English names
INSERT OR IGNORE INTO order_state_lang (order_state_id, lang, name) VALUES
    ('pending',    'en', 'Pending'),
    ('confirmed',  'en', 'Confirmed'),
    ('checked_in', 'en', 'Checked In'),
    ('checked_out','en', 'Checked Out'),
    ('cancelled',  'en', 'Cancelled');

-- Arabic names
INSERT OR IGNORE INTO order_state_lang (order_state_id, lang, name) VALUES
    ('pending',    'ar', 'قيد الانتظار'),
    ('confirmed',  'ar', 'مؤكد'),
    ('checked_in', 'ar', 'تم تسجيل الدخول'),
    ('checked_out','ar', 'تم تسجيل الخروج'),
    ('cancelled',  'ar', 'ملغي');

-- Default super_admin user
-- Password: sinairoot (bcrypt hash)
-- This will be auto-hashed on first login if plaintext
INSERT OR IGNORE INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at) VALUES
    ('superadmin', NULL, 'admin@sinaicamps.com', '$2b$10$qRNPVasnC6D0gn5W4.NuGuMUAEhfCMmtmkS4HnWnaZOumKt04vXdG', 'super_admin', 'Super', 'Admin', 1, CURRENT_TIMESTAMP);
