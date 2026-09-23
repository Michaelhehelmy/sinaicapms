-- Migration 0053: One camp per tenant — camps own all sub-entities
--
-- Parent feature: "one camp per tenant". A tenant becomes equivalent to its
-- single camp, so:
--   * camps.tenant_id is UNIQUE — a tenant can have at most ONE camp
--   * room types (pos_products) point directly at their camp via camp_id,
--     replacing the product_camps junction as the source of truth
--   * rooms (rooms_new), rate plans (rate_plans_new), reservations (orders)
--     and activity plans (plans_new) already carry camp_id — no change
--   * branding stays on tenants: with tenant == its one camp, tenant branding
--     IS camp branding — no schema change
--
-- NOTE ON TARGET TABLES: the legacy room_types / room_type_camps tables from
-- 0001 no longer exist. Migration 0021 consolidated room_types into
-- pos_products and replaced room_type_camps with product_camps; 0021 then
-- dropped room_type_camps and 0045 dropped room_types. This migration
-- therefore operates on the LIVE tables:
--   room_types      -> pos_products (type='room' rows)
--   room_type_camps -> product_camps
--
-- pos_products.camp_id already exists (added by 0020 for camp-scoped items and
-- preserved by the 0042 table rebuild). It is a soft FK (no REFERENCES clause —
-- adding one would require a full table rebuild, deferred to a follow-up).
-- This migration only backfills it from product_camps so room types stop
-- relying on the junction.

-- 1. One camp per tenant — normalize existing ownership first.
--    A camp whose id matches an existing tenant id belongs to that tenant
--    (the established convention: camp 'acaciacamp' <-> tenant 'acaciacamp').
--    Only camps whose tenant_id is currently DUPLICATED are re-pointed, and
--    only to a same-id tenant. E.g. local/E2E residue has camp 'michaelshouse'
--    pointing at tenant 'acaciacamp'; it is re-pointed to tenant
--    'michaelshouse' so the unique index below can be created. If a duplicate
--    has NO same-id tenant, the index creation fails loudly rather than guess.

UPDATE camps SET tenant_id = id
WHERE tenant_id != id
  AND EXISTS (SELECT 1 FROM tenants WHERE tenants.id = camps.id)
  AND (SELECT COUNT(*) FROM camps c2 WHERE c2.tenant_id = camps.tenant_id) > 1;

-- 2. Enforce one camp per tenant. SQLite cannot add a UNIQUE constraint via
--    ALTER TABLE — a unique index provides the same guarantee.

CREATE UNIQUE INDEX IF NOT EXISTS idx_camps_one_per_tenant ON camps(tenant_id);

-- 3. Room types belong directly to their camp: backfill pos_products.camp_id
--    from the product_camps junction. Room types with no junction row keep
--    NULL (orphaned/unused) — they are not guessed at here.

UPDATE pos_products
SET camp_id = (SELECT pc.camp_id FROM product_camps pc WHERE pc.product_id = pos_products.id LIMIT 1)
WHERE camp_id IS NULL
  AND EXISTS (SELECT 1 FROM product_camps pc WHERE pc.product_id = pos_products.id);

-- 4. product_camps is KEPT (not dropped): the currently deployed backend still
--    reads the junction to resolve camp membership. A follow-up migration may
--    drop it once the backend (task B2) switches to pos_products.camp_id.
