-- 0088: Paymob payment configuration for platform_settings
-- Adds a `payment` JSON-blob column to the singleton platform_settings row
-- so the super-admin dashboard can store Paymob integration configuration.
--
-- Payment blob shape:
--   {
--     enabled:          boolean   – master switch for payment processing
--     secretKey:        string    – Paymob API secret key (SECRET — masked on GET)
--     hmacSecret:       string    – Paymob HMAC signing secret (SECRET — masked on GET)
--     integrationIds:   object    – map of Paymob integration IDs per payment method
--     baseUrl:          string    – Paymob API base URL
--     publicKey:        string    – Paymob publishable / client-side key (safe to send)
--     currency:         string    – default transaction currency (e.g. "EGP")
--     marketplaceFeePct: number   – platform fee percentage deducted per transaction
--   }
--
-- SECURITY NOTE: secretKey and hmacSecret are stored here but are NEVER returned
-- raw to the browser.  GET endpoints mask these fields (replaced with "••••") before
-- the response leaves the server.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Add payment configuration blob to platform_settings
-- ══════════════════════════════════════════════════════════════════════

-- NOTE: ALTER TABLE ADD COLUMN has no IF NOT EXISTS in SQLite/D1.
-- If this migration has already run, re-applying it will fail with
-- "duplicate column name" — that is expected and safe to ignore on
-- retry.
ALTER TABLE platform_settings ADD COLUMN payment TEXT DEFAULT '{}';
