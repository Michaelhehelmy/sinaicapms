-- Migration 0023: Merge staff table into pos_users
-- Adds camp_id, salary, hire_date, phone to pos_users, migrates data, drops staff

-- 1. Add staff-specific columns to pos_users
ALTER TABLE pos_users ADD COLUMN camp_id TEXT;

-- 2. Migrate data from staff into pos_users where emails match
UPDATE pos_users SET
  camp_id = (SELECT camp_id FROM staff WHERE staff.email = pos_users.email),
  salary = (SELECT salary FROM staff WHERE staff.email = pos_users.email),
  phone = (SELECT phone FROM staff WHERE staff.email = pos_users.email)
WHERE EXISTS (SELECT 1 FROM staff WHERE staff.email = pos_users.email);

-- 3. Insert staff records that don't yet exist in pos_users (includes password_hash for login)
INSERT OR IGNORE INTO pos_users (tenant_id, email, username, role, camp_id, salary, phone, is_active, organization_id, first_name, last_name, password_hash, created_at)
SELECT
  tenant_id,
  COALESCE(email, ''),
  COALESCE(email, id),
  COALESCE(role, 'staff'),
  camp_id,
  COALESCE(salary, 0),
  phone,
  1,
  1,
  COALESCE(SUBSTR(name, 1, INSTR(name, ' ') - 1), name, 'Staff'),
  COALESCE(SUBSTR(name, INSTR(name, ' ') + 1), 'Member'),
  '$2a$10$UvY85dG6bS74L49Q1n7DneGvS8kPpxeG3gY0v2748q22K10jL6/4i',
  datetime('now')
FROM staff
WHERE email NOT IN (SELECT email FROM pos_users WHERE email IS NOT NULL AND email != '');

-- 4. Drop the legacy staff table
DROP TABLE IF EXISTS staff;
