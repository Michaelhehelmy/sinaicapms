import { FullConfig } from '@playwright/test';

/**
 * Production/Staging E2E global setup.
 *
 * This config only runs READ-ONLY specs (no auth, no mutations).
 * Seeding is skipped entirely — we verify the API is reachable and
 * the critical tenant exists, but do NOT create/modify any data.
 *
 * If a test needs specific data that doesn't exist on prod, it should
 * be excluded from the production config, not force-seeded here.
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'https://sinaicamps.com';
  console.log(`\n🌍 Production E2E Setup (${baseURL})`);

  // 1. Verify API is reachable
  try {
    const res = await fetch(`${baseURL}/api/tenants`);
    if (!res.ok) {
      console.warn(`⚠️  GET /api/tenants returned ${res.status} — API may be down`);
    } else {
      const tenants = await res.json();
      console.log(`  ✅ API reachable (${Array.isArray(tenants) ? tenants.length : '?'} tenants)`);
    }
  } catch (err) {
    console.error('❌ Cannot reach API — aborting setup');
    throw err;
  }

  // 2. Verify the test tenant exists (acaciacamp — used by tenant/public specs)
  try {
    const res = await fetch(`${baseURL}/api/tenants/acaciacamp`);
    if (res.ok) {
      console.log('  ✅ Test tenant (acaciacamp) exists');
    } else {
      console.warn(`⚠️  GET /api/tenants/acaciacamp returned ${res.status} — tenant specs may fail`);
    }
  } catch (err) {
    console.warn('⚠️  Could not verify test tenant:', err);
  }

  console.log('🌍 Production setup complete (read-only mode — no seeding)\n');
}

export default globalSetup;
