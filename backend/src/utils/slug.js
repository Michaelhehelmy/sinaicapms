/**
 * Shared slug generator (unified architecture migration).
 *
 * Rules (per schema direction plan):
 *   1. lowercase
 *   2. replace whitespace runs with hyphens
 *   3. strip every character that is not a-z, 0-9 or '-'
 *   4. collapse runs of hyphens left behind by stripped characters
 *   5. trim leading/trailing hyphens
 *
 * Used by tags.js (tag slugs) and camps.js (project slugs — UNIQUE(tenant_id, slug)).
 * Returns '' when the input contains no usable characters — callers must treat
 * an empty result as a validation failure rather than inserting it.
 */
export function slugify(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
