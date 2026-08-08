-- Migration 0007: Add custom secret admin passphrase column for tenants
ALTER TABLE tenants ADD COLUMN admin_passphrase TEXT DEFAULT 'sinaiadmin';

-- Set default passphrases for existing records
UPDATE tenants SET admin_passphrase = 'sinaiadmin' WHERE id = 'tenant_1';
UPDATE tenants SET admin_passphrase = 'sinaiadmin' WHERE id = 'tenant_2';
UPDATE tenants SET admin_passphrase = 'sinaiadmin' WHERE id = 'marketplace';
