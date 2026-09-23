-- Migration 0104: Phase-0 default project provisioning (data-only, no backfill).
--
-- WHAT: provisions exactly ONE default camp-type project per project-less tenant via
-- a single idempotent INSERT…SELECT … WHERE NOT EXISTS. No project_id backfill is
-- performed here — backfilling the 0100–0103 project_id columns from the default
-- (or chosen) project per tenant is owned by Phase 1.
--
-- Recon ground truth: /tmp/opencode/p0-recon.md §3 (0104 section).
--   - tenants: id TEXT PRIMARY KEY (0001:7-8) + subdomain TEXT UNIQUE (0001:9) +
--     name TEXT NOT NULL (0001:11); later adds business_type / lat-long / deleted_at /
--     meta_version / onboarding_token+status (0059, 0073). Provisioning keys on id.
--   - projects: id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id)
--     (0063:26-28) + slug TEXT NOT NULL (0063:30) + project_type DEFAULT 'camp'
--     (0063:31) + UNIQUE(tenant_id, slug) (0063:45); populated 0063:51-60 via
--     INSERT…SELECT FROM camps — the shape reused below.
--
-- IDEMPOTENCY: the WHERE NOT EXISTS guard (no project rows for the tenant) makes
-- reruns a no-op — same INSERT…SELECT lineage as 0063_rename_camps_to_projects.sql
-- (INSERT…SELECT copy) plus the standard SQL anti-row guard; soft-deleted tenants
-- (tenants.deleted_at, added 0059:23) are skipped. The slug 'default-camp' is safe
-- because the guard only fires for tenants with ZERO projects, so no
-- UNIQUE(tenant_id, slug) collision is possible on insert.
--
-- MARKER + ROLLBACK (hard rule 7 for data): every row provisioned here carries the
-- marker slug = 'default-camp' AND description = 'P0 default-provisioned project
-- (migration 0104)'. Rollback = manual DELETE of marker rows ONLY (never a blind
-- slug delete — a tenant may legitimately own a hand-made 'default-camp' slug):
--
--   DELETE FROM projects
--   WHERE slug = 'default-camp'
--     AND description = 'P0 default-provisioned project (migration 0104)'
--     AND tenant_id = '<tenant>';  -- repeat per tenant, or omit tenant_id to roll
--                                   -- back all 0104-provisioned rows at once.
--
-- Only run the rollback BEFORE Phase 1 backfill points rows at these projects; after
-- backfill, re-point or migrate dependents first (ON DELETE SET NULL links from the
-- 0100–0103 columns would null out, but camp_id links are SET NULL too — check).
--
-- TOUCH DISCIPLINE (db-migration gotchas): this file inserts into projects ONLY.
-- It does NOT touch pos_users (GENERATED name → first_name/last_name ONLY;
-- organization_id INTEGER NOT NULL), pos_transactions (cashier_id, not staff_id),
-- or any other POS row — no gotcha applies.
--
-- VERIFY (post-apply, read-only — kept as comments, not executed statements):
--   -- Expect 0: tenants still without a live project
--   -- SELECT COUNT(*) AS tenants_without_project FROM tenants t
--   -- WHERE t.deleted_at IS NULL
--   --   AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.tenant_id = t.id);
--   -- Expect 1 row per provisioned tenant (audit the marker set)
--   -- SELECT tenant_id, id, slug, project_type FROM projects
--   -- WHERE slug = 'default-camp'
--   --   AND description = 'P0 default-provisioned project (migration 0104)'
--   -- ORDER BY tenant_id;

INSERT INTO projects (id, tenant_id, name, slug, project_type, status, description)
SELECT
  lower(hex(randomblob(16))),
  t.id,
  t.name || ' Default Camp',
  'default-camp',
  'camp',
  'active',
  'P0 default-provisioned project (migration 0104)'
FROM tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.tenant_id = t.id);
