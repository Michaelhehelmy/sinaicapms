-- 0074: Performance indexes across all business modules
-- Covers: orders, POS, inventory, services, onboarding, promotions, bookings

-- ── Orders: tenant scoping + date range + state filtering ───────────
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON orders(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(order_state_id);
CREATE INDEX IF NOT EXISTS idx_orders_room ON orders(room_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_checkin ON orders(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- ── Order items: order lookups + split grouping ────────────────────
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_type ON order_items(type);
CREATE INDEX IF NOT EXISTS idx_order_items_split ON order_items(split_group);

-- ── POS transactions: tenant + date + status + kitchen status ──────
CREATE INDEX IF NOT EXISTS idx_pos_tx_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_tx_status ON pos_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pos_tx_kitchen ON pos_transactions(kitchen_status);
CREATE INDEX IF NOT EXISTS idx_pos_tx_type ON pos_transactions(type);
CREATE INDEX IF NOT EXISTS idx_pos_tx_staff ON pos_transactions(cashier_id);

-- ── POS transaction items: product lookups + tenant scoping ────────
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_tx ON pos_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_product ON pos_transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_tenant ON pos_transaction_items(tenant_id);

-- ── POS products: inventory + category + supplier + type filtering ─
CREATE INDEX IF NOT EXISTS idx_pos_products_tenant ON pos_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_org ON pos_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_category ON pos_products(category_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_type ON pos_products(type);
CREATE INDEX IF NOT EXISTS idx_pos_products_active ON pos_products(is_active, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_products_stock ON pos_products(stock_quantity, min_stock_level);
CREATE INDEX IF NOT EXISTS idx_pos_products_barcode ON pos_products(barcode);
CREATE INDEX IF NOT EXISTS idx_pos_products_variant ON pos_products(variant_of);

-- ── POS shifts: tenant + date range + staff ────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_shifts_tenant ON pos_shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_staff ON pos_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_dates ON pos_shifts(opened_at, closed_at);

-- ── POS users: tenant + role lookups ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_users_tenant ON pos_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_org ON pos_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_role ON pos_users(role);

-- ── POS tables: tenant + section + status ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_tables_tenant ON pos_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_tables_status ON pos_tables(status);
CREATE INDEX IF NOT EXISTS idx_pos_tables_section ON pos_tables(section);

-- ── Projects (camps): tenant scoping ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- ── Rooms: camp lookups + status + floor ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms_new(status);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms_new(floor);
CREATE INDEX IF NOT EXISTS idx_rooms_capacity ON rooms_new(capacity);

-- ── Customers: tenant scoping ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ── Inbox: tenant + status + date ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inbox_tenant ON inbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox(status);
CREATE INDEX IF NOT EXISTS idx_inbox_date ON inbox(created_at);

-- ── Promotions: tenant + active + date range ───────────────────────
CREATE INDEX IF NOT EXISTS idx_promotions_tenant ON promotions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_day ON promotions(day_of_week);

-- ── Service definitions: tenant + slug ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_service_defs_tenant ON service_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_defs_slug ON service_definitions(slug);

-- ── Service items: tenant + definition + project + status ──────────
CREATE INDEX IF NOT EXISTS idx_service_items_tenant ON service_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_items_def ON service_items(service_definition_id);
CREATE INDEX IF NOT EXISTS idx_service_items_project ON service_items(project_id);
CREATE INDEX IF NOT EXISTS idx_service_items_status ON service_items(status);
CREATE INDEX IF NOT EXISTS idx_service_items_worker ON service_items(assigned_worker_id);

-- ── Service bookings: tenant + item + status + date ────────────────
CREATE INDEX IF NOT EXISTS idx_service_bookings_tenant ON service_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_item ON service_bookings(service_item_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_status ON service_bookings(status);
CREATE INDEX IF NOT EXISTS idx_service_bookings_date ON service_bookings(scheduled_date);

-- ── Admins: tenant + email lookups ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admins_tenant ON admins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);

-- ── Tenants: subdomain + domain lookups ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(custom_domain);
CREATE INDEX IF NOT EXISTS idx_tenants_type ON tenants(type);
CREATE INDEX IF NOT EXISTS idx_tenants_onboarding ON tenants(onboarding_status);

-- ── Leads: tenant + status + date ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- ── Meal schedules: project + date ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meal_schedules_project ON meal_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_date ON meal_schedules(date);

-- ── Restaurant tables (pos_tables): availability check ─────────────
-- (Composite index for the most common query: available tables for a date+time)
-- Already covered by idx_pos_tables_tenant + idx_pos_tables_status above.

-- ── Rooms_new: room_number lookups ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_number ON rooms_new(room_number);
