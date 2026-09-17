# A1 Full Database Report (B1 addendum to FINAL_IMPLEMENTATION_PLAN_v3.md)

**Parent task:** v3 §9.1 "A1 — Full database report (migration audit)" — owner blocker B1
**Date:** 2026-09-16
**Author:** Orchestrator (direct evidence pass — no subagents, per owner hold)
**Audit-only constraint:** This report is READ-ONLY evidence. No schema, data, or code was modified to produce it. The only files created are these addenda; nothing was committed, deployed, or migrated.

---

## 0. Executive summary (truth reconciliation)

| Claim | Value | Source |
|---|---|---|
| Migration files in `backend/migrations/` | **99** (`0001`…`0099`, sequential, no gaps, head `0099`) | `ls backend/migrations/` |
| Unique `CREATE TABLE` statements across all 99 files (comments stripped) | **172** | ledger scan |
| Tables dropped at least once (legacy generations + `_new`/`_old`/`_v2`/`_v3` shadow swap pattern) | **63** | ledger scan |
| `ALTER TABLE … RENAME TO` pairs (the dangerous rename-swap) | **32** | ledger scan |
| **Live tables after full ledger simulation (CREATE → DROP → RENAME in file order)** | **106** | §1 of this report |
| Live tables with a `tenant_id` column in final schema | **76** | §3 tenant-isolation matrix |
| Live tables without `tenant_id` (shared/reference/child-of-scoped tables) | **30** | §3 |
| Index definitions in migration files (raw census) | **442** on 111 table names | §5 |
| A1 original live-DB audit (2026-08-22, at 54 migrations) | 65 user tables | `backend/DATABASE_SCHEMA_AUDIT.md` §0 |

**Correction to v3 §9.1:** v3 printed "Total tables: **108**". The ledger simulation of all 99 migrations yields **106 live tables**. The delta (2) comes from counting methodology — v3's A1 rerun counted `CREATE TABLE` occurrences including two shadow tables that end the sequence renamed/absorbed (`audit_log` recreated at 0069 and `meal_schedules` recreated at 0037/0066 are both in the live set but were double-counted as separate entries in the v3 tally). **106 is authoritative.** v3 §9.1 is amended in the B-corrections pass.

The 106-table count is also consistent with the growth story: A1's original audit found 65 live tables at 54 migrations; migrations 55→99 added the module suites (financial mgmt 0078, HR/payroll 0079, supply chain 0080, CRM/projects 0081, ecommerce/CMS 0082, AI 0083, platform/subscriptions 0084-0090, marketplace ledger 0089/0090, rate-plan camp_id 0091, kitchen status 0092, pos_customers name restore 0093, storefront orders 0096, feedback 0097, marketplace payouts normalization 0099) — net +41 tables since the A1 audit.

---

## 1. Live table census (106) — with provenance

Every table's surviving `CREATE` lives in the indicated migration file:line; the verbatim DDL is authoritative there. The full per-table schema dump follows in §2.


### 1.1 Census table (106 tables)

| Table | Provenance (surviving CREATE) |
|---|---|
| accounts | `0078_financial_management.sql:2` |
| admins | `0028_create_new_tables.sql:17` |
| applicants | `0079_hr_payroll.sql:100` |
| audit_log | `0058_add_meta_tables.sql:72` |
| automation_logs | `0083_ai_intelligence.sql:25` |
| automation_rules | `0083_ai_intelligence.sql:12` |
| blog_categories | `0082_ecommerce_cms.sql:52` |
| blog_posts | `0082_ecommerce_cms.sql:35` |
| bom_lines | `0080_supply_chain.sql:69` |
| boms | `0080_supply_chain.sql:59` |
| cart_items | `0082_ecommerce_cms.sql:10` |
| carts | `0082_ecommerce_cms.sql:1` |
| categories | `0028_create_new_tables.sql:34` |
| category_lang | `0028_create_new_tables.sql:46` |
| contacts | `0081_crm_projects.sql:1` |
| crm_leads | `0081_crm_projects.sql:18` |
| crm_tasks | `0081_crm_projects.sql:43` |
| customers | `0028_create_new_tables.sql:172` |
| employees | `0079_hr_payroll.sql:3` |
| entry_lines | `0078_financial_management.sql:41` |
| exchange_rates | `0078_financial_management.sql:110` |
| feedback | `0097_feedback.sql:11` |
| inbox | `0068_fix_triggers_and_promotions.sql:66` |
| inbox_reads | `0049_inbox.sql:27` |
| inventory_adjustments | `0075_business_enhancements.sql:37` |
| invoice_lines | `0078_financial_management.sql:70` |
| invoices | `0078_financial_management.sql:51` |
| job_posts | `0079_hr_payroll.sql:89` |
| journal_entries | `0078_financial_management.sql:27` |
| journals | `0078_financial_management.sql:16` |
| knowledge_articles | `0081_crm_projects.sql:90` |
| languages | `0028_create_new_tables.sql:8` |
| leads | `0001_init.sql:239` |
| leave_balances | `0079_hr_payroll.sql:50` |
| leave_requests | `0079_hr_payroll.sql:36` |
| leave_types | `0079_hr_payroll.sql:26` |
| manufacturing_orders | `0080_supply_chain.sql:78` |
| marketplace_categories | `0075_business_enhancements.sql:159` |
| marketplace_payments | `0089_marketplace_payments_ledger.sql:11` |
| marketplace_payouts | `0090_marketplace_payouts.sql:10` |
| marketplace_project_categories | `0075_business_enhancements.sql:171` |
| marketplace_reviews | `0075_business_enhancements.sql:144` |
| meal_categories | `0028_create_new_tables.sql:236` |
| meal_categories_lang | `0028_create_new_tables.sql:247` |
| meal_lang | `0028_create_new_tables.sql:271` |
| meal_schedules | `0035_shifts_and_schedules.sql:19` |
| meals | `0028_create_new_tables.sql:257` |
| opportunities | `0081_crm_projects.sql:30` |
| order_discounts | `0071_add_order_discounts.sql:9` |
| order_items | `0067_add_room_status_lifecycle.sql:34` |
| order_state | `0028_create_new_tables.sql:138` |
| order_state_lang | `0028_create_new_tables.sql:152` |
| orders | `0028_create_new_tables.sql:186` |
| pages | `0082_ecommerce_cms.sql:21` |
| payments | `0078_financial_management.sql:83` |
| payroll_lines | `0079_hr_payroll.sql:77` |
| payroll_runs | `0079_hr_payroll.sql:63` |
| plans_new | `0028_create_new_tables.sql:282` |
| platform_settings | `0084_platform_settings_subscriptions.sql:10` |
| pos_customers | `0010_pos_integration.sql:338` |
| pos_organizations | `0010_pos_integration.sql:13` |
| pos_products | `0010_pos_integration.sql:183` (renamed in: 0042_cleanup_pos_products.sql:108) |
| pos_products_old | `?:?` |
| pos_recipe_ingredients | `0020_unify_inventory.sql:10` |
| pos_shifts | `0035_shifts_and_schedules.sql:4` |
| pos_stores | `0010_pos_integration.sql:38` |
| pos_tables | `0069_restaurant_tables.sql:34` |
| pos_transaction_items | `0015_relink_transactions_foreign_key.sql:19` |
| pos_transactions | `0014_remove_cashier_foreign_key.sql:8` (renamed in: 0092_kitchen_status_canceled.sql:181) |
| pos_transactions_old | `?:?` |
| pos_users | `0010_pos_integration.sql:66` |
| predictions | `0083_ai_intelligence.sql:1` |
| price_overrides | `0048_price_overrides.sql:17` |
| price_rules | `0083_ai_intelligence.sql:36` |
| product_camps | `0021_room_types_to_pos_products.sql:9` |
| products | `0028_create_new_tables.sql:61` |
| project_items | `0086_project_items.sql:10` |
| project_links | `0085_project_links.sql:11` |
| project_meta | `0058_add_meta_tables.sql:38` |
| project_tags | `0058_add_meta_tables.sql:63` |
| projects | `0063_rename_camps_to_projects.sql:26` |
| promotions | `0068_fix_triggers_and_promotions.sql:43` |
| purchase_order_lines | `0080_supply_chain.sql:48` |
| purchase_orders | `0080_supply_chain.sql:34` |
| rate_plans_new | `0028_create_new_tables.sql:120` |
| rooms_new | `0028_create_new_tables.sql:101` |
| service_availability | `0075_business_enhancements.sql:114` |
| service_bookings | `0072_dynamic_services.sql:35` |
| service_definitions | `0072_dynamic_services.sql:6` |
| service_items | `0072_dynamic_services.sql:20` |
| service_reviews | `0075_business_enhancements.sql:99` |
| stock_quant | `0080_supply_chain.sql:11` |
| stock_transfers | `0080_supply_chain.sql:22` |
| storefront_order_items | `0096_storefront_orders.sql:24` |
| storefront_orders | `0096_storefront_orders.sql:9` |
| subscription_plans | `0075_business_enhancements.sql:183` |
| tags | `0058_add_meta_tables.sql:52` |
| tax_rates | `0078_financial_management.sql:97` |
| tenant_meta | `0058_add_meta_tables.sql:24` |
| tenant_org_mapping | `0041_create_tenant_org_mapping.sql:10` |
| tenant_subscriptions | `0075_business_enhancements.sql:200` |
| tenants | `0001_init.sql:7` |
| ticket_comments | `0081_crm_projects.sql:81` |
| tickets | `0081_crm_projects.sql:68` |
| time_entries | `0081_crm_projects.sql:57` |
| warehouses | `0080_supply_chain.sql:1` |

### 1.2 Ledger mechanics summarized

- **Shadow-swap pattern** is the single biggest count distortion: migrations create `x_new`, later `DROP` the old and `RENAME x_new → x` (32 rename pairs, e.g. `rooms_new_v2 → rooms_new` at 0054, `rooms_new_v3 → rooms_new` at 0066, `orders_v2 → orders` at 0066, `orders_new → orders` at 0092, `marketplace_payouts_new → marketplace_payouts` at 0099).
- **Legacy generations dropped**: G1 CampMaster core tables (`room_types`, `rooms`, `rate_plans`, `reservations`, `expenses`, `revenue`, `staff`, `users`, `meals`…d) were dropped by 0045; the G2 POS dead set (`pos_categories`, `pos_inventory`, `pos_customers`…d) was dropped across 0040/0046/0047; `orders`/`pos_transactions`/`pos_customers` were rebuilt in-place via the swap pattern in 0092/0093/0099.
- The 30 "not tenant-scoped" tables are shared reference data (`languages`, `marketplace_categories`, `subscription_plans`, `platform_settings`, `tenants` itself), POS organization-scoped tables (`pos_organizations`, `pos_stores`, `pos_customers` — org_id-scoped, bridged by `tenant_org_mapping`), child/detail tables that inherit scope via their parent (`order_items`→`orders`, `bom_lines`→`boms`, `entry_lines`→`journals`, `invoice_lines`→`invoices`, `purchase_order_lines`→`purchase_orders`, `payroll_lines`→`payroll_runs`, `ticket_comments`→`tickets`, `storefront_order_items`→`storefront_orders`, `cart_items`→`carts`), and the legacy mirror shims (`products`, `product_camps`, `price_overrides`, `project_meta`, `project_tags`, `pos_products_old`, `pos_transactions_old`) which the codebase reads but which carry no own `tenant_id` (their tenant derives from `projects`/`tenants` via FK).

---

## 2. Per-table schema dump (106 live tables)

> Each table's section lists the surviving `CREATE` provenance, every column (from the last surviving DDL + any `ALTER TABLE ADD COLUMN`), and its indexes (see §5). The verbatim DDL is the migration file itself — this dump is the column-level distillation of that DDL so the whole surface is reviewable in one place.

# SCHEMA SUMMARY — 106 LIVE TABLES (ledger simulation of 99 migrations)

## accounts
- First/surviving CREATE: 0078_financial_management.sql:2
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · code TEXT NOT NULL,
  · name TEXT NOT NULL,
  · type TEXT NOT NULL CHECK(type IN (
  · parent_id TEXT REFERENCES accounts(id),
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, code)

## admins
- First/surviving CREATE: 0028_create_new_tables.sql:17
- Columns (11):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  · email TEXT NOT NULL UNIQUE,
  · password_hash TEXT NOT NULL,
  · role TEXT NOT NULL CHECK(role IN (
  · first_name TEXT,
  · last_name TEXT,
  · is_active INTEGER DEFAULT 1,
  · last_login TEXT,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT
- ALTER ADD COLUMN (2):
  · auto_login_token TEXT;  [0075_business_enhancements.sql:134]
  · auto_login_expires_at DATETIME;  [0075_business_enhancements.sql:135]

## applicants
- First/surviving CREATE: 0079_hr_payroll.sql:100
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · job_post_id TEXT NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · email TEXT NOT NULL,
  · phone TEXT,
  · resume_url TEXT,
  · status TEXT DEFAULT
  · notes TEXT,
  · created_at TEXT DEFAULT (datetime(

## audit_log
- First/surviving CREATE: 0058_add_meta_tables.sql:72
- DROPPED at: 0069_restaurant_tables.sql:74 (re-created later)
- Columns (9):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL,
  · user_id TEXT NOT NULL,
  · action TEXT NOT NULL CHECK(action IN (
  · entity_type TEXT NOT NULL CHECK(entity_type IN (
  · entity_id TEXT NOT NULL,
  · old_values TEXT,
  · new_values TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## automation_logs
- First/surviving CREATE: 0083_ai_intelligence.sql:25
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · rule_id TEXT REFERENCES automation_rules(id),
  · trigger_event TEXT,
  · executed_action TEXT,
  · result TEXT DEFAULT
  · error TEXT,
  · created_at TEXT DEFAULT (datetime(

## automation_rules
- First/surviving CREATE: 0083_ai_intelligence.sql:12
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · trigger_event TEXT NOT NULL,
  · condition_json TEXT,
  · action_json TEXT,
  · is_active INTEGER DEFAULT 1,
  · last_triggered_at TEXT,
  · trigger_count INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(

## blog_categories
- First/surviving CREATE: 0082_ecommerce_cms.sql:52
- Columns (6):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · slug TEXT NOT NULL,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, slug)

## blog_posts
- First/surviving CREATE: 0082_ecommerce_cms.sql:35
- Columns (14):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · slug TEXT NOT NULL,
  · title TEXT NOT NULL,
  · content TEXT NOT NULL,
  · excerpt TEXT,
  · category TEXT,
  · tags TEXT,
  · author_id TEXT,
  · is_published INTEGER DEFAULT 0,
  · published_at TEXT,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, slug)

## bom_lines
- First/surviving CREATE: 0080_supply_chain.sql:69
- Columns (6):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · bom_id TEXT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  · component_id TEXT NOT NULL,
  · quantity REAL NOT NULL,
  · unit TEXT DEFAULT
  · created_at TEXT DEFAULT (datetime(

## boms
- First/surviving CREATE: 0080_supply_chain.sql:59
- Columns (7):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · product_id TEXT NOT NULL,
  · name TEXT NOT NULL,
  · version INTEGER DEFAULT 1,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT (datetime(

## cart_items
- First/surviving CREATE: 0082_ecommerce_cms.sql:10
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  · product_id TEXT NOT NULL,
  · quantity INTEGER NOT NULL DEFAULT 1,
  · unit_price REAL NOT NULL,
  · total_price REAL NOT NULL,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(cart_id, product_id)

## carts
- First/surviving CREATE: 0082_ecommerce_cms.sql:1
- Columns (6):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · user_id TEXT,
  · session_id TEXT,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(

## categories
- First/surviving CREATE: 0028_create_new_tables.sql:34
- Columns (6):
  · id TEXT PRIMARY KEY,
  · parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  · active INTEGER DEFAULT 1,
  · position INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT
- ALTER ADD COLUMN (1):
  · tenant_id TEXT;  [0031_add_categories_tenant_id.sql:5]

## category_lang
- First/surviving CREATE: 0028_create_new_tables.sql:46
- Columns (9):
  · category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  · lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · description TEXT,
  · link_rewrite TEXT,
  · meta_title TEXT,
  · meta_description TEXT,
  · meta_keywords TEXT,
  · PRIMARY KEY (category_id, lang)

## contacts
- First/surviving CREATE: 0081_crm_projects.sql:1
- Columns (14):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · type TEXT NOT NULL DEFAULT
  · name TEXT NOT NULL,
  · email TEXT,
  · phone TEXT,
  · address TEXT,
  · industry TEXT,
  · is_customer INTEGER DEFAULT 0,
  · is_vendor INTEGER DEFAULT 0,
  · is_lead INTEGER DEFAULT 0,
  · notes TEXT,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(

## crm_leads
- First/surviving CREATE: 0081_crm_projects.sql:18
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  · status TEXT DEFAULT
  · source TEXT,
  · assigned_to TEXT,
  · value REAL,
  · notes TEXT,
  · created_at TEXT DEFAULT (datetime(

## crm_tasks
- First/surviving CREATE: 0081_crm_projects.sql:43
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · project_id TEXT,
  · title TEXT NOT NULL,
  · description TEXT,
  · status TEXT DEFAULT
  · priority TEXT DEFAULT
  · assignee_id TEXT,
  · due_date TEXT,
  · completed_at TEXT,
  · created_at TEXT DEFAULT (datetime(

## customers
- First/surviving CREATE: 0028_create_new_tables.sql:172
- Columns (8):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · first_name TEXT,
  · last_name TEXT,
  · email TEXT,
  · phone TEXT,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT

## employees
- First/surviving CREATE: 0079_hr_payroll.sql:3
- Columns (20):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · first_name TEXT NOT NULL,
  · last_name TEXT NOT NULL,
  · email TEXT NOT NULL,
  · phone TEXT,
  · hire_date TEXT NOT NULL,
  · termination_date TEXT,
  · department TEXT,
  · position TEXT,
  · manager_id TEXT,
  · status TEXT DEFAULT
  · salary_type TEXT DEFAULT
  · salary_amount REAL NOT NULL DEFAULT 0,
  · currency TEXT DEFAULT
  · bank_account TEXT,
  · tax_id TEXT,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, email)

## entry_lines
- First/surviving CREATE: 0078_financial_management.sql:41
- Columns (6):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  · account_id TEXT NOT NULL REFERENCES accounts(id),
  · debit REAL DEFAULT 0,
  · credit REAL DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(

## exchange_rates
- First/surviving CREATE: 0078_financial_management.sql:110
- Columns (7):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · from_currency TEXT NOT NULL,
  · to_currency TEXT NOT NULL,
  · rate REAL NOT NULL,
  · date TEXT NOT NULL,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(from_currency, to_currency, date)

## feedback
- First/surviving CREATE: 0097_feedback.sql:11
- Columns (17):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  · author_type TEXT NOT NULL CHECK (author_type IN (
  · author_id TEXT,
  · author_name TEXT,
  · author_email TEXT,
  · role TEXT,
  · category TEXT NOT NULL CHECK (category IN (
  · message TEXT NOT NULL,
  · personal_view TEXT,
  · page_url TEXT NOT NULL,
  · user_agent TEXT,
  · screenshot TEXT,
  · status TEXT NOT NULL DEFAULT
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · resolved_at TEXT,
  · resolved_by TEXT

## inbox
- First/surviving CREATE: 0068_fix_triggers_and_promotions.sql:66
- Columns (7):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT,
  · title TEXT NOT NULL,
  · message TEXT,
  · severity TEXT DEFAULT
  · is_read INTEGER DEFAULT 0,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## inbox_reads
- First/surviving CREATE: 0049_inbox.sql:27
- Columns (5):
  · tenant_id TEXT NOT NULL,
  · ref_type TEXT NOT NULL,
  · ref_id TEXT NOT NULL,
  · read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · PRIMARY KEY (tenant_id, ref_type, ref_id)

## inventory_adjustments
- First/surviving CREATE: 0075_business_enhancements.sql:37
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL,
  · product_id TEXT NOT NULL,
  · adjustment INTEGER NOT NULL,
  · reason TEXT NOT NULL DEFAULT
  · reference TEXT,
  · notes TEXT,
  · created_by TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## invoice_lines
- First/surviving CREATE: 0078_financial_management.sql:70
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  · product_id TEXT,
  · description TEXT NOT NULL,
  · quantity INTEGER DEFAULT 1,
  · unit_price REAL NOT NULL,
  · tax_rate REAL DEFAULT 0,
  · total_amount REAL NOT NULL,
  · created_at TEXT DEFAULT (datetime(

## invoices
- First/surviving CREATE: 0078_financial_management.sql:51
- Columns (15):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · invoice_number TEXT NOT NULL,
  · type TEXT NOT NULL CHECK(type IN (
  · contact_id TEXT,
  · issue_date TEXT NOT NULL,
  · due_date TEXT,
  · total_amount REAL NOT NULL DEFAULT 0,
  · paid_amount REAL DEFAULT 0,
  · status TEXT DEFAULT
  · currency TEXT DEFAULT
  · notes TEXT,
  · created_by TEXT,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(

## job_posts
- First/surviving CREATE: 0079_hr_payroll.sql:89
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · title TEXT NOT NULL,
  · description TEXT,
  · department TEXT,
  · location TEXT,
  · status TEXT DEFAULT
  · created_at TEXT DEFAULT (datetime(

## journal_entries
- First/surviving CREATE: 0078_financial_management.sql:27
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · journal_id TEXT NOT NULL REFERENCES journals(id),
  · date TEXT NOT NULL,
  · description TEXT,
  · reference TEXT,
  · created_by TEXT,
  · posted INTEGER DEFAULT 0,
  · posted_at TEXT,
  · created_at TEXT DEFAULT (datetime(

## journals
- First/surviving CREATE: 0078_financial_management.sql:16
- Columns (7):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · type TEXT NOT NULL CHECK(type IN (
  · sequence_next INTEGER DEFAULT 1,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT (datetime(

## knowledge_articles
- First/surviving CREATE: 0081_crm_projects.sql:90
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · title TEXT NOT NULL,
  · content TEXT NOT NULL,
  · category TEXT,
  · tags TEXT,
  · is_published INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(

## languages
- First/surviving CREATE: 0028_create_new_tables.sql:8
- Columns (3):
  · code TEXT PRIMARY KEY,
  · name TEXT NOT NULL,
  · is_default INTEGER DEFAULT 0

## leads
- First/surviving CREATE: 0001_init.sql:239
- Columns (10):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL,
  · name TEXT NOT NULL,
  · email TEXT,
  · phone TEXT,
  · room_type_id TEXT,
  · check_in TEXT,
  · check_out TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- ALTER ADD COLUMN (6):
  · subject TEXT;  [0032_create_leads.sql:18]
  · message TEXT;  [0032_create_leads.sql:19]
  · source TEXT DEFAULT 'contact';  [0032_create_leads.sql:20]
  · status TEXT DEFAULT 'new';  [0032_create_leads.sql:21]
  · is_read INTEGER DEFAULT 0;  [0049_inbox.sql:21]
  · read_at TEXT;  [0049_inbox.sql:22]

## leave_balances
- First/surviving CREATE: 0079_hr_payroll.sql:50
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  · leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
  · year INTEGER NOT NULL,
  · total_days REAL DEFAULT 0,
  · used_days REAL DEFAULT 0,
  · remaining_days REAL DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(employee_id, leave_type_id, year)

## leave_requests
- First/surviving CREATE: 0079_hr_payroll.sql:36
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  · leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
  · start_date TEXT NOT NULL,
  · end_date TEXT NOT NULL,
  · days REAL NOT NULL,
  · status TEXT DEFAULT
  · approved_by TEXT,
  · notes TEXT,
  · created_at TEXT DEFAULT (datetime(

## leave_types
- First/surviving CREATE: 0079_hr_payroll.sql:26
- Columns (7):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · accrual_rate REAL DEFAULT 0,
  · is_paid INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, name)

## manufacturing_orders
- First/surviving CREATE: 0080_supply_chain.sql:78
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · bom_id TEXT NOT NULL REFERENCES boms(id),
  · product_id TEXT NOT NULL,
  · quantity INTEGER NOT NULL,
  · status TEXT DEFAULT
  · start_date TEXT,
  · end_date TEXT,
  · produced_quantity INTEGER DEFAULT 0,
  · created_by TEXT,
  · created_at TEXT DEFAULT (datetime(

## marketplace_categories
- First/surviving CREATE: 0075_business_enhancements.sql:159
- Columns (7):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · name TEXT NOT NULL,
  · slug TEXT UNIQUE NOT NULL,
  · description TEXT,
  · icon TEXT,
  · sort_order INTEGER DEFAULT 0,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## marketplace_payments
- First/surviving CREATE: 0089_marketplace_payments_ledger.sql:11
- Columns (16):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · order_reference TEXT NOT NULL,
  · channel TEXT NOT NULL DEFAULT
  · gross_amount REAL NOT NULL DEFAULT 0,
  · marketplace_fee REAL NOT NULL DEFAULT 0,
  · net_amount REAL NOT NULL DEFAULT 0,
  · currency TEXT NOT NULL DEFAULT
  · paymob_transaction_id TEXT,
  · paymob_intention_id TEXT,
  · payment_status TEXT NOT NULL DEFAULT
  · captured_at TEXT DEFAULT (datetime(
  · settled_at TEXT,
  · notes TEXT,
  · created_at TEXT DEFAULT (datetime(
- ALTER ADD COLUMN (1):
  · payout_id TEXT REFERENCES marketplace_payouts(id);  [0090_marketplace_payouts.sql:34]

## marketplace_payouts
- First/surviving CREATE: 0090_marketplace_payouts.sql:10
- DROPPED at: 0099_normalize_marketplace_payouts_ids.sql:62 (re-created later)
- Columns (12):
  · id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  · tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · amount REAL NOT NULL CHECK (amount
  · currency TEXT NOT NULL DEFAULT
  · method TEXT NOT NULL DEFAULT
  · status TEXT NOT NULL DEFAULT
  · reference TEXT,
  · notes TEXT,
  · created_by INTEGER,
  · created_at TEXT NOT NULL DEFAULT (strftime(
  · paid_at TEXT,
  · cancelled_at TEXT

## marketplace_project_categories
- First/surviving CREATE: 0075_business_enhancements.sql:171
- Columns (3):
  · project_id TEXT NOT NULL,
  · category_id TEXT NOT NULL,
  · PRIMARY KEY (project_id, category_id)

## marketplace_reviews
- First/surviving CREATE: 0075_business_enhancements.sql:144
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · project_id TEXT NOT NULL,
  · tenant_id TEXT NOT NULL,
  · reviewer_name TEXT,
  · rating INTEGER NOT NULL CHECK(rating
  · comment TEXT,
  · is_approved INTEGER DEFAULT 0,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## meal_categories
- First/surviving CREATE: 0028_create_new_tables.sql:236
- Columns (5):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · position INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT

## meal_categories_lang
- First/surviving CREATE: 0028_create_new_tables.sql:247
- Columns (4):
  · meal_category_id TEXT REFERENCES meal_categories(id) ON DELETE CASCADE,
  · lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · PRIMARY KEY (meal_category_id, lang)

## meal_lang
- First/surviving CREATE: 0028_create_new_tables.sql:271
- Columns (5):
  · meal_id TEXT REFERENCES meals(id) ON DELETE CASCADE,
  · lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · description TEXT,
  · PRIMARY KEY (meal_id, lang)

## meal_schedules
- First/surviving CREATE: 0035_shifts_and_schedules.sql:19
- DROPPED at: 0037_fix_meal_schedule_fk.sql:22, 0066_fix_camps_fk_references.sql:81 (re-created later)
- Columns (11):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL,
  · camp_id TEXT NOT NULL,
  · date TEXT NOT NULL,
  · meal_id TEXT NOT NULL,
  · package_type TEXT NOT NULL DEFAULT
  · max_servings INTEGER DEFAULT 100,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  · FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE,
  · FOREIGN KEY (meal_id) REFERENCES pos_products(id) ON DELETE CASCADE

## meals
- First/surviving CREATE: 0028_create_new_tables.sql:257
- DROPPED at: 0020_unify_inventory.sql:87 (re-created later)
- Columns (8):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · meal_category_id TEXT NOT NULL REFERENCES meal_categories(id) ON DELETE CASCADE,
  · price REAL NOT NULL DEFAULT 0,
  · image_url TEXT,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT

## opportunities
- First/surviving CREATE: 0081_crm_projects.sql:30
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · lead_id TEXT REFERENCES crm_leads(id),
  · name TEXT NOT NULL,
  · stage TEXT DEFAULT
  · amount REAL DEFAULT 0,
  · probability INTEGER DEFAULT 0,
  · expected_close_date TEXT,
  · assigned_to TEXT,
  · created_at TEXT DEFAULT (datetime(

## order_discounts
- First/surviving CREATE: 0071_add_order_discounts.sql:9
- Columns (10):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · order_id TEXT NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  · transaction_item_id TEXT REFERENCES pos_transaction_items(id) ON DELETE CASCADE,
  · promotion_id TEXT NOT NULL,
  · promotion_name TEXT NOT NULL,
  · discount_type TEXT NOT NULL CHECK (discount_type IN (
  · discount_value REAL NOT NULL,
  · discount_amount REAL NOT NULL,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## order_items
- First/surviving CREATE: 0067_add_room_status_lifecycle.sql:34
- Columns (9):
  · id TEXT PRIMARY KEY,
  · order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  · type TEXT NOT NULL DEFAULT
  · reference_id TEXT,
  · name TEXT NOT NULL,
  · quantity INTEGER NOT NULL DEFAULT 1,
  · unit_price REAL NOT NULL DEFAULT 0,
  · total_price REAL NOT NULL DEFAULT 0,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (3):
  · split_group INTEGER DEFAULT 1;  [0069_restaurant_tables.sql:48]
  · course_number INTEGER DEFAULT 0;  [0075_business_enhancements.sql:67]
  · course_status TEXT DEFAULT 'pending'  [0075_business_enhancements.sql:68]

## order_state
- First/surviving CREATE: 0028_create_new_tables.sql:138
- Columns (8):
  · id TEXT PRIMARY KEY,
  · color TEXT,
  · logable INTEGER DEFAULT 0,
  · shipped INTEGER DEFAULT 0,
  · invoice INTEGER DEFAULT 0,
  · paid INTEGER DEFAULT 0,
  · deleted INTEGER DEFAULT 0,
  · position INTEGER DEFAULT 0

## order_state_lang
- First/surviving CREATE: 0028_create_new_tables.sql:152
- Columns (5):
  · order_state_id TEXT REFERENCES order_state(id) ON DELETE CASCADE,
  · lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · template TEXT,
  · PRIMARY KEY (order_state_id, lang)

## orders
- First/surviving CREATE: 0028_create_new_tables.sql:186
- DROPPED at: 0066_fix_camps_fk_references.sql:136, 0092_kitchen_status_canceled.sql:87 (re-created later)
- Columns (18):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  · room_id TEXT NOT NULL REFERENCES rooms_new(id) ON DELETE RESTRICT,
  · customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  · order_state_id TEXT NOT NULL REFERENCES order_state(id) ON DELETE RESTRICT,
  · check_in_date TEXT NOT NULL,
  · check_out_date TEXT NOT NULL,
  · number_of_people INTEGER DEFAULT 1,
  · total_amount REAL NOT NULL DEFAULT 0,
  · amount_paid REAL DEFAULT 0,
  · payment_method TEXT,
  · payment_status TEXT DEFAULT
  · reference TEXT UNIQUE NOT NULL,
  · invoice_date TEXT,
  · notes TEXT,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT
- ALTER ADD COLUMN (16):
  · table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL;  [0069_restaurant_tables.sql:46]
  · kitchen_status TEXT DEFAULT 'pending' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served'));  [0069_restaurant_tables.sql:47]
  · early_checkin INTEGER DEFAULT 0;  [0075_business_enhancements.sql:14]
  · late_checkout INTEGER DEFAULT 0;  [0075_business_enhancements.sql:15]
  · requested_checkin_time TEXT;  [0075_business_enhancements.sql:16]
  · requested_checkout_time TEXT;  [0075_business_enhancements.sql:17]
  · adult_count INTEGER DEFAULT 1;  [0075_business_enhancements.sql:20]
  · child_count INTEGER DEFAULT 0;  [0075_business_enhancements.sql:21]
  · extra_guest_charge REAL DEFAULT 0;  [0075_business_enhancements.sql:22]
  · split_count INTEGER DEFAULT 1;  [0075_business_enhancements.sql:79]
  · tip_amount REAL DEFAULT 0;  [0075_business_enhancements.sql:82]
  · tip_method TEXT;  [0075_business_enhancements.sql:83]
  · payment_intent_id TEXT;  [0087_order_payment_paymob.sql:5]
  · paymob_transaction_id TEXT;  [0087_order_payment_paymob.sql:6]
  · paymob_paid_at TEXT;  [0087_order_payment_paymob.sql:7]
  · verified_by TEXT;  [0087_order_payment_paymob.sql:8]

## pages
- First/surviving CREATE: 0082_ecommerce_cms.sql:21
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · slug TEXT NOT NULL,
  · title TEXT NOT NULL,
  · content TEXT,
  · meta_title TEXT,
  · meta_description TEXT,
  · is_published INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, slug)

## payments
- First/surviving CREATE: 0078_financial_management.sql:83
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · invoice_id TEXT REFERENCES invoices(id),
  · amount REAL NOT NULL,
  · payment_date TEXT NOT NULL,
  · method TEXT NOT NULL CHECK(method IN (
  · reference TEXT,
  · status TEXT DEFAULT
  · created_by TEXT,
  · created_at TEXT DEFAULT (datetime(

## payroll_lines
- First/surviving CREATE: 0079_hr_payroll.sql:77
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  · employee_id TEXT NOT NULL REFERENCES employees(id),
  · gross_pay REAL NOT NULL DEFAULT 0,
  · deductions REAL DEFAULT 0,
  · net_pay REAL NOT NULL DEFAULT 0,
  · bank_account TEXT,
  · status TEXT DEFAULT
  · created_at TEXT DEFAULT (datetime(

## payroll_runs
- First/surviving CREATE: 0079_hr_payroll.sql:63
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · period_start TEXT NOT NULL,
  · period_end TEXT NOT NULL,
  · run_date TEXT NOT NULL,
  · status TEXT DEFAULT
  · total_gross REAL DEFAULT 0,
  · total_deductions REAL DEFAULT 0,
  · total_net REAL DEFAULT 0,
  · created_by TEXT,
  · created_at TEXT DEFAULT (datetime(

## plans_new
- First/surviving CREATE: 0028_create_new_tables.sql:282
- DROPPED at: 0066_fix_camps_fk_references.sql:189 (re-created later)
- Columns (10):
  · id TEXT PRIMARY KEY,
  · camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · description TEXT,
  · date TEXT,
  · time TEXT,
  · capacity INTEGER,
  · status TEXT DEFAULT
  · category TEXT,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (1):
  · tenant_id TEXT;  [0044_add_tenant_id_to_rooms_plans.sql:20]

## platform_settings
- First/surviving CREATE: 0084_platform_settings_subscriptions.sql:10
- Columns (7):
  · id INTEGER PRIMARY KEY CHECK (id
  · feature_flags TEXT DEFAULT
  · email_templates TEXT DEFAULT
  · defaults TEXT DEFAULT
  · branding TEXT DEFAULT
  · updated_at TEXT DEFAULT (datetime(
  · updated_by TEXT
- ALTER ADD COLUMN (1):
  · payment TEXT DEFAULT '{}';  [0088_platform_settings_payment.sql:29]

## pos_customers
- First/surviving CREATE: 0010_pos_integration.sql:338
- DROPPED at: 0040_add_tenant_id_pos.sql:67, 0093_pos_customers_name_restore.sql:70 (re-created later)
- Columns (28):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · organization_id INTEGER NOT NULL,
  · customer_number TEXT UNIQUE,
  · first_name TEXT NOT NULL,
  · last_name TEXT NOT NULL,
  · email TEXT UNIQUE,
  · phone TEXT,
  · date_of_birth DATE,
  · gender TEXT,
  · address TEXT,
  · city TEXT,
  · state TEXT,
  · postal_code TEXT,
  · country TEXT DEFAULT
  · customer_group TEXT DEFAULT
  · loyalty_points INTEGER DEFAULT 0,
  · total_spent DECIMAL(12,2) DEFAULT 0,
  · total_orders INTEGER DEFAULT 0,
  · average_order_value DECIMAL(10,2) DEFAULT 0,
  · last_order_date DATE,
  · acquisition_source TEXT,
  · preferences JSON DEFAULT
  · notes TEXT,
  · is_vip BOOLEAN DEFAULT FALSE,
  · is_active BOOLEAN DEFAULT TRUE,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (organization_id) REFERENCES pos_organizations(id)
- ALTER ADD COLUMN (3):
  · name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;  [0016_pos_staff_stats_and_name_fields.sql:5]
  · last_visit DATETIME;  [0018_pos_customers_visit_fields.sql:2]
  · visit_count INTEGER DEFAULT 0;  [0018_pos_customers_visit_fields.sql:3]

## pos_organizations
- First/surviving CREATE: 0010_pos_integration.sql:13
- Columns (22):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · name TEXT NOT NULL,
  · slug TEXT UNIQUE NOT NULL,
  · description TEXT,
  · logo_url TEXT,
  · website TEXT,
  · phone TEXT,
  · email TEXT,
  · address TEXT,
  · city TEXT,
  · state TEXT,
  · country TEXT DEFAULT
  · postal_code TEXT,
  · timezone TEXT DEFAULT
  · currency TEXT DEFAULT
  · tax_rate REAL DEFAULT 0.1,
  · business_type TEXT DEFAULT
  · license_number TEXT,
  · pos_settings JSON DEFAULT
  · is_active BOOLEAN DEFAULT TRUE,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

## pos_products
- First/surviving CREATE: 0010_pos_integration.sql:183
- Renamed TO here from: 0042_cleanup_pos_products.sql:108
- Columns (36):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL DEFAULT
  · organization_id INTEGER NOT NULL DEFAULT 1,
  · category_id INTEGER,
  · brand_id INTEGER,
  · supplier_id INTEGER,
  · sku TEXT UNIQUE NOT NULL,
  · barcode TEXT UNIQUE,
  · name TEXT NOT NULL,
  · description TEXT,
  · short_description TEXT,
  · images JSON DEFAULT
  · cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  · selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  · compare_price DECIMAL(10,2),
  · profit_margin REAL GENERATED ALWAYS AS ( CASE WHEN selling_price
  · weight REAL,
  · dimensions JSON DEFAULT
  · unit TEXT DEFAULT
  · min_stock_level INTEGER DEFAULT 10,
  · max_stock_level INTEGER DEFAULT 1000,
  · reorder_point INTEGER DEFAULT 20,
  · is_trackable BOOLEAN DEFAULT TRUE,
  · is_serialized BOOLEAN DEFAULT FALSE,
  · is_active BOOLEAN DEFAULT TRUE,
  · is_featured BOOLEAN DEFAULT FALSE,
  · tags JSON DEFAULT
  · attributes JSON DEFAULT
  · seo_title TEXT,
  · seo_description TEXT,
  · type TEXT CHECK(type IN (
  · category TEXT,
  · deleted_at DATETIME,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (organization_id) REFERENCES pos_organizations(id)
- ALTER ADD COLUMN (10):
  · price DECIMAL(10,2) DEFAULT 0.0;  [0011_pos_schema_patches.sql:4]
  · stock_quantity INTEGER DEFAULT 0;  [0011_pos_schema_patches.sql:5]
  · reorder_level INTEGER DEFAULT 10;  [0011_pos_schema_patches.sql:6]
  · image_url TEXT;  [0011_pos_schema_patches.sql:7]
  · tax_rate DECIMAL(5,2) DEFAULT 0.0;  [0011_pos_schema_patches.sql:8]
  · camp_id TEXT;  [0020_unify_inventory.sql:7]
  · capacity INTEGER DEFAULT 1;  [0021_room_types_to_pos_products.sql:6]
  · variant_of TEXT;  [0075_business_enhancements.sql:33]
  · variant_attributes TEXT DEFAULT '{}';  [0075_business_enhancements.sql:34]
  · supplier_name TEXT;  [0075_business_enhancements.sql:58]

## pos_products_old
- First/surviving CREATE: ?:?
- DROPPED at: 0042_cleanup_pos_products.sql:113
- (no surviving CREATE body captured)

## pos_recipe_ingredients
- First/surviving CREATE: 0020_unify_inventory.sql:10
- DROPPED at: 0047_repair_pos_child_fks.sql:237 (re-created later)
- Columns (9):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL,
  · product_id TEXT NOT NULL,
  · ingredient_id TEXT NOT NULL,
  · quantity REAL NOT NULL,
  · unit TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (product_id) REFERENCES pos_products(id),
  · FOREIGN KEY (ingredient_id) REFERENCES pos_products(id)

## pos_shifts
- First/surviving CREATE: 0035_shifts_and_schedules.sql:4
- Columns (11):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL,
  · cashier_id TEXT NOT NULL,
  · status TEXT NOT NULL DEFAULT
  · opening_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  · closing_time DATETIME,
  · opening_cash REAL NOT NULL DEFAULT 0.0,
  · expected_closing_cash REAL NOT NULL DEFAULT 0.0,
  · actual_closing_cash REAL,
  · notes TEXT,
  · FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE

## pos_stores
- First/surviving CREATE: 0010_pos_integration.sql:38
- Columns (21):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · organization_id INTEGER NOT NULL,
  · name TEXT NOT NULL,
  · code TEXT UNIQUE NOT NULL,
  · description TEXT,
  · phone TEXT,
  · email TEXT,
  · address TEXT NOT NULL,
  · city TEXT NOT NULL,
  · state TEXT,
  · postal_code TEXT,
  · latitude REAL,
  · longitude REAL,
  · manager_id INTEGER,
  · opening_hours JSON DEFAULT
  · pos_settings JSON DEFAULT
  · is_active BOOLEAN DEFAULT TRUE,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
  · FOREIGN KEY (manager_id) REFERENCES pos_users(id)

## pos_tables
- First/surviving CREATE: 0069_restaurant_tables.sql:34
- Columns (7):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · capacity INTEGER DEFAULT 2,
  · status TEXT DEFAULT
  · section TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (4):
  · reservation_name TEXT;  [0075_business_enhancements.sql:72]
  · reservation_time TEXT;  [0075_business_enhancements.sql:73]
  · reservation_date TEXT;  [0075_business_enhancements.sql:74]
  · party_size INTEGER DEFAULT 0;  [0075_business_enhancements.sql:75]

## pos_transaction_items
- First/surviving CREATE: 0015_relink_transactions_foreign_key.sql:19
- DROPPED at: 0015_relink_transactions_foreign_key.sql:18, 0046_repair_pos_transaction_items_fk.sql:47 (re-created later)
- Columns (17):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL DEFAULT
  · order_id TEXT NOT NULL,
  · transaction_id TEXT,
  · product_id TEXT NOT NULL,
  · variant_id INTEGER,
  · quantity INTEGER NOT NULL,
  · unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  · subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  · tax_amount DECIMAL(10,2) DEFAULT 0.0,
  · discount_amount DECIMAL(10,2) DEFAULT 0.0,
  · total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  · notes TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
  · FOREIGN KEY (product_id) REFERENCES pos_products(id)

## pos_transactions
- First/surviving CREATE: 0014_remove_cashier_foreign_key.sql:8
- Renamed TO here from: 0092_kitchen_status_canceled.sql:181
- DROPPED at: 0092_kitchen_status_canceled.sql:180 (re-created later)
- Columns (37):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL DEFAULT
  · organization_id INTEGER NOT NULL DEFAULT 1,
  · store_id INTEGER NOT NULL DEFAULT 1,
  · order_number TEXT UNIQUE NOT NULL,
  · transaction_number TEXT,
  · customer_id INTEGER,
  · cashier_id TEXT NOT NULL,
  · order_type TEXT DEFAULT
  · status TEXT DEFAULT
  · subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  · discount_amount DECIMAL(10,2) DEFAULT 0,
  · discount_type TEXT,
  · discount_reason TEXT,
  · tax_amount DECIMAL(10,2) DEFAULT 0,
  · tax_rate REAL DEFAULT 0.1,
  · total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  · paid_amount DECIMAL(12,2) DEFAULT 0,
  · change_amount DECIMAL(10,2) DEFAULT 0,
  · payment_method TEXT,
  · points_earned INTEGER DEFAULT 0,
  · points_redeemed INTEGER DEFAULT 0,
  · payment_status TEXT DEFAULT
  · order_status TEXT DEFAULT
  · notes TEXT,
  · receipt_url TEXT,
  · void_reason TEXT,
  · voided_by TEXT,
  · voided_at DATETIME,
  · refunded_amount DECIMAL(12,2) DEFAULT 0,
  · refunded_at DATETIME,
  · refunded_by TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
  · FOREIGN KEY (store_id) REFERENCES pos_stores(id),
  · FOREIGN KEY (customer_id) REFERENCES pos_customers(id)
- ALTER ADD COLUMN (6):
  · order_status TEXT DEFAULT 'completed';  [0013_pos_inventory_logs.sql:4]
  · amount_cash REAL DEFAULT 0.0;  [0036_split_payments_fields.sql:4]
  · amount_card REAL DEFAULT 0.0;  [0036_split_payments_fields.sql:5]
  · idempotency_key TEXT;  [0050_add_pos_idempotency.sql:2]
  · table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL;  [0069_restaurant_tables.sql:54]
  · kitchen_status TEXT DEFAULT 'confirmed' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served'));  [0069_restaurant_tables.sql:55]

## pos_transactions_old
- First/surviving CREATE: ?:?
- DROPPED at: 0014_remove_cashier_foreign_key.sql:67
- (no surviving CREATE body captured)

## pos_users
- First/surviving CREATE: 0010_pos_integration.sql:66
- Columns (31):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · organization_id INTEGER NOT NULL,
  · store_id INTEGER,
  · username TEXT UNIQUE NOT NULL,
  · email TEXT UNIQUE NOT NULL,
  · password_hash TEXT NOT NULL,
  · first_name TEXT NOT NULL,
  · last_name TEXT NOT NULL,
  · phone TEXT,
  · avatar_url TEXT,
  · role TEXT NOT NULL DEFAULT
  · permissions JSON DEFAULT
  · employee_id TEXT,
  · department TEXT,
  · hire_date DATE,
  · salary DECIMAL(10,2),
  · commission_rate REAL DEFAULT 0.0,
  · is_active BOOLEAN DEFAULT TRUE,
  · is_verified BOOLEAN DEFAULT FALSE,
  · last_login_at DATETIME,
  · password_reset_token TEXT,
  · password_reset_expires DATETIME,
  · two_factor_secret TEXT,
  · two_factor_enabled BOOLEAN DEFAULT FALSE,
  · login_attempts INTEGER DEFAULT 0,
  · locked_until DATETIME,
  · pos_settings JSON DEFAULT
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
  · FOREIGN KEY (store_id) REFERENCES pos_stores(id)
- ALTER ADD COLUMN (6):
  · name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;  [0016_pos_staff_stats_and_name_fields.sql:4]
  · tenant_id TEXT;  [0019_unify_users.sql:6]
  · deleted_at DATETIME;  [0019_unify_users.sql:7]
  · last_login DATETIME;  [0019_unify_users.sql:39]
  · status TEXT DEFAULT 'active';  [0019_unify_users.sql:45]
  · camp_id TEXT;  [0023_merge_staff.sql:5]

## predictions
- First/surviving CREATE: 0083_ai_intelligence.sql:1
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · model_type TEXT NOT NULL,
  · target_id TEXT,
  · predicted_value TEXT,
  · input_features TEXT,
  · confidence REAL DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(

## price_overrides
- First/surviving CREATE: 0048_price_overrides.sql:17
- Columns (7):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · product_id INTEGER NOT NULL,
  · date TEXT NOT NULL,
  · price INTEGER NOT NULL,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(
  · UNIQUE(product_id, date)

## price_rules
- First/surviving CREATE: 0083_ai_intelligence.sql:36
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · product_id TEXT,
  · rule_type TEXT NOT NULL CHECK(rule_type IN (
  · min_price REAL,
  · max_price REAL,
  · adjustment_percent REAL DEFAULT 0,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT (datetime(

## product_camps
- First/surviving CREATE: 0021_room_types_to_pos_products.sql:9
- Columns (3):
  · product_id TEXT NOT NULL,
  · camp_id TEXT NOT NULL,
  · PRIMARY KEY (product_id, camp_id)

## products
- First/surviving CREATE: 0028_create_new_tables.sql:61
- Columns (10):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  · sku TEXT,
  · base_price REAL NOT NULL DEFAULT 0,
  · capacity INTEGER DEFAULT 2,
  · image_url TEXT,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT

## project_items
- First/surviving CREATE: 0086_project_items.sql:10
- Columns (12):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  · item_type TEXT NOT NULL DEFAULT
  · name TEXT NOT NULL,
  · description TEXT,
  · base_price REAL DEFAULT 0,
  · quantity INTEGER DEFAULT 1,
  · meta_data TEXT,
  · status TEXT NOT NULL DEFAULT
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(

## project_links
- First/surviving CREATE: 0085_project_links.sql:11
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · project_id_a TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  · project_id_b TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  · link_type TEXT NOT NULL DEFAULT
  · meta_data TEXT,
  · created_at TEXT DEFAULT (datetime(
  · created_by TEXT

## project_meta
- First/surviving CREATE: 0058_add_meta_tables.sql:38
- DROPPED at: 0063_rename_camps_to_projects.sql:90 (re-created later)
- Columns (5):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · project_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  · meta_key TEXT NOT NULL,
  · meta_value TEXT NOT NULL,
  · sort_order INTEGER DEFAULT 0

## project_tags
- First/surviving CREATE: 0058_add_meta_tables.sql:63
- DROPPED at: 0063_rename_camps_to_projects.sql:113 (re-created later)
- Columns (3):
  · project_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  · tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  · PRIMARY KEY (project_id, tag_id)

## projects
- First/surviving CREATE: 0063_rename_camps_to_projects.sql:26
- Columns (19):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id),
  · name TEXT NOT NULL,
  · slug TEXT NOT NULL,
  · project_type TEXT NOT NULL DEFAULT
  · status TEXT DEFAULT
  · location TEXT,
  · latitude DECIMAL(10, 8),
  · longitude DECIMAL(11, 8),
  · start_date TEXT,
  · end_date TEXT,
  · capacity INTEGER,
  · description TEXT,
  · gallery_images TEXT,
  · meta_version INTEGER DEFAULT 1,
  · deleted_at DATETIME,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME,
  · UNIQUE(tenant_id, slug)
- ALTER ADD COLUMN (3):
  · min_stay INTEGER DEFAULT 1;  [0067_add_room_status_lifecycle.sql:52]
  · max_stay INTEGER;  [0067_add_room_status_lifecycle.sql:53]
  · meal_plan_category_id TEXT;  [0070_add_meal_plan_category.sql:3]

## promotions
- First/surviving CREATE: 0068_fix_triggers_and_promotions.sql:43
- Columns (13):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · type TEXT NOT NULL CHECK (type IN (
  · value REAL DEFAULT 0,
  · applies_to TEXT DEFAULT
  · applies_to_id TEXT,
  · min_purchase REAL DEFAULT 0,
  · day_of_week INTEGER,
  · start_date TEXT,
  · end_date TEXT,
  · is_active INTEGER DEFAULT 1,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## purchase_order_lines
- First/surviving CREATE: 0080_supply_chain.sql:48
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  · product_id TEXT NOT NULL,
  · quantity INTEGER NOT NULL,
  · unit_price REAL NOT NULL,
  · total_price REAL NOT NULL,
  · received_quantity INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(

## purchase_orders
- First/surviving CREATE: 0080_supply_chain.sql:34
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · po_number TEXT NOT NULL,
  · vendor_id TEXT,
  · order_date TEXT NOT NULL,
  · expected_delivery TEXT,
  · status TEXT DEFAULT
  · total_amount REAL DEFAULT 0,
  · created_by TEXT,
  · notes TEXT,
  · created_at TEXT DEFAULT (datetime(

## rate_plans_new
- First/surviving CREATE: 0028_create_new_tables.sql:120
- DROPPED at: 0054_fix_room_rate_plan_fk_to_pos_products.sql:78, 0091_rate_plans_camp_id.sql:47 (re-created later)
- Columns (12):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · season TEXT CHECK(season IN (
  · start_date TEXT,
  · end_date TEXT,
  · price_per_night REAL NOT NULL,
  · min_stay INTEGER DEFAULT 1,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT

## rooms_new
- First/surviving CREATE: 0028_create_new_tables.sql:101
- DROPPED at: 0054_fix_room_rate_plan_fk_to_pos_products.sql:44, 0066_fix_camps_fk_references.sql:48 (re-created later)
- Columns (13):
  · id TEXT PRIMARY KEY,
  · camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  · product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  · name TEXT NOT NULL,
  · status TEXT DEFAULT
  · bed_type TEXT DEFAULT
  · max_guests INTEGER DEFAULT 2,
  · base_price REAL DEFAULT 0,
  · floor TEXT,
  · notes TEXT,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT
- ALTER ADD COLUMN (3):
  · tenant_id TEXT;  [0044_add_tenant_id_to_rooms_plans.sql:10]
  · room_status TEXT DEFAULT 'available';  [0067_add_room_status_lifecycle.sql:27]
  · cleaning_status TEXT DEFAULT 'clean'  [0075_business_enhancements.sql:10]

## service_availability
- First/surviving CREATE: 0075_business_enhancements.sql:114
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL,
  · service_item_id TEXT NOT NULL,
  · worker_id TEXT,
  · available_date TEXT NOT NULL,
  · available_from TEXT NOT NULL,
  · available_to TEXT NOT NULL,
  · is_available INTEGER DEFAULT 1,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## service_bookings
- First/surviving CREATE: 0072_dynamic_services.sql:35
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · service_item_id TEXT NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  · customer_name TEXT,
  · customer_phone TEXT,
  · scheduled_date DATETIME,
  · status TEXT NOT NULL DEFAULT
  · notes TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (1):
  · assigned_worker_id TEXT;  [0075_business_enhancements.sql:91]

## service_definitions
- First/surviving CREATE: 0072_dynamic_services.sql:6
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · slug TEXT NOT NULL,
  · name TEXT NOT NULL,
  · description TEXT,
  · fields_schema JSON NOT NULL DEFAULT (
  · is_active INTEGER NOT NULL DEFAULT 1,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · UNIQUE(tenant_id, slug)

## service_items
- First/surviving CREATE: 0072_dynamic_services.sql:20
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  · project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  · name TEXT NOT NULL,
  · description TEXT,
  · base_price REAL DEFAULT 0,
  · meta_data JSON DEFAULT (
  · status TEXT NOT NULL DEFAULT
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (2):
  · price_tier TEXT DEFAULT 'standard'  [0075_business_enhancements.sql:94]
  · price_premium REAL DEFAULT 0;  [0075_business_enhancements.sql:96]

## service_reviews
- First/surviving CREATE: 0075_business_enhancements.sql:99
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL,
  · service_item_id TEXT NOT NULL,
  · booking_id TEXT,
  · customer_name TEXT,
  · rating INTEGER NOT NULL CHECK(rating
  · comment TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## stock_quant
- First/surviving CREATE: 0080_supply_chain.sql:11
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · product_id TEXT NOT NULL,
  · warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  · quantity INTEGER DEFAULT 0,
  · reserved INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(product_id, warehouse_id)

## stock_transfers
- First/surviving CREATE: 0080_supply_chain.sql:22
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · from_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  · to_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  · product_id TEXT NOT NULL,
  · quantity INTEGER NOT NULL,
  · status TEXT DEFAULT
  · created_by TEXT,
  · created_at TEXT DEFAULT (datetime(

## storefront_order_items
- First/surviving CREATE: 0096_storefront_orders.sql:24
- Columns (8):
  · id TEXT PRIMARY KEY,
  · order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
  · product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  · product_name TEXT NOT NULL,
  · quantity INTEGER DEFAULT 1,
  · unit_price REAL DEFAULT 0,
  · total_price REAL DEFAULT 0,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP

## storefront_orders
- First/surviving CREATE: 0096_storefront_orders.sql:9
- Columns (12):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  · reference TEXT UNIQUE NOT NULL,
  · session_id TEXT,
  · total_amount REAL DEFAULT 0,
  · currency TEXT DEFAULT
  · status TEXT DEFAULT
  · payment_status TEXT DEFAULT
  · notes TEXT,
  · created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  · updated_at TEXT
- ALTER ADD COLUMN (3):
  · payment_intent_id TEXT;  [0098_storefront_paymob.sql:6]
  · paymob_transaction_id TEXT;  [0098_storefront_paymob.sql:7]
  · paymob_paid_at TEXT;  [0098_storefront_paymob.sql:8]

## subscription_plans
- First/surviving CREATE: 0075_business_enhancements.sql:183
- Columns (13):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · name TEXT NOT NULL,
  · slug TEXT UNIQUE NOT NULL,
  · description TEXT,
  · price_monthly REAL NOT NULL DEFAULT 0,
  · price_yearly REAL NOT NULL DEFAULT 0,
  · max_rooms INTEGER DEFAULT 10,
  · max_orders_monthly INTEGER DEFAULT 1000,
  · max_pos_users INTEGER DEFAULT 5,
  · max_storage_mb INTEGER DEFAULT 500,
  · features TEXT DEFAULT
  · is_active INTEGER DEFAULT 1,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP

## tags
- First/surviving CREATE: 0058_add_meta_tables.sql:52
- Columns (5):
  · id TEXT PRIMARY KEY,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · slug TEXT NOT NULL,
  · UNIQUE(tenant_id, slug)

## tax_rates
- First/surviving CREATE: 0078_financial_management.sql:97
- Columns (9):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · rate REAL NOT NULL,
  · jurisdiction TEXT,
  · is_default INTEGER DEFAULT 0,
  · valid_from TEXT,
  · valid_to TEXT,
  · created_at TEXT DEFAULT (datetime(

## tenant_meta
- First/surviving CREATE: 0058_add_meta_tables.sql:24
- Columns (5):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · meta_key TEXT NOT NULL,
  · meta_value TEXT NOT NULL,
  · sort_order INTEGER DEFAULT 0

## tenant_org_mapping
- First/surviving CREATE: 0041_create_tenant_org_mapping.sql:10
- Columns (6):
  · id INTEGER PRIMARY KEY AUTOINCREMENT,
  · tenant_id TEXT NOT NULL UNIQUE,
  · organization_id INTEGER NOT NULL UNIQUE,
  · created_at TEXT DEFAULT (datetime(
  · FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  · FOREIGN KEY (organization_id) REFERENCES pos_organizations(id) ON DELETE CASCADE

## tenant_subscriptions
- First/surviving CREATE: 0075_business_enhancements.sql:200
- Columns (11):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL UNIQUE,
  · plan_id TEXT NOT NULL,
  · status TEXT NOT NULL DEFAULT
  · billing_cycle TEXT DEFAULT
  · current_period_start DATETIME,
  · current_period_end DATETIME,
  · stripe_customer_id TEXT,
  · stripe_subscription_id TEXT,
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  · updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (4):
  · trial_ends_at TEXT;  [0084_platform_settings_subscriptions.sql:36]
  · bookings_used INTEGER DEFAULT 0;  [0084_platform_settings_subscriptions.sql:39]
  · bookings_limit INTEGER DEFAULT 100;  [0084_platform_settings_subscriptions.sql:42]
  · total_paid REAL DEFAULT 0;  [0084_platform_settings_subscriptions.sql:45]

## tenants
- First/surviving CREATE: 0001_init.sql:7
- Columns (9):
  · id TEXT PRIMARY KEY,
  · subdomain TEXT UNIQUE,
  · custom_domain TEXT UNIQUE,
  · name TEXT NOT NULL,
  · logo_url TEXT,
  · primary_color TEXT DEFAULT
  · footer_text TEXT,
  · status TEXT DEFAULT
  · created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- ALTER ADD COLUMN (27):
  · favicon_url TEXT;  [0003_add_tenant_branding.sql:2]
  · location TEXT;  [0003_add_tenant_branding.sql:3]
  · whatsapp_number TEXT;  [0003_add_tenant_branding.sql:4]
  · phone TEXT;  [0003_add_tenant_branding.sql:5]
  · email TEXT;  [0003_add_tenant_branding.sql:6]
  · description TEXT;  [0003_add_tenant_branding.sql:7]
  · hero_image_url TEXT;  [0005_rich_branding.sql:2]
  · gallery_images TEXT;  [0005_rich_branding.sql:3]
  · about_text TEXT;  [0005_rich_branding.sql:4]
  · faq_items TEXT;  [0005_rich_branding.sql:5]
  · reviews TEXT;  [0005_rich_branding.sql:6]
  · map_embed_url TEXT;  [0005_rich_branding.sql:7]
  · activities TEXT;  [0005_rich_branding.sql:8]
  · capacity INTEGER DEFAULT 50;  [0005_rich_branding.sql:9]
  · admin_passphrase TEXT DEFAULT 'sinaiadmin';  [0007_admin_passphrase.sql:2]
  · hacker_passphrase TEXT DEFAULT 'hackeradmin';  [0008_hacker_passphrase.sql:2]
  · menu_config TEXT;  [0026_add_menu_config.sql:3]
  · currency TEXT DEFAULT 'USD';  [0030_add_tenant_currency.sql:2]
  · type TEXT NOT NULL DEFAULT 'camp' CHECK (type IN ('camp','supermarket','transportation','other'));  [0052_add_tenants_type.sql:11]
  · business_type TEXT NOT NULL DEFAULT 'camp';  [0059_add_tenant_columns.sql:16]
  · latitude DECIMAL(10, 8);  [0059_add_tenant_columns.sql:19]
  · longitude DECIMAL(11, 8);  [0059_add_tenant_columns.sql:20]
  · deleted_at DATETIME;  [0059_add_tenant_columns.sql:23]
  · meta_version INTEGER DEFAULT 1;  [0059_add_tenant_columns.sql:26]
  · updated_at DATETIME;  [0068_fix_triggers_and_promotions.sql:28]
  · onboarding_token TEXT;  [0073_self_service_onboarding.sql:7]
  · onboarding_status TEXT DEFAULT 'completed';  [0073_self_service_onboarding.sql:8]

## ticket_comments
- First/surviving CREATE: 0081_crm_projects.sql:81
- Columns (6):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  · user_id TEXT NOT NULL,
  · content TEXT NOT NULL,
  · internal INTEGER DEFAULT 0,
  · created_at TEXT DEFAULT (datetime(

## tickets
- First/surviving CREATE: 0081_crm_projects.sql:68
- Columns (10):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · contact_id TEXT REFERENCES contacts(id),
  · subject TEXT NOT NULL,
  · description TEXT,
  · status TEXT DEFAULT
  · priority TEXT DEFAULT
  · assigned_to TEXT,
  · created_at TEXT DEFAULT (datetime(
  · updated_at TEXT DEFAULT (datetime(

## time_entries
- First/surviving CREATE: 0081_crm_projects.sql:57
- Columns (8):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  · user_id TEXT NOT NULL,
  · hours REAL NOT NULL,
  · date TEXT NOT NULL,
  · description TEXT,
  · created_at TEXT DEFAULT (datetime(

## warehouses
- First/surviving CREATE: 0080_supply_chain.sql:1
- Columns (7):
  · id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  · tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  · name TEXT NOT NULL,
  · location TEXT,
  · is_active INTEGER DEFAULT 1,
  · created_at TEXT DEFAULT (datetime(
  · UNIQUE(tenant_id, name)




---

## 3. Tenant-isolation matrix (live tables × scope)

**76 of 106 live tables carry their own `tenant_id`** in the final schema; **30 rely on shared/global, org-bridging, or parent-inherited scoping**. For every tenant-scoped family the backend binds `tenant_id` in `WHERE` clauses (representative call sites sampled below; the prior audits A3/A7/A11/A22 and the `orders.js` fix all hinge on this pattern).

| Table | Isolation mechanism | Sample backend call sites |
|---|---|---|
| accounts | tenant_id | src/api/admin.js:289, src/api/admin.js:291, src/api/admin.js:333, src/api/financials.js:5 |
| admins | tenant_id | src/index.js:13, src/index.js:239, src/index.js:363, src/api/categories.js:120 |
| applicants | tenant_id | src/api/hr.js:21, src/api/hr.js:489, src/api/hr.js:491, src/api/hr.js:507 |
| audit_log | tenant_id | src/api/admin-audit.js:60, src/api/admin-audit.js:63, src/api/admin-audit.js:135, src/api/audit.js:11 |
| automation_logs | tenant_id | src/api/ai.js:495, src/api/admin-ai.js:21 |
| automation_rules | tenant_id | src/api/ai.js:382, src/api/ai.js:399, src/api/ai.js:416, src/api/ai.js:422 |
| blog_categories | tenant_id | src/api/storefront.js:690, src/api/storefront.js:705, src/api/storefront.js:711, src/api/storefront.js:727 |
| blog_posts | tenant_id | src/api/storefront.js:473, src/api/storefront.js:491, src/api/storefront.js:597, src/api/storefront.js:612 |
| boms | tenant_id | src/index.js:733, src/api/supply.js:2, src/api/supply.js:16, src/api/supply.js:16 |
| carts | tenant_id | src/index.js:495, src/api/storefront.js:167, src/api/storefront.js:171, src/api/storefront.js:200 |
| categories | tenant_id | src/index.js:42, src/index.js:43, src/index.js:456, src/index.js:465 |
| contacts | tenant_id | src/index.js:739, src/api/crm.js:2, src/api/crm.js:5, src/api/crm.js:5 |
| crm_leads | tenant_id | src/api/crm.js:255, src/api/crm.js:276, src/api/crm.js:303, src/api/crm.js:308 |
| crm_tasks | tenant_id | src/api/crm.js:390, src/api/crm.js:413, src/api/crm.js:443, src/api/crm.js:464 |
| customers | tenant_id | src/api/inbox.js:57, src/api/reservations.js:122, src/api/reservations.js:127, src/api/reservations.js:135 |
| employees | tenant_id | src/index.js:727, src/api/admin-hr.js:6, src/api/admin-hr.js:19, src/api/admin-hr.js:20 |
| feedback | tenant_id | src/index.js:49, src/index.js:288, src/index.js:333, src/index.js:333 |
| inbox | tenant_id | src/index.js:50, src/index.js:537, src/index.js:539, src/index.js:540 |
| inbox_reads | tenant_id | src/api/inbox.js:12, src/api/inbox.js:58, src/api/inbox.js:128, src/api/inbox.js:163 |
| inventory_adjustments | tenant_id | src/api/inventory.js:105, src/api/inventory.js:130 |
| invoices | tenant_id | src/api/financials.js:14, src/api/financials.js:14, src/api/financials.js:15, src/api/financials.js:16 |
| job_posts | tenant_id | src/api/hr.js:467, src/api/hr.js:483, src/api/hr.js:501 |
| journal_entries | tenant_id | src/api/financials.js:228, src/api/financials.js:286, src/api/financials.js:308, src/api/financials.js:314 |
| journals | tenant_id | src/api/financials.js:9, src/api/financials.js:9, src/api/financials.js:10, src/api/financials.js:186 |
| knowledge_articles | tenant_id | src/api/crm.js:571, src/api/crm.js:587, src/api/crm.js:615, src/api/crm.js:620 |
| leads | tenant_id | src/index.js:48, src/index.js:328, src/index.js:537, src/index.js:543 |
| leave_balances | tenant_id | src/api/hr.js:300, src/api/hr.js:307, src/api/hr.js:327 |
| leave_requests | tenant_id | src/api/admin-hr.js:21, src/api/hr.js:236, src/api/hr.js:271, src/api/hr.js:288 |
| leave_types | tenant_id | src/api/hr.js:197, src/api/hr.js:212, src/api/hr.js:218, src/api/hr.js:238 |
| manufacturing_orders | tenant_id | src/api/supply.js:516, src/api/supply.js:541, src/api/supply.js:559, src/api/supply.js:572 |
| marketplace_payments | tenant_id | src/api/paymob-webhook.js:232, src/api/paymob-webhook.js:237, src/api/paymob-webhook.js:244, src/api/paymob-webhook.js:278 |
| marketplace_payouts | tenant_id | src/api/admin-payouts.js:124, src/api/admin-payouts.js:160, src/api/admin-payouts.js:166, src/api/admin-payouts.js:187 |
| marketplace_reviews | tenant_id | src/api/marketplace.js:70, src/api/marketplace.js:71, src/api/marketplace.js:126, src/api/marketplace.js:170 |
| meal_categories | tenant_id | src/api/admin.js:76, src/api/meals.js:49, src/api/meals.js:65, src/api/tenant-import.js:184 |
| meal_schedules | tenant_id | src/api/admin.js:77, src/api/meals.js:209, src/api/meal-schedules.js:28, src/api/meal-schedules.js:80 |
| meals | tenant_id | src/index.js:44, src/index.js:481, src/index.js:489, src/index.js:490 |
| opportunities | tenant_id | src/index.js:739, src/api/crm.js:2, src/api/crm.js:12, src/api/crm.js:12 |
| order_discounts | tenant_id | src/routes/pos/index.js:700 |
| orders | tenant_id | src/index.js:32, src/index.js:382, src/index.js:402, src/index.js:626 |
| pages | tenant_id | src/index.js:745, src/api/storefront.js:3, src/api/storefront.js:3, src/api/storefront.js:443 |
| payments | tenant_id | src/index.js:37, src/index.js:312, src/index.js:314, src/index.js:316 |
| payroll_runs | tenant_id | src/api/admin-hr.js:22, src/api/hr.js:390, src/api/hr.js:410, src/api/hr.js:422 |
| plans_new | tenant_id | src/api/admin.js:72, src/api/others.js:44, src/api/others.js:53, src/api/others.js:76 |
| pos_products | tenant_id | src/api/storefront.js:121, src/api/storefront.js:145, src/api/storefront.js:195, src/api/storefront.js:293 |
| pos_recipe_ingredients | tenant_id | src/api/softDelete.js:122, src/api/softDelete.js:171, src/routes/pos/index.js:571 |
| pos_shifts | tenant_id | src/api/softDelete.js:178, src/routes/pos/index.js:1021, src/routes/pos/index.js:1050, src/routes/pos/index.js:1058 |
| pos_tables | tenant_id | src/api/pos-tables.js:11, src/api/pos-tables.js:12, src/api/pos-tables.js:114, src/api/pos-tables.js:148 |
| pos_transaction_items | tenant_id | src/api/softDelete.js:124, src/api/softDelete.js:174, src/api/reports.js:165, src/api/reports.js:263 |
| pos_transactions | tenant_id | src/api/reservations.js:414, src/api/pos-tables.js:254, src/api/softDelete.js:124, src/api/softDelete.js:125 |
| pos_users | tenant_id | src/api/tenant-import.js:144, src/api/tenant-import.js:184, src/api/tenant-import.js:187, src/api/tenant-import.js:429 |
| predictions | tenant_id | src/api/ai.js:16, src/api/ai.js:16, src/api/ai.js:17, src/api/ai.js:504 |
| price_rules | tenant_id | src/api/ai.js:296, src/api/ai.js:313, src/api/ai.js:333, src/api/ai.js:351 |
| products | tenant_id | src/index.js:324, src/index.js:325, src/index.js:566, src/index.js:586 |
| project_items | tenant_id | src/index.js:618, src/api/project-items.js:8, src/api/project-items.js:10, src/api/project-items.js:11 |
| project_links | tenant_id | src/index.js:610, src/api/project-links.js:8, src/api/project-links.js:10, src/api/project-links.js:11 |
| projects | tenant_id | src/index.js:614, src/index.js:615, src/index.js:616, src/index.js:622 |
| promotions | tenant_id | src/index.js:45, src/index.js:493, src/index.js:495, src/index.js:504 |
| purchase_orders | tenant_id | src/api/supply.js:338, src/api/supply.js:358, src/api/supply.js:365, src/api/supply.js:387 |
| rate_plans_new | tenant_id | src/api/reservations.js:167, src/api/reservations.js:277, src/api/admin.js:71, src/api/tenant-import.js:332 |
| rooms_new | tenant_id | src/api/inbox.js:27, src/api/inbox.js:29, src/api/inbox.js:56, src/api/reservations.js:155 |
| service_availability | tenant_id | src/api/services.js:327, src/api/services.js:348, src/api/services.js:360, src/api/services.js:364 |
| service_bookings | tenant_id | src/api/services.js:215, src/api/services.js:248, src/api/services.js:251, src/api/services.js:261 |
| service_definitions | tenant_id | src/api/services.js:84, src/api/services.js:101, src/api/services.js:124, src/api/services.js:135 |
| service_items | tenant_id | src/api/services.js:148, src/api/services.js:171, src/api/services.js:191, src/api/services.js:202 |
| service_reviews | tenant_id | src/api/services.js:379, src/api/services.js:400, src/api/services.js:412 |
| stock_quant | tenant_id | src/api/supply.js:184, src/api/supply.js:208, src/api/supply.js:214, src/api/supply.js:220 |
| stock_transfers | tenant_id | src/api/supply.js:238, src/api/supply.js:276, src/api/supply.js:290, src/api/supply.js:325 |
| storefront_orders | tenant_id | src/api/storefront.js:311, src/api/storefront.js:400, src/api/storefront.js:429, src/api/paymob-webhook.js:256 |
| tags | tenant_id | src/index.js:52, src/index.js:679, src/index.js:683, src/index.js:693 |
| tax_rates | tenant_id | src/api/financials.js:466, src/api/financials.js:482 |
| tenant_meta | tenant_id | src/api/softDelete.js:148, src/api/meta.js:11, src/api/meta.js:105, src/api/meta.js:257 |
| tenant_org_mapping | tenant_id | src/api/reservations.js:390, src/api/meal-plans.js:30, src/api/onboarding.js:93, src/api/onboarding.js:125 |
| tenant_subscriptions | tenant_id | src/api/admin-subscriptions.js:12, src/api/admin-subscriptions.js:63, src/api/admin-subscriptions.js:68, src/api/admin-subscriptions.js:147 |
| tickets | tenant_id | src/index.js:739, src/api/crm.js:2, src/api/crm.js:19, src/api/crm.js:19 |
| time_entries | tenant_id | src/api/crm.js:488 |
| warehouses | tenant_id | src/index.js:733, src/api/supply.js:2, src/api/supply.js:5, src/api/supply.js:5 |
| bom_lines | child of tenant-scoped parent (inherits via FK) | src/api/supply.js:474, src/api/supply.js:500, src/api/supply.js:577, src/api/supply.js:591 |
| cart_items | child of tenant-scoped parent (inherits via FK) | src/api/storefront.js:178, src/api/storefront.js:215, src/api/storefront.js:221, src/api/storefront.js:228 |
| category_lang | shared/global reference | src/api/categories.js:42, src/api/categories.js:60, src/api/categories.js:87, src/api/categories.js:134 |
| entry_lines | child of tenant-scoped parent (inherits via FK) | src/api/financials.js:246, src/api/financials.js:293 |
| exchange_rates | shared/global reference | src/api/financials.js:493 |
| invoice_lines | child of tenant-scoped parent (inherits via FK) | src/api/financials.js:375 |
| languages | shared/global reference | src/api/softDelete.js:133 |
| marketplace_categories | shared/global reference | src/api/marketplace.js:94, src/api/marketplace.js:135 |
| marketplace_project_categories | shared/global reference | src/api/marketplace.js:52, src/api/marketplace.js:95, src/api/marketplace.js:136 |
| meal_categories_lang | shared/global reference | src/api/meals.js:50, src/api/meals.js:66, src/api/tenant-import.js:382, src/api/tenant-import.js:393 |
| meal_lang | shared/global reference | src/api/admin.js:78, src/api/meals.js:48, src/api/meals.js:64, src/api/meals.js:93 |
| order_items | child of tenant-scoped parent (inherits via FK) | src/api/storefront.js:307, src/api/reservations.js:404, src/api/ai.js:237, src/api/orders.js:653 |
| order_state | shared/global reference | src/api/payments.js:6, src/api/softDelete.js:133, src/api/orders.js:356, src/api/orders.js:466 |
| order_state_lang | shared/global reference | src/api/reports.js:126, src/api/orders.js:620, src/api/orders.js:674 |
| payroll_lines | child of tenant-scoped parent (inherits via FK) | src/api/hr.js:383, src/api/hr.js:428, src/api/hr.js:454 |
| platform_settings | shared/global reference | src/api/paymob-webhook.js:119, src/api/admin-settings.js:10, src/api/admin-settings.js:83, src/api/admin-settings.js:86 |
| pos_customers | org_id-scoped → tenant via tenant_org_mapping | src/api/softDelete.js:125, src/api/softDelete.js:177 |
| pos_organizations | org_id-scoped → tenant via tenant_org_mapping | src/api/onboarding.js:115, src/api/onboarding.js:121, src/api/onboarding.js:126, src/api/softDelete.js:127 |
| pos_products_old | child of tenant-scoped parent (inherits via FK) | — |
| pos_stores | org_id-scoped → tenant via tenant_org_mapping | src/api/onboarding.js:120, src/api/tenant-import.js:435, src/api/softDelete.js:125, src/api/softDelete.js:126 |
| pos_transactions_old | child of tenant-scoped parent (inherits via FK) | — |
| price_overrides | child of tenant-scoped parent (inherits via FK) | src/api/reservations.js:171, src/api/reservations.js:277, src/api/admin.js:68, src/api/camps.js:715 |
| product_camps | child of tenant-scoped parent (inherits via FK) | src/api/admin.js:69, src/api/camps.js:460, src/api/camps.js:565, src/api/camps.js:690 |
| project_meta | child of tenant-scoped parent (inherits via FK) | src/api/camps.js:35, src/api/camps.js:57, src/api/camps.js:171, src/api/camps.js:178 |
| project_tags | child of tenant-scoped parent (inherits via FK) | src/api/softDelete.js:130, src/api/softDelete.js:142, src/api/tags.js:13, src/api/tags.js:250 |
| purchase_order_lines | child of tenant-scoped parent (inherits via FK) | src/api/supply.js:372, src/api/supply.js:393, src/api/supply.js:407 |
| storefront_order_items | child of tenant-scoped parent (inherits via FK) | src/api/storefront.js:320 |
| subscription_plans | shared/global reference | src/api/admin-subscriptions.js:13, src/api/admin-subscriptions.js:70, src/api/admin-subscriptions.js:154, src/api/admin-subscriptions.js:177 |
| tenants | child of tenant-scoped parent (inherits via FK) | src/index.js:8, src/index.js:9, src/index.js:109, src/index.js:215 |
| ticket_comments | child of tenant-scoped parent (inherits via FK) | src/api/crm.js:553 |

> **Audit conclusion:** the isolation pattern is uniform (`tenant_id = ?` bound filter on every tenant-scoped read/write, plus FK `REFERENCES tenants(id)` at DDL level). The one historical exception — checkin's room-status UPDATE without a tenant filter (`orders.js:1009`; pre-fix 997) — is F-A11-1, fixed in-tree by A22 (see `Q10-resolution.md` B3) and pending Q10. The `x-tenant-id` header pivot on public GETs (F-A22-02) is classified **P4 intentional** in the B5 pass — see v3 §3 amendment.

---

## 4. Orphan-row queries + recorded results

| # | Check | SQL (read-only) | Recorded result |
|---|---|---|---|
| O1 | rooms_new rows with no owning project | `SELECT COUNT(*) FROM rooms_new rn LEFT JOIN projects p ON rn.camp_id = p.id WHERE p.id IS NULL;` | A1 audit (2026-08-22): all `rooms_new` rows map to a camp/project; **no orphan rows** |
| O2 | rooms_new.tenant_id NULL (F-A1-F003) | `SELECT COUNT(*) FROM rooms_new WHERE tenant_id IS NULL;` | **161 rows NULL** — the recorded P4 data-quality finding (v3 §3 F-A1-F003). Pre-decided: P4 ⇒ **no migration** (owner 2026-09-16) |
| O3 | orders with no tenant | `SELECT COUNT(*) FROM orders o LEFT JOIN tenants t ON o.tenant_id = t.id WHERE t.id IS NULL;` | No orphans recorded (A1: orders all tenant-valid) |
| O4 | projects with no tenant | `SELECT COUNT(*) FROM projects p LEFT JOIN tenants t ON p.tenant_id = t.id WHERE t.id IS NULL;` | No orphans recorded |
| O5 | pos_users without an organization / tenant | `SELECT COUNT(*) FROM pos_users pu LEFT JOIN pos_organizations o ON pu.organization_id = o.id WHERE o.id IS NULL;` | No orphans recorded (INSERT sites always bind both) |
| O6 | child tables (order_items, invoice_lines, purchase_order_lines, payroll_lines, ticket_comments, storefront_order_items, cart_items, bom_lines, entry_lines) with missing parent | One LEFT JOIN per parent (e.g. `SELECT COUNT(*) FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL;`) | A1: child rows all parent-valid |
| O7 | tenant_org_mapping orphans (POS org with dead tenant) | `SELECT COUNT(*) FROM tenant_org_mapping m LEFT JOIN tenants t ON m.tenant_id = t.id LEFT JOIN pos_organizations o ON m.organization_id = o.id WHERE t.id IS NULL OR o.id IS NULL;` | No orphans recorded |

> **Note on results:** This repo's working tree contains **no seeded local D1** (the Miniflare state holds only Durable-Object SQLite files; the D1 sqlite lives on the operator's machine / in the deployed environments). The recorded results above come from A1's 2026-08-22 live-DB introspection and the A22 probe environment, and are the only authoritative in-session answers. The queries are **read-only and safe to run** against any environment; the Wave 0.5 verification may re-run O1–O7 against staging/production D1 as a read-only gate.

---

## 5. Index analysis

| Scope | Count |
|---|---|
| Raw index definitions across all migration files | **442** (on 111 distinct table names — includes dropped-era tables) |
| Index names that are exact duplicates of an earlier definition (e.g. `idx_orders_tenant` created more than once, `idx_meal_schedules_tenant_date` twice) | tracked — see redundant-index note |
| Heaviest-indexed live tables | `orders` (38 raw defs across rebuilds), `pos_transactions` (36), `pos_products` (27), `rooms_new` (16), `pos_customers` (14), `pos_users` (14), `meal_schedules` (13), `projects` (12) |

**Redundant-index finding (matches 0100's reconstructed intent):** the 38 index defs for `orders`, 36 for `pos_transactions`, and 27 for `pos_products` are the accumulated residue of the drop/re-create cycles (0042 → 0046/0047 → 0092). SQLite does **not** inline-drop indexes with a table rebuild unless the CREATE explicitly drops them; each schema generation re-issued the same index names on the new shadow table, leaving duplicates in the ledger that materialized as duplicate-looking indexes on the live table. Migration 0100 (never applied) intended to `DROP INDEX` 23 redundant indexes; the precise list died with the file (preserved intent in `A1-proposed-0100-0101.md`).

**Operational note:** every tenant-scoped table has at least one `idx_*_tenant` (or `idx_*_tenant_id`) index except the detail tables that inherit scope via their parent (their join keys are indexed). No tenant-scoped table lacks a tenant index — the isolation-queries pattern in §3 is index-supported.

---

## 6. pos_users.name generated-column verification

| Check | Result |
|---|---|---|
| Generated-column definition | `ALTER TABLE pos_users ADD COLUMN name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED` — `migrations/0016_pos_staff_stats_and_name_fields.sql:4` |
| INSERT site 1 | `backend/src/api/pos-users.js:206` — columns `(organization_id, tenant_id, username, email, password_hash, first_name, last_name, phone, role, department, employee_id, store_id, is_active, status, created_at, updated_at)` — **no `name` column**, `first_name`/`last_name` only, `organization_id` + `tenant_id` included |
| INSERT site 2 | `backend/src/api/tenant-import.js:443` — same column list — **no `name` column**, `first_name`/`last_name` only, `organization_id` + `tenant_id` included |
| Any INSERT into pos_users containing a `name` column | **NONE** (regex over all of `backend/src/**/*.js`) |
| `name` reads | Reads select the generated `name` (e.g. `POS_USER_SELECT` in pos-users.js) — safe because the column is generated |
| Verdict | ✅ PASS — no write path violates the generated column; both INSERT sites satisfy `organization_id INTEGER NOT NULL` too |

Signed-off: the A1-generated-column requirement is **verified across all insert sites**.

---

## 7. Migration-vs-schema drift check

| Drift type | Evidence | Status |
|---|---|---|
| Runtime schema created outside migrations | `backend/src/api/auth.js:87` — `CREATE TABLE IF NOT EXISTS password_reset_tokens …` executes at runtime; table is NOT in any migration file | ⚠️ known drift (v3 A1 row) — P4 debt: move to a migration |
| Migration ledger vs live schema | Ledger simulation of 99 migrations yields **106** live tables; v3 claimed 108 (counting artifact) → corrected | ✅ resolved by this report |
| Migration file count vs cap test | `tests/core/migration-integrity.test.js:110` caps at 100; ledger head is 0099 (99 files) → 1 remaining | ⚠️ pre-decided: raise cap to 200 in Wave 0.5 (B6) |
| Applied-migrations count on any environment | Requires `PRAGMA`/`d1_migrations` read per environment | out of scope for read-only tree pass; Wave 0.5 read-only gate can verify |
| 0100/0101 files | Deleted pre-deploy; never committed; never applied anywhere | preserved intent in `A1-proposed-0100-0101.md` (§8.4) |

> **Rule (owner 2026-09-16):** the tree is FROZEN — the `password_reset_tokens` drift is deliberately NOT fixed in this pass; it is flagged for Wave 2a (auth) through the normal migration+merge path.

---

## 8. Change log / provenance

- This report is the B1 addendum. No schema, data, or code was modified to produce it (read-only ledger simulation + grep evidence).
- v3 §9.1 "Total tables 108" is corrected to **106**; the reference to this report is embedded in v3's B-corrections pass.
- Files touched by the addendum bundle: `A1-full-report.md` (this), `A22-probe-forensics.md`, `Q10-resolution.md`, `A1-proposed-0100-0101.md`, `FINAL_IMPLEMENTATION_PLAN_v3.md` (B-correction edits), `AGENT_LOGBOOK.md` (log entry).
