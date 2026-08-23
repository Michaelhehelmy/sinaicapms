import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useInboxQuery,
  useInboxUnreadQuery,
  useMarkInboxReadMutation,
  useDeleteInboxLeadMutation,
  queryKeys,
} from '@/hooks/useQueryHooks';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const api = vi.hoisted(() => ({
  getInbox: vi.fn(),
  markInboxRead: vi.fn(),
  deleteInboxLead: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

/** Minimal InboxResponse fixture shaped like the OpenAPI schema. */
function buildFeed(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        id: 'i1',
        kind: 'lead',
        name: 'Ada',
        email: 'ada@example.com',
        phone: null,
        subject: 'Hello',
        message: null,
        status: 'new',
        source: 'website',
        isRead: 0,
        campName: null,
        roomNumber: null,
        customerName: null,
        checkInDate: null,
        checkOutDate: null,
        numberOfPeople: null,
        totalAmount: null,
        amountPaid: null,
        paymentStatus: null,
        orderStateId: null,
        reference: null,
        createdAt: '2026-08-08T10:00:00Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
    hasMore: false,
    unread: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockShowToast.mockClear();
  Object.values(api).forEach((fn) => {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inbox query keys', () => {
  it('queryKeys.inbox(params) embeds the params', () => {
    expect(queryKeys.inbox()).toEqual(['admin', 'inbox', undefined]);
    expect(queryKeys.inbox({ kind: 'lead', page: '2' })).toEqual(['admin', 'inbox', { kind: 'lead', page: '2' }]);
  });

  it('queryKeys.inboxUnread is a stable distinct key', () => {
    expect(queryKeys.inboxUnread).toEqual(['admin', 'inbox', 'unread']);
  });
});

describe('useInboxQuery', () => {
  it('passes params through to getInbox and exposes the feed', async () => {
    const { wrapper } = createWrapper();
    const feed = buildFeed({ total: 2, unread: 2 });
    api.getInbox.mockResolvedValue(feed);
    const { result } = renderHook(() => useInboxQuery({ page: '2', pageSize: '20', kind: 'lead' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getInbox).toHaveBeenCalledWith({ page: '2', pageSize: '20', kind: 'lead' });
    expect(result.current.data).toEqual(feed);
  });

  it('fetches without params when none are given', async () => {
    const { wrapper } = createWrapper();
    api.getInbox.mockResolvedValue(buildFeed());
    const { result } = renderHook(() => useInboxQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getInbox).toHaveBeenCalledWith(undefined);
  });

  it('keeps previous data visible while a new filter refetches', async () => {
    const { wrapper } = createWrapper();
    const feedA = buildFeed({ total: 1, unread: 1 });
    const feedB = buildFeed({ total: 5, unread: 5, page: 2 });
    api.getInbox.mockResolvedValueOnce(feedA);
    let resolveB!: (value: unknown) => void;
    api.getInbox.mockReturnValueOnce(new Promise((resolve) => { resolveB = resolve; }));

    const { result, rerender } = renderHook((props) => useInboxQuery(props), {
      initialProps: { page: '1' },
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(feedA);

    rerender({ page: '2' });
    // New key is pending, but the previous page stays visible as placeholder
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual(feedA);

    await act(async () => {
      resolveB(feedB);
    });
    await waitFor(() => expect(result.current.data).toEqual(feedB));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('shows an error toast when the feed fails', async () => {
    const { wrapper } = createWrapper();
    api.getInbox.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useInboxQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load inbox: boom', 'error');
  });
});

describe('useInboxUnreadQuery', () => {
  it('fetches the lightest feed slice and exposes the unread count', async () => {
    const { wrapper } = createWrapper();
    api.getInbox.mockResolvedValue(buildFeed({ unread: 3 }));
    const { result } = renderHook(() => useInboxUnreadQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getInbox).toHaveBeenCalledWith({ pageSize: '1' });
    expect(result.current.data).toBe(3);
  });

  it('polls every 30 seconds', async () => {
    vi.useFakeTimers();
    const { wrapper } = createWrapper();
    api.getInbox.mockResolvedValue(buildFeed({ unread: 3 }));
    const { result } = renderHook(() => useInboxUnreadQuery(), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getInbox).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(api.getInbox).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(api.getInbox).toHaveBeenCalledTimes(3);
  });

  it('shows an error toast when the unread fetch fails', async () => {
    const { wrapper } = createWrapper();
    api.getInbox.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useInboxUnreadQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load unread count: boom', 'error');
  });
});

describe('useMarkInboxReadMutation', () => {
  it('marks an item read and invalidates feed + unread count', async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    api.markInboxRead.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMarkInboxReadMutation(), { wrapper });

    act(() => {
      result.current.mutate({ kind: 'lead', id: 'lead-1' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.markInboxRead).toHaveBeenCalledWith('lead', 'lead-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'inbox'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'inbox', 'unread'] });
    expect(mockShowToast).toHaveBeenCalledWith('Marked as read', 'success');
  });

  it('supports booking items and shows an error toast on failure', async () => {
    const { wrapper } = createWrapper();
    api.markInboxRead.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useMarkInboxReadMutation(), { wrapper });

    act(() => {
      result.current.mutate({ kind: 'booking', id: 'b1' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(api.markInboxRead).toHaveBeenCalledWith('booking', 'b1');
    expect(mockShowToast).toHaveBeenCalledWith('Failed to mark as read: bad', 'error');
  });
});

describe('useDeleteInboxLeadMutation', () => {
  it('deletes a lead and invalidates feed + unread count', async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    api.deleteInboxLead.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useDeleteInboxLeadMutation(), { wrapper });

    act(() => {
      result.current.mutate('lead-1');
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.deleteInboxLead).toHaveBeenCalledWith('lead-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'inbox'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'inbox', 'unread'] });
    expect(mockShowToast).toHaveBeenCalledWith('Lead deleted', 'success');
  });

  it('shows an error toast when deletion fails', async () => {
    const { wrapper } = createWrapper();
    api.deleteInboxLead.mockRejectedValue(new Error('bad'));
    const { result } = renderHook(() => useDeleteInboxLeadMutation(), { wrapper });

    act(() => {
      result.current.mutate('lead-1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(api.deleteInboxLead).toHaveBeenCalledWith('lead-1');
    expect(mockShowToast).toHaveBeenCalledWith('Failed to delete lead: bad', 'error');
  });
});
