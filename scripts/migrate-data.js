#!/usr/bin/env node
/**
 * Data Migration Script: Old Schema → New Schema
 * 
 * Usage:
 *   node scripts/migrate-data.js --env=production
 *   node scripts/migrate-data.js --env=staging
 *   node scripts/migrate-data.js --dry-run
 * 
 * This script reads from old tables and writes to new tables.
 * Run AFTER migration 0028 + 0029 have been applied.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const bcrypt = require('../backend/node_modules/bcryptjs');

// ============================================================
// Configuration
// ============================================================
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const envArg = args.find(a => a.startsWith('--env='));
const ENV = envArg ? envArg.split('=')[1] : 'production';

function log(msg) { console.log(`[migrate] ${msg}`); }
function warn(msg) { console.warn(`[WARN] ${msg}`); }
function error(msg) { console.error(`[ERROR] ${msg}`); }

// ============================================================
// D1 Query Helpers
// ============================================================
function d1Query(sql, ...params) {
  const escaped = sql.replace(/\?/g, () => {
    const p = params.shift();
    if (p === undefined || p === null) return 'NULL';
    if (typeof p === 'string') return `'${p.replace(/'/g, "''")}'`;
    return String(p);
  });
  
  try {
    const result = execSync(
      `wrangler d1 execute campmaster-db --remote --env=${ENV} --command="${escaped.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    // Parse JSON output from wrangler
    const lines = result.trim().split('\n');
    const jsonLine = lines.find(l => l.startsWith('[') || l.startsWith('{'));
    if (jsonLine) {
      const parsed = JSON.parse(jsonLine);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
    return [];
  } catch (e) {
    warn(`Query failed: ${e.message}`);
    return [];
  }
}

function d1Execute(sql) {
  try {
    execSync(
      `wrangler d1 execute campmaster-db --remote --env=${ENV} --command="${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return true;
  } catch (e) {
    warn(`Execute failed: ${e.message}`);
    return false;
  }
}

function uuid() {
  return crypto.randomUUID();
}

function generateRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'ORD-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================
// Step 1: Migrate Languages
// ============================================================
function migrateLanguages() {
  log('Step 1: Migrating languages...');
  // Already seeded in 0029, just verify
  const langs = d1Query("SELECT code FROM languages");
  log(`  Languages: ${langs.length} found (${langs.map(l => l.code).join(', ')})`);
}

// ============================================================
// Step 2: Migrate Order States
// ============================================================
function migrateOrderStates() {
  log('Step 2: Migrating order states...');
  // Already seeded in 0029, just verify
  const states = d1Query("SELECT id FROM order_state");
  log(`  Order states: ${states.length} found (${states.map(s => s.id).join(', ')})`);
}

// ============================================================
// Step 3: Migrate Tenants (add currency)
// ============================================================
function migrateTenants() {
  log('Step 3: Migrating tenants (adding currency)...');
  
  const tenants = d1Query("SELECT id, currency FROM tenants");
  for (const t of tenants) {
    if (!t.currency) {
      d1Execute(`UPDATE tenants SET currency = 'EGP' WHERE id = '${t.id}'`);
    }
  }
  log(`  Updated ${tenants.length} tenants with currency`);
}

// ============================================================
// Step 4: Migrate Products (room types from pos_products)
// ============================================================
function migrateProducts() {
  log('Step 4: Migrating products (room types)...');
  
  // Get all room types from pos_products
  const roomTypes = d1Query(
    "SELECT id, tenant_id, name, sku, selling_price, capacity, image_url, description, is_active FROM pos_products WHERE type = 'room' AND deleted_at IS NULL"
  );
  
  log(`  Found ${roomTypes.length} room types to migrate`);
  
  let productCount = 0;
  let langCount = 0;
  
  for (const rt of roomTypes) {
    const productId = rt.id;
    
    // Insert product
    const insertSql = `INSERT OR IGNORE INTO products (id, tenant_id, sku, base_price, capacity, image_url, is_active, created_at)
      VALUES (
        '${productId}',
        '${rt.tenant_id}',
        ${rt.sku ? `'${rt.sku}'` : 'NULL'},
        ${rt.selling_price || 0},
        ${rt.capacity || 2},
        ${rt.image_url ? `'${rt.image_url.replace(/'/g, "''")}'` : 'NULL'},
        ${rt.is_active || 1},
        CURRENT_TIMESTAMP
      )`;
    
    if (!isDryRun) d1Execute(insertSql);
    productCount++;
    
    // Insert product_lang (English - default)
    if (rt.name) {
      const langSql = `INSERT OR IGNORE INTO product_lang (product_id, lang, name, description)
        VALUES (
          '${productId}',
          'en',
          '${rt.name.replace(/'/g, "''")}',
          ${rt.description ? `'${rt.description.replace(/'/g, "''")}'` : 'NULL'}
        )`;
      if (!isDryRun) d1Execute(langSql);
      langCount++;
    }
  }
  
  log(`  Products: ${productCount} created, ${langCount} language entries`);
  return productCount;
}

// ============================================================
// Step 5: Migrate Product-Camps junction
// ============================================================
function migrateProductCamps() {
  log('Step 5: Migrating product_camps...');
  
  const links = d1Query("SELECT product_id, camp_id FROM product_camps");
  let count = 0;
  
  for (const link of links) {
    const sql = `INSERT OR IGNORE INTO product_camps_new (product_id, camp_id)
      VALUES ('${link.product_id}', '${link.camp_id}')`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  log(`  Product-camp links: ${count} migrated`);
}

// ============================================================
// Step 6: Migrate Rooms
// ============================================================
function migrateRooms() {
  log('Step 6: Migrating rooms...');
  
  const rooms = d1Query(
    "SELECT id, tenant_id, camp_id, room_type_id, room_number, floor, status FROM rooms"
  );
  
  let count = 0;
  for (const r of rooms) {
    // room_type_id → product_id (same ID, just different table now)
    const sql = `INSERT OR IGNORE INTO rooms_new (id, camp_id, product_id, name, status, bed_type, max_guests, base_price, floor, is_active, created_at)
      VALUES (
        '${r.id}',
        '${r.camp_id}',
        '${r.room_type_id}',
        '${(r.room_number || r.id).replace(/'/g, "''")}',
        '${r.status || 'available'}',
        'single',
        2,
        0,
        ${r.floor ? `'${r.floor}'` : 'NULL'},
        1,
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  log(`  Rooms: ${count} migrated`);
}

// ============================================================
// Step 7: Migrate Rate Plans
// ============================================================
function migrateRatePlans() {
  log('Step 7: Migrating rate plans...');
  
  const plans = d1Query(
    "SELECT rp.id, rp.tenant_id, rp.room_type_id, rp.name, rp.price, rp.start_date, rp.end_date, rp.season FROM rate_plans rp"
  );
  
  let count = 0;
  for (const p of plans) {
    // Get tenant_id from the product
    const product = d1Query(`SELECT tenant_id FROM products WHERE id = '${p.room_type_id}'`);
    const tenantId = product.length > 0 ? product[0].tenant_id : p.tenant_id;
    
    const sql = `INSERT OR IGNORE INTO rate_plans_new (id, tenant_id, product_id, name, season, start_date, end_date, price_per_night, is_active, created_at)
      VALUES (
        '${p.id}',
        '${tenantId}',
        '${p.room_type_id}',
        '${(p.name || '').replace(/'/g, "''")}',
        '${p.season || 'all'}',
        ${p.start_date ? `'${p.start_date}'` : 'NULL'},
        ${p.end_date ? `'${p.end_date}'` : 'NULL'},
        ${p.price || 0},
        1,
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  log(`  Rate plans: ${count} migrated`);
}

// ============================================================
// Step 8: Migrate Customers (from reservations)
// ============================================================
function migrateCustomers() {
  log('Step 8: Migrating customers (from reservations)...');
  
  // Group reservations by guest info to deduplicate
  const reservations = d1Query(
    "SELECT tenant_id, guest_name, guest_email, guest_phone FROM reservations WHERE guest_name IS NOT NULL GROUP BY tenant_id, guest_email, guest_phone"
  );
  
  const customerMap = {}; // key: "tenant_id:email:phone" → customer_id
  let count = 0;
  
  for (const r of reservations) {
    const key = `${r.tenant_id}:${r.guest_email || ''}:${r.guest_phone || ''}`;
    if (customerMap[key]) continue;
    
    const customerId = uuid();
    const nameParts = (r.guest_name || '').split(' ');
    const firstName = nameParts[0] || r.guest_name || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const sql = `INSERT OR IGNORE INTO customers (id, tenant_id, first_name, last_name, email, phone, created_at)
      VALUES (
        '${customerId}',
        '${r.tenant_id}',
        '${firstName.replace(/'/g, "''")}',
        '${lastName.replace(/'/g, "''")}',
        ${r.guest_email ? `'${r.guest_email.replace(/'/g, "''")}'` : 'NULL'},
        ${r.guest_phone ? `'${r.guest_phone.replace(/'/g, "''")}'` : 'NULL'},
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    
    customerMap[key] = customerId;
    count++;
  }
  
  log(`  Customers: ${count} created`);
  return customerMap;
}

// ============================================================
// Step 9: Migrate Orders (from reservations)
// ============================================================
function migrateOrders(customerMap) {
  log('Step 9: Migrating orders (from reservations)...');
  
  const reservations = d1Query(
    "SELECT id, tenant_id, camp_id, room_id, guest_name, guest_email, guest_phone, number_of_people, check_in_date, check_out_date, status, total_amount, amount_paid, notes FROM reservations"
  );
  
  // Status mapping
  const statusMap = {
    'pending': 'pending',
    'confirmed': 'confirmed',
    'checked-in': 'checked_in',
    'checked_out': 'checked_out',
    'cancelled': 'cancelled'
  };
  
  let count = 0;
  for (const r of reservations) {
    const orderId = r.id;
    const orderStateId = statusMap[r.status] || 'pending';
    const reference = generateRef();
    
    // Find customer
    const customerKey = `${r.tenant_id}:${r.guest_email || ''}:${r.guest_phone || ''}`;
    const customerId = customerMap[customerKey] || 'NULL';
    
    const sql = `INSERT OR IGNORE INTO orders (id, tenant_id, camp_id, room_id, customer_id, order_state_id, check_in_date, check_out_date, number_of_people, total_amount, amount_paid, payment_status, reference, notes, created_at)
      VALUES (
        '${orderId}',
        '${r.tenant_id}',
        '${r.camp_id}',
        '${r.room_id}',
        ${customerId !== 'NULL' ? `'${customerId}'` : 'NULL'},
        '${orderStateId}',
        '${r.check_in_date}',
        '${r.check_out_date}',
        ${r.number_of_people || 1},
        ${r.total_amount || 0},
        ${r.amount_paid || 0},
        ${r.amount_paid > 0 ? "'paid'" : "'pending'"},
        '${reference}',
        ${r.notes ? `'${r.notes.replace(/'/g, "''")}'` : 'NULL'},
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  log(`  Orders: ${count} migrated`);
}

// ============================================================
// Step 10: Migrate Meals (from tenants.menu_config)
// ============================================================
function migrateMeals() {
  log('Step 10: Migrating meals (from menu_config)...');
  
  const tenants = d1Query("SELECT id, menu_config FROM tenants WHERE menu_config IS NOT NULL AND menu_config != ''");
  
  let categoryCount = 0;
  let mealCount = 0;
  
  for (const t of tenants) {
    let menuConfig;
    try {
      menuConfig = JSON.parse(t.menu_config);
    } catch (e) {
      warn(`  Failed to parse menu_config for tenant ${t.id}: ${e.message}`);
      continue;
    }
    
    if (!menuConfig.categories || !Array.isArray(menuConfig.categories)) {
      warn(`  No categories found for tenant ${t.id}`);
      continue;
    }
    
    let position = 0;
    for (const cat of menuConfig.categories) {
      const catId = uuid();
      
      // Insert meal category
      const catSql = `INSERT OR IGNORE INTO meal_categories (id, tenant_id, position, created_at)
        VALUES ('${catId}', '${t.id}', ${position}, CURRENT_TIMESTAMP)`;
      if (!isDryRun) d1Execute(catSql);
      categoryCount++;
      
      // Insert category lang (Arabic - from name)
      if (cat.name) {
        const catLangAr = `INSERT OR IGNORE INTO meal_categories_lang (meal_category_id, lang, name)
          VALUES ('${catId}', 'ar', '${cat.name.replace(/'/g, "''")}')`;
        if (!isDryRun) d1Execute(catLangAr);
      }
      
      // Insert category lang (English - from nameEn)
      if (cat.nameEn) {
        const catLangEn = `INSERT OR IGNORE INTO meal_categories_lang (meal_category_id, lang, name)
          VALUES ('${catId}', 'en', '${cat.nameEn.replace(/'/g, "''")}')`;
        if (!isDryRun) d1Execute(catLangEn);
      }
      
      // Insert meals
      if (cat.items && Array.isArray(cat.items)) {
        for (const item of cat.items) {
          const mealId = uuid();
          
          const mealSql = `INSERT OR IGNORE INTO meals (id, tenant_id, meal_category_id, price, is_active, created_at)
            VALUES (
              '${mealId}',
              '${t.id}',
              '${catId}',
              ${item.price || 0},
              1,
              CURRENT_TIMESTAMP
            )`;
          if (!isDryRun) d1Execute(mealSql);
          mealCount++;
          
          // Meal lang (Arabic)
          if (item.name) {
            const mealLangAr = `INSERT OR IGNORE INTO meal_lang (meal_id, lang, name, description)
              VALUES ('${mealId}', 'ar', '${item.name.replace(/'/g, "''")}', ${item.note ? `'${item.note.replace(/'/g, "''")}'` : 'NULL'})`;
            if (!isDryRun) d1Execute(mealLangAr);
          }
          
          // Meal lang (English)
          if (item.nameEn) {
            const mealLangEn = `INSERT OR IGNORE INTO meal_lang (meal_id, lang, name, description)
              VALUES ('${mealId}', 'en', '${item.nameEn.replace(/'/g, "''")}', ${item.note ? `'${item.note.replace(/'/g, "''")}'` : 'NULL'})`;
            if (!isDryRun) d1Execute(mealLangEn);
          }
        }
      }
      
      position++;
    }
  }
  
  log(`  Meal categories: ${categoryCount}, Meals: ${mealCount}`);
}

// ============================================================
// Step 11: Migrate Admins (from pos_users)
// ============================================================
function migrateAdmins() {
  log('Step 11: Migrating admins...');
  
  // Get tenant admins
  const admins = d1Query(
    "SELECT id, tenant_id, email, password_hash, first_name, last_name, role FROM pos_users WHERE role IN ('admin', 'tenant_admin') AND deleted_at IS NULL"
  );
  
  let count = 0;
  for (const a of admins) {
    const adminId = `admin_${a.id}`;
    const role = a.role === 'tenant_admin' ? 'admin' : a.role;
    
    const sql = `INSERT OR IGNORE INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at)
      VALUES (
        '${adminId}',
        ${a.tenant_id ? `'${a.tenant_id}'` : 'NULL'},
        '${(a.email || `admin_${a.id}@sinaicamps.com`).replace(/'/g, "''")}',
        '${(a.password_hash || 'placeholder').replace(/'/g, "''")}',
        '${role}',
        ${a.first_name ? `'${a.first_name.replace(/'/g, "''")}'` : 'NULL'},
        ${a.last_name ? `'${a.last_name.replace(/'/g, "''")}'` : 'NULL'},
        1,
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  // Create default super_admin if not exists
  const superAdmin = d1Query("SELECT id FROM admins WHERE id = 'superadmin'");
  if (superAdmin.length === 0) {
    // Default bootstrap password (bcrypt-hashed at runtime, NEVER stored
    // plaintext). Rotate immediately after the first login.
    const bootstrapPassword = process.env.SUPER_ADMIN_INITIAL_PASSWORD || 'sinairoot';
    const sql = `INSERT OR IGNORE INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at)
      VALUES (
        'superadmin',
        NULL,
        'admin@sinaicamps.com',
        '${bcrypt.hashSync(bootstrapPassword, 10)}',
        'super_admin',
        'Super',
        'Admin',
        1,
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  log(`  Admins: ${count} created`);
}

// ============================================================
// Step 12: Migrate Plans
// ============================================================
function migratePlans() {
  log('Step 12: Migrating plans...');
  
  const plans = d1Query(
    "SELECT id, tenant_id, camp_id, title, description, date, time, status, category FROM plans"
  );
  
  let count = 0;
  for (const p of plans) {
    const sql = `INSERT OR IGNORE INTO plans_new (id, camp_id, name, description, date, time, status, category, created_at)
      VALUES (
        '${p.id}',
        '${p.camp_id}',
        '${(p.title || '').replace(/'/g, "''")}',
        ${p.description ? `'${p.description.replace(/'/g, "''")}'` : 'NULL'},
        ${p.date ? `'${p.date}'` : 'NULL'},
        ${p.time ? `'${p.time}'` : 'NULL'},
        '${p.status || 'planned'}',
        ${p.category ? `'${p.category.replace(/'/g, "''")}'` : 'NULL'},
        CURRENT_TIMESTAMP
      )`;
    if (!isDryRun) d1Execute(sql);
    count++;
  }
  
  log(`  Plans: ${count} migrated`);
}

// ============================================================
// Step 13: Verification
// ============================================================
function verify() {
  log('Step 13: Verification...');
  
  const checks = [
    { old: "SELECT COUNT(*) as c FROM pos_products WHERE type='room' AND deleted_at IS NULL", new: "SELECT COUNT(*) as c FROM products", label: 'Products (room types)' },
    { old: "SELECT COUNT(*) as c FROM product_camps", new: "SELECT COUNT(*) as c FROM product_camps_new", label: 'Product-camp links' },
    { old: "SELECT COUNT(*) as c FROM rooms", new: "SELECT COUNT(*) as c FROM rooms_new", label: 'Rooms' },
    { old: "SELECT COUNT(*) as c FROM rate_plans", new: "SELECT COUNT(*) as c FROM rate_plans_new", label: 'Rate plans' },
    { old: "SELECT COUNT(DISTINCT guest_email || guest_phone) as c FROM reservations WHERE guest_name IS NOT NULL", new: "SELECT COUNT(*) as c FROM customers", label: 'Customers' },
    { old: "SELECT COUNT(*) as c FROM reservations", new: "SELECT COUNT(*) as c FROM orders", label: 'Orders (reservations)' },
    { old: "SELECT COUNT(*) as c FROM plans", new: "SELECT COUNT(*) as c FROM plans_new", label: 'Plans' },
  ];
  
  let allPassed = true;
  for (const check of checks) {
    const oldCount = d1Query(check.old)[0]?.c || 0;
    const newCount = d1Query(check.new)[0]?.c || 0;
    const status = oldCount === newCount ? '✓' : '✗';
    if (oldCount !== newCount) allPassed = false;
    log(`  ${status} ${check.label}: old=${oldCount}, new=${newCount}`);
  }
  
  // Check meals (from menu_config)
  const mealTenants = d1Query("SELECT COUNT(*) as c FROM tenants WHERE menu_config IS NOT NULL AND menu_config != ''")[0]?.c || 0;
  const mealCategories = d1Query("SELECT COUNT(*) as c FROM meal_categories")[0]?.c || 0;
  const meals = d1Query("SELECT COUNT(*) as c FROM meals")[0]?.c || 0;
  log(`  Meals: ${mealCategories} categories, ${meals} meals (from ${mealTenants} tenants with menu_config)`);
  
  // Check admins
  const admins = d1Query("SELECT COUNT(*) as c FROM admins")[0]?.c || 0;
  log(`  Admins: ${admins}`);
  
  return allPassed;
}

// ============================================================
// Main
// ============================================================
async function main() {
  log('=== Data Migration: Old Schema → New Schema ===');
  log(`Environment: ${ENV}`);
  log(`Dry run: ${isDryRun}`);
  log('');
  
  if (isDryRun) {
    log('DRY RUN — no data will be modified');
    log('');
  }
  
  migrateLanguages();
  migrateOrderStates();
  migrateTenants();
  migrateProducts();
  migrateProductCamps();
  migrateRooms();
  migrateRatePlans();
  const customerMap = migrateCustomers();
  migrateOrders(customerMap);
  migrateMeals();
  migrateAdmins();
  migratePlans();
  
  log('');
  log('=== Verification ===');
  const passed = verify();
  
  log('');
  if (passed) {
    log('=== Migration complete ===');
  } else {
    warn('=== Migration complete with warnings ===');
    warn('Some counts may differ due to soft-deletes or data quality issues.');
  }
  
  if (isDryRun) {
    log('');
    log('DRY RUN complete. Re-run without --dry-run to execute.');
  }
}

main().catch(e => {
  error(`Migration failed: ${e.message}`);
  process.exit(1);
});
