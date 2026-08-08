-- Migration 0009: Add username column to users table for alternative login
ALTER TABLE users ADD COLUMN username TEXT;

-- Seed default usernames for existing users
UPDATE users SET username = 'admin1' WHERE id = 'usr_1';
UPDATE users SET username = 'admin2' WHERE id = 'usr_2';
