import { jsonResponse, errorResponse } from '../utils/response';
import { Hono } from 'hono';
import { getScope } from '../middleware/resolveScope.js';

// Max uploaded image size: 8 MB (matches the wizard's client-side limit).
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// Extension allowlist — only raster image formats are accepted.
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

/**
 * Returns the lowercase extension of `filename` when it is on the allowlist,
 * otherwise null. `filename` is the multipart file name or the ?filename=
 * query param of a raw octet-stream upload.
 */
export function allowedExt(filename) {
  if (typeof filename !== 'string' || !filename) return null;
  const idx = filename.lastIndexOf('.');
  if (idx < 0 || idx === filename.length - 1) return null;
  const ext = filename.slice(idx + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : null;
}

/**
 * Media object key: media/{tenantId}/{uuid}.{ext}. The tenantId prefix keeps
 * every object tenant-scoped so the public GET route can never serve another
 * tenant's media and the key itself is never attacker-controlled.
 */
export function makeObjectKey(tenantId, ext) {
  const id = crypto.randomUUID();
  return `media/${tenantId}/${id}.${ext}`;
}

/**
 * Rejects any raw key that is not a well-formed media object key:
 *  - must start with `media/` (already enforced by the route prefix, kept here
 *    so the helper is standalone-safe),
 *  - must NOT contain `..` (path traversal — a decoded `%2e%2e` collapses to
 *    `..` and is rejected by the same check),
 *  - must NOT contain a null byte,
 *  - must match the {media}/{tenantId}/{uuid}.{ext} shape (tenantId + UUID are
 *    both token-only, so no separators/slashes can hide in them).
 */
export function sanitizeMediaKey(rawKey) {
  if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
  if (rawKey.includes('\0')) return null;
  if (rawKey.includes('..')) return null;
  if (!rawKey.startsWith('media/')) return null;
  if (!/^media\/[A-Za-z0-9_-]+\/[A-Fa-f0-9-]{36}\.(jpg|jpeg|png|webp|gif)$/.test(rawKey)) {
    return null;
  }
  return rawKey;
}

/**
 * POST /api/upload — authenticated, tenant-scoped image upload to R2.
 *
 * Auth is enforced by the catch-all dispatcher in index.js (this handler runs
 * AFTER tenant resolution + JWT verification + tenant-partition check).
 *
 * Body: `multipart/form-data` with a `file` field (preferred), OR a raw
 * `application/octet-stream` body with the original filename in `?filename=`.
 *
 * Validation: content type must start with `image/`, size ≤ 8 MB (File.size
 * for multipart, buffered byte length for raw), extension on the allowlist.
 *
 * Returns camelCase `{ url }` where url = `/api/media/{key}` (streamed by
 * handleMediaRoute).
 */
const uploadRoutes = new Hono();

uploadRoutes.post('/', async (c) => {
  const request = c.req.raw;
  const env = c.env;
  const tenantId = getScope(c).tenantId;
  const url = new URL(request.url);
  if (!env.MEDIA_BUCKET) return errorResponse('Media storage is not configured', 503);

  const contentType = (request.headers.get('content-type') || '').toLowerCase();

  let body;
  let filename;
  let declaredContentType;

  if (contentType.startsWith('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return errorResponse('No file field in form-data', 400);
    if (file.size > MAX_UPLOAD_BYTES) return errorResponse('File exceeds the 8 MB limit', 413);
    body = file;
    filename = file.name;
    declaredContentType = (file.type || '').toLowerCase();
  } else {
    // Raw octet-stream upload: ?filename= carries the original file name.
    filename = url.searchParams.get('filename');
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_UPLOAD_BYTES) return errorResponse('File exceeds the 8 MB limit', 413);
    body = raw;
    declaredContentType = contentType || 'application/octet-stream';
  }

  const ext = allowedExt(filename);
  if (!ext) return errorResponse('Unsupported file type: allowed extensions are jpg, jpeg, png, webp, gif', 400);

  if (!declaredContentType.startsWith('image/')) {
    return errorResponse('Only image uploads are allowed', 400);
  }

  const key = makeObjectKey(tenantId, ext);
  await env.MEDIA_BUCKET.put(key, body, { httpMetadata: { contentType: declaredContentType } });

  return jsonResponse({ url: `/api/media/${key}` }, 200);
});

uploadRoutes.all('*', () => errorResponse('Method not allowed', 405));

export default uploadRoutes;

/**
 * GET /api/media/* — PUBLIC stream of a stored media object.
 *
 * The key is extracted from the URL path after `/api/media/`, percent-decoded
 * ONCE and sanitized (see sanitizeMediaKey) so `..`, `%2e%2e` and null bytes
 * can never reach the R2 lookup. Missing objects and malformed keys both return
 * 404. NO CORS headers here — hono/cors in index.js is the single source.
 */
export const mediaRoutes = new Hono();

mediaRoutes.on(['GET', 'HEAD'], '*', async (c) => {
  const request = c.req.raw;
  const env = c.env;
  const pathname = new URL(request.url).pathname;
  let rawKey;
  try {
    rawKey = decodeURIComponent(pathname.slice('/api/media/'.length));
  } catch {
    return errorResponse('Not found', 404);
  }

  const key = sanitizeMediaKey(rawKey);
  if (!key) return errorResponse('Not found', 404);

  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return errorResponse('Not found', 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

mediaRoutes.all('*', () => errorResponse('Not found', 404));
