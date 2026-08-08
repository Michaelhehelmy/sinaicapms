import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleUploadRoute,
  handleMediaRoute,
  makeObjectKey,
  allowedExt,
  sanitizeMediaKey,
  MAX_UPLOAD_BYTES,
} from '../src/api/upload.js';

function makeRequest(method, path, opts = {}) {
  const { body, headers = {}, filename } = opts;
  const url = new URL(`https://sinaicamps.com${path}`);
  if (filename) url.searchParams.set('filename', filename);
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : body,
  });
}

function makeBucketSpy() {
  const bucket = {
    put: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
  };
  return bucket;
}

describe('makeObjectKey', () => {
  it('prefixes with media/ and embeds the tenant id', () => {
    const key = makeObjectKey('tenant_42', 'png');
    expect(key.startsWith('media/tenant_42/')).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
  });

  it('produces a UUID filename (36-char token)', () => {
    const key = makeObjectKey('t1', 'jpg');
    const name = key.slice('media/t1/'.length, -'.jpg'.length);
    expect(name).toMatch(/^[A-Fa-f0-9-]{36}$/);
  });

  it('produces unique keys per call', () => {
    expect(makeObjectKey('t1', 'jpg')).not.toBe(makeObjectKey('t1', 'jpg'));
  });
});

describe('allowedExt', () => {
  it.each(['jpg', 'jpeg', 'png', 'webp', 'gif'])('accepts .%s', (ext) => {
    expect(allowedExt(`photo.${ext}`)).toBe(ext);
  });

  it('is case-insensitive and normalizes to lowercase', () => {
    expect(allowedExt('PHOTO.JPG')).toBe('jpg');
    expect(allowedExt('Photo.PNG')).toBe('png');
  });

  it.each(['photo.svg', 'photo.bmp', 'photo.tiff', 'photo.pdf', 'photo.heic', 'photo.mp4'])(
    'rejects %s',
    (name) => {
      expect(allowedExt(name)).toBeNull();
    }
  );

  it('rejects names without a dot, empty, or non-strings', () => {
    expect(allowedExt('photo')).toBeNull();
    expect(allowedExt('')).toBeNull();
    expect(allowedExt(null)).toBeNull();
    expect(allowedExt(undefined)).toBeNull();
    expect(allowedExt(42)).toBeNull();
  });
});

describe('sanitizeMediaKey', () => {
  it('accepts a well-formed media key', () => {
    expect(sanitizeMediaKey('media/tenant_1/11111111-2222-3333-4444-555555555555.png')).toBe(
      'media/tenant_1/11111111-2222-3333-4444-555555555555.png'
    );
  });

  it('rejects path traversal ("..") and its percent-encoded forms', () => {
    expect(sanitizeMediaKey('media/tenant_1/../secret')).toBeNull();
    expect(sanitizeMediaKey('media/tenant_1/..%2fsecret')).toBeNull();
    expect(sanitizeMediaKey('media/tenant_1/%2e%2e/secret')).toBeNull();
    expect(sanitizeMediaKey('media/../x.jpg')).toBeNull();
  });

  it('rejects keys that do not start with media/', () => {
    expect(sanitizeMediaKey('foo/tenant_1/11111111-2222-3333-4444-555555555555.png')).toBeNull();
    expect(sanitizeMediaKey('/media/tenant_1/11111111-2222-3333-4444-555555555555.png')).toBeNull();
  });

  it('rejects null bytes', () => {
    expect(sanitizeMediaKey('media/tenant_1/a\0b.png')).toBeNull();
  });

  it('rejects malformed shapes (bad tenant, non-UUID, bad ext, extra segments)', () => {
    expect(sanitizeMediaKey('media/tenant 1/11111111-2222-3333-4444-555555555555.png')).toBeNull();
    expect(sanitizeMediaKey('media/tenant_1/not-a-uuid.png')).toBeNull();
    expect(sanitizeMediaKey('media/tenant_1/11111111-2222-3333-4444-555555555555.svg')).toBeNull();
    expect(sanitizeMediaKey('media/tenant_1/a/b.png')).toBeNull();
  });

  it('rejects empty and non-string input', () => {
    expect(sanitizeMediaKey('')).toBeNull();
    expect(sanitizeMediaKey(null)).toBeNull();
    expect(sanitizeMediaKey(undefined)).toBeNull();
  });
});

describe('handleUploadRoute — POST /api/upload', () => {
  const tenantId = 'tenant_1';

  it('returns 405 for non-POST methods', async () => {
    const env = { MEDIA_BUCKET: makeBucketSpy() };
    const res = await handleUploadRoute(makeRequest('GET', '/api/upload'), env, tenantId);
    expect(res.status).toBe(405);
  });

  it('returns 503 when MEDIA_BUCKET is not configured', async () => {
    const env = {};
    const res = await handleUploadRoute(
      makeRequest('POST', '/api/upload', { filename: 'photo.jpg' }),
      env,
      tenantId
    );
    expect(res.status).toBe(503);
  });

  it('uploads a multipart image and returns a tenant-scoped media url', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const formData = new FormData();
    formData.append('file', new File(['fake-image-bytes'], 'photo.png', { type: 'image/png' }));
    const res = await handleUploadRoute(makeRequest('POST', '/api/upload', { body: formData }), env, tenantId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^\/api\/media\/media\/tenant_1\/[A-Fa-f0-9-]{36}\.png$/);
    expect(bucket.put).toHaveBeenCalledTimes(1);
    const [key, file, opts] = bucket.put.mock.calls[0];
    expect(key).toMatch(/^media\/tenant_1\//);
    expect(opts.httpMetadata.contentType).toBe('image/png');
    expect(file.size).toBe('fake-image-bytes'.length);
  });

  it('uploads a raw octet-stream body with ?filename= and preserves the content type', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleUploadRoute(
      makeRequest('POST', '/api/upload', {
        body: new ArrayBuffer(5),
        headers: { 'Content-Type': 'image/webp' },
        filename: 'photo.webp',
      }),
      env,
      tenantId
    );
    expect(res.status).toBe(200);
    expect(bucket.put).toHaveBeenCalledTimes(1);
    const [, raw, opts] = bucket.put.mock.calls[0];
    expect(raw.byteLength).toBe(5);
    expect(opts.httpMetadata.contentType).toBe('image/webp');
  });

  it('returns 400 when a multipart upload has no file field', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const formData = new FormData();
    formData.append('other', 'x');
    const res = await handleUploadRoute(makeRequest('POST', '/api/upload', { body: formData }), env, tenantId);
    expect(res.status).toBe(400);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('returns 413 when a multipart file exceeds 8 MB', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const formData = new FormData();
    const big = new File([new ArrayBuffer(MAX_UPLOAD_BYTES + 1)], 'big.png', { type: 'image/png' });
    formData.append('file', big);
    const res = await handleUploadRoute(makeRequest('POST', '/api/upload', { body: formData }), env, tenantId);
    expect(res.status).toBe(413);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('returns 413 when a raw body exceeds 8 MB', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleUploadRoute(
      makeRequest('POST', '/api/upload', {
        body: new ArrayBuffer(MAX_UPLOAD_BYTES + 1),
        headers: { 'Content-Type': 'application/octet-stream' },
        filename: 'big.jpg',
      }),
      env,
      tenantId
    );
    expect(res.status).toBe(413);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('returns 400 for an extension outside the allowlist', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleUploadRoute(
      makeRequest('POST', '/api/upload', {
        body: new ArrayBuffer(3),
        headers: { 'Content-Type': 'image/svg+xml' },
        filename: 'icon.svg',
      }),
      env,
      tenantId
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unsupported file type');
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('returns 400 when the declared content type is not an image', async () => {
    const bucket = makeBucketSpy();
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleUploadRoute(
      makeRequest('POST', '/api/upload', {
        body: new ArrayBuffer(3),
        headers: { 'Content-Type': 'application/pdf' },
        filename: 'doc.jpg',
      }),
      env,
      tenantId
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Only image uploads are allowed');
    expect(bucket.put).not.toHaveBeenCalled();
  });
});

describe('handleMediaRoute — GET /api/media/*', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('streams a stored object with immutable cache headers and no CORS headers', async () => {
    const object = {
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }),
      httpMetadata: { contentType: 'image/jpeg' },
    };
    const bucket = { get: vi.fn().mockResolvedValue(object) };
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleMediaRoute(
      makeRequest('GET', '/api/media/media/tenant_1/11111111-2222-3333-4444-555555555555.jpg'),
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(bucket.get).toHaveBeenCalledWith('media/tenant_1/11111111-2222-3333-4444-555555555555.jpg');
    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBe(3);
  });

  it('returns 404 when the object is missing', async () => {
    const bucket = { get: vi.fn().mockResolvedValue(null) };
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleMediaRoute(
      makeRequest('GET', '/api/media/media/tenant_1/11111111-2222-3333-4444-555555555555.jpg'),
      env
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for path traversal attempts (.. and %2e%2e)', async () => {
    const bucket = { get: vi.fn() };
    const env = { MEDIA_BUCKET: bucket };
    const dotdot = await handleMediaRoute(makeRequest('GET', '/api/media/../../etc/passwd'), env);
    expect(dotdot.status).toBe(404);
    const encoded = await handleMediaRoute(makeRequest('GET', '/api/media/%2e%2e/%2e%2e/x'), env);
    expect(encoded.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('returns 404 for keys outside media/ or malformed', async () => {
    const bucket = { get: vi.fn() };
    const env = { MEDIA_BUCKET: bucket };
    const notMedia = await handleMediaRoute(makeRequest('GET', '/api/media/secret.txt'), env);
    expect(notMedia.status).toBe(404);
    const badShape = await handleMediaRoute(makeRequest('GET', '/api/media/media/t1/not-a-uuid.jpg'), env);
    expect(badShape.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('returns 404 for invalid percent-encoding', async () => {
    const bucket = { get: vi.fn() };
    const env = { MEDIA_BUCKET: bucket };
    const res = await handleMediaRoute(makeRequest('GET', '/api/media/media/%zz'), env);
    expect(res.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });
});
