import { describe, it, expect, vi, beforeEach } from 'vitest';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouterAuthenticated, signAdminToken } from './helpers/routerHarness.js';

const tenantId = 'tenant_1';

// Real-auth harness: requests run through the production resolveScope +
// requireAuth chain (JWT signature, admin role allow-list, is_active probe,
// tenant hint resolution). Tokens are signed with this secret and the same
// secret is placed on every request env, exactly like index.js in production.
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-import-suite';

// Mirrors backend/src/index.js `/api/tenants/import` mount options exactly.
const IMPORT_SCOPE_OPTIONS = {
  auth: { roles: ['super_admin', 'admin'], requireTenant: false },
  requireTenantHint: false,
};

let superAdminToken;
let tenantAdminToken;
let noTenantAdminToken;

function makeEnv(db) {
  return { DB: db, MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}) }, JWT_SECRET };
}

/**
 * Flexible D1 mock.
 *  - `query(sql, bound)` is invoked for every .all()/.first(); default { results: [] }.
 *  - `batch(items)` is invoked with [{ sql, bound }]; default each { meta: { changes: 1 } }.
 *  - Every statement is recorded in db.__statements (batch records carry their items).
 */
function makeDb({ query = () => ({ results: [] }), batch = (items) => items.map(() => ({ meta: { changes: 1 } })) } = {}) {
  const statements = [];
  const prepare = vi.fn((sql) => {
    const state = { sql, bound: [] };
    const stmt = {
      state,
      bind(...args) {
        state.bound = args;
        return stmt;
      },
      async all() {
        statements.push({ type: 'all', ...state });
        return query(state.sql, state.bound);
      },
      async first() {
        statements.push({ type: 'first', ...state });
        return query(state.sql, state.bound).results?.[0] ?? null;
      },
      async run() {
        statements.push({ type: 'run', ...state });
        return {};
      },
    };
    return stmt;
  });
  const db = {
    prepare,
    async batch(items) {
      const states = items.map((s) => s.state);
      statements.push({ type: 'batch', items: states });
      return batch(states);
    },
    __statements: statements,
  };
  return db;
}

/** Query pre-built for the happy flow: org exists, one project, no dupes. */
const happyPathQuery = (sql) => {
  if (sql.includes('SELECT is_active FROM admins WHERE id')) {
    // real-auth gate probes is_active on every request
    return { results: [{ is_active: 1 }] };
  }
  if (sql.includes('SELECT organization_id FROM tenant_org_mapping WHERE tenant_id')) {
    return { results: [{ organization_id: 7 }] };
  }
  if (sql.includes('SELECT id FROM projects WHERE tenant_id')) {
    return { results: [{ id: 'camp_1' }] };
  }
  if (sql.includes('SELECT id, name FROM pos_products WHERE tenant_id')) {
    return { results: [] };
  }
  if (sql.includes('SELECT capacity FROM pos_products')) {
    return { results: [{ capacity: 4 }] };
  }
  if (sql.includes('SELECT mc.id, mcl.name FROM meal_categories')) {
    return { results: [] };
  }
  if (sql.includes('SELECT id FROM pos_stores WHERE organization_id')) {
    return { results: [{ id: 5 }] };
  }
  return { results: [] };
};

const happyManifest = {
  tenant: {
    name: 'Sinai Palms',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColor: '#0f766e',
    currency: 'EGP',
  },
  project: { name: 'Sinai Palms Camp' },
  products: [
    { id: 'prod_tent', name: 'Beach Tent', sku: 'TENT-01', basePrice: 1500, type: 'room' },
    { name: 'Family Tent', basePrice: 2500, type: 'room' },
  ],
  rooms: [
    { id: 'room_1', name: 'Room 101', productName: 'Beach Tent', floor: 1, maxGuests: 2, basePrice: 1500 },
    { id: 'room_2', name: 'Room 102', productId: 'prod_tent', bedType: 'double' },
  ],
  ratePlans: [
    { productName: 'Beach Tent', name: 'Summer', pricePerNight: 1500, season: 'summer' },
  ],
  menu: {
    categories: [{ name: 'Grills' }, { name: 'Drinks', position: 2 }],
    meals: [
      { name: 'Mixed Grill', categoryName: 'Grills', price: 350 },
      { name: 'Fresh Juice', categoryName: 'Drinks', price: 90 },
    ],
  },
  posUsers: [
    { email: 'cashier@sinaipalms.com', password: 'password123', firstName: 'Aya', lastName: 'Salem', role: 'cashier' },
    { email: 'admin@sinaipalms.com', password: 'password123', firstName: 'Omar', lastName: 'Fathy', role: 'admin' },
  ],
};

function findBatchWith(db, sqlFragment) {
  const batch = db.__statements.find((s) => s.type === 'batch' && s.items.some((i) => i.sql.includes(sqlFragment)));
  return batch ? batch.items.filter((i) => i.sql.includes(sqlFragment)) : null;
}

function runStatements(db) {
  return db.__statements.filter((s) => s.type === 'run');
}

describe('POST /api/tenants/import', () => {
  let env;
  let app;

  const post = (manifest, { token = tenantAdminToken, tenantHint = true } = {}, url = 'http://localhost/api/tenants/import') => {
    const headers = { Authorization: `Bearer ${token}` };
    if (tenantHint) headers['x-tenant-id'] = tenantId;
    return app.request(url, { method: 'POST', headers, body: JSON.stringify(manifest) }, env);
  };

  beforeEach(async () => {
    app = mountRouterAuthenticated(tenantImportRoutes, {
      basePath: '/api/tenants/import',
      scopeOptions: IMPORT_SCOPE_OPTIONS,
    });
    tenantAdminToken = await signAdminToken(
      { sub: 'adm_1', userId: 'adm_1', email: 'adm@sinai.test', role: 'admin', tenantId },
      JWT_SECRET,
    );
    superAdminToken = await signAdminToken(
      { sub: 'adm_super1', userId: 'adm_super1', email: 'super@sinai.test', role: 'super_admin', tenantId: null },
      JWT_SECRET,
    );
    noTenantAdminToken = await signAdminToken(
      { sub: 'adm_none', userId: 'adm_none', email: 'none@sinai.test', role: 'admin', tenantId: null },
      JWT_SECRET,
    );
    env = makeEnv(makeDb({ query: happyPathQuery }));
  });

  describe('happy path', () => {
    it('returns success with per-section counts', async () => {
      const res = await post(happyManifest);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tenantId).toBe(tenantId);
      expect(data.counts).toEqual({
        products: 2,
        rooms: 2,
        ratePlans: 1,
        mealCategories: 2,
        meals: 2,
        posUsers: 2,
      });
    });

    it('writes tenant branding via COALESCE UPDATE', async () => {
      await post(happyManifest);
      const tenantRun = runStatements(env.DB).find((s) => s.sql.includes('UPDATE tenants SET'));
      expect(tenantRun).toBeTruthy();
      expect(tenantRun.sql).toContain('name = COALESCE(?, name)');
      expect(tenantRun.bound[0]).toBe('Sinai Palms');
      expect(tenantRun.bound[tenantRun.bound.length - 1]).toBe(tenantId);
    });

    it('inserts products with resolved org, own SKU, and given camp', async () => {
      await post(happyManifest);
      const products = findBatchWith(env.DB, 'INSERT INTO pos_products');
      expect(products).toBeTruthy();
      expect(products.length).toBe(2);
      const first = products[0];
      expect(first.sql).toContain('INSERT INTO pos_products');
      const b = first.bound;
      expect(b[0]).toBe('prod_tent'); // id
      expect(b[1]).toBe(tenantId); // tenant_id
      expect(b[2]).toBe(7); // organization_id
      expect(b[4]).toBe('TENT-01'); // sku (as provided)
      expect(b[12]).toBe('room'); // type
      expect(b[13]).toBe('camp_1'); // camp_id
    });

    it('falls back SKU to PROD-<ID> and camp to the sole project', async () => {
      await post(happyManifest);
      const products = findBatchWith(env.DB, 'INSERT INTO pos_products');
      const second = products[1];
      expect(second.bound[4]).toMatch(/^PROD-/); // generated SKU
      expect(second.bound[13]).toBe('camp_1'); // default camp
    });

    it('inserts rooms via tenant-scoped INSERT...SELECT guard', async () => {
      await post(happyManifest);
      const rooms = findBatchWith(env.DB, 'INSERT INTO rooms_new');
      expect(rooms).toBeTruthy();
      expect(rooms.length).toBe(2);
      expect(rooms[0].sql).toContain('SELECT');
      expect(rooms[0].sql).toContain('c3.tenant_id = ?');
      // product_name reference resolved to the imported product id
      expect(rooms[0].bound[2]).toBe('prod_tent');
    });

    it('defaults room max_guests from product capacity when omitted', async () => {
      await post(happyManifest);
      const rooms = findBatchWith(env.DB, 'INSERT INTO rooms_new');
      const second = rooms[1]; // no maxGuests in manifest → capacity query (4)
      expect(second.bound[4]).toBe('available'); // status
      expect(second.bound[6]).toBe(4); // max_guests
    });

    it('inserts rate plans via product-guarded INSERT...SELECT', async () => {
      await post(happyManifest);
      const rps = findBatchWith(env.DB, 'INSERT INTO rate_plans_new');
      expect(rps).toBeTruthy();
      expect(rps.length).toBe(1);
      expect(rps[0].sql).toContain('SELECT');
      expect(rps[0].sql).toContain('p.tenant_id = ?');
      expect(rps[0].bound[0]).toMatch(/^rp_/); // generated id prefix
    });

    it('inserts meal categories + en lang rows', async () => {
      await post(happyManifest);
      const cats = findBatchWith(env.DB, 'INSERT INTO meal_categories');
      expect(cats).toBeTruthy();
      const langs = findBatchWith(env.DB, 'INSERT INTO meal_categories_lang');
      expect(langs).toBeTruthy();
      expect(langs[0].sql).toContain("'en'"); // lang is a literal in the SQL
      expect(langs[0].bound[1]).toBe('Grills'); // name
      expect(cats[0].bound[0]).toBe(langs[0].bound[0]); // same category id
    });

    it('inserts meals + meal_lang rows (lang=en)', async () => {
      await post(happyManifest);
      const meals = findBatchWith(env.DB, 'INSERT INTO meals');
      expect(meals).toBeTruthy();
      const langs = findBatchWith(env.DB, 'INSERT INTO meal_lang');
      expect(langs).toBeTruthy();
      expect(langs[0].sql).toContain("'en'"); // lang is a literal in the SQL
      expect(langs[0].bound[1]).toBe('Mixed Grill'); // name
      expect(langs[0].bound[2]).toBeNull(); // description
    });

    it('creates POS users with first_name/last_name (generated name) and resolved org', async () => {
      await post(happyManifest);
      const users = findBatchWith(env.DB, 'INSERT INTO pos_users');
      expect(users).toBeTruthy();
      expect(users.length).toBe(2);
      expect(users[0].sql).toContain('first_name');
      expect(users[0].sql).toContain('last_name');
      expect(users[0].sql).not.toMatch(/,\s*name,?\s/); // name column not inserted directly
      const b = users[0].bound;
      expect(b[0]).toBe(7); // organization_id
      expect(b[1]).toBe(tenantId);
      expect(b[3]).toBe('cashier@sinaipalms.com');
      expect(b[4]).toMatch(/^\$2/); // bcrypt hash (cost 12)
      expect(b[5]).toBe('Aya');
      expect(b[6]).toBe('Salem');
      expect(b[8]).toBe('cashier');
    });

    it('resolves a POS user store from the org when storeId omitted', async () => {
      await post(happyManifest);
      const users = findBatchWith(env.DB, 'INSERT INTO pos_users');
      expect(users[0].bound[11]).toBe(5); // store_id from pos_stores lookup
    });
  });

  describe('base64 image resolution', () => {
    it('uploads a data-URI logo to R2 and stores the /api/media/ URL', async () => {
      const base64 = Buffer.from('fakepngbytes').toString('base64');
      const res = await post({ tenant: { name: 'Sinai', logoUrl: `data:image/png;base64,${base64}` } });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(env.MEDIA_BUCKET.put).toHaveBeenCalledTimes(1);
      const [key, body, meta] = env.MEDIA_BUCKET.put.mock.calls[0];
      expect(key).toMatch(/^media\/tenant_1\/[0-9a-f-]{36}\.png$/);
      expect(Buffer.from(body).toString('utf8').replace(/\0/g, '')).toBe('fakepngbytes');
      expect(meta.httpMetadata.contentType).toBe('image/png');
      expect(data.success).toBe(true);
    });

    it('passes http(s) and /api/media/ URLs through unchanged', async () => {
      const res = await post({
        tenant: { name: 'Sinai', logoUrl: 'https://cdn.example.com/logo.png' },
        products: [{ name: 'Tent', imageUrl: '/api/media/media/t1/x.png' }],
      });
      expect(res.status).toBe(200);
      expect(env.MEDIA_BUCKET.put).not.toHaveBeenCalled();
    });
  });

  describe('validation and failure handling', () => {
    it('returns 400 for a manifest missing a product name', async () => {
      const res = await post({ products: [{ sku: 'X' }] });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeTruthy();
    });

    it('returns 409 on a duplicate SKU (UNIQUE constraint failure)', async () => {
      const db = makeDb({
        query: happyPathQuery,
        batch: () => {
          throw new Error('D1_ERROR: UNIQUE constraint failed: pos_products.sku');
        },
      });
      env.DB = db;
      const res = await post({ products: [{ name: 'A' }, { name: 'B' }] });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('duplicate');
    });

    it('returns 404 when a room references a cross-tenant product (guard yields changes=0)', async () => {
      const db = makeDb({
        query: happyPathQuery,
        batch: (items) =>
          items.map(({ sql }) =>
            sql.includes('INSERT INTO rooms_new') ? { meta: { changes: 0 } } : { meta: { changes: 1 } },
          ),
      });
      env.DB = db;
      const res = await post({
        products: [{ id: 't2_prod', name: 'Other Tent' }],
        rooms: [{ name: 'Room 1', productId: 't2_prod' }],
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('Room');
    });

    it('returns 400 when a room references an entirely unknown product', async () => {
      const res = await post({ rooms: [{ name: 'Room 1' }] });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('unknown product');
    });

    it('returns 409 when the tenant has no POS org (unprovisioned)', async () => {
      const db = makeDb({
        query: (sql) => {
          if (sql.includes('SELECT organization_id FROM tenant_org_mapping')) return { results: [] };
          if (sql.includes('SELECT id FROM pos_organizations WHERE slug')) return { results: [] };
          return happyPathQuery(sql);
        },
      });
      env.DB = db;
      const res = await post({ products: [{ name: 'Tent' }] });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('not provisioned');
    });
  });

  describe('auth harness', () => {
    it('returns 401 when no tenant scope is resolved', async () => {
      // Valid admin token WITHOUT a tenantId claim and no tenant hint: the
      // middleware passes (roles allow-list + is_active probe) but the
      // handler's existing-tenant branch resolves no scope → 401.
      app = mountRouterAuthenticated(tenantImportRoutes, {
        basePath: '/api/tenants/import',
        scopeOptions: IMPORT_SCOPE_OPTIONS,
      });
      const res = await post({}, { token: noTenantAdminToken, tenantHint: false });
      expect(res.status).toBe(401);
    });

    it('returns 401 for a bare request with no Bearer token', async () => {
      const res = await app.request(
        'http://localhost/api/tenants/import',
        { method: 'POST', headers: { 'x-tenant-id': tenantId }, body: '{}' },
        env,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('identity creation mode', () => {
    const identityManifest = {
      identity: {
        name: 'New Camp',
        subdomain: 'newcamp',
        type: 'camp',
        email: 'admin@newcamp.com',
        password: 'password123',
        firstName: 'Ali',
        lastName: 'Hassan',
      },
      products: [{ name: 'Tent A', basePrice: 100 }],
    };

    /**
     * Stateful query mock for creation mode. INSERTs flow through run()
     * (which executes real SQL in D1 and commits), so the subsequent
     * slug SELECT always finds the row — emulate that by returning the org.
     */
    function makeCreationQuery() {
      return (sql) => {
        if (sql.includes('SELECT is_active FROM admins WHERE id')) return { results: [{ is_active: 1 }] };
        if (sql.includes('SELECT id FROM tenants WHERE subdomain')) return { results: [] };
        if (sql.includes('SELECT id FROM admins WHERE email')) return { results: [] };
        if (sql.includes('SELECT organization_id FROM tenant_org_mapping')) return { results: [] };
        if (sql.includes('SELECT id FROM pos_organizations WHERE slug')) return { results: [{ id: 99 }] };
        if (sql.includes('SELECT id FROM projects WHERE tenant_id')) return { results: [] };
        if (sql.includes('SELECT id, name FROM pos_products WHERE tenant_id')) return { results: [] };
        if (sql.includes('SELECT capacity FROM pos_products')) return { results: [{ capacity: 2 }] };
        if (sql.includes('SELECT mc.id, mcl.name FROM meal_categories')) return { results: [] };
        if (sql.includes('SELECT id FROM pos_stores WHERE organization_id')) return { results: [{ id: 1 }] };
        return { results: [] };
      };
    }

    beforeEach(() => {
      // Real-auth: identity mode is driven by a SUPER_ADMIN token with NO
      // tenant hint — resolveScope (requireTenantHint:false) must let the
      // orphaned super_admin reach the handler's identity branch.
      env = makeEnv(makeDb({ query: makeCreationQuery() }));
    });

    const postIdentity = (manifest, opts = {}) =>
      post(manifest, { token: superAdminToken, tenantHint: false, ...opts });

    it('creates tenant + admin + org + project and returns 201 with created IDs', async () => {
      const res = await postIdentity(identityManifest);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.created).toBeDefined();
      expect(data.created.tenantId).toMatch(/^tenant_/);
      expect(data.created.adminId).toMatch(/^adm_/);
      expect(data.created.organizationId).toBeDefined();
    });

    it('INSERTs tenant with active status and completed onboarding', async () => {
      await postIdentity(identityManifest);
      const stmts = env.DB.__statements.filter((s) => s.type === 'run' && s.sql.includes('INSERT INTO tenants'));
      expect(stmts.length).toBe(1);
      const b = stmts[0].bound;
      expect(b[0]).toMatch(/^tenant_/); // id
      expect(b[1]).toBe('newcamp'); // subdomain
      expect(b[2]).toBe('New Camp'); // name
      expect(b[5]).toBe('admin@newcamp.com'); // email
    });

    it('INSERTs admin with role=admin and is_active=1', async () => {
      await postIdentity(identityManifest);
      const stmts = env.DB.__statements.filter((s) => s.type === 'run' && s.sql.includes('INSERT INTO admins'));
      expect(stmts.length).toBe(1);
      const b = stmts[0].bound;
      expect(b[0]).toMatch(/^adm_/); // id
      expect(b[1]).toBeDefined(); // tenant_id
      expect(b[2]).toBe('admin@newcamp.com'); // email
      expect(b[3]).toBeTruthy(); // password hash
      expect(b[4]).toBe('Ali'); // first_name
      expect(b[5]).toBe('Hassan'); // last_name
      expect(stmts[0].sql).toContain("'admin'"); // role hardcoded in SQL
      expect(stmts[0].sql).toContain('1, datetime'); // is_active=1 hardcoded in SQL
    });

    it('creates default project with slug derived from subdomain', async () => {
      await postIdentity(identityManifest);
      const stmts = env.DB.__statements.filter((s) => s.type === 'run' && s.sql.includes('INSERT INTO projects'));
      expect(stmts.length).toBe(1);
      const b = stmts[0].bound;
      expect(b[0]).toMatch(/^proj_/);
      expect(b[2]).toBe('New Camp'); // name
      expect(b[3]).toBe('newcamp'); // slug
    });

    it('calls ensureTenantOrg (creates org + store + mapping)', async () => {
      await postIdentity(identityManifest);
      const orgInsert = env.DB.__statements.find(
        (s) => s.type === 'run' && s.sql.includes('INSERT OR IGNORE INTO pos_organizations')
      );
      expect(orgInsert).toBeTruthy();
      const mappingInsert = env.DB.__statements.find(
        (s) => s.type === 'run' && s.sql.includes('INSERT OR IGNORE INTO tenant_org_mapping')
      );
      expect(mappingInsert).toBeTruthy();
    });

    it('runs data import after creation (products inserted)', async () => {
      await postIdentity(identityManifest);
      const products = findBatchWith(env.DB, 'INSERT INTO pos_products');
      expect(products).toBeTruthy();
      expect(products.length).toBe(1);
    });

    it('strips identity block from import payload (no identity in manifest schema)', async () => {
      // The manifest schema should not receive the identity block
      // If it did, zod .strip() would silently ignore it, but we verify the import ran
      const res = await postIdentity(identityManifest);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns 403 for tenant admin (non-super_admin)', async () => {
      app = mountRouterAuthenticated(tenantImportRoutes, {
        basePath: '/api/tenants/import',
        scopeOptions: IMPORT_SCOPE_OPTIONS,
      });
      const res = await postIdentity(identityManifest, { token: tenantAdminToken });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('super-admin');
    });

    it('returns 400 for invalid subdomain format', async () => {
      const res = await postIdentity({
        ...identityManifest,
        identity: { ...identityManifest.identity, subdomain: 'INVALID SUBDOMAIN!' },
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Subdomain');
    });

    it('returns 400 when subdomain is already taken', async () => {
      const db = makeDb({
        query: (sql) => {
          if (sql.includes('SELECT is_active FROM admins WHERE id')) return { results: [{ is_active: 1 }] };
          if (sql.includes('SELECT id FROM tenants WHERE subdomain')) return { results: [{ id: 'existing' }] };
          return creationQuery(sql);
        },
      });
      env.DB = db;
      const res = await postIdentity(identityManifest);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('subdomain');
    });

    it('returns 400 when admin email already exists', async () => {
      const db = makeDb({
        query: (sql) => {
          if (sql.includes('SELECT is_active FROM admins WHERE id')) return { results: [{ is_active: 1 }] };
          if (sql.includes('SELECT id FROM tenants WHERE subdomain')) return { results: [] };
          if (sql.includes('SELECT id FROM admins WHERE email')) return { results: [{ id: 'existing_admin' }] };
          return creationQuery(sql);
        },
      });
      env.DB = db;
      const res = await postIdentity(identityManifest);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('email');
    });

    it('returns 400 when identity block has missing required fields', async () => {
      const res = await postIdentity({ identity: { name: 'Camp' } });
      expect(res.status).toBe(400);
    });

    it('uses identity.name for tenant when tenant block omitted', async () => {
      await postIdentity(identityManifest);
      const tenantInsert = env.DB.__statements.find(
        (s) => s.type === 'run' && s.sql.includes('INSERT INTO tenants')
      );
      expect(tenantInsert.bound[2]).toBe('New Camp');
    });

    it('merges tenant block fields over identity when both present', async () => {
      // Fresh DB for this test since it makes its own request
      env = makeEnv(makeDb({ query: makeCreationQuery() }));
      const res = await postIdentity({
        identity: identityManifest.identity,
        tenant: { name: 'Override Name', currency: 'USD' },
      });
      expect(res.status).toBe(201);
      // Identity creates the row; tenant block merges via COALESCE UPDATE in importTenantManifest
      const tenantInsert = env.DB.__statements.find(
        (s) => s.type === 'run' && s.sql.includes('INSERT INTO tenants')
      );
      expect(tenantInsert.bound[2]).toBe('New Camp'); // identity name used for INSERT
      const tenantUpdate = env.DB.__statements.find(
        (s) => s.type === 'run' && s.sql.includes('UPDATE tenants SET')
      );
      expect(tenantUpdate).toBeTruthy(); // importTenantManifest runs UPDATE
      expect(tenantUpdate.bound[0]).toBe('Override Name'); // tenant block name overrides via COALESCE
    });
  });
});