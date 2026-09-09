/**
 * Seed human-testing test users for SinaiCamps.
 *
 * Creates the two API-creatable role accounts used by human testers
 * (documented in docs/TESTING_GUIDE_TESTER.md):
 *   - Camp admin:  admin.test@acaciacamp.com  (tenant admin for acaciacamp)
 *   - POS cashier: pos.test@acaciacamp.com    (POS user for acaciacamp)
 *
 * The super admin (admin@sinaicamps.com) is seeded by migration 0029 and has
 * NO public creation API — it is not created and its credentials are NOT
 * printed here (owner-only, see docs/TESTING_GUIDE_OWNER.md). Logging in as
 * the super admin is required internally to create the tenant admin.
 *
 * Idempotent: creation routes return 409 when the account already exists,
 * which the script treats as success (safe to re-run).
 *
 * Usage:
 *   node scripts/seed-test-users.js
 *
 * Env overrides (all optional):
 *   API_BASE_URL         default http://127.0.0.1:8787
 *   SUPER_ADMIN_EMAIL    default admin@sinaicamps.com
 *   SUPER_ADMIN_PASSWORD default sinairoot
 *   TENANT_ID            default acaciacamp
 *   TEST_ADMIN_PASSWORD  default TestPass123!
 *   TEST_POS_PASSWORD    default pass1234  (POST /api/pos-users enforces min 8 chars)
 */

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8787';
const SUPER_ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL || 'admin@sinaicamps.com',
  password: process.env.SUPER_ADMIN_PASSWORD || 'sinairoot',
};
const TENANT_ID = process.env.TENANT_ID || 'acaciacamp';
const TEST_ADMIN = {
  email: 'admin.test@acaciacamp.com',
  password: process.env.TEST_ADMIN_PASSWORD || 'TestPass123!',
};
const TEST_POS = {
  email: 'pos.test@acaciacamp.com',
  username: 'testpos',
  password: process.env.TEST_POS_PASSWORD || 'pass1234',
};

async function apiRequest(method, path, body, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function main() {
  console.log(`\n🌱 Seeding test users against ${API_BASE}\n`);

  // 1. Super admin login (seeded by migration 0029 — never re-created).
  const loginRes = await apiRequest('POST', '/api/auth/login', {
    email: SUPER_ADMIN.email,
    password: SUPER_ADMIN.password,
    tenantId: 'marketplace',
  });
  if (!loginRes.ok) {
    console.error('❌ Super admin login failed:', loginRes.status, await loginRes.text());
    console.error('   (Ensure wrangler dev is running and migration 0029 applied.)');
    process.exit(1);
  }
  const superToken = (await loginRes.json()).token;
  console.log('  ✅ Super admin login OK');

  // 2. Camp admin for acaciacamp (POST /api/admin/admins → handleSuperAdminRoute).
  const adminRes = await apiRequest('POST', '/api/admin/admins', {
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
    tenantId: TENANT_ID,
    role: 'admin',
    firstName: 'Test',
    lastName: 'Admin',
  }, { Authorization: `Bearer ${superToken}` });
  if (adminRes.status === 409) {
    console.log('  ℹ️  Camp admin already exists (409) — nothing to do');
  } else if (!adminRes.ok) {
    console.error('❌ Camp admin creation failed:', adminRes.status, await adminRes.text());
    process.exit(1);
  } else {
    console.log('  ✅ Camp admin created');
  }

  // 3. Tenant admin login (needed for the POS org-scoped headers).
  const tenantLoginRes = await apiRequest('POST', '/api/auth/login', {
    email: TEST_ADMIN.email,
    password: TEST_ADMIN.password,
    tenantId: TENANT_ID,
  });
  if (!tenantLoginRes.ok) {
    console.error('❌ Camp admin login failed:', tenantLoginRes.status, await tenantLoginRes.text());
    process.exit(1);
  }
  const tenantToken = (await tenantLoginRes.json()).token;
  console.log('  ✅ Camp admin login OK');

  // 4. POS cashier (POST /api/pos-users auto-provisions the POS organization;
  //    tenant scoping comes from the x-tenant-id header, not the URL).
  const posRes = await apiRequest('POST', '/api/pos-users', {
    email: TEST_POS.email,
    username: TEST_POS.username,
    password: TEST_POS.password,
    firstName: 'Test',
    lastName: 'POS',
    role: 'cashier',
  }, { Authorization: `Bearer ${tenantToken}`, 'x-tenant-id': TENANT_ID });
  if (posRes.status === 409) {
    console.log('  ℹ️  POS user already exists (409) — nothing to do');
  } else if (!posRes.ok) {
    console.error('❌ POS user creation failed:', posRes.status, await posRes.text());
    process.exit(1);
  } else {
    console.log('  ✅ POS cashier created');
  }

  console.log('\n✅ Seed complete. TESTER accounts (super admin stays owner-only):');
  console.log('   ┌───────────────────────┬────────────────────────────┬──────────────┐');
  console.log('   │ Surface                │ Email                     │ Password     │');
  console.log('   ├───────────────────────┼────────────────────────────┼──────────────┤');
  console.log(`   │ Camp admin             │ ${TEST_ADMIN.email.padEnd(26)} │ ${TEST_ADMIN.password.padEnd(12)} │`);
  console.log(`   │ POS cashier            │ ${TEST_POS.email.padEnd(26)} │ ${TEST_POS.password.padEnd(12)} │`);
  console.log('   └───────────────────────┴────────────────────────────┴──────────────┘');
  console.log('   POS login uses username: ' + TEST_POS.username);
  console.log('   Share: docs/TESTING_GUIDE_TESTER.md   (owner guide: docs/TESTING_GUIDE_OWNER.md)\n');
}

main().catch((err) => {
  console.error('Unexpected failure:', err);
  process.exit(1);
});