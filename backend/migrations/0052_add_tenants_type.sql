-- Migration 0052: add marketplace listing type to tenants
--
-- Phase 2 (marketplace vs tenant domain separation): a tenant can be a camp,
-- supermarket, transportation provider, or other marketplace listing. Existing
-- rows default to 'camp' (backward compatible — the original business is camps).
--
-- SQLite supports inline CHECK on ADD COLUMN; the constraint applies to rows
-- inserted/updated after this migration. Default 'camp' satisfies the CHECK so
-- the ALTER is safe on populated tables.

ALTER TABLE tenants ADD COLUMN type TEXT NOT NULL DEFAULT 'camp' CHECK (type IN ('camp','supermarket','transportation','other'));
