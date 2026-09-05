/**
 * Global teardown for Playwright E2E coverage.
 *
 * Runs after all tests complete. Merges per-worker raw JSONL coverage files
 * into a single Istanbul-format `coverage/e2e-coverage.json` and generates
 * an HTML summary report under `coverage/html/`.
 *
 * This is a no-op when no raw coverage data exists (i.e. when COVERAGE_ENABLED
 * was not set during the run).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createCoverageMap, type CoverageMap } from 'istanbul-lib-coverage';

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'coverage', 'raw');
const OUTPUT_DIR = path.join(ROOT, 'coverage');

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(RAW_DIR)) {
    // No raw data — coverage was not collected. Silently return.
    return;
  }

  const jsonlFiles = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) {
    fs.rmSync(RAW_DIR, { recursive: true, force: true });
    return;
  }

  console.log(`\n📊 E2E Coverage: merging ${jsonlFiles.length} worker file(s)...`);

  // ---------- merge all JSONL entries into one CoverageMap ----------
  const map: CoverageMap = createCoverageMap({});

  for (const file of jsonlFiles) {
    const lines = fs
      .readFileSync(path.join(RAW_DIR, file), 'utf8')
      .split('\n')
      .filter(Boolean);

    for (const line of lines) {
      try {
        map.merge(JSON.parse(line));
      } catch {
        // Skip malformed lines.
      }
    }
  }

  // ---------- write merged JSON ----------
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'e2e-coverage.json');
  fs.writeFileSync(jsonPath, JSON.stringify(map.toJSON(), null, 2), 'utf8');

  // ---------- generate HTML report ----------
  try {
    const istanbulReport = require('istanbul-reports');
    const istanbulLibReport = require('istanbul-lib-report');

    const htmlDir = path.join(OUTPUT_DIR, 'html');
    const context = istanbulLibReport.createContext({
      dir: htmlDir,
      coverageMap: map,
      defaultSummarizer: 'nested',
      reports: ['html', 'text-summary'],
    });

    istanbulReport.create('html').execute(context);
    istanbulReport.create('text-summary').execute(context);
    console.log(`   HTML report → ${htmlDir}/index.html`);
  } catch (err) {
    console.warn('   ⚠️  HTML report generation skipped:', (err as Error).message);
  }

  // ---------- print per-file summary ----------
  const files = map.files();
  console.log(`   ${files.length} file(s) covered.\n`);

  const summary: Array<{ file: string; stmts: string; fns: string; branches: string }> = [];
  for (const filePath of files) {
    const fc = map.fileCoverageFor(filePath);
    const s = fc.s;
    const f = fc.f;
    const b = fc.b;

    const totalS = Object.keys(s).length;
    const hitS = Object.values(s).filter((v) => v > 0).length;

    const totalF = Object.keys(f).length;
    const hitF = Object.values(f).filter((v) => v > 0).length;

    let totalB = 0;
    let hitB = 0;
    for (const branches of Object.values(b)) {
      totalB += branches.length;
      hitB += branches.filter((v) => v > 0).length;
    }

    summary.push({
      file: filePath,
      stmts: totalS ? `${((hitS / totalS) * 100).toFixed(1)}%` : '—',
      fns: totalF ? `${((hitF / totalF) * 100).toFixed(1)}%` : '—',
      branches: totalB ? `${((hitB / totalB) * 100).toFixed(1)}%` : '—',
    });
  }

  // Sort by file path for readability.
  summary.sort((a, b) => a.file.localeCompare(b.file));

  console.log('   File                          Stmts     Fns      Branches');
  console.log('   ' + '─'.repeat(62));
  for (const row of summary) {
    const name = row.file.length > 30 ? '…' + row.file.slice(-29) : row.file.padEnd(30);
    console.log(
      `   ${name}  ${row.stmts.padEnd(8)} ${row.fns.padEnd(8)} ${row.branches}`,
    );
  }

  // ---------- clean up raw files ----------
  fs.rmSync(RAW_DIR, { recursive: true, force: true });

  console.log(`\n✅ Coverage report → ${jsonPath}\n`);
}
