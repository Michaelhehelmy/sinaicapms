-- Migration 0008: Add custom hacker passphrase column for tenants (Ctrl + Alt + A countdown alert gate)
ALTER TABLE tenants ADD COLUMN hacker_passphrase TEXT DEFAULT 'hackeradmin';

-- Set default passphrases for existing records
UPDATE tenants SET hacker_passphrase = 'hackeradmin' WHERE id = 'tenant_1';
UPDATE tenants SET hacker_passphrase = 'hackeradmin' WHERE id = 'tenant_2';
UPDATE tenants SET hacker_passphrase = 'hackeradmin' WHERE id = 'marketplace';
