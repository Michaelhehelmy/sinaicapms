-- T27: tenant_usage was created in 0075_business_enhancements.sql but is never
-- read or written by any handler (verified: zero code references after the
-- admin-stats/admin-users modules were deleted in the same task). Dropping the
-- dead table also drops its indexes (idx_tenant_usage_tenant,
-- idx_tenant_usage_metric) automatically.
DROP TABLE IF EXISTS tenant_usage;