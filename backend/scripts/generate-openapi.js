/**
 * Regenerates backend/openapi.json from the route registry (source of truth).
 * Run: npm run gen:openapi  (in backend/)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildOpenApiDocument } from '../src/routes/registry.js';

const doc = buildOpenApiDocument();
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
const pathCount = Object.keys(doc.paths || {}).length;
console.log(`Wrote ${outPath} (${pathCount} paths, ${Object.keys(doc.components?.schemas || {}).length} schemas)`);
