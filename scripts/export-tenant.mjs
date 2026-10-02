#!/usr/bin/env node
/**
 * export-tenant.mjs — read-only tenant exporter producing an A.1-shaped
 * import manifest (mani-a6).
 *
 * Mirrors the import wire contract (`docs/tenant-import.md`,
 * `backend/src/api/tenant-import.js` manifestSchema, camelCase):
 * - Sections: tenant, project, products, rooms, ratePlans,
 *   menu{categories,meals}, posUsers. NO identity block (export never
 *   provisions; identity is creation-mode only).
 * - Reads ONLY via public GETs (+ optional authed GET /api/pos-users).
 *   Never writes: no POST/PUT/DELETE, no KV, no R2.
 *
 * Usage:
 *   node scripts/export-tenant.mjs <subdomain> [--staging]
 *     [--base-url URL] [--out path] [--jwt TOKEN]
 *
 *   <subdomain>   tenant subdomain, e.g. acaciacamp
 *   --staging     read from https://staging.sinaicamps.com
 *                 (default: http://127.0.0.1:8787 local wrangler dev)
 *   --base-url    override the API origin (no trailing slash)
 *   --out         write JSON to path (default: stdout)
 *   --jwt         Bearer token for GET /api/pos-users (or $EXPORT_JWT).
 *                 Without it posUsers exports as [] (endpoint is 401).
 *
 * Exit: 0 on success (posUsers may be skipped with a warning),
 *       1 on core-endpoint fetch failure / usage error.
 *
 * KNOWN LOSSES (see .opencode/audits/BLOCKED-manifest-roundtrip.md):
 * - posUsers[].password: bcrypt one-way hash; never readable via any GET.
 *   (rooms[].roomStatus/cleaningStatus was the third entry and is GONE: the
 *   import schema gained both fields, so they now round-trip. The canary below
 *   re-reports them if the read side ever stops returning the columns.)
 */

const DEFAULT_LOCAL_BASE = 'http://127.0.0.1:8787';
const STAGING_BASE = 'https://staging.sinaicamps.com';

function usage() {
  console.error(
    'Usage: node scripts/export-tenant.mjs <subdomain> [--staging] [--base-url URL] [--out path] [--jwt TOKEN]'
  );
}

function parseArgs(argv) {
  const out = { subdomain: null, staging: false, baseUrl: null, outPath: null, jwt: process.env.EXPORT_JWT || null };
  const rest = [...argv];
  out.subdomain = rest.shift() || null;
  while (rest.length > 0) {
    const flag = rest.shift();
    if (flag === '--staging') out.staging = true;
    else if (flag === '--base-url') out.baseUrl = rest.shift() || null;
    else if (flag === '--out') out.outPath = rest.shift() || null;
    else if (flag === '--jwt') out.jwt = rest.shift() || null;
    else if (flag === '-h' || flag === '--help') { usage(); process.exit(1); }
    else { console.error(`Unknown flag: ${flag}`); usage(); process.exit(1); }
  }
  return out;
}

/** GET JSON; rows unwrapped from array-or-{data} envelopes. */
async function getJson(base, path, subdomain, jwt) {
  const headers = { 'x-tenant-id': subdomain };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${base}/api${path}`, { headers });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return data;
}

/** Pick camelCase-or-snake_case value, first non-null wins. */
function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.subdomain) { usage(); process.exit(1); }
  const base = args.baseUrl || (args.staging ? STAGING_BASE : DEFAULT_LOCAL_BASE);
  const warnings = [];
  const lostFields = [];

  let tenantRaw, projects, productsRaw, roomsRaw, ratePlansRaw, catsRaw, mealsRaw;
  try {
    tenantRaw = await getJson(base, `/tenants/${args.subdomain}`, args.subdomain, args.jwt);
    projects = await getJson(base, '/projects', args.subdomain, args.jwt);
    productsRaw = await getJson(base, '/products', args.subdomain, args.jwt);
    roomsRaw = await getJson(base, '/rooms', args.subdomain, args.jwt);
    ratePlansRaw = await getJson(base, '/rateplans', args.subdomain, args.jwt);
    catsRaw = await getJson(base, '/meal-categories', args.subdomain, args.jwt);
    mealsRaw = await getJson(base, '/meals', args.subdomain, args.jwt);
  } catch (e) {
    console.error(`EXPORT FAILED ${args.subdomain} @ ${base}: ${e.message}`);
    process.exit(1);
  }

  // posUsers is auth-gated; skip gracefully when unauthenticated.
  let posUsersRaw = null;
  try {
    posUsersRaw = await getJson(base, '/pos-users', args.subdomain, args.jwt);
  } catch (e) {
    warnings.push(`pos-users skipped: ${e.message}`);
    lostFields.push('posUsers[] (endpoint requires admin JWT; passwords are bcrypt hashes — never re-importable)');
  }
  if (posUsersRaw && posUsersRaw.length > 0) {
    // Even when readable, only hashes exist — plaintext is unrecoverable.
    lostFields.push('posUsers[].password (only password_hash is stored/returned; re-import would double-hash)');
  }

  // ── tenant (20 A.1 fields) ──
  const t = tenantRaw || {};
  const tenant = {};
  for (const [mk, ...aks] of [
    ['name', 'name'], ['logoUrl', 'logoUrl', 'logo_url'],
    ['faviconUrl', 'faviconUrl', 'favicon_url'],
    ['heroImageUrl', 'heroImageUrl', 'hero_image_url'],
    ['primaryColor', 'primaryColor', 'primary_color'],
    ['currency', 'currency'], ['footerText', 'footerText', 'footer_text'],
    ['location', 'location'], ['whatsappNumber', 'whatsappNumber', 'whatsapp_number'],
    ['phone', 'phone'], ['email', 'email'], ['description', 'description'],
    ['aboutText', 'aboutText', 'about_text'],
    ['galleryImages', 'galleryImages', 'gallery_images'],
    ['mapEmbedUrl', 'mapEmbedUrl', 'map_embed_url'],
    ['activities', 'activities'], ['faqItems', 'faqItems', 'faq_items'],
    ['reviews', 'reviews'], ['capacity', 'capacity'], ['menuConfig', 'menuConfig', 'menu_config'],
  ]) {
    const v = pick(t, ...aks);
    if (v !== undefined && v !== null) tenant[mk] = v;
  }

  // ── project (first active; prefer slug match) ──
  const projList = Array.isArray(projects) ? projects : [];
  const proj = projList.find((p) => pick(p, 'slug') === args.subdomain && pick(p, 'status') === 'active')
    || projList.find((p) => pick(p, 'status') === 'active')
    || projList[0]
    || null;
  const project = proj ? {
    ...(pick(proj, 'name') !== undefined ? { name: pick(proj, 'name') } : {}),
    ...(pick(proj, 'location') !== undefined && pick(proj, 'location') !== null ? { location: pick(proj, 'location') } : {}),
    ...(pick(proj, 'capacity') !== undefined && pick(proj, 'capacity') !== null ? { capacity: pick(proj, 'capacity') } : {}),
    ...(pick(proj, 'status') !== undefined ? { status: pick(proj, 'status') } : {}),
  } : {};
  if (!proj) warnings.push('no project found for tenant; exporting empty project block');

  // ── products ──
  // DEFECT-2 fixed: GET /api/products selects p.type, so `type` is exported
  // for every row and re-import keeps room|menu|buffet|retail. The guard
  // below still fires if the column ever goes missing again.
  const productIdToName = new Map();
  for (const p of productsRaw) productIdToName.set(pick(p, 'id'), pick(p, 'name'));
  let typeMissing = 0;
  const products = productsRaw.map((p) => {
    if (pick(p, 'type') === undefined) typeMissing += 1;
    const o = {};
    for (const [mk, ...aks] of [
      ['id', 'id'], ['name', 'name'], ['sku', 'sku'],
      ['basePrice', 'basePrice', 'base_price'],
      ['capacity', 'capacity'], ['description', 'description'],
      ['shortDescription', 'shortDescription', 'short_description'],
      ['imageUrl', 'imageUrl', 'image_url'],
      ['categoryId', 'categoryId', 'category_id'],
      ['isActive', 'isActive', 'is_active'],
    ]) {
      const v = pick(p, ...aks);
      if (v !== undefined && v !== null) o[mk] = v;
    }
    // Include explicit type when the API returns it.
    if (pick(p, 'type') !== undefined) o.type = pick(p, 'type');
    // Singular campId from the read-side campIds[] array.
    const campIds = pick(p, 'campIds', 'camp_ids', 'campId', 'camp_id');
    const firstCamp = Array.isArray(campIds) ? campIds[0] : campIds;
    if (firstCamp !== undefined && firstCamp !== null) o.campId = firstCamp;
    return o;
  });
  if (typeMissing > 0) {
    lostFields.push(`products[].type (${typeMissing}/${productsRaw.length} rows; GET /api/products SELECT omits the column, re-import defaults to 'retail')`);
  }

  // ── rooms (resolve productName for readability; handler prefers productId) ──
  // roomStatus/cleaningStatus are emitted because the import schema accepts
  // both (DEFECT-4); they were previously read, counted, and then DROPPED,
  // which round-tripped every room back to the schema defaults and made this
  // exporter advertise a loss that no longer existed. `roomStatusRows` is kept
  // ONLY as a canary — see below — because a silent disappearance of the
  // columns would otherwise look exactly like "every room is available/clean".
  let roomStatusRows = 0;
  const rooms = roomsRaw.map((r) => {
    const o = {};
    for (const [mk, ...aks] of [
      ['id', 'id'], ['name', 'name'], ['productId', 'productId', 'product_id'],
      ['floor', 'floor'], ['maxGuests', 'maxGuests', 'max_guests'],
      ['basePrice', 'basePrice', 'base_price'], ['status', 'status'],
      ['bedType', 'bedType', 'bed_type'], ['notes', 'notes'],
      ['isActive', 'isActive', 'is_active'],
      ['roomStatus', 'roomStatus', 'room_status'],
      ['cleaningStatus', 'cleaningStatus', 'cleaning_status'],
    ]) {
      const v = pick(r, ...aks);
      if (v !== undefined && v !== null) o[mk] = v;
    }
    const pid = pick(r, 'productId', 'product_id');
    if (pid && productIdToName.has(pid)) o.productName = productIdToName.get(pid);
    // Canary only — both values are emitted above. Counts rows where the read
    // side actually returned either column.
    if (pick(r, 'roomStatus', 'room_status') !== undefined ||
        pick(r, 'cleaningStatus', 'cleaning_status') !== undefined) {
      roomStatusRows += 1;
    }
    return o;
  });
  if (roomsRaw.length > 0 && roomStatusRows === 0) {
    lostFields.push(
      `rooms[].roomStatus/cleaningStatus (0/${roomsRaw.length} rows returned either column — ` +
      'the read side stopped sending them; rooms will re-import at the schema defaults)',
    );
  }

  // ── ratePlans ──
  const ratePlans = ratePlansRaw.map((rp) => {
    const o = {};
    for (const [mk, ...aks] of [
      ['id', 'id'], ['productId', 'productId', 'product_id'],
      ['name', 'name'], ['pricePerNight', 'pricePerNight', 'price_per_night'],
      ['startDate', 'startDate', 'start_date'], ['endDate', 'endDate', 'end_date'],
      ['season', 'season'], ['minStay', 'minStay', 'min_stay'],
      ['isActive', 'isActive', 'is_active'],
    ]) {
      const v = pick(rp, ...aks);
      if (v !== undefined && v !== null) o[mk] = v;
    }
    const pid = pick(rp, 'productId', 'product_id');
    if (pid && productIdToName.has(pid)) o.productName = productIdToName.get(pid);
    return o;
  });

  // ── menu ──
  // Legacy categories may lack a lang name (LEFT JOIN → null); the import
  // schema requires a name, so nameless rows are skipped with a warning.
  const namedCats = catsRaw.filter((c) => {
    const n = pick(c, 'name');
    return typeof n === 'string' && n.length > 0;
  });
  if (namedCats.length < catsRaw.length) {
    warnings.push(`skipped ${catsRaw.length - namedCats.length}/${catsRaw.length} meal-categories with no name (no lang row; not re-importable)`);
    lostFields.push(`menu.categories[] without lang name (${catsRaw.length - namedCats.length} rows; GET name=null, import requires name)`);
  }
  const categories = namedCats.map((c) => {
    const o = { name: pick(c, 'name') };
    const pos = pick(c, 'position');
    if (pos !== undefined && pos !== null) o.position = pos;
    return o;
  });
  const catIdToName = new Map(namedCats.map((c) => [pick(c, 'id'), pick(c, 'name')]));
  const meals = mealsRaw.map((m) => {
    const o = {};
    for (const [mk, ...aks] of [
      ['id', 'id'], ['name', 'name'],
      ['mealCategoryId', 'mealCategoryId', 'meal_category_id', 'categoryId', 'category_id'],
      ['price', 'price'], ['description', 'description'],
      ['imageUrl', 'imageUrl', 'image_url'], ['isActive', 'isActive', 'is_active'],
    ]) {
      const v = pick(m, ...aks);
      if (v !== undefined && v !== null) o[mk] = v;
    }
    const cid = pick(m, 'mealCategoryId', 'meal_category_id', 'categoryId', 'category_id');
    const cname = pick(m, 'categoryName', 'category_name') || (cid && catIdToName.get(cid));
    if (cname) o.categoryName = cname;
    return o;
  });

  // ── posUsers: never re-importable (no plaintext passwords anywhere) ──
  const posUsers = [];

  const manifest = { tenant, project, products, rooms, ratePlans, menu: { categories, meals }, posUsers };

  const counts = {
    products: products.length, rooms: rooms.length, ratePlans: ratePlans.length,
    mealCategories: categories.length, meals: meals.length, posUsers: posUsers.length,
  };

  const json = JSON.stringify(manifest, null, 2);
  if (args.outPath) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.outPath, json + '\n', 'utf8');
  } else {
    process.stdout.write(json + '\n');
  }
  console.error(`EXPORT OK ${args.subdomain} @ ${base} counts=${JSON.stringify(counts)}`);
  for (const w of warnings) console.error(`warning: ${w}`);
  if (lostFields.length > 0) {
    console.error('lost-fields (not re-importable):');
    for (const f of lostFields) console.error(` - ${f}`);
  }
}

main().catch((e) => { console.error(`EXPORT FAILED: ${e.message}`); process.exit(1); });
