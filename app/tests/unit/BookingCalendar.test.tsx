import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addDays, addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import BookingCalendar from '@/components/admin/BookingCalendar';

const mockShowToast = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const camp = {
  id: 'c1',
  name: 'Camp 1',
  location: 'Sinai',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  capacity: 50,
  status: 'active',
  notes: '',
};

const product = {
  id: 'p1',
  tenantId: 't1',
  categoryId: null,
  sku: 'STD',
  basePrice: 100,
  capacity: 2,
  imageUrl: null,
  isActive: 1,
  name: 'Standard',
};

const room = {
  id: 'r1',
  campId: 'c1',
  productId: 'p1',
  name: 'Room 101',
  status: 'available',
  bedType: 'single',
  maxGuests: 2,
  basePrice: 100,
  floor: '1',
  notes: '',
  isActive: 1,
};

const defaultAvailability = {
  availability: [
    { productId: 'p1', availableCount: 1, rooms: [{ id: 'r1', name: 'Room 101' }] },
  ],
};

const api = {
  getProducts: vi.fn(),
  getRooms: vi.fn(),
  getOrders: vi.fn(),
  getRatePlans: vi.fn(),
  getPriceOverrides: vi.fn(),
  getAvailability: vi.fn(),
  setPriceOverrides: vi.fn(),
  deletePriceOverride: vi.fn(),
};

vi.mock('@/lib/api', () => ({
  getProducts: () => api.getProducts(),
  getRooms: () => api.getRooms(),
  getOrders: (params: unknown) => api.getOrders(params),
  getRatePlans: () => api.getRatePlans(),
  getPriceOverrides: (params: unknown) => api.getPriceOverrides(params),
  getAvailability: (params: unknown) => api.getAvailability(params),
  setPriceOverrides: (data: unknown) => api.setPriceOverrides(data),
  deletePriceOverride: (productId: string, date: string) => api.deletePriceOverride(productId, date),
}));

const mockAuth = vi.hoisted(() => ({
  isAuthenticated: false,
  user: null as { role: string; tenantId?: string } | null,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isAuthenticated: mockAuth.isAuthenticated,
    user: mockAuth.user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  }),
}));

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

vi.mock('@/hooks/useSseOrders', () => ({
  useSseOrders: (opts: SseConnectionOptions) => {
    mockSse.connections.push(opts);
    return { connected: mockSse.connected };
  },
}));

const todayKey = format(new Date(), 'yyyy-MM-dd');

function setupApi(overrides: Partial<typeof api> = {}) {
  api.getProducts.mockResolvedValue([product]);
  api.getRooms.mockResolvedValue([room]);
  api.getOrders.mockResolvedValue({ data: [], total: 0 });
  api.getRatePlans.mockResolvedValue([]);
  api.getPriceOverrides.mockResolvedValue({ overrides: [] });
  api.getAvailability.mockResolvedValue(defaultAvailability);
  api.setPriceOverrides.mockResolvedValue({ success: true, productId: 'p1', count: 1 });
  api.deletePriceOverride.mockResolvedValue({ success: true });
  Object.assign(api, overrides);
}

function renderCalendar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BookingCalendar campIds={['c1']} camps={[camp]} />
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}

function dayButton(dateKey: string) {
  const button = document.querySelector(`[data-date="${dateKey}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`No day button found for ${dateKey}`);
  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockShowToast.mockClear();
  setupApi();
  mockAuth.isAuthenticated = false;
  mockAuth.user = null;
  mockSse.connected = false;
  mockSse.connections = [];
  window.localStorage.clear();
});

describe('BookingCalendar', () => {
  it('renders two month grids with current and next month titles', async () => {
    renderCalendar();
    expect(await screen.findByText(format(new Date(), 'MMMM yyyy'))).toBeInTheDocument();
    expect(screen.getByText(format(addMonths(new Date(), 1), 'MMMM yyyy'))).toBeInTheDocument();
    expect(screen.getAllByTestId('month-grid')).toHaveLength(2);
  });

  it('renders legend items', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));
    expect(screen.getByText('Override')).toBeInTheDocument();
    expect(screen.getByText('Booked')).toBeInTheDocument();
    expect(screen.getByText('Rate plan')).toBeInTheDocument();
    expect(screen.getByText('Base price')).toBeInTheDocument();
  });

  it('renders the product selector with room-type options', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));
    expect(screen.getByRole('combobox', { name: 'Select room type' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
  });

  it('shows previous/next/Today navigation buttons', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));
    expect(screen.getByRole('button', { name: 'Previous months' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next months' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });

  it('navigates forward, backward, and back to today', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(screen.getByRole('button', { name: 'Next months' }));
    expect(await screen.findByText(format(addMonths(new Date(), 1), 'MMMM yyyy'))).toBeInTheDocument();
    expect(screen.getByText(format(addMonths(new Date(), 2), 'MMMM yyyy'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous months' }));
    expect(await screen.findByText(format(new Date(), 'MMMM yyyy'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next months' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByText(format(new Date(), 'MMMM yyyy'))).toBeInTheDocument();
  });

  it('shows the availability summary', async () => {
    renderCalendar();
    expect(await screen.findByText(/1 room available this period/)).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00 base \/ night/)).toBeInTheDocument();
  });

  it('selecting a day opens the drawer with the price breakdown', async () => {
    const { container } = renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));
    const drawer = screen.getByTestId('override-drawer');
    expect(drawer).toBeInTheDocument();
    expect(dayButton(todayKey)).toHaveAttribute('aria-pressed', 'true');
    expect(within(drawer).getByText(format(new Date(), 'EEEE, MMMM d, yyyy'))).toBeInTheDocument();
    expect(within(drawer).getByText('Base price')).toBeInTheDocument();
    expect(within(drawer).getByText('Effective price')).toBeInTheDocument();
    // Base row and effective row both show the base price when no override exists
    expect(within(drawer).getAllByText('$100.00').length).toBeGreaterThanOrEqual(2);
    expect(container).toBeTruthy();
  });

  it('saves a price override via the PUT endpoint and toasts success', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));
    fireEvent.change(screen.getByLabelText('Override price (per night)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }));

    await waitFor(() =>
      expect(api.setPriceOverrides).toHaveBeenCalledWith({
        productId: 'p1',
        overrides: [{ date: todayKey, price: 150 }],
      }),
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Price override saved', 'success'));
  });

  it('shows warning toast for invalid override input without calling the API', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));

    // Empty value
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }));
    expect(mockShowToast).toHaveBeenCalledWith('Enter a valid non-negative integer price', 'warning');

    // Negative value
    fireEvent.change(screen.getByLabelText('Override price (per night)'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }));
    expect(mockShowToast).toHaveBeenCalledWith('Enter a valid non-negative integer price', 'warning');

    // Non-integer value
    fireEvent.change(screen.getByLabelText('Override price (per night)'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }));
    expect(mockShowToast).toHaveBeenCalledWith('Enter a valid non-negative integer price', 'warning');

    expect(api.setPriceOverrides).not.toHaveBeenCalled();
  });

  it('clears an existing override via the DELETE endpoint and toasts success', async () => {
    api.getPriceOverrides.mockResolvedValue({
      overrides: [
        { id: 'po1', productId: 'p1', date: todayKey, price: 150, updatedAt: '2026-08-01T00:00:00Z' },
      ],
    });
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));
    expect(screen.getByText('Override active')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(api.deletePriceOverride).toHaveBeenCalledWith('p1', todayKey));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Price override cleared', 'success'));
  });

  it('renders a booked day when every room is occupied by an active order', async () => {
    const tomorrowKey = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    api.getOrders.mockResolvedValue({
      data: [
        {
          id: 'o1',
          tenantId: 't1',
          campId: 'c1',
          roomId: 'r1',
          customerId: null,
          orderStateId: 'confirmed',
          checkInDate: todayKey,
          checkOutDate: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          numberOfPeople: 2,
          totalAmount: 200,
          amountPaid: 0,
          paymentStatus: 'pending',
          reference: 'REF1',
          customerFirstName: 'John',
          customerLastName: 'Doe',
          roomName: 'Room 101',
          stateName: 'Confirmed',
        },
      ],
      total: 1,
    });
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    expect(dayButton(todayKey)).toHaveAttribute('data-state', 'booked');
    expect(dayButton(todayKey)).toHaveTextContent('Booked');
    expect(dayButton(tomorrowKey)).toHaveAttribute('data-state', 'booked');
  });

  it('ignores cancelled and no-show orders when marking days booked', async () => {
    api.getOrders.mockResolvedValue({
      data: [
        {
          id: 'o-c',
          tenantId: 't1',
          campId: 'c1',
          roomId: 'r1',
          customerId: null,
          orderStateId: 'cancelled',
          checkInDate: todayKey,
          checkOutDate: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          numberOfPeople: 2,
          totalAmount: 200,
          amountPaid: 0,
          paymentStatus: 'pending',
          reference: 'REF-C',
          customerFirstName: 'Ann',
          customerLastName: 'Null',
          roomName: 'Room 101',
          stateName: 'Cancelled',
        },
        {
          id: 'o-n',
          tenantId: 't1',
          campId: 'c1',
          roomId: 'r1',
          customerId: null,
          orderStateId: 'no_show',
          checkInDate: todayKey,
          checkOutDate: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          numberOfPeople: 2,
          totalAmount: 200,
          amountPaid: 0,
          paymentStatus: 'pending',
          reference: 'REF-N',
          customerFirstName: 'Bob',
          customerLastName: 'Gone',
          roomName: 'Room 101',
          stateName: 'No Show',
        },
      ],
      total: 2,
    });
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    expect(dayButton(todayKey)).toHaveAttribute('data-state', 'base');
  });

  it('renders a rate-plan day when a rate plan covers the date', async () => {
    api.getRatePlans.mockResolvedValue([
      {
        id: 'rp1',
        tenantId: 't1',
        productId: 'p1',
        name: 'Peak',
        season: '',
        startDate: todayKey,
        endDate: todayKey,
        pricePerNight: 200,
        minStay: 1,
        isActive: 1,
      },
    ]);
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    expect(dayButton(todayKey)).toHaveAttribute('data-state', 'rate-plan');
  });

  it('renders an override day with the override price', async () => {
    api.getPriceOverrides.mockResolvedValue({
      overrides: [
        { id: 'po1', productId: 'p1', date: todayKey, price: 150, updatedAt: '2026-08-01T00:00:00Z' },
      ],
    });
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    // Overrides are only fetched once a product is active (enabled guard), so
    // the day cell flips to override after the products query resolves.
    await waitFor(() => {
      expect(dayButton(todayKey)).toHaveAttribute('data-state', 'override');
    });
    expect(dayButton(todayKey)).toHaveTextContent('$150.00');
  });

  it('shows a loading state while data is fetching', async () => {
    api.getProducts.mockReturnValue(new Promise(() => {}));
    renderCalendar();
    expect(await screen.findByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows an empty state when there are no room types', async () => {
    api.getProducts.mockResolvedValue([]);
    api.getRooms.mockResolvedValue([]);
    renderCalendar();
    expect(await screen.findByText('No rooms available')).toBeInTheDocument();
  });

  it('supports keyboard arrow navigation between days', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));
    const tomorrowKey = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    fireEvent.click(dayButton(todayKey));
    fireEvent.keyDown(dayButton(todayKey), { key: 'ArrowRight' });

    expect(dayButton(tomorrowKey)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('override-drawer')).toBeInTheDocument();
    expect(screen.getByText(format(addDays(new Date(), 1), 'EEEE, MMMM d, yyyy'))).toBeInTheDocument();
  });

  it('switches products when a different room type is selected', async () => {
    const product2 = { ...product, id: 'p2', name: 'Deluxe', basePrice: 180 };
    const room2 = { ...room, id: 'r2', productId: 'p2', name: 'Room 201' };
    api.getProducts.mockResolvedValue([product, product2]);
    api.getRooms.mockResolvedValue([room, room2]);
    const availability2 = {
      availability: [
        { productId: 'p1', availableCount: 1, rooms: [{ id: 'r1', name: 'Room 101' }] },
        { productId: 'p2', availableCount: 2, rooms: [{ id: 'r2', name: 'Room 201' }] },
      ],
    };
    api.getAvailability.mockResolvedValue(availability2);

    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.change(screen.getByRole('combobox', { name: 'Select room type' }), {
      target: { value: 'p2' },
    });

    expect(await screen.findByText(/2 rooms available this period/)).toBeInTheDocument();
    expect(api.getPriceOverrides).toHaveBeenLastCalledWith(
      expect.objectContaining({ productId: 'p2' }),
    );
  });

  it('derives room-type options from rooms when the products query is empty', async () => {
    api.getProducts.mockResolvedValue([]);
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    expect(screen.getByRole('combobox', { name: 'Select room type' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Room type p1' })).toBeInTheDocument();
    // Base price falls back to the room's basePrice
    expect(screen.getByText(/\$100\.00 base \/ night/)).toBeInTheDocument();
  });

  it('closes the drawer when the Close button is clicked', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));
    expect(screen.getByTestId('override-drawer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('override-drawer')).not.toBeInTheDocument();
  });

  it('supports Home and End keys to jump to the first and last visible day', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.keyDown(dayButton(todayKey), { key: 'Home' });
    const firstDayKey = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    expect(dayButton(firstDayKey)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('override-drawer')).toBeInTheDocument();

    const lastDayKey = format(endOfMonth(addMonths(new Date(), 1)), 'yyyy-MM-dd');
    fireEvent.keyDown(dayButton(firstDayKey), { key: 'End' });
    expect(dayButton(lastDayKey)).toHaveAttribute('aria-pressed', 'true');
  });

  it('navigates months when an arrow key moves outside the visible window', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    const firstDayKey = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    fireEvent.click(dayButton(firstDayKey));
    fireEvent.keyDown(dayButton(firstDayKey), { key: 'ArrowLeft' });

    // The previous month becomes the first grid of the new window
    expect(await screen.findByText(format(addMonths(new Date(), -1), 'MMMM yyyy'))).toBeInTheDocument();
  });

  it('shows an error toast when saving an override fails', async () => {
    api.setPriceOverrides.mockRejectedValue(new Error('nope'));
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));
    fireEvent.change(screen.getByLabelText('Override price (per night)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save override' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save price override: nope', 'error'),
    );
  });

  it('shows an error toast when clearing an override fails', async () => {
    api.getPriceOverrides.mockResolvedValue({
      overrides: [
        { id: 'po1', productId: 'p1', date: todayKey, price: 150, updatedAt: '2026-08-01T00:00:00Z' },
      ],
    });
    api.deletePriceOverride.mockRejectedValue(new Error('nope'));
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    fireEvent.click(dayButton(todayKey));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Failed to clear price override: nope', 'error'),
    );
  });
});

describe('BookingCalendar SSE live refresh', () => {
  const bookingEvent = (campId: string | number) => ({
    type: 'new-booking',
    orderId: 'ord1',
    campId,
    checkIn: '2026-08-10',
    checkOut: '2026-08-12',
  });

  function connectAuthed() {
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'admin', tenantId: 't1' };
    window.localStorage.setItem('sinaicamps_token', 'sse-test-token');
  }

  function latestConnection() {
    const last = mockSse.connections.at(-1);
    if (!last) throw new Error('No useSseOrders connection was recorded');
    return last;
  }

  it('never enables the stream when the admin is not authenticated', async () => {
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));
    expect(mockSse.connections.length).toBeGreaterThan(0);
    expect(mockSse.connections.every((c) => c.enabled === false)).toBe(true);
  });

  it('does not enable the stream when authenticated but no token is stored', async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = { role: 'admin', tenantId: 't1' };
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));
    expect(mockSse.connections.length).toBeGreaterThan(0);
    expect(mockSse.connections.every((c) => c.enabled === false)).toBe(true);
  });

  it('opens the stream with the stored token and tenant id once a product is in view', async () => {
    connectAuthed();
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    const conn = latestConnection();
    expect(conn.enabled).toBe(true);
    expect(conn.tenantId).toBe('t1');
    expect(conn.token).toBe('sse-test-token');
  });

  it('invalidates availability and price-overrides on a new-booking for a viewed camp', async () => {
    connectAuthed();
    const { queryClient } = renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    api.getAvailability.mockClear();
    api.getPriceOverrides.mockClear();
    latestConnection().onEvent(bookingEvent('c1'));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'availability'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'price-overrides'] });
    });
    await waitFor(() => expect(api.getAvailability).toHaveBeenCalled());
    await waitFor(() => expect(api.getPriceOverrides).toHaveBeenCalled());
  });

  it('ignores a new-booking for a camp outside the current view', async () => {
    connectAuthed();
    const { queryClient } = renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    latestConnection().onEvent(bookingEvent('c9'));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['admin', 'availability'] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['admin', 'price-overrides'] });
  });

  it('ignores non-new-booking events', async () => {
    connectAuthed();
    const { queryClient } = renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    latestConnection().onEvent({ type: 'connected' });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('shows the Live badge when the stream is connected', async () => {
    connectAuthed();
    mockSse.connected = true;
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    const badge = screen.getByTestId('live-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Live');
  });

  it('hides the Live badge when the stream is not connected', async () => {
    connectAuthed();
    mockSse.connected = false;
    renderCalendar();
    await screen.findByText(format(new Date(), 'MMMM yyyy'));

    expect(screen.queryByTestId('live-badge')).not.toBeInTheDocument();
  });
});
