-- 0077: Deferred indexes (depend on columns added by 0075)
-- These indexes reference columns that didn't exist when 0074 was written.

-- service_bookings.assigned_worker_id (added by 0075)
CREATE INDEX IF NOT EXISTS idx_svc_bookings_worker ON service_bookings(assigned_worker_id);

-- rooms_new.max_guests (rooms_new uses max_guests, not capacity)
CREATE INDEX IF NOT EXISTS idx_rooms_capacity ON rooms_new(max_guests);
