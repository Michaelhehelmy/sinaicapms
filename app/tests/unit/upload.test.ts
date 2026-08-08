import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { upload } from '@/lib/api';

global.fetch = vi.fn();

function setTestHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin: `https://${hostname}`, search: '' },
    writable: true,
  });
}

function mockUploadFetch(ok: boolean, status: number, contentType: string, body: unknown) {
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status,
    json: () =>
      contentType.includes('application/json')
        ? Promise.resolve(body)
        : Promise.reject(new Error('body is not JSON')),
    headers: { get: () => contentType },
  } as unknown as Response);
}

function makeFile(name = 'photo.png', type = 'image/png'): File {
  return new File([new ArrayBuffer(1024)], name, { type });
}

describe('upload', () => {
  beforeEach(() => {
    localStorage.clear();
    setTestHostname('localhost');
    vi.mocked(fetch).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the file as multipart FormData and resolves with the upload response', async () => {
    localStorage.setItem('sinaicamps_tenant_id', 'tenant_3');
    localStorage.setItem('sinaicamps_token', 'jwt-token');
    mockUploadFetch(true, 200, 'application/json', { url: 'https://cdn.example.com/a.png' });

    const file = makeFile();
    await expect(upload(file)).resolves.toEqual({ url: 'https://cdn.example.com/a.png' });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/upload')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
    expect(init.headers).toEqual({
      'x-tenant-id': 'tenant_3',
      Authorization: 'Bearer jwt-token',
    });
  });

  it('omits tenant and auth headers when neither is available', async () => {
    mockUploadFetch(true, 200, 'application/json', { url: 'https://cdn.example.com/a.png' });

    await expect(upload(makeFile())).resolves.toEqual({ url: 'https://cdn.example.com/a.png' });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({});
  });

  it('throws the server error field for JSON error responses', async () => {
    mockUploadFetch(false, 403, 'application/json', { error: 'Upload forbidden' });

    await expect(upload(makeFile())).rejects.toThrow('Upload forbidden');
  });

  it('falls back to the message field when error is missing', async () => {
    mockUploadFetch(false, 422, 'application/json', { message: 'Too large' });

    await expect(upload(makeFile())).rejects.toThrow('Too large');
  });

  it('falls back to a status-based message when neither error nor message exists', async () => {
    mockUploadFetch(false, 400, 'application/json', { ok: false });

    await expect(upload(makeFile())).rejects.toThrow('API error: 400');
  });

  it('falls back to a status-based message when the error body is not parseable JSON', async () => {
    mockUploadFetch(false, 500, 'application/json', null);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('boom')),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await expect(upload(makeFile())).rejects.toThrow('API error: 500');
  });

  it('throws a server error for non-JSON error responses', async () => {
    mockUploadFetch(false, 502, 'text/html', '<html>Bad Gateway</html>');

    await expect(upload(makeFile())).rejects.toThrow('Server error (502): non-JSON response');
  });

  it('throws a server error when the content-type header is missing', async () => {
    mockUploadFetch(false, 500, '', 'oops');

    await expect(upload(makeFile())).rejects.toThrow('Server error (500): non-JSON response');
  });
});
