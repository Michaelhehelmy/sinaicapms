import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProjectMeta,
  setProjectMeta,
  updateProjectMeta,
  deleteProjectMeta,
  reorderProjectMeta,
  getTags,
  createTag,
  getProjectTags,
  addProjectTags,
  removeProjectTag,
  getAuditLog,
} from '@/lib/api';

global.fetch = vi.fn();

function setTestHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin: `https://${hostname}`, search: '' },
    writable: true,
  });
}

function mockFetch(jsonResponse: unknown, ok = true) {
  setTestHostname('test.sinaicamps.com');
  localStorage.setItem('sinaicamps_tenant_id', 'test');
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(jsonResponse),
    headers: { get: () => 'application/json' },
  } as Response);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('project meta endpoints', () => {
  it('getProjectMeta GETs /projects/:id/meta and returns the array', async () => {
    const rows = [{ id: 1, projectId: 'p1', metaKey: 'activities', metaValue: 'Hiking' }];
    mockFetch(rows);
    await expect(getProjectMeta('p1')).resolves.toEqual(rows);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/projects/p1/meta');
    expect(String(url)).toMatch(/\/api\/v1\//);
  });

  it('getProjectMeta returns [] when the response is not an array', async () => {
    mockFetch({ unexpected: 'shape' });
    await expect(getProjectMeta('p1')).resolves.toEqual([]);
  });

  it('setProjectMeta POSTs metaKey/metaValue body', async () => {
    mockFetch({ success: true, id: 7 });
    await expect(setProjectMeta('p1', 'activities', 'Hiking')).resolves.toEqual({
      success: true,
      id: 7,
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/projects/p1/meta');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      metaKey: 'activities',
      metaValue: 'Hiking',
    });
  });

  it('updateProjectMeta PUTs metaValue to /projects/:id/meta/:metaId', async () => {
    mockFetch({ success: true });
    await expect(updateProjectMeta('p1', 12, '["Cabin"]')).resolves.toEqual({ success: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/projects/p1/meta/12');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ metaValue: '["Cabin"]' });
  });

  it('deleteProjectMeta DELETEs /projects/:id/meta/:metaId and resolves void', async () => {
    mockFetch({ success: true });
    await expect(deleteProjectMeta('p1', 42)).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/projects/p1/meta/42');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('reorderProjectMeta PATCHes the /reorder path with items payload', async () => {
    mockFetch({ success: true, updated: 2 });
    await expect(
      reorderProjectMeta('p1', [
        { id: 3, sort_order: 0 },
        { id: 4, sort_order: 1 },
      ]),
    ).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/projects/p1/meta/reorder');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      items: [
        { id: 3, sort_order: 0 },
        { id: 4, sort_order: 1 },
      ],
    });
  });

  it('propagates API errors from failed writes', async () => {
    mockFetch({ error: 'Meta not found' }, false);
    await expect(deleteProjectMeta('p1', 999)).rejects.toThrow('Meta not found');
  });
});

describe('tag endpoints', () => {
  it('getTags GETs /tags without params by default', async () => {
    mockFetch([{ id: 'tag_a', name: 'Family' }]);
    await expect(getTags()).resolves.toHaveLength(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/tags$/);
  });

  it('getTags forwards an explicit tenantId as a query param', async () => {
    mockFetch([]);
    await getTags('acacia');
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/tags?tenantId=acacia');
  });

  it('createTag POSTs the display name (slug is server-side)', async () => {
    mockFetch({ id: 'tag_new', success: true });
    await expect(createTag('Romantic')).resolves.toEqual({ id: 'tag_new', success: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/tags$/);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Romantic' });
  });

  it('getProjectTags GETs /projects/:id/tags', async () => {
    mockFetch([{ id: 'tag_a', name: 'Family', slug: 'family' }]);
    await expect(getProjectTags('p1')).resolves.toHaveLength(1);
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/projects/p1/tags');
  });

  it('addProjectTags POSTs tagIds array', async () => {
    mockFetch({ success: true, added: 2, tag_ids: ['a', 'b'] });
    await expect(addProjectTags('p1', ['a', 'b'])).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/projects/p1/tags');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ tagIds: ['a', 'b'] });
  });

  it('removeProjectTag DELETEs /projects/:id/tags/:tagId', async () => {
    mockFetch({ success: true });
    await expect(removeProjectTag('p1', 'tag_x')).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/projects/p1/tags/tag_x');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

describe('audit endpoint', () => {
  it('getAuditLog GETs /audit with no params when empty', async () => {
    mockFetch({ data: [], total: 0, page: 1, pageSize: 50, hasMore: false });
    await getAuditLog();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/audit$/);
  });

  it('getAuditLog forwards entity_type/limit/offset as snake_case query params', async () => {
    mockFetch({ data: [], total: 0, page: 2, pageSize: 10, hasMore: false });
    await getAuditLog({ entity_type: 'project', limit: 10, offset: 10 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const qs = String(url);
    expect(qs).toContain('/audit?');
    expect(qs).toContain('entity_type=project');
    expect(qs).toContain('limit=10');
    expect(qs).toContain('offset=10');
  });

  it('getAuditLog omits unset params', async () => {
    mockFetch({ data: [], total: 0, page: 1, pageSize: 50, hasMore: false });
    await getAuditLog({ entity_type: 'order' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const qs = String(url);
    expect(qs).toContain('entity_type=order');
    expect(qs).not.toContain('limit');
    expect(qs).not.toContain('offset');
  });
});
