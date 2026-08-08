-- Migration 0006: Add room type images and update Acacia Camp data
ALTER TABLE room_types ADD COLUMN image_url TEXT;

-- Delete old room type mappings, rooms, and rate plans for Tenant 1 to avoid conflicts
DELETE FROM reservations WHERE tenant_id = 'tenant_1';
DELETE FROM rooms WHERE tenant_id = 'tenant_1';
DELETE FROM room_type_camps WHERE room_type_id IN (SELECT id FROM room_types WHERE tenant_id = 'tenant_1');
DELETE FROM rate_plans WHERE tenant_id = 'tenant_1';
DELETE FROM room_types WHERE tenant_id = 'tenant_1';

-- Insert the 4 specific room types for Acacia Camp (Tenant 1)
INSERT INTO room_types (id, tenant_id, name, capacity, base_price, description, image_url) VALUES
('rt_acacia_bungalow', 'tenant_1', 'Bungalow', 2, 75, 'A charming beachfront bungalow with a private deck overlooking the Gulf of Aqaba.', NULL),
('rt_acacia_room', 'tenant_1', 'Room', 2, 50, 'Cozy, well-furnished standard room with climate control and proximity to central dining.', 'https://i.postimg.cc/WpBZdd8J/IMG-20260327-WA0012.jpg'),
('rt_acacia_cabin', 'tenant_1', 'Cabin', 4, 110, 'Spacious, rustic wooden cabins nestled under acacia trees. Ideal for groups and families.', 'https://i.postimg.cc/BQ2KHJ7Q/IMG-20260327-WA0024.jpg'),
('rt_acacia_suite', 'tenant_1', 'Suite', 4, 180, 'Premium deluxe suite featuring panoramic Sinai mountain and shoreline views with private lounge.', 'https://i.postimg.cc/hPVdTKZQ/IMG-20260327-WA0027.jpg');

-- Map Room Types to Acacia Camp Session (camp_1)
INSERT INTO room_type_camps (room_type_id, camp_id) VALUES
('rt_acacia_bungalow', 'camp_1'),
('rt_acacia_room', 'camp_1'),
('rt_acacia_cabin', 'camp_1'),
('rt_acacia_suite', 'camp_1');

-- Map Physical Rooms for Bookings
INSERT INTO rooms (id, tenant_id, camp_id, room_type_id, room_number, floor, status) VALUES
('room_acacia_b1', 'tenant_1', 'camp_1', 'rt_acacia_bungalow', 'B101', 1, 'available'),
('room_acacia_b2', 'tenant_1', 'camp_1', 'rt_acacia_bungalow', 'B102', 1, 'available'),
('room_acacia_r1', 'tenant_1', 'camp_1', 'rt_acacia_room', 'R201', 1, 'available'),
('room_acacia_r2', 'tenant_1', 'camp_1', 'rt_acacia_room', 'R202', 1, 'available'),
('room_acacia_c1', 'tenant_1', 'camp_1', 'rt_acacia_cabin', 'C301', 1, 'available'),
('room_acacia_c2', 'tenant_1', 'camp_1', 'rt_acacia_cabin', 'C302', 1, 'available'),
('room_acacia_s1', 'tenant_1', 'camp_1', 'rt_acacia_suite', 'S401', 1, 'available');

-- Map Default Rate Plans for Price Calculations
INSERT INTO rate_plans (id, tenant_id, room_type_id, name, price, start_date, end_date, season) VALUES
('rp_acacia_b', 'tenant_1', 'rt_acacia_bungalow', 'Standard Rate', 75, '2026-01-01', '2026-12-31', 'all'),
('rp_acacia_r', 'tenant_1', 'rt_acacia_room', 'Standard Rate', 50, '2026-01-01', '2026-12-31', 'all'),
('rp_acacia_c', 'tenant_1', 'rt_acacia_cabin', 'Standard Rate', 110, '2026-01-01', '2026-12-31', 'all'),
('rp_acacia_s', 'tenant_1', 'rt_acacia_suite', 'Standard Rate', 180, '2026-01-01', '2026-12-31', 'all');

-- Populate all 23 beautiful Postimg URLs into the Acacia Camp Gallery
UPDATE tenants SET
  hero_image_url = 'https://i.postimg.cc/WpBZdd8J/IMG-20260327-WA0012.jpg',
  gallery_images = '["https://i.postimg.cc/WpBZdd8J/IMG-20260327-WA0012.jpg", "https://i.postimg.cc/h4kmXXsz/IMG-20260327-WA0021.jpg", "https://i.postimg.cc/zXTgKq2z/IMG-20260327-WA0022.jpg", "https://i.postimg.cc/BQ2KHJ7Q/IMG-20260327-WA0024.jpg", "https://i.postimg.cc/hPVdTKZQ/IMG-20260327-WA0027.jpg", "https://i.postimg.cc/tCFxW9vB/IMG-20260327-WA0028.jpg", "https://i.postimg.cc/hPVdTKZp/IMG-20260327-WA0029.jpg", "https://i.postimg.cc/vH5VfG2P/IMG-20260327-WA0031.jpg", "https://i.postimg.cc/T3GWcBB0/IMG-20260327-WA0032.jpg", "https://i.postimg.cc/g2d6K11M/IMG-20260327-WA0033.jpg", "https://i.postimg.cc/sgyZJbb6/IMG-20260327-WA0035.jpg", "https://i.postimg.cc/kg9tyLLp/IMG-20260327-WA0037.jpg", "https://i.postimg.cc/6pwGhFFS/IMG-20260327-WA0038.jpg", "https://i.postimg.cc/13PNKbbk/IMG-20260327-WA0040.jpg", "https://i.postimg.cc/Gmrsj6Z1/IMG-20260327-WA0042.jpg", "https://i.postimg.cc/9QVqBsvc/IMG-20260327-WA0045.jpg", "https://i.postimg.cc/0yfKXcqL/IMG-20260327-WA0046.jpg", "https://i.postimg.cc/W1nqYXvT/IMG-20260327-WA0047.jpg", "https://i.postimg.cc/7ZVJtmkH/IMG-20260327-WA0048.jpg", "https://i.postimg.cc/L8TgQNp8/IMG-20260327-WA0049.jpg", "https://i.postimg.cc/MpDf3dST/IMG-20260327-WA0050.jpg", "https://i.postimg.cc/GmQTgqCy/IMG-20260327-WA0051.jpg", "https://i.postimg.cc/ZqnKZ4m9/IMG-20250902-WA0068.jpg"]'
WHERE id = 'tenant_1';
