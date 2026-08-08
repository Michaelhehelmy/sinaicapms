import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InboxPanel from '@/components/admin/InboxPanel';
import { InboxNavBadge } from '@/components/admin/AdminApp';

const mockShowToast = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const api = vi.hoisted(() => ({
  getInbox: vi.fn(),
  markInboxRead: vi.fn(),
  deleteInboxLead: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

interface SseConnectionOptions {
  enabled: boolean;
  tenantId?: string;
  token?: string;
  onEvent: (event: unknown) => void;
}

const mockSse = vi.hoisted(() => ({
  connected: false,
  connections: [] as SseConnectionOptions[],
}));

vi.mock('@/hooks/useSseInbox', () => ({
  useSseInbox: (opts: SseConnectionOptions) => {
    mockSse.connections.push(opts);
    return { connected: mockSse.connected };
  },
}));

/** Lead fixture shaped like the OpenAPI InboxItem schema. */
function buildLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
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
    ...overrides,
  };
}

/** Booking fixture shaped like the OpenAPI InboxItem schema. */
function buildBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'book-1',
    kind: 'booking',
    name: null,
    email: null,
    phone: null,
    subject: null,
    message: null,
    status: null,
    source: null,
    isRead: 0,
    campName: 'Blue Camp',
    roomNumber: 'R1',
    customerName: 'Bob',
    checkInDate: '2026-08-10',
    checkOutDate: '2026-08-12',
    numberOfPeople: 2,
    totalAmount: 240,
    amountPaid: 120,
    paymentStatus: 'partial',
    orderStateId: 'confirmed',
    reference: 'REF-1',
    createdAt: '2026-08-08T11:00:00Z',
    ...overrides,
  };
}

function buildFeed(data: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  return {
    data,
    total: data.length,
    page: 1,
    pageSize: 10,
    hasMore: false,
    unread: data.filter((i) => !(i as { isRead: number }).isRead).length,
    ...overrides,
  };
}

function latestConnection() {
  const last = mockSse.connections.at(-1);
  if (!last) throw new Error('No useSseInbox connection was recorded');
  return last;
}

function renderPanel(props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <InboxPanel {...(props as any)} />
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockSse.connected = false;
  mockSse.connections = [];
  Object.values(api).forEach((fn) => {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  });
});

describe('InboxPanel tabs and filters', () => {
  it('defaults to the All feed (no kind filter)', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    renderPanel();
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledWith(undefined));
    expect(screen.getByTestId('inbox-panel')).toBeInTheDocument();
  });

  it('filters the feed by kind when switching tabs', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    renderPanel();
    await screen.findByTestId('inbox-panel');

    fireEvent.click(screen.getByTestId('inbox-tab-leads'));
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledWith({ kind: 'lead' }));

    fireEvent.click(screen.getByTestId('inbox-tab-bookings'));
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledWith({ kind: 'booking' }));
  });

  it('narrows leads by status', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    renderPanel();
    await screen.findByTestId('inbox-panel');

    fireEvent.click(screen.getByTestId('inbox-tab-leads'));
    fireEvent.click(screen.getByTestId('inbox-status-converted'));
    await waitFor(() => expect(api.getInbox).toHaveBeenCalledWith({ kind: 'lead', status: 'converted' }));
  });
});

describe('InboxPanel rendering', () => {
  it('renders unread rows with a dot and read rows without', async () => {
    api.getInbox.mockResolvedValue(
      buildFeed([buildLead(), buildBooking({ isRead: 1 })]),
    );
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');
    expect(screen.getAllByTestId('unread-dot')).toHaveLength(1);
    expect(screen.getByTestId('inbox-item-lead-1')).toHaveTextContent('Ada');
    expect(screen.getByTestId('inbox-item-book-1')).toHaveTextContent('Bob');
  });

  it('shows an unread count badge in the header', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead(), buildBooking()], { unread: 2 }));
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');
    expect(screen.getByTestId('inbox-unread-count')).toHaveTextContent('2 unread');
  });

  it('renders the empty state when the feed is empty', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    renderPanel();
    await screen.findByText('Inbox zero');
  });

  it('shows an error state and retries', async () => {
    api.getInbox.mockRejectedValueOnce(new Error('boom'));
    api.getInbox.mockResolvedValueOnce(buildFeed([buildLead()]));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('inbox-error')).toBeInTheDocument());
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load inbox: boom', 'error');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('inbox-item-lead-1')).toBeInTheDocument());
  });

  it('renders booking details with order state and payment badges', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildBooking()]));
    renderPanel();
    await screen.findByTestId('inbox-item-book-1');
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('$240.00')).toBeInTheDocument();
    // The camp name is part of the joined detail line ("Blue Camp · R1 · …").
    expect(screen.getByText(/Blue Camp/)).toBeInTheDocument();
  });

  it('renders badges for every order state variant', async () => {
    api.getInbox.mockResolvedValue(
      buildFeed([
        buildBooking({ id: 'b-pending', orderStateId: 'pending' }),
        buildBooking({ id: 'b-in', orderStateId: 'checked_in' }),
        buildBooking({ id: 'b-out', orderStateId: 'checked_out' }),
        buildBooking({ id: 'b-cancelled', orderStateId: 'cancelled' }),
        buildBooking({ id: 'b-unknown', orderStateId: 'mystery' }),
      ]),
    );
    renderPanel();
    await screen.findByTestId('inbox-item-b-pending');
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Checked In')).toBeInTheDocument();
    expect(screen.getByText('Checked Out')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    // Unknown state ids fall back to the neutral variant + capitalized label.
    expect(screen.getByText('Mystery')).toBeInTheDocument();
  });
});

describe('InboxPanel actions', () => {
  it('marks an unread row read optimistically and fires the read mutation', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead()]));
    let resolveRead!: (value: unknown) => void;
    api.markInboxRead.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');

    expect(screen.getAllByTestId('unread-dot')).toHaveLength(1);
    // userEvent (not fireEvent) reliably reaches React 19's delegated handler on <li>.
    await userEvent.click(screen.getByTestId('inbox-item-lead-1'));

    // Optimistic: the dot disappears before the mutation resolves.
    expect(screen.queryAllByTestId('unread-dot')).toHaveLength(0);
    expect(api.markInboxRead).toHaveBeenCalledWith('lead', 'lead-1');

    await act(async () => {
      resolveRead({ success: true });
    });
  });

  it('does not fire the read mutation for an already-read row', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead({ isRead: 1 })]));
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');

    await userEvent.click(screen.getByTestId('inbox-item-lead-1'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.markInboxRead).not.toHaveBeenCalled();
  });

  it('updates a lead status and refetches the feed', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead()]));
    api.updateLead.mockResolvedValue({ success: true });
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');

    fireEvent.change(screen.getByLabelText('Update status for Ada'), { target: { value: 'contacted' } });

    await waitFor(() =>
      expect(api.updateLead).toHaveBeenCalledWith('lead-1', { status: 'contacted' }),
    );
    expect(mockShowToast).toHaveBeenCalledWith('Lead status updated', 'success');
    // onSuccess invalidates the feed → getInbox refetches
    await waitFor(() => expect(api.getInbox.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('shows an error toast when the lead status update fails', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead()]));
    api.updateLead.mockRejectedValue(new Error('nope'));
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');

    fireEvent.change(screen.getByLabelText('Update status for Ada'), { target: { value: 'contacted' } });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Failed to update lead: nope', 'error'),
    );
  });

  it('deletes a lead after confirmation', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead()]));
    api.deleteInboxLead.mockResolvedValue({ success: true });
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete lead?')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteInboxLead).toHaveBeenCalledWith('lead-1'));
    expect(mockShowToast).toHaveBeenCalledWith('Lead deleted', 'success');
  });

  it('cancels the delete dialog without deleting', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildLead()]));
    renderPanel();
    await screen.findByTestId('inbox-item-lead-1');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.deleteInboxLead).not.toHaveBeenCalled();
  });

  it('invokes the Open booking callback with the booking id', async () => {
    api.getInbox.mockResolvedValue(buildFeed([buildBooking()]));
    const onOpenOrder = vi.fn();
    renderPanel({ onOpenOrder });
    await screen.findByTestId('inbox-item-book-1');

    fireEvent.click(screen.getByRole('button', { name: 'Open booking' }));
    expect(onOpenOrder).toHaveBeenCalledWith('book-1');
  });
});

describe('InboxPanel SSE live refresh', () => {
  it('does not enable the stream when no token or tenant is provided', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    renderPanel();
    await screen.findByTestId('inbox-panel');
    expect(mockSse.connections.length).toBeGreaterThan(0);
    expect(mockSse.connections.every((c) => c.enabled === false)).toBe(true);
  });

  it('opens the stream with the stored token and tenant id', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    renderPanel({ tenantId: 't1', token: 'sse-test-token' });
    await screen.findByTestId('inbox-panel');

    const conn = latestConnection();
    expect(conn.enabled).toBe(true);
    expect(conn.tenantId).toBe('t1');
    expect(conn.token).toBe('sse-test-token');
  });

  it('invalidates the feed and unread count on a new-lead event', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    const { queryClient } = renderPanel({ tenantId: 't1', token: 'sse-test-token' });
    await screen.findByTestId('inbox-panel');

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    latestConnection().onEvent({ type: 'new-lead', leadId: 'lead-9' });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox', 'unread'] });
    });
  });

  it('invalidates on a new-booking event and ignores unrelated events', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    const { queryClient } = renderPanel({ tenantId: 't1', token: 'sse-test-token' });
    await screen.findByTestId('inbox-panel');

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    latestConnection().onEvent({ type: 'new-booking', orderId: 'ord-9' });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox'] }),
    );

    invalidateSpy.mockClear();
    latestConnection().onEvent({ type: 'connected' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('shows the Live badge when the stream is connected', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    mockSse.connected = true;
    renderPanel({ tenantId: 't1', token: 'sse-test-token' });
    await screen.findByTestId('inbox-panel');

    const badge = screen.getByTestId('inbox-live-badge');
    expect(badge).toHaveTextContent('Live');
  });

  it('hides the Live badge when the stream is not connected', async () => {
    api.getInbox.mockResolvedValue(buildFeed([]));
    mockSse.connected = false;
    renderPanel({ tenantId: 't1', token: 'sse-test-token' });
    await screen.findByTestId('inbox-panel');

    expect(screen.queryByTestId('inbox-live-badge')).not.toBeInTheDocument();
  });
});

describe('InboxNavBadge', () => {
  it('renders nothing when the count is zero or missing', () => {
    const { rerender } = render(<InboxNavBadge count={0} />);
    expect(screen.queryByTestId('nav-inbox-unread')).not.toBeInTheDocument();
    rerender(<InboxNavBadge count={-2} />);
    expect(screen.queryByTestId('nav-inbox-unread')).not.toBeInTheDocument();
  });

  it('renders the raw count for small values', () => {
    render(<InboxNavBadge count={5} />);
    const badge = screen.getByTestId('nav-inbox-unread');
    expect(badge).toHaveTextContent('5');
  });

  it('caps the display at 99+', () => {
    render(<InboxNavBadge count={150} />);
    const badge = screen.getByTestId('nav-inbox-unread');
    expect(badge).toHaveTextContent('99+');
  });
});
