function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/**
 * Deep-convert object keys to camelCase (keys only — values are never touched).
 * Idempotent: already-camelCase keys pass through unchanged.
 * Recurses into arrays and plain objects; leaves Date/etc. and primitives untouched.
 */
export function toCamel(obj) {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (!isPlainObject(obj)) return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    out[camelKey] = toCamel(obj[key]);
  }
  return out;
}

/**
 * Deep-convert object keys to snake_case (keys only — values are never touched).
 * Idempotent: already-snake_case keys pass through unchanged.
 * Recurses into arrays and plain objects; leaves Date/etc. and primitives untouched.
 */
export function toSnake(obj) {
  if (Array.isArray(obj)) return obj.map(toSnake);
  if (!isPlainObject(obj)) return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    out[snakeKey] = toSnake(obj[key]);
  }
  return out;
}

export function jsonResponse(data, status = 200) {
  // NOTE: CORS headers are handled by hono/cors in index.js.
  // Do NOT duplicate them here — a wildcard origin here would bypass the restrictive CORS policy.
  return new Response(JSON.stringify(toCamel(data)), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      // L4 fix: Removed deprecated X-XSS-Protection header
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
    }
  });
}

/**
 * JSON response with Cache-Control for public read-heavy endpoints.
 * Use for: tenants list, camps, products, availability, rateplans, categories, meals, plans.
 * @param {any} data
 * @param {number} maxAge - Cache max-age in seconds (default 300 = 5 min)
 * @param {number} status
 */
export function cachedJsonResponse(data, maxAge = 300, status = 200) {
  return new Response(JSON.stringify(toCamel(data)), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
    }
  });
}

/**
 * Error envelope: { success: false, error, errors? }.
 * `errors` is an optional structured array (e.g. Zod field errors [{ field, message }])
 * appended to the envelope only when provided — 2-arg call sites are unchanged.
 * jsonResponse applies toCamel; `errors` items use single-word keys so they pass through.
 */
export function errorResponse(message, status = 400, errors = undefined) {
  return jsonResponse({ success: false, error: message, ...(errors ? { errors } : {}) }, status);
}

/**
 * Success envelope: the data payload itself (Phase 3 contract normalization).
 * Thin wrapper over jsonResponse — exists so success call sites read distinctly
 * from raw `jsonResponse` and can be grepped/audited as one family.
 */
export function ok(data, status = 200) {
  return jsonResponse(data, status);
}

/**
 * Created envelope: { success: true, id } with HTTP 201.
 * Standard shape for POST-create endpoints.
 */
export function created(id, status = 201) {
  return jsonResponse({ success: true, id }, status);
}

export function escHtml(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
