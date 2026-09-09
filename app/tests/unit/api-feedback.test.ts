import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiModule from '@/lib/api';

// Same widening pattern as api-bulk.test.ts — fixture payloads are loose.
const api = apiModule as unknown as Record<string, (...args: any[]) => any>;

global.fetch = vi.fn();

function setTestHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin: `https://${hostname}`, search: '' },
    writable: true,
  });
}

function mockFetch(jsonResponse: unknown, ok = true, contentType = 'application/json') {
  setTestHostname('test.sinaicamps.com');
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(jsonResponse),
    blob: () => Promise.resolve(new Blob([JSON.stringify(jsonResponse)], { type: 'text/csv' })),
    headers: { get: () => contentType },
  } as unknown as Response);
}

const RESULT = { ok: true };

beforeEach(() => {
  mockFetch(RESULT);
});

async function expectFetchBody(fn: () => unknown, urlPart: string, method: string, bodyPart?: string) {
  const promise = fn() as Promise<unknown>;
  await expect(promise).resolves.toEqual(RESULT);
  const [url, init] = vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1];
  expect(String(url)).toContain(urlPart);
  expect((init as RequestInit)?.method ?? 'GET').toBe(method);
  if (bodyPart) {
    expect(String((init as RequestInit)?.body)).toContain(bodyPart);
  }
}

describe('api.ts — feedback (human-testing debug reports)', () => {
  it('submitFeedback posts camelCase body to /feedback', async () => {
    await expectFetchBody(
      () => api.submitFeedback({
        category: 'bug',
        message: 'Save button does nothing',
        pageUrl: 'https://acaciacamp.com/admin/bookings',
        authorType: 'admin',
        authorName: 'Test Admin',
      }),
      '/api/v1/feedback', 'POST', '"category":"bug"',
    );
  });

  it('getFeedbackList hits /admin/feedback and omits empty params', async () => {
    await expectFetchBody(() => api.getFeedbackList(), '/api/v1/admin/feedback', 'GET');
    await expectFetchBody(
      () => api.getFeedbackList({ status: 'open', authorType: 'public', page: 1, pageSize: 25 }),
      '/api/v1/admin/feedback?status=open&authorType=public&page=1&pageSize=25', 'GET',
    );
  });

  it('getFeedback loads the full detail incl. screenshot', async () => {
    await expectFetchBody(() => api.getFeedback('fb_1'), '/api/v1/admin/feedback/fb_1', 'GET');
  });

  it('updateFeedbackStatus PATCHes the status', async () => {
    await expectFetchBody(
      () => api.updateFeedbackStatus('fb_1', 'resolved'),
      '/api/v1/admin/feedback/fb_1', 'PATCH', '"status":"resolved"',
    );
  });
});