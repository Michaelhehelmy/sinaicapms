-- Baseline 0005_menu.sql: menu catalogue + schedules.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: meals, meal_categories, meal_schedules, meal_lang, meal_categories_lang, categories, category_lang
PRAGMA defer_foreign_keys = ON;

CREATE TABLE meals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    meal_category_id TEXT NOT NULL REFERENCES meal_categories(id) ON DELETE CASCADE,
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE meal_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE "meal_schedules" (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'all',
  max_servings INTEGER DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);

CREATE TABLE meal_lang (
    meal_id TEXT REFERENCES meals(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    PRIMARY KEY (meal_id, lang)
);

CREATE TABLE meal_categories_lang (
    meal_category_id TEXT REFERENCES meal_categories(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    PRIMARY KEY (meal_category_id, lang)
);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    active INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
, tenant_id TEXT);

CREATE TABLE category_lang (
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    link_rewrite TEXT,
    meta_title TEXT,
    meta_description TEXT,
    meta_keywords TEXT,
    PRIMARY KEY (category_id, lang)
);

-- Indexes
CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX idx_meal_categories_tenant ON meal_categories(tenant_id);
CREATE INDEX idx_meal_schedules_camp ON meal_schedules(camp_id);
CREATE INDEX idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
CREATE INDEX idx_meal_schedules_date ON meal_schedules(date);
CREATE INDEX idx_meal_schedules_meal ON meal_schedules(meal_id);
CREATE INDEX idx_meal_schedules_tenant ON meal_schedules(tenant_id);
CREATE INDEX idx_meal_schedules_tenant_camp_date ON meal_schedules(tenant_id, camp_id, date);
CREATE INDEX idx_meal_schedules_tenant_date ON meal_schedules(tenant_id, date);
CREATE INDEX idx_meals_category ON meals(meal_category_id);
CREATE INDEX idx_meals_tenant ON meals(tenant_id);
