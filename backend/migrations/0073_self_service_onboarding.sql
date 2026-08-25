-- 0073: Tenant self-service onboarding
-- Adds onboarding_token + onboarding_status to tenants for the public signup flow.

-- Onboarding status: pending_setup → active (completed)
-- New tenants created via /api/public/signup start as 'pending_setup'.

ALTER TABLE tenants ADD COLUMN onboarding_token TEXT;
ALTER TABLE tenants ADD COLUMN onboarding_status TEXT DEFAULT 'completed';

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_tenants_onboarding_token ON tenants(onboarding_token) WHERE onboarding_token IS NOT NULL;
