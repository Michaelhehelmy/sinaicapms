-- Insert Marketplace Branding Record
INSERT INTO tenants (id, name, subdomain, custom_domain, primary_color, logo_url, favicon_url, location, phone, email, description, status)
VALUES (
  'marketplace',
  'Sinai Camps',
  'sinaicamps',
  'sinaicamps.com',
  '#2c3e50',
  'http://localhost:8000/logo.png',
  'http://localhost:8000/favicon.png',
  'Sinai, Egypt',
  '+201000000000',
  'info@sinaicamps.com',
  'The central directory for exploring top adventure and beach camps in South Sinai.',
  'active'
);

-- Update Tenant 1 (Acacia Camp - Custom Domain)
UPDATE tenants SET
  name = 'Acacia Camp',
  subdomain = 'acacia',
  custom_domain = 'acaciacamp.com',
  primary_color = '#2e7d32',
  logo_url = 'http://localhost:8001/acacia_logo.png',
  favicon_url = 'http://localhost:8001/acacia_favicon.png',
  location = 'Sinai Peninsula, Egypt',
  whatsapp_number = '+201234567890',
  phone = '+201234567890',
  email = 'info@acaciacamp.com',
  description = 'Experience premium summer camp programs and wilderness lodges in the heart of Sinai.'
WHERE id = 'tenant_1';

-- Update Tenant 2 (Michael's House - Subdomain Domain)
UPDATE tenants SET
  name = 'Michael''s House',
  subdomain = 'michaelshouse',
  custom_domain = NULL,
  primary_color = '#1565c0',
  logo_url = 'http://localhost:8001/michael_logo.png',
  favicon_url = 'http://localhost:8001/michael_favicon.png',
  location = 'Dahab, South Sinai',
  whatsapp_number = '+201234567891',
  phone = '+201234567891',
  email = 'michael@sinaicamps.com',
  description = 'Charming beach house accommodations and water sports activities in Dahab.'
WHERE id = 'tenant_2';

-- Update Camp Names to reflect branding
UPDATE camps SET name = 'Acacia Camp Summer Session', location = 'Sinai Peninsula, Egypt' WHERE tenant_id = 'tenant_1';
UPDATE camps SET name = 'Dahab Beach Getaway', location = 'Dahab, South Sinai' WHERE tenant_id = 'tenant_2';

-- Update Room Types to reflect branding
UPDATE room_types SET name = 'Standard Cabin' WHERE tenant_id = 'tenant_1' AND name = 'Standard Room';
UPDATE room_types SET name = 'Deluxe Lodge' WHERE tenant_id = 'tenant_1' AND name = 'Deluxe Room';
INSERT INTO room_types (id, tenant_id, name, capacity, base_price, description) 
VALUES ('rt_suite', 'tenant_1', 'Luxury Suite', 4, 250, 'Spacious suite with king-size bed and sea views.');

UPDATE room_types SET name = 'Twin Beach Room' WHERE tenant_id = 'tenant_2' AND name = 'Standard Room';
UPDATE room_types SET name = 'Family Beach House' WHERE tenant_id = 'tenant_2' AND name = 'Deluxe Room';
