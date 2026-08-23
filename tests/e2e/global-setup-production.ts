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

/** Fetch with retry — Cloudflare DNS round-robins between IPs, some may be unreachable. */
async function fetchWithRetry(url: string, retries = 5, delayMs = 1000): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.log(`  ⏳ Attempt ${attempt}/${retries} failed, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'https://sinaicamps.com';
  console.log(`\n🌍 Production E2E Setup (${baseURL})`);

  // 1. Verify API is reachable (with retries for flaky Cloudflare IPs)
  try {
    const res = await fetchWithRetry(`${baseURL}/api/tenants`);
    if (!res.ok) {
      console.warn(`⚠️  GET /api/tenants returned ${res.status} — API may be down`);
    } else {
      const tenants = await res.json();
      console.log(`  ✅ API reachable (${Array.isArray(tenants) ? tenants.length : '?'} tenants)`);
    }
  } catch (err) {
    console.error('❌ Cannot reach API after retries — aborting setup');
    throw err;
  }

  // 2. Verify the test tenant exists (acaciacamp — used by tenant/public specs)
  try {
    const res = await fetchWithRetry(`${baseURL}/api/tenants/acaciacamp`, 2);
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
