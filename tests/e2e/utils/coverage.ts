/**
 * E2E V8 Coverage Collection Utilities
 *
 * Uses Playwright's Chromium-only `page.coverage` API to capture V8 script
 * coverage, then converts each entry to Istanbul format via `v8-to-istanbul`.
 * Raw per-worker data is appended as JSONL to `coverage/raw/<workerKey>.jsonl`
 * for later merging in global-teardown.
 */

import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const v8ToIstanbul = require('v8-to-istanbul');

const RAW_DIR = path.resolve(process.cwd(), 'coverage', 'raw');

/** URLs matching this pattern are considered app source (Astro dev server). */
const APP_URL_RE = /^http:\/\/localhost:\d+\/.*/;

/** URLs matching any of these are excluded from coverage collection. */
const EXCLUDE_RE = [
  /node_modules/,
  /\.map$/,
  /\.css(\?|$)/,
  /\.png(\?|$)/,
  /\.jpg(\?|$)/,
  /\.svg(\?|$)/,
  /\.woff2?(\?|$)/,
  /\.ttf(\?|$)/,
  /\.ico(\?|$)/,
  /favicon/,
  /@vite\/client/,
  /__vite_ping/,
  /__open-in-editor/,
  // V8 / Vitest / Playwright test-infrastructure scripts (not app code)
  /@id\/astro:scripts\//,
  /\/__vitest/,
  /\/@vitest/,
  // Playwright internal pages
  /playwright\.dev/,
];

/**
 * Start V8 JavaScript coverage on the given page.
 * No-op if the page is not Chromium.
 */
export async function startCoverage(page: import('@playwright/test').Page): Promise<void> {
  const browser = page.context().browser();
  if (!browser || browser.browserType().name() !== 'chromium') return;
  await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
}

/**
 * Stop V8 coverage, filter to app source, convert to Istanbul format via
 * v8-to-istanbul, and append to the worker's raw JSONL file.
 */
export async function collectCoverage(
  page: import('@playwright/test').Page,
  workerKey: string,
): Promise<void> {
  const browser = page.context().browser();
  if (!browser || browser.browserType().name() !== 'chromium') return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entries: any[];

  try {
    entries = await page.coverage.stopJSCoverage();
  } catch {
    // Coverage may not be available (e.g. page already closed).
    return;
  }

  // Filter to app source JS only.
  const appEntries = entries.filter((entry) => {
    if (!APP_URL_RE.test(entry.url)) return false;
    if (EXCLUDE_RE.some((re) => re.test(entry.url))) return false;
    // Must be a JS-like resource.
    const pathname = entry.url.split('?')[0];
    return /\.(js|mjs|ts|tsx|jsx|astro)(\?|$)/.test(pathname);
  });

  if (appEntries.length === 0) return;

  // Convert each raw entry to Istanbul format.
  const istanbulChunks: object[] = [];

  for (const entry of appEntries) {
    try {
      // Extract the pathname from the full URL.
      // entry.url looks like "http://localhost:4320/_astro/hoisted.abc.js"
      let scriptPath: string;
      try {
        scriptPath = new URL(entry.url).pathname;
      } catch {
        // Fallback: if URL parsing fails, use the raw path.
        scriptPath = entry.url.split('?')[0];
        if (!scriptPath.startsWith('/')) scriptPath = '/' + scriptPath;
      }

      const converter = v8ToIstanbul(scriptPath, 0, { source: entry.source || '' });
      await converter.load();
      converter.applyCoverage(entry.functions);
      const istanbulData = converter.toIstanbul();
      if (istanbulData && Object.keys(istanbulData).length > 0) {
        istanbulChunks.push(istanbulData);
      }
    } catch {
      // Skip entries that can't be converted (e.g. source map issues).
    }
  }

  if (istanbulChunks.length === 0) return;

  // Append to worker's raw JSONL file.
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const rawFile = path.join(RAW_DIR, `${workerKey}.jsonl`);
  const lines = istanbulChunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n';
  fs.appendFileSync(rawFile, lines, 'utf8');
}
