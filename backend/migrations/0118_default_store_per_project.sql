-- Migration 0118: Phase 4a — one default pos_store per project (Option Y, design §6).
--
-- WHAT: guarantees every live project owns at least one default pos_store, in
-- two ordered steps (both NULL-safe, rerunnable):
--   Step 1 — bind: every pos_stores row with NULL project_id whose org maps to
--     a tenant (tenant_org_mapping) is bound to that tenant's oldest live
--     project (ORDER BY created_at ASC, id ASC — same tie-break as 0105).
--   Step 2 — provision: every live project that still has NO store carrying
--     its project_id gets one default store inserted (org = the tenant's org
--     via tenant_org_mapping).
--
-- Recon ground truth: pos_stores DDL (0004_pos.sql: pos_stores — id INTEGER PK
-- AUTOINCREMENT, organization_id INTEGER NOT NULL, name/code/address/city NOT
-- NULL, code UNIQUE) + 0101 (project_id TEXT nullable + idx_pos_stores_project)
-- + 0105:180-191 (partial backfill — mapped orgs only; unmapped-org stores
-- stayed NULL by design, recon §12 Q1) + 0107:576-577 (NOT NULL enforcement
-- deliberately SKIPPED for pos_stores — unresolvable orphans).
--
-- DETERMINISTIC SLUG: pos_stores.id is INTEGER AUTOINCREMENT (no deterministic
-- TEXT id possible); the deterministic slug is `code = 'ST_' || projects.id`
-- (projects.id is unique ⇒ code UNIQUE can never collide). Name is
-- `<project name> || ' Store'` (deterministic per project; mirrors the
-- ensureTenantOrg `<tenant> Store` / `ST_<tenant>` convention in
-- backend/src/middleware/resolveScope.js:63-66). address/city 'N/A' mirrors
-- the same convention (NOT NULL columns).
--
-- SCOPE LIMITS: projects whose tenant has NO tenant_org_mapping row (tenant
-- without a POS org — e.g. never-onboarded tenants) get NO store
-- (organization_id is NOT NULL; inventing an org here would fork the
-- ensureTenantOrg 1:1 tenant:org invariant). Stores in unmapped orgs
-- (no mapping row — orphan probe leftovers per 0105:181-183) stay NULL.
-- Both residuals are countable post-apply (see VERIFY below) and are healed
-- going forward by the camps.js project-create store hook (same change set).
--
-- IDEMPOTENCY: Step 1 touches only NULL rows in mapped orgs; Step 2's
-- NOT EXISTS (no store carries this project_id) makes reruns a no-op. No DDL,
-- no index changes (idx_pos_stores_project from 0101 covers the lookups).
--
-- ROLLBACK SAFETY (hard rule 7): data-only, forward-only. Step 1 rollback =
-- restore from pre-apply backup (same locker procedure as 0105). Step 2
-- rollback = DELETE marker rows ONLY:
--   DELETE FROM pos_stores WHERE code LIKE 'ST_camp\_%' ESCAPE '\'
--     AND project_id IS NOT NULL
--     AND name LIKE '% Store' AND address = 'N/A' AND city = 'N/A';
-- (code prefix 'ST_' + project id + the N/A marker distinguishes 0118 rows
-- from ensureTenantOrg/onboarding 'ST_<tenant>' rows. Run BEFORE any
-- 4b+ enforcement migration turns project_id NOT NULL.)
--
-- TOUCH DISCIPLINE (db-migration gotchas): this file touches pos_stores ONLY.
-- It does NOT touch pos_users (GENERATED name → first_name/last_name ONLY;
-- organization_id INTEGER NOT NULL), pos_transactions (cashier_id, not
-- staff_id), or any other table.

-- ─────────────────────────────────────────────────────────────
-- Step 1 — bind NULL-project stores in mapped orgs to the org tenant's
-- oldest live project.
-- ─────────────────────────────────────────────────────────────
UPDATE pos_stores SET project_id = (
  SELECT p.id FROM projects p
  JOIN tenant_org_mapping m ON m.tenant_id = p.tenant_id
  WHERE m.organization_id = pos_stores.organization_id
    AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL
  AND EXISTS (
    SELECT 1 FROM tenant_org_mapping m2
    WHERE m2.organization_id = pos_stores.organization_id
  );

-- ─────────────────────────────────────────────────────────────
-- Step 2 — one default store per live project that still has none.
-- (MUST run after Step 1: bound stores satisfy the NOT EXISTS guard, so no
-- project ends up with a duplicate default.)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pos_stores (organization_id, name, code, address, city, project_id, created_at, updated_at)
SELECT
  m.organization_id,
  p.name || ' Store',
  'ST_' || p.id,
  'N/A',
  'N/A',
  p.id,
  datetime('now'),
  datetime('now')
FROM projects p
JOIN tenant_org_mapping m ON m.tenant_id = p.tenant_id
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM pos_stores s WHERE s.project_id = p.id);

-- ─────────────────────────────────────────────────────────────
-- VERIFY (post-apply, read-only — comments only, not executed statements).
-- ─────────────────────────────────────────────────────────────
-- Expect 0: live projects without a store
-- SELECT COUNT(*) AS projects_without_store FROM projects p
-- WHERE p.deleted_at IS NULL
--   AND NOT EXISTS (SELECT 1 FROM pos_stores s WHERE s.project_id = p.id);
-- Expect only unmapped-org orphans: NULL-project stores (no mapping row)
-- SELECT COUNT(*) AS unmapped_null_stores FROM pos_stores s
-- WHERE s.project_id IS NULL
--   AND NOT EXISTS (SELECT 1 FROM tenant_org_mapping m WHERE m.organization_id = s.organization_id);
-- Expect 0: NULL-project stores in mapped orgs whose tenant HAS a live project
-- SELECT COUNT(*) AS mapped_null_stores FROM pos_stores s
-- WHERE s.project_id IS NULL
--   AND EXISTS (
--     SELECT 1 FROM tenant_org_mapping m
--     JOIN projects p ON p.tenant_id = m.tenant_id AND p.deleted_at IS NULL
--     WHERE m.organization_id = s.organization_id
--   );
-- Expect 0: live projects in org-less tenants (no store possible)
-- SELECT COUNT(*) AS orgless_projects FROM projects p
-- WHERE p.deleted_at IS NULL
--   AND NOT EXISTS (SELECT 1 FROM tenant_org_mapping m WHERE m.tenant_id = p.tenant_id);
