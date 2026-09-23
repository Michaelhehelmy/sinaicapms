-- 0084: Platform-wide settings and subscription management for Super Admin
-- Feature flags, email templates, defaults, branding are stored as JSON blobs.
-- NOTE: tenant_subscriptions and subscription_plans already exist (created by 0075).
-- This migration adds platform_settings and augments tenant_subscriptions with
-- the additional columns needed by the admin UI (trial_ends_at, bookings_used, etc.).

-- ══════════════════════════════════════════════════════════════════════
-- 1. Platform settings (singleton row)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  feature_flags TEXT DEFAULT '{}',
  email_templates TEXT DEFAULT '{}',
  defaults TEXT DEFAULT '{}',
  branding TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT
);

-- Seed the singleton with sensible defaults
INSERT OR IGNORE INTO platform_settings (id, feature_flags, email_templates, defaults, branding)
VALUES (
  1,
  '{"financials":false,"hr":false,"supply":false,"crm":false,"storefront":false,"ai":false}',
  '{"welcome":{"subject":"Welcome to SinaiCamps","body":"Welcome aboard!"},"invoice":{"subject":"Your Invoice","body":"Thank you for your purchase."},"passwordReset":{"subject":"Reset Your Password","body":"Click the link to reset your password."}}',
  '{"taxRate":0,"currency":"USD","timezone":"UTC","dateFormat":"YYYY-MM-DD"}',
  '{"platformName":"SinaiCamps","logoUrl":null,"faviconUrl":null,"primaryColor":"#16a34a"}'
);

-- ══════════════════════════════════════════════════════════════════════
-- 2. Augment tenant_subscriptions with admin-UI columns
--    (table already exists from 0075 with plan_id FK to subscription_plans)
-- ══════════════════════════════════════════════════════════════════════

-- trial_ends_at: when free trial expires (nullable)
ALTER TABLE tenant_subscriptions ADD COLUMN trial_ends_at TEXT;

-- bookings_used: running count of orders in current period
ALTER TABLE tenant_subscriptions ADD COLUMN bookings_used INTEGER DEFAULT 0;

-- bookings_limit: plan-specific cap (derived from subscription_plans.max_orders_monthly)
ALTER TABLE tenant_subscriptions ADD COLUMN bookings_limit INTEGER DEFAULT 100;

-- total_paid: lifetime revenue from this tenant
ALTER TABLE tenant_subscriptions ADD COLUMN total_paid REAL DEFAULT 0;
