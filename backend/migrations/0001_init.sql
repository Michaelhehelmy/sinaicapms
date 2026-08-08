-- Migration 0001: Init Schema for Multi-Tenant CampMaster Pro

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Tenants table
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  subdomain TEXT UNIQUE,
  custom_domain TEXT UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4a7c4f',
  footer_text TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Camps
CREATE TABLE camps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  capacity INTEGER,
  status TEXT DEFAULT 'active',
  notes TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Room types
CREATE TABLE room_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER,
  base_price REAL,
  description TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Room Type to Camps Join Table
CREATE TABLE room_type_camps (
  room_type_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  PRIMARY KEY (room_type_id, camp_id),
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE
);

-- Rooms
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  room_type_id TEXT NOT NULL,
  room_number TEXT NOT NULL,
  floor INTEGER,
  status TEXT DEFAULT 'available',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE,
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE RESTRICT,
  UNIQUE(tenant_id, camp_id, room_number)
);

-- Rate plans
CREATE TABLE rate_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  start_date TEXT,
  end_date TEXT,
  season TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE
);

-- Reservations
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  number_of_people INTEGER,
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  total_amount REAL,
  amount_paid REAL,
  notes TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT
);

-- Staff
CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  salary REAL,
  status TEXT DEFAULT 'active',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE
);

-- Expenses
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  expense_type TEXT,
  linked_id TEXT,          -- room_id or meal_id
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  receipt_info TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE
);

-- Inventory
CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  cost_per_unit REAL,
  min_quantity REAL,
  last_updated TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE
);

-- Meals
CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  selling_price REAL,
  description TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Meal ingredients
CREATE TABLE meal_ingredients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- Plans
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  time TEXT,
  status TEXT DEFAULT 'pending',
  category TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE
);

-- Financial accounts
CREATE TABLE financial_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  balance REAL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Financial transactions
CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL,       -- 'credit' or 'debit'
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  expense_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE
);

-- Revenue
CREATE TABLE revenue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source TEXT NOT NULL,     -- 'room', 'meal'
  source_id TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  camp_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE
);

-- Users (Tenant admins)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Leads (WhatsApp/Public site leads)
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  room_type_id TEXT,
  check_in TEXT,
  check_out TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
