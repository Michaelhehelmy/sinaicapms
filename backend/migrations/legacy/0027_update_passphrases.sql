-- Migration 0027: Update security passphrases
-- Marketplace: hacker_passphrase → 'superoot'
-- Tenants: hacker_passphrase → 'admin!'

UPDATE tenants SET hacker_passphrase = 'superoot' WHERE id = 'marketplace';
UPDATE tenants SET hacker_passphrase = 'admin!' WHERE id != 'marketplace';
