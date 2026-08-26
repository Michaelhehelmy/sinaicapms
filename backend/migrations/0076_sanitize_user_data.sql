-- Migration 0076: Sanitize existing user-generated fields against stored XSS.
-- Strips <script> tags and on* event handlers from free-text columns.

-- 1. tenant_meta.meta_value
UPDATE tenant_meta
SET meta_value = REPLACE(REPLACE(REPLACE(
  meta_value,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE meta_value LIKE '%<script%' OR meta_value LIKE '%</script%' OR meta_value LIKE '%onerror=%';

-- 2. project_meta.meta_value
UPDATE project_meta
SET meta_value = REPLACE(REPLACE(REPLACE(
  meta_value,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE meta_value LIKE '%<script%' OR meta_value LIKE '%</script%' OR meta_value LIKE '%onerror=%';

-- 3. projects.description
UPDATE projects
SET description = REPLACE(REPLACE(REPLACE(
  description,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE description LIKE '%<script%' OR description LIKE '%</script%' OR description LIKE '%onerror=%';

-- 4. pos_products.description
UPDATE pos_products
SET description = REPLACE(REPLACE(REPLACE(
  description,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE description LIKE '%<script%' OR description LIKE '%</script%' OR description LIKE '%onerror=%';

-- 5. service_bookings.notes
UPDATE service_bookings
SET notes = REPLACE(REPLACE(REPLACE(
  notes,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE notes LIKE '%<script%' OR notes LIKE '%</script%' OR notes LIKE '%onerror=%';

-- 6. service_reviews.comment
UPDATE service_reviews
SET comment = REPLACE(REPLACE(REPLACE(
  comment,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE comment LIKE '%<script%' OR comment LIKE '%</script%' OR comment LIKE '%onerror=%';

-- 7. inventory_adjustments.notes
UPDATE inventory_adjustments
SET notes = REPLACE(REPLACE(REPLACE(
  notes,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE notes LIKE '%<script%' OR notes LIKE '%</script%' OR notes LIKE '%onerror=%';

-- 8. orders.notes
UPDATE orders
SET notes = REPLACE(REPLACE(REPLACE(
  notes,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE notes LIKE '%<script%' OR notes LIKE '%</script%' OR notes LIKE '%onerror=%';

-- 9. tenants.description
UPDATE tenants
SET description = REPLACE(REPLACE(REPLACE(
  description,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE description LIKE '%<script%' OR description LIKE '%</script%' OR description LIKE '%onerror=%';

-- 10. plans.description (meal plans)
UPDATE plans_new
SET description = REPLACE(REPLACE(REPLACE(
  description,
  '<script', '<scr¡pt'),
  '</script>', '</scr¡pt'),
  'onerror=', 'onerror​=')
WHERE description LIKE '%<script%' OR description LIKE '%</script%' OR description LIKE '%onerror=%';
