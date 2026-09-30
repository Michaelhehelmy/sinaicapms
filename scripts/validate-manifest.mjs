#!/usr/bin/env node
/**
 * validate-manifest.mjs — zero-dependency tenant-manifest validator (mani-a5).
 *
 * Mirrors A.1 (`docs/audit-2026-09-30-tenant-manifest-schema.md`, sourced from
 * `backend/src/api/tenant-import.js` identitySchema :12-21 + manifestSchema
 * :64-160, both `.strip()`):
 * - Caller wire format is camelCase → deep toSnake() first (same regex as
 *   `backend/src/utils/response.js`), then snake_case rules apply.
 * - All 8 top-level sections optional → `{}` parses (no-op import).
 * - Unknown top-level/section keys stripped (NOT errors) — mirrors `.strip()`.
 * - Array caps: products 200, rooms 200, rate_plans 200, menu.categories 50,
 *   menu.meals 200, pos_users 100.
 * - Reference asymmetry (A.1 finding 4): unknown rooms/ratePlans `product_name`
 *   → ERROR (handler 400); unknown meals `category_name` → WARNING only
 *   (handler stores null, no error).
 * - `rooms[].camp_id` accepted-but-stripped (A.1 finding 3): never errors, never used.
 * - Images NOT resolved here (no R2, no KV writes ever — free-plan quota).
 *
 * Usage: node scripts/validate-manifest.mjs <manifest.json>
 * Exit: 0 valid, 1 invalid (syntax / shape / type / cross-ref failure / usage).
 */
import { readFileSync } from 'node:fs';

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const IDENTITY_TYPES = ['camp', 'supermarket', 'transportation', 'other'];
const PRODUCT_TYPES = ['room', 'menu', 'buffet', 'retail'];
const PROJECT_STATUSES = ['active', 'inactive', 'planning', 'completed'];
const POS_ROLES = ['cashier', 'manager', 'admin'];

const CAPS = {
  products: 200,
  rooms: 200,
  rate_plans: 200,
  categories: 50,
  meals: 200,
  pos_users: 100,
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}

function toSnake(obj) {
  if (Array.isArray(obj)) return obj.map(toSnake);
  if (!isPlainObject(obj)) return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)] = toSnake(obj[key]);
  }
  return out;
}

function checkStr(v) { return typeof v === 'string'; }
function checkNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * Validate one manifest object (already toSnake'd). Returns { errors, warnings, counts }.
 * errors: [{ field, message }]; warnings: [{ field, message }]; counts: per-section counts.
 */
function validateManifest(data) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (field, message) => warnings.push({ field, message });

  if (!isPlainObject(data)) {
    err('(root)', 'Manifest must be a JSON object');
    return { errors, warnings, counts: zeroCounts() };
  }

  // ── identity (optional; creation-mode block) ──
  if (data.identity !== undefined) {
    const id = data.identity;
    if (!isPlainObject(id)) {
      err('identity', 'identity must be an object');
    } else {
      if (!checkStr(id.name) || id.name.length < 1) err('identity.name', 'Tenant name is required');
      if (!checkStr(id.subdomain) || id.subdomain.length < 1) {
        err('identity.subdomain', 'Subdomain is required');
      } else if (!SUBDOMAIN_RE.test(id.subdomain)) {
        err('identity.subdomain', 'Subdomain must be lowercase alphanumeric with hyphens, 3-63 chars');
      }
      if (id.type !== undefined && !IDENTITY_TYPES.includes(id.type)) {
        err('identity.type', `type must be one of ${IDENTITY_TYPES.join('|')}`);
      }
      if (!checkStr(id.email) || !EMAIL_RE.test(id.email)) err('identity.email', 'Valid admin email is required');
      if (!checkStr(id.password) || id.password.length < 8) err('identity.password', 'Password must be at least 8 characters');
      if (!checkStr(id.first_name) || id.first_name.length < 1) err('identity.first_name', 'First name is required');
      if (!checkStr(id.last_name) || id.last_name.length < 1) err('identity.last_name', 'Last name is required');
      if (id.business_type !== undefined && !checkStr(id.business_type)) err('identity.business_type', 'business_type must be a string');
    }
  }

  // ── tenant (optional; 20 fields, all optional) ──
  const TENANT_STR_FIELDS = ['name', 'logo_url', 'favicon_url', 'primary_color', 'footer_text',
    'location', 'whatsapp_number', 'phone', 'email', 'description', 'hero_image_url',
    'gallery_images', 'about_text', 'faq_items', 'reviews', 'map_embed_url', 'activities',
    'currency', 'menu_config'];
  if (data.tenant !== undefined) {
    if (!isPlainObject(data.tenant)) {
      err('tenant', 'tenant must be an object');
    } else {
      for (const f of TENANT_STR_FIELDS) {
        if (data.tenant[f] !== undefined && !checkStr(data.tenant[f])) err(`tenant.${f}`, `${f} must be a string`);
      }
      if (data.tenant.capacity !== undefined && !checkNum(data.tenant.capacity)) {
        err('tenant.capacity', 'capacity must be a number');
      }
    }
  }

  // ── project (optional; validated but inert — A.1 finding 2) ──
  if (data.project !== undefined) {
    if (!isPlainObject(data.project)) {
      err('project', 'project must be an object');
    } else {
      const p = data.project;
      if (p.name !== undefined && (!checkStr(p.name) || p.name.length < 1)) err('project.name', 'project.name must be a non-empty string when present');
      if (p.location !== undefined && !checkStr(p.location)) err('project.location', 'project.location must be a string');
      if (p.capacity !== undefined && (!checkNum(p.capacity) || p.capacity < 0)) err('project.capacity', 'project.capacity must be a number >= 0');
      if (p.status !== undefined && !PROJECT_STATUSES.includes(p.status)) {
        err('project.status', `project.status must be one of ${PROJECT_STATUSES.join('|')}`);
      }
    }
  }

  // ── products (optional, max 200) ──
  const productNames = new Set();
  if (data.products !== undefined) {
    if (!Array.isArray(data.products)) {
      err('products', 'products must be an array');
    } else if (data.products.length > CAPS.products) {
      err('products', `products must have at most ${CAPS.products} items`);
    } else {
      data.products.forEach((item, i) => {
        const f = `products[${i}]`;
        if (!isPlainObject(item)) { err(f, 'product must be an object'); return; }
        if (!checkStr(item.name) || item.name.length < 1) err(`${f}.name`, 'Product name is required');
        else productNames.add(item.name);
        if (item.id !== undefined && !checkStr(item.id)) err(`${f}.id`, 'id must be a string');
        if (item.sku !== undefined && !checkStr(item.sku)) err(`${f}.sku`, 'sku must be a string');
        if (item.base_price !== undefined && (!checkNum(item.base_price) || item.base_price < 0)) {
          err(`${f}.base_price`, 'base_price must be a number >= 0');
        }
        if (item.capacity !== undefined && (!checkNum(item.capacity) || item.capacity < 1)) {
          err(`${f}.capacity`, 'capacity must be a number >= 1');
        }
        for (const sf of ['description', 'short_description', 'image_url', 'category_id', 'camp_id']) {
          if (item[sf] !== undefined && !checkStr(item[sf])) err(`${f}.${sf}`, `${sf} must be a string`);
        }
        if (item.is_active !== undefined && !checkNum(item.is_active)) err(`${f}.is_active`, 'is_active must be a number');
        if (item.type !== undefined && !PRODUCT_TYPES.includes(item.type)) {
          err(`${f}.type`, `type must be one of ${PRODUCT_TYPES.join('|')}`);
        }
      });
    }
  }

  // ── rooms (optional, max 200) ──
  if (data.rooms !== undefined) {
    if (!Array.isArray(data.rooms)) {
      err('rooms', 'rooms must be an array');
    } else if (data.rooms.length > CAPS.rooms) {
      err('rooms', `rooms must have at most ${CAPS.rooms} items`);
    } else {
      data.rooms.forEach((room, i) => {
        const f = `rooms[${i}]`;
        if (!isPlainObject(room)) { err(f, 'room must be an object'); return; }
        if (!checkStr(room.name) || room.name.length < 1) err(`${f}.name`, 'Room name is required');
        if (room.id !== undefined && !checkStr(room.id)) err(`${f}.id`, 'id must be a string');
        if (room.product_id !== undefined && !checkStr(room.product_id)) err(`${f}.product_id`, 'product_id must be a string');
        if (room.product_name !== undefined && !checkStr(room.product_name)) err(`${f}.product_name`, 'product_name must be a string');
        if (room.floor !== undefined && !checkStr(room.floor) && !checkNum(room.floor)) {
          err(`${f}.floor`, 'floor must be a string or number');
        }
        for (const sf of ['status', 'bed_type', 'notes']) {
          if (room[sf] !== undefined && !checkStr(room[sf])) err(`${f}.${sf}`, `${sf} must be a string`);
        }
        if (room.max_guests !== undefined && !checkNum(room.max_guests)) err(`${f}.max_guests`, 'max_guests must be a number');
        if (room.base_price !== undefined && !checkNum(room.base_price)) err(`${f}.base_price`, 'base_price must be a number');
        if (room.is_active !== undefined && !checkNum(room.is_active)) err(`${f}.is_active`, 'is_active must be a number');
        // camp_id stripped by .strip() — accepted, never used (A.1 finding 3). No error.
      });
    }
  }

  // ── rate_plans (optional, max 200) ──
  if (data.rate_plans !== undefined) {
    if (!Array.isArray(data.rate_plans)) {
      err('rate_plans', 'rate_plans must be an array');
    } else if (data.rate_plans.length > CAPS.rate_plans) {
      err('rate_plans', `rate_plans must have at most ${CAPS.rate_plans} items`);
    } else {
      data.rate_plans.forEach((rp, i) => {
        const f = `rate_plans[${i}]`;
        if (!isPlainObject(rp)) { err(f, 'rate plan must be an object'); return; }
        if (!checkStr(rp.name) || rp.name.length < 1) err(`${f}.name`, 'Rate plan name is required');
        if (!checkNum(rp.price_per_night) || rp.price_per_night <= 0) {
          err(`${f}.price_per_night`, 'Price must be positive');
        }
        if (rp.id !== undefined && !checkStr(rp.id)) err(`${f}.id`, 'id must be a string');
        if (rp.product_id !== undefined && !checkStr(rp.product_id)) err(`${f}.product_id`, 'product_id must be a string');
        if (rp.product_name !== undefined && !checkStr(rp.product_name)) err(`${f}.product_name`, 'product_name must be a string');
        for (const sf of ['start_date', 'end_date', 'season']) {
          if (rp[sf] !== undefined && !checkStr(rp[sf])) err(`${f}.${sf}`, `${sf} must be a string`);
        }
        if (rp.min_stay !== undefined && !checkNum(rp.min_stay)) err(`${f}.min_stay`, 'min_stay must be a number');
        if (rp.is_active !== undefined && !checkNum(rp.is_active)) err(`${f}.is_active`, 'is_active must be a number');
      });
    }
  }

  // ── menu (optional) ──
  const categoryNames = new Set();
  if (data.menu !== undefined) {
    if (!isPlainObject(data.menu)) {
      err('menu', 'menu must be an object');
    } else {
      if (data.menu.categories !== undefined) {
        if (!Array.isArray(data.menu.categories)) {
          err('menu.categories', 'menu.categories must be an array');
        } else if (data.menu.categories.length > CAPS.categories) {
          err('menu.categories', `menu.categories must have at most ${CAPS.categories} items`);
        } else {
          data.menu.categories.forEach((cat, i) => {
            const f = `menu.categories[${i}]`;
            if (!isPlainObject(cat)) { err(f, 'category must be an object'); return; }
            if (!checkStr(cat.name) || cat.name.length < 1) err(`${f}.name`, 'Category name is required');
            else categoryNames.add(cat.name);
            if (cat.position !== undefined && !checkNum(cat.position)) err(`${f}.position`, 'position must be a number');
          });
        }
      }
      if (data.menu.meals !== undefined) {
        if (!Array.isArray(data.menu.meals)) {
          err('menu.meals', 'menu.meals must be an array');
        } else if (data.menu.meals.length > CAPS.meals) {
          err('menu.meals', `menu.meals must have at most ${CAPS.meals} items`);
        } else {
          data.menu.meals.forEach((meal, i) => {
            const f = `menu.meals[${i}]`;
            if (!isPlainObject(meal)) { err(f, 'meal must be an object'); return; }
            if (!checkStr(meal.name) || meal.name.length < 1) err(`${f}.name`, 'Meal name is required');
            if (meal.id !== undefined && !checkStr(meal.id)) err(`${f}.id`, 'id must be a string');
            if (meal.meal_category_id !== undefined && !checkStr(meal.meal_category_id)) {
              err(`${f}.meal_category_id`, 'meal_category_id must be a string');
            }
            if (meal.category_name !== undefined && !checkStr(meal.category_name)) {
              err(`${f}.category_name`, 'category_name must be a string');
            }
            if (meal.price !== undefined && (!checkNum(meal.price) || meal.price < 0)) {
              err(`${f}.price`, 'price must be a number >= 0');
            }
            if (meal.description !== undefined && !checkStr(meal.description)) err(`${f}.description`, 'description must be a string');
            if (meal.image_url !== undefined && !checkStr(meal.image_url)) err(`${f}.image_url`, 'image_url must be a string');
            if (meal.is_active !== undefined && !checkNum(meal.is_active)) err(`${f}.is_active`, 'is_active must be a number');
          });
        }
      }
    }
  }

  // ── pos_users (optional, max 100) ──
  if (data.pos_users !== undefined) {
    if (!Array.isArray(data.pos_users)) {
      err('pos_users', 'pos_users must be an array');
    } else if (data.pos_users.length > CAPS.pos_users) {
      err('pos_users', `pos_users must have at most ${CAPS.pos_users} items`);
    } else {
      data.pos_users.forEach((u, i) => {
        const f = `pos_users[${i}]`;
        if (!isPlainObject(u)) { err(f, 'pos user must be an object'); return; }
        if (!checkStr(u.email) || !EMAIL_RE.test(u.email)) err(`${f}.email`, 'Valid email is required');
        if (!checkStr(u.password) || u.password.length < 8) err(`${f}.password`, 'Password must be at least 8 characters');
        if (!checkStr(u.first_name) || u.first_name.length < 1) err(`${f}.first_name`, 'First name is required');
        if (!checkStr(u.last_name) || u.last_name.length < 1) err(`${f}.last_name`, 'Last name is required');
        if (u.username !== undefined && !checkStr(u.username)) err(`${f}.username`, 'username must be a string');
        if (u.phone !== undefined && !checkStr(u.phone)) err(`${f}.phone`, 'phone must be a string');
        if (u.role !== undefined && !POS_ROLES.includes(u.role)) {
          err(`${f}.role`, `role must be one of ${POS_ROLES.join('|')}`);
        }
        if (u.department !== undefined && !checkStr(u.department)) err(`${f}.department`, 'department must be a string');
        if (u.employee_id !== undefined && !checkStr(u.employee_id)) err(`${f}.employee_id`, 'employee_id must be a string');
        if (u.store_id !== undefined && (!checkNum(u.store_id) || !Number.isInteger(u.store_id))) {
          err(`${f}.store_id`, 'store_id must be an integer');
        }
      });
    }
  }

  // ── cross-refs: product_name (rooms/rate_plans → ERROR; A.1 finding 4) ──
  if (Array.isArray(data.rooms)) {
    data.rooms.forEach((room, i) => {
      if (!isPlainObject(room)) return;
      const pid = room.product_id;
      const pname = room.product_name;
      if ((pid === undefined || pid === null || pid === '') && (pname === undefined || pname === null || pname === '')) {
        err(`rooms[${i}].product_name`, `Room "${room.name || '?'}" references unknown product: no product_id`);
      } else if ((pid === undefined || pid === null || pid === '') && pname && !productNames.has(pname)) {
        err(`rooms[${i}].product_name`, `Room "${room.name || '?'}" references unknown product: ${pname}`);
      }
    });
  }
  if (Array.isArray(data.rate_plans)) {
    data.rate_plans.forEach((rp, i) => {
      if (!isPlainObject(rp)) return;
      const pid = rp.product_id;
      const pname = rp.product_name;
      if ((pid === undefined || pid === null || pid === '') && (pname === undefined || pname === null || pname === '')) {
        err(`rate_plans[${i}].product_name`, `Rate plan "${rp.name || '?'}" references unknown product: no product_id`);
      } else if ((pid === undefined || pid === null || pid === '') && pname && !productNames.has(pname)) {
        err(`rate_plans[${i}].product_name`, `Rate plan "${rp.name || '?'}" references unknown product: ${pname}`);
      }
    });
  }

  // ── cross-refs: category_name (meals → WARNING only; unknown → null, no 400) ──
  if (data.menu && Array.isArray(data.menu.meals)) {
    data.menu.meals.forEach((meal, i) => {
      if (!isPlainObject(meal)) return;
      if (meal.meal_category_id) return; // direct reference wins
      if (meal.category_name && !categoryNames.has(meal.category_name)) {
        warn(`menu.meals[${i}].category_name`, `Unknown category "${meal.category_name}" resolves to null (no error)`);
      }
    });
  }

  return { errors, warnings, counts: countSections(data) };
}

function zeroCounts() {
  return { products: 0, rooms: 0, rate_plans: 0, meal_categories: 0, meals: 0, pos_users: 0 };
}

function countSections(data) {
  const c = zeroCounts();
  if (Array.isArray(data.products)) c.products = data.products.length;
  if (Array.isArray(data.rooms)) c.rooms = data.rooms.length;
  if (Array.isArray(data.rate_plans)) c.rate_plans = data.rate_plans.length;
  if (data.menu && Array.isArray(data.menu.categories)) c.meal_categories = data.menu.categories.length;
  if (data.menu && Array.isArray(data.menu.meals)) c.meals = data.menu.meals.length;
  if (Array.isArray(data.pos_users)) c.pos_users = data.pos_users.length;
  return c;
}

function main() {
  const file = process.argv[2];
  if (!file || process.argv.includes('-h') || process.argv.includes('--help')) {
    console.error('Usage: node scripts/validate-manifest.mjs <manifest.json>');
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`INVALID ${file}`);
    console.error(` - (root): cannot read file: ${e.message}`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`INVALID ${file}`);
    console.error(` - (root): invalid JSON: ${e.message}`);
    console.error('counts: ' + JSON.stringify(zeroCounts()));
    process.exit(1);
  }
  const { errors, warnings, counts } = validateManifest(toSnake(parsed));
  if (errors.length > 0) {
    console.error(`INVALID ${file}`);
    for (const e of errors) console.error(` - ${e.field}: ${e.message}`);
    console.error('counts: ' + JSON.stringify(counts));
    process.exit(1);
  }
  console.log(`VALID ${file}`);
  console.log('counts: ' + JSON.stringify(counts));
  for (const w of warnings) console.log(`warning - ${w.field}: ${w.message}`);
  process.exit(0);
}

main();
