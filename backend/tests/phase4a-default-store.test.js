/**
 * Phase 4a — one default pos_store per project (Option Y, design §6).
 *
 * Part A replays the REAL 0118 migration file against a better-sqlite3
 * :memory: db with real-shaped stub parents (pattern copied from
 * tests/migration-0110-payment-records.test.js): proves backfill binds every
 * NULL store in a mapped org to the tenant's oldest live project and
 * provisions exactly one store per storeless live project.
 *
 * Part B drives the REAL camps.js POST /api/camps handler (mock-D1 style of
 * tests/camps-unit.test.js): proves a project create inserts one store bound
 * to the new project_id, and degrades gracefully (project still created)
 * when the tenant has no POS org and provisioning fails.
 *
 * Scope: report real failures as failures — never fake green.
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import campsRoutes from '../src/api/camps.js';
import { mountRouter } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');
const readMigration = (file) => readFileSync(join(migrationsDir, file), 'utf8');

// Minimal parent stubs with the REAL column shapes under test:
// tenants(id TEXT PK, deleted_at), projects(id TEXT PK, tenant_id, name,
// created_at, deleted_at), pos_organizations(id INTEGER PK, slug UNIQUE),
// pos_stores(id INTEGER PK AUTOINCREMENT, organization_id NOT NULL,
// name/code/address/city NOT NULL, code UNIQUE, project_id nullable per 0101),
// tenant_org_mapping(tenant_id UNIQUE, organization_id UNIQUE).
function buildPhase4aDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, deleted_at TEXT);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      created_at TEXT, deleted_at TEXT
    );
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL);
    CREATE TABLE pos_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL, city TEXT NOT NULL,
      project_id TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE tenant_org_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL UNIQUE, organization_id INTEGER NOT NULL UNIQUE
    );
    INSERT INTO tenants (id, deleted_at) VALUES ('t1', NULL), ('t2', NULL), ('t3', NULL);
    INSERT INTO pos_organizations (id, name, slug) VALUES (1, 'T1 Org', 'org_t1'), (2, 'T2 Org', 'org_t2'), (9, 'Orphan Org', 'org_orphan');
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('t1', 1), ('t2', 2);
    INSERT INTO projects (id, tenant_id, name, created_at, deleted_at) VALUES
      ('p_old', 't1', 'Old Camp', '2026-01-01 00:00:00', NULL),
      ('p_new', 't1', 'New Camp', '2026-06-01 00:00:00', NULL),
      ('p2', 't2', 'T2 Camp', '2026-02-01 00:00:00', NULL),
      ('p3', 't3', 'Org-less Camp', '2026-03-01 00:00:00', NULL),
      ('p_dead', 't1', 'Dead Camp', '2026-01-15 00:00:00', '2026-05-01 00:00:00');
    INSERT INTO pos_stores (organization_id, name, code, address, city, project_id) VALUES
      (1, 'T1 Store', 'ST_t1', 'N/A', 'N/A', NULL),
      (9, 'Orphan Store', 'ST_ORPHAN', 'N/A', 'N/A', NULL);
  `);
  db.exec(readMigration('0118_default_store_per_project.sql'));
  return db;
}

const storesOf = (db) =>
  db.prepare('SELECT id, organization_id, name, code, project_id FROM pos_stores ORDER BY id').all();

describe('migration 0118 backfill (Phase 4a)', () => {
  it('binds NULL stores in mapped orgs to the tenant oldest live project', () => {
    const db = buildPhase4aDb();
    const t1Store = storesOf(db).find((s) => s.code === 'ST_t1');
    expect(t1Store.project_id).toBe('p_old');
  });

  it('provisions exactly one store per storeless live project with deterministic code', () => {
    const db = buildPhase4aDb();
    const rows = storesOf(db);
    for (const pid of ['p_new', 'p2']) {
      const mine = rows.filter((s) => s.project_id === pid);
      expect(mine, `expected exactly one store for ${pid}`).toHaveLength(1);
      expect(mine[0].code).toBe('ST_' + pid);
      expect(mine[0].name).toContain('Store');
    }
    // Oldest project keeps its single bound store — no duplicate default.
    expect(rows.filter((s) => s.project_id === 'p_old')).toHaveLength(1);
    // Soft-deleted projects get no store.
    expect(rows.filter((s) => s.project_id === 'p_dead')).toHaveLength(0);
  });

  it('leaves org-less projects storeless and unmapped-org stores NULL (countable residuals)', () => {
    const db = buildPhase4aDb();
    const rows = storesOf(db);
    expect(rows.filter((s) => s.project_id === 'p3')).toHaveLength(0);
    expect(rows.find((s) => s.code === 'ST_ORPHAN').project_id).toBeNull();
    // VERIFY query 1: every live project in a MAPPED tenant owns a store.
    const missing = db.prepare(`
      SELECT COUNT(*) AS n FROM projects p
      WHERE p.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM tenant_org_mapping m WHERE m.tenant_id = p.tenant_id)
        AND NOT EXISTS (SELECT 1 FROM pos_stores s WHERE s.project_id = p.id)
    `).get().n;
    expect(missing).toBe(0);
  });

  it('is idempotent: a second apply provisions nothing new', () => {
    const db = buildPhase4aDb();
    const before = storesOf(db).length;
    db.exec(readMigration('0118_default_store_per_project.sql'));
    expect(storesOf(db)).toHaveLength(before);
  });
});

// ─── Part B: project-create store hook ──────────────────────────

function mockDbForCreate({ mappedOrgId }) {
  const chains = [];
  const sqls = [];
  const db = {
    prepare: vi.fn().mockImplementation((sql) => {
      sqls.push(sql);
      const chain = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      if (sql.includes('FROM tenant_org_mapping') && mappedOrgId !== null) {
        chain.all = vi.fn().mockResolvedValue({ results: [{ organization_id: mappedOrgId }] });
      }
      chains.push(chain);
      return chain;
    }),
  };
  return { db, chains, sqls };
}

function postCamp(app, db, body) {
  return app.request('/api/camps', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  }, { DB: db });
}

describe('POST /api/camps project-create store hook (Phase 4a)', () => {
  it('inserts one store bound to the new project_id with deterministic code', async () => {
    const { db, chains, sqls } = mockDbForCreate({ mappedOrgId: 7 });
    const app = mountRouter(campsRoutes, { tenantId: 't1', basePath: '/api/camps' });
    const res = await postCamp(app, db, { name: 'New Camp' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    const storeIdx = sqls.findIndex((s) => s.includes('INTO pos_stores'));
    expect(storeIdx, 'expected an INSERT INTO pos_stores').toBeGreaterThanOrEqual(0);
    const bindArgs = chains[storeIdx].bind.mock.calls[0];
    // bind(organizationId, name, code, project_id)
    expect(bindArgs[0]).toBe(7);
    expect(bindArgs[1]).toBe('New Camp Store');
    expect(bindArgs[2]).toBe('ST_' + body.id);
    expect(bindArgs[3]).toBe(body.id);
  });

  it('still creates the project when the tenant has no org and provisioning yields none', async () => {
    const { db, sqls } = mockDbForCreate({ mappedOrgId: null });
    const app = mountRouter(campsRoutes, { tenantId: 't_noorg', basePath: '/api/camps' });
    const res = await postCamp(app, db, { name: 'Org-less Camp' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    // ensureTenantOrg ran on empty mocks and returned null → no store insert,
    // but the project INSERT still happened.
    expect(sqls.some((s) => s.includes('INSERT INTO projects'))).toBe(true);
  });
});
