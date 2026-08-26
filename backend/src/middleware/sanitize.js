/**
 * XSS Sanitization Middleware (defense-in-depth).
 *
 * Strips <script> tags and on* event handler attributes from string fields
 * in POST/PUT/PATCH request bodies before they reach route handlers.
 *
 * React auto-escapes JSX at render time, so this is a belt-and-suspenders
 * defense against stored XSS if:
 *   - A future non-React consumer renders raw data
 *   - Admin tools or webhooks copy data between tenants
 *   - Data is rendered in email templates or notification systems
 *
 * Philosophy: sanitize at the storage boundary (API layer), not at render
 * time. This ensures ALL consumers of the data get clean values.
 */

/**
 * Strip <script>...</script> tags (case-insensitive, with attributes).
 * Handles: <script>, <script type="text/javascript">, <SCRIPT>, etc.
 */
function stripScriptTags(str) {
  return str.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

/**
 * Strip on* event handler attributes from HTML tags.
 * Matches: onclick=, onerror=, onload=, onmouseover=, etc.
 * Handles both single and double quoted values.
 */
function stripEventHandlers(str) {
  return str.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

/**
 * Strip javascript: and vbscript: protocol handlers from href/src attributes.
 */
function stripScriptUrls(str) {
  return str.replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');
}

/**
 * Sanitize a single string value — strips dangerous HTML constructs.
 * Returns non-string values unchanged.
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let result = str;
  result = stripScriptTags(result);
  result = stripEventHandlers(result);
  result = stripScriptUrls(result);
  return result;
}

/**
 * Deep-sanitize all string values in an object or array.
 * Recurses into nested objects and arrays.
 */
export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const out = {};
    for (const key of Object.keys(obj)) {
      out[key] = sanitizeObject(obj[key]);
    }
    return out;
  }
  return obj;
}

/**
 * Hono middleware that sanitizes request body string fields.
 * Only runs on POST, PUT, PATCH methods (state-changing requests).
 */
export function sanitizeInput() {
  return async (c, next) => {
    const method = c.req.method;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        const contentType = c.req.header('content-type') || '';
        if (contentType.includes('application/json')) {
          const cloned = c.req.raw.clone();
          const body = await cloned.json();
          const sanitized = sanitizeObject(body);
          // Re-create the request with sanitized body
          c.req = new Request(c.req.raw, {
            method: c.req.raw.method,
            headers: c.req.raw.headers,
            body: JSON.stringify(sanitized),
          });
        }
      } catch {
        // If body parsing fails (e.g., no body, non-JSON), skip sanitization.
        // Route handlers will handle their own validation.
      }
    }
    await next();
  };
}
