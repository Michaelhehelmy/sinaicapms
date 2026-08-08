/**
 * Lighthouse authed baseline runner for SinaiCamps.
 *
 * Assumes the local dev/preview stack is ALREADY running (this is intentional —
 * starting servers from here is flaky; `npx playwright test` boots them for you):
 *
 *   - Frontend  ->  http://localhost:4320   (webServer: `cd app && npx astro dev --port 4320 --host`)
 *   - Backend   ->  http://localhost:8787   (webServer: `cd backend && npx wrangler dev --port 8787 --local`)
 *
 * (Same webServer entries as playwright.config.ts.)
 *
 * It logs into the admin SPA as the seed super-admin (reusing tests/e2e helper
 * creds), seeds the test tenant if missing, then audits three URLs with the
 * Lighthouse mobile preset and default throttling:
 *
 *   1. Marketplace home        http://localhost:4320/
 *   2. Tenant / camp page      http://localhost:4320/camp/<tenantId>
 *   3. Admin dashboard (authed) http://localhost:4320/admin?tenant=marketplace
 *
 * Output: tests/lighthouse/lighthouse-baseline.json + printed summary.
 *
 * Usage:
 *   npx tsx tests/lighthouse/run.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launch as launchChrome } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { pageFunctions } from 'lighthouse/core/lib/page-functions.js';
import {
  apiRequest,
  createTestTenant,
  createTestTenantAdmin,
  seedTestData,
  superAdminLogin,
} from '../e2e/utils/api-helpers';
import { SUPER_ADMIN, TEST_TENANT } from '../e2e/fixtures/test-data';

// tsx loads lighthouse's .js through esbuild with `keepNames: true`, which rewrites
// page functions to call a `__name(...)` helper. In an unbundled env that helper is
// never injected by lighthouse (isBundledEnvironment() -> false), so the injected
// eval dies with `ReferenceError: __name is not defined`. Re-create the esbuild
// helper in the eval preamble. execution-context.js reads this property live, so
// patching the imported object before the first lighthouse() call is enough.
if (!pageFunctions.esbuildFunctionWrapperString) {
  pageFunctions.esbuildFunctionWrapperString =
    'var __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });';
}

const BASE_URL = (process.env.LIGHTHOUSE_BASE_URL || 'http://localhost:4320').replace(/\/$/, '');
const DEBUG_PORT = Number(process.env.LIGHTHOUSE_CHROME_PORT || 9222);
const LIGHTHOUSE_TARGETS = { cls: 0.1, lcpMs: 2500, tbtMs: 300, enforced: false };

const OUT_DIR = join(fileURLToPath(new URL('.', import.meta.url)));
const OUT_FILE = join(OUT_DIR, 'lighthouse-baseline.json');

async function checkReachable(url: string, label: string): Promise<void> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(
      `\n✖ ${label} at ${url} is NOT reachable (${(err as Error).message}).\n` +
        '  The Lighthouse baseline assumes the dev stack is already running.\n' +
        '  Boot it the same way `npx playwright test` does, then re-run:\n' +
        '    cd backend && npx wrangler dev --port 8787 --local\n' +
        '    cd app && npx astro dev --port 4320 --host\n' +
        '  (or simply: npx playwright test --list  — Playwright boots both webServers.)',
    );
    process.exit(1);
  }
}

/** Ensure the test tenant exists so the camp page audits real content. */
async function ensureSeeded(): Promise<void> {
  try {
    const existing = await apiRequest('GET', `/api/tenants/${TEST_TENANT.id}`);
    if (existing.ok) {
      console.log('  ✓ Test tenant already present, skipping seed');
      return;
    }
    console.log('  Seeding test tenant + admin + camps/products…');
    await superAdminLogin();
    await createTestTenant();
    await createTestTenantAdmin();
    await seedTestData();
    console.log('  ✓ Seeded');
  } catch (err) {
    console.warn('  ⚠ Seed failed (camp page may audit an empty/404 state):', (err as Error).message);
  }
}

/** Log the super admin into the admin SPA and return the logged-in URL. */
async function loginAdmin(url: string): Promise<string> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  try {
    // E2E gotcha: use domcontentloaded — some asset URLs are dead on localhost.
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="login-email"]').fill(SUPER_ADMIN.email);
    await page.locator('[data-testid="login-password"]').fill(SUPER_ADMIN.password);
    await page.locator('[data-testid="login-submit"]').click();
    await page.locator('[data-testid="content-area"]').waitFor({ state: 'visible', timeout: 30_000 });
    console.log('  ✓ Admin dashboard loaded (authed)');
    return page.url();
  } finally {
    await page.close();
    await browser.close();
  }
}

type CategoryScores = Record<string, number | null>;
interface UrlResult {
  url: string;
  scores: CategoryScores;
  metrics: { cls: number | null; lcpMs: number | null; tbtMs: number | null };
}

async function auditUrl(url: string, port: number): Promise<UrlResult> {
  console.log(`\nAuditing ${url} …`);
  const result = await lighthouse(url, {
    port,
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    logLevel: 'error',
  } as never);

  if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
  const lhr = result.lhr;
  const score = (id: string) =>
    lhr.categories[id]?.score == null ? null : Math.round(lhr.categories[id].score! * 100);

  const metric = (id: string): number | null => {
    const a = lhr.audits[id];
    if (!a || typeof a.numericValue !== 'number') return null;
    return Math.round(a.numericValue);
  };

  return {
    url,
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      'best-practices': score('best-practices'),
      seo: score('seo'),
    },
    metrics: {
      cls: metric('cumulative-layout-shift'),
      lcpMs: metric('largest-contentful-paint'),
      tbtMs: metric('total-blocking-time'),
    },
  };
}

async function main(): Promise<void> {
  console.log(`Lighthouse baseline — target ${BASE_URL} (mobile preset, default throttling)\n`);

  await checkReachable(`${BASE_URL}/`, 'Frontend');
  await checkReachable(`http://localhost:8787/api/tenants`, 'Backend');

  await ensureSeeded();

  const adminUrl = `${BASE_URL}/admin?tenant=marketplace`;
  const campUrl = `${BASE_URL}/camp/${TEST_TENANT.id}`;
  const urlsToAudit = [adminUrl, campUrl, `${BASE_URL}/`];

  let launcher: Awaited<ReturnType<typeof launchChrome>> | undefined;
  try {
    console.log('\nLaunching Chromium with remote debugging…');
    launcher = await launchChrome({
      port: DEBUG_PORT,
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    console.log(`  Chrome on port ${launcher.port}`);

    await loginAdmin(adminUrl);

    const results: Record<string, UrlResult> = {};
    for (const url of urlsToAudit) {
      results[url] = await auditUrl(url, launcher.port);
    }

    const baseline = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      preset: 'mobile',
      throttling: 'default (Lighthouse simulated Slow 4G + 4x CPU)',
      targets: LIGHTHOUSE_TARGETS,
      note: 'Dev/preview server baseline (astro dev + wrangler dev --local). Not enforced this pass.',
      results,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2));
    console.log(`\n✓ Wrote ${OUT_FILE}`);

    console.log('\n=================== Lighthouse Summary ===================');
    console.log(
      'URL'.padEnd(52) +
        'Perf'.padStart(5) +
        'A11y'.padStart(5) +
        'BP'.padStart(5) +
        'SEO'.padStart(5) +
        'CLS'.padStart(8) +
        'LCP(s)'.padStart(8) +
        'TBT(ms)'.padStart(9),
    );
    for (const r of Object.values(results)) {
      console.log(
        r.url.padEnd(52) +
          String(r.scores.performance ?? '-').padStart(5) +
          String(r.scores.accessibility ?? '-').padStart(5) +
          String(r.scores['best-practices'] ?? '-').padStart(5) +
          String(r.scores.seo ?? '-').padStart(5) +
          (r.metrics.cls == null ? '-'.padStart(8) : r.metrics.cls.toFixed(3).padStart(8)) +
          (r.metrics.lcpMs == null ? '-'.padStart(8) : (r.metrics.lcpMs / 1000).toFixed(2).padStart(8)) +
          (r.metrics.tbtMs == null ? '-'.padStart(9) : String(r.metrics.tbtMs).padStart(9)),
      );
    }
    console.log('===========================================================');
    console.log(`\nTargets (flags only, NOT enforced): CLS < 0.1, LCP < 2.5s, TBT < 300ms\n`);
  } finally {
    if (launcher) await launcher.kill();
  }
}

main().catch((err) => {
  console.error('Lighthouse run failed:', err);
  process.exit(1);
});
