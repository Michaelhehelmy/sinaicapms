-- Migration 0002: Seed database with sample tenants, camps, rooms, reservations, staff, and transactions

-- Tenants
INSERT INTO tenants (id, subdomain, custom_domain, name, logo_url, primary_color, footer_text, status) VALUES 
('tenant_1', 'mountain', NULL, 'Mountain Ridge Camps', NULL, '#4a7c4f', 'Mountain Ridge - Managed with CampMaster Pro', 'active'),
('tenant_2', 'lake', NULL, 'Lake View Retreats', NULL, '#1e3d59', 'Lake View - Managed with CampMaster Pro', 'active');

-- Camps
INSERT INTO camps (id, tenant_id, name, location, start_date, end_date, capacity, status, notes) VALUES
('camp_1', 'tenant_1', 'Mountain Ridge Camp', 'Colorado Rockies', '2026-06-15', '2026-08-20', 80, 'active', 'Annual summer camp for ages 10-16'),
('camp_2', 'tenant_2', 'Lake View Retreat', 'Lake Tahoe, CA', '2026-07-01', '2026-08-30', 50, 'active', 'Family-oriented retreat camp');

-- Room Types
INSERT INTO room_types (id, tenant_id, name, capacity, base_price, description) VALUES
('rt_1', 'tenant_1', 'Standard Room', 2, 100, 'Standard double room'),
('rt_2', 'tenant_1', 'Deluxe Room', 2, 150, 'Deluxe room with view'),
('rt_3', 'tenant_1', 'Suite', 4, 250, 'Family suite with kitchen'),
('rt_4', 'tenant_2', 'Standard Room', 2, 100, 'Standard double room'),
('rt_5', 'tenant_2', 'Deluxe Room', 2, 150, 'Deluxe room with view');

-- Room Type to Camps Mappings
INSERT INTO room_type_camps (room_type_id, camp_id) VALUES
('rt_1', 'camp_1'),
('rt_2', 'camp_1'),
('rt_3', 'camp_1'),
('rt_4', 'camp_2'),
('rt_5', 'camp_2');

-- Rooms
INSERT INTO rooms (id, tenant_id, camp_id, room_type_id, room_number, floor, status) VALUES
('room_1', 'tenant_1', 'camp_1', 'rt_1', '101', 1, 'occupied'),
('room_2', 'tenant_1', 'camp_1', 'rt_1', '102', 1, 'available'),
('room_3', 'tenant_1', 'camp_1', 'rt_2', '201', 2, 'available'),
('room_4', 'tenant_1', 'camp_1', 'rt_3', '301', 3, 'available'),
('room_5', 'tenant_2', 'camp_2', 'rt_4', '101', 1, 'occupied'),
('room_6', 'tenant_2', 'camp_2', 'rt_5', '201', 2, 'available');

-- Rate Plans
INSERT INTO rate_plans (id, tenant_id, room_type_id, name, price, start_date, end_date, season) VALUES
('rp_1', 'tenant_1', 'rt_1', 'Standard Rate', 100, '2026-01-01', '2026-12-31', 'all'),
('rp_2', 'tenant_1', 'rt_1', 'Summer Peak', 150, '2026-06-01', '2026-08-31', 'summer'),
('rp_3', 'tenant_1', 'rt_1', 'Winter Discount', 80, '2026-12-01', '2027-02-28', 'winter'),
('rp_4', 'tenant_2', 'rt_4', 'Standard Rate', 100, '2026-01-01', '2026-12-31', 'all');

-- Reservations
INSERT INTO reservations (id, tenant_id, camp_id, room_id, guest_name, guest_email, guest_phone, number_of_people, check_in_date, check_out_date, status, total_amount, amount_paid, notes) VALUES
('res_1', 'tenant_1', 'camp_1', 'room_1', 'Alice Johnson', 'alice@email.com', '555-0101', 2, '2026-07-05', '2026-07-12', 'confirmed', 1200, 800, 'Family of 4, cabin preference'),
('res_2', 'tenant_1', 'camp_1', 'room_2', 'Bob Smith', 'bob@email.com', '555-0102', 2, '2026-07-10', '2026-07-15', 'pending', 600, 300, ''),
('res_3', 'tenant_2', 'camp_2', 'room_5', 'Carol Davis', 'carol@email.com', '555-0103', 2, '2026-08-01', '2026-08-07', 'confirmed', 1500, 1500, 'Full payment received');

-- Staff
INSERT INTO staff (id, tenant_id, camp_id, name, role, email, phone, salary, status) VALUES
('stf_1', 'tenant_1', 'camp_1', 'David Wilson', 'Camp Director', 'david@camp.com', '555-0201', 5500, 'active'),
('stf_2', 'tenant_1', 'camp_1', 'Emma Brown', 'Activity Coordinator', 'emma@camp.com', '555-0202', 3800, 'active'),
('stf_3', 'tenant_2', 'camp_2', 'Frank Garcia', 'Head Chef', 'frank@camp.com', '555-0203', 4200, 'active');

-- Expenses
INSERT INTO expenses (id, tenant_id, camp_id, expense_type, linked_id, category, description, amount, date, receipt_info) VALUES
('exp_1', 'tenant_1', 'camp_1', 'food', '', 'Food & Supplies', 'Weekly grocery order', 450, '2026-07-01', 'Invoice #G-789'),
('exp_2', 'tenant_1', 'camp_1', 'room', 'room_1', 'Equipment', 'New furniture for rooms', 2200, '2026-06-20', 'REI Order #44521'),
('exp_3', 'tenant_2', 'camp_2', 'maintenance', '', 'Maintenance', 'Dock repair', 800, '2026-06-25', 'Contractor invoice');

-- Inventory
INSERT INTO inventory (id, tenant_id, camp_id, item_name, category, quantity, unit, cost_per_unit, min_quantity, last_updated) VALUES
('ing_1', 'tenant_1', 'camp_1', 'Chicken Breast', 'Protein', 50, 'kg', 8.50, 10, '2026-06-01'),
('ing_2', 'tenant_1', 'camp_1', 'Rice', 'Grains', 100, 'kg', 2.00, 20, '2026-06-01'),
('ing_3', 'tenant_1', 'camp_1', 'Vegetables Mix', 'Vegetables', 30, 'kg', 4.00, 10, '2026-06-01'),
('ing_4', 'tenant_2', 'camp_2', 'Beef', 'Protein', 40, 'kg', 12.00, 10, '2026-05-15');

-- Meals
INSERT INTO meals (id, tenant_id, name, category, selling_price, description) VALUES
('meal_1', 'tenant_1', 'Grilled Chicken with Rice', 'Main Course', 18.00, 'Grilled chicken breast with seasoned rice and vegetables'),
('meal_2', 'tenant_1', 'Beef Stir Fry', 'Main Course', 22.00, 'Beef strips with mixed vegetables'),
('meal_3', 'tenant_2', 'Beef Stir Fry', 'Main Course', 22.00, 'Beef strips with mixed vegetables');

-- Meal Ingredients
INSERT INTO meal_ingredients (id, tenant_id, meal_id, ingredient_id, quantity, unit) VALUES
('mi_1', 'tenant_1', 'meal_1', 'ing_1', 0.3, 'kg'),
('mi_2', 'tenant_1', 'meal_1', 'ing_2', 0.2, 'kg'),
('mi_3', 'tenant_1', 'meal_1', 'ing_3', 0.2, 'kg'),
('mi_4', 'tenant_2', 'meal_3', 'ing_4', 0.25, 'kg');

-- Plans
INSERT INTO plans (id, tenant_id, camp_id, title, description, date, time, status, category) VALUES
('pln_1', 'tenant_1', 'camp_1', 'Opening Day Ceremony', 'Welcome campers', '2026-07-01', '09:00', 'confirmed', 'Event'),
('pln_2', 'tenant_1', 'camp_1', 'Hiking Trip - Eagle Trail', 'Full-day hike', '2026-07-08', '07:30', 'pending', 'Activity'),
('pln_3', 'tenant_2', 'camp_2', 'Fishing Workshop', 'Morning session', '2026-07-15', '10:00', 'confirmed', 'Workshop');

-- Financial Accounts
INSERT INTO financial_accounts (id, tenant_id, name, type, balance) VALUES
('acc_1', 'tenant_1', 'Cash', 'asset', 5000),
('acc_2', 'tenant_1', 'Bank Account', 'asset', 25000),
('acc_3', 'tenant_1', 'Accounts Receivable', 'asset', 1500),
('acc_4', 'tenant_2', 'Cash', 'asset', 5000),
('acc_5', 'tenant_2', 'Bank Account', 'asset', 25000),
('acc_6', 'tenant_2', 'Accounts Receivable', 'asset', 1500);

-- Financial Transactions
INSERT INTO financial_transactions (id, tenant_id, account_id, type, amount, date, description, expense_id) VALUES
('tx_1', 'tenant_1', 'acc_2', 'credit', 1200, '2026-07-05', 'Room payment', NULL);

-- Revenue
INSERT INTO revenue (id, tenant_id, source, source_id, amount, date, description, camp_id) VALUES
('rev_1', 'tenant_1', 'room', 'res_1', 1200, '2026-07-05', 'Room reservation', 'camp_1'),
('rev_2', 'tenant_1', 'meal', 'meal_1', 360, '2026-07-05', 'Meal sales', 'camp_1');

-- Users (Tenant admins - password is 'admin123')
INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES
('usr_1', 'tenant_1', 'Mountain Ridge Admin', 'admin1@camp.com', '240aa26b9a14e0f6e409d93e395ec1bb8aab20428e9c62936e5cf48c34c25d38', 'admin'),
('usr_2', 'tenant_2', 'Lake View Admin', 'admin2@camp.com', '240aa26b9a14e0f6e409d93e395ec1bb8aab20428e9c62936e5cf48c34c25d38', 'admin');
