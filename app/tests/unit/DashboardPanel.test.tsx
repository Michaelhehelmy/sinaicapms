import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardPanel from '@/components/admin/DashboardPanel';

const mockUseOrdersQuery = vi.fn();
const mockUseRoomsQuery = vi.fn();
const mockUseProductsQuery = vi.fn();
const mockUsePlansQuery = vi.fn();
const mockUseMealsQuery = vi.fn();
const mockUseLowStock = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  useOrdersQuery: (...args: unknown[]) => mockUseOrdersQuery(...args),
  useRoomsQuery: (...args: unknown[]) => mockUseRoomsQuery(...args),
  useProductsQuery: (...args: unknown[]) => mockUseProductsQuery(...args),
  usePlansQuery: (...args: unknown[]) => mockUsePlansQuery(...args),
  useMealsQuery: (...args: unknown[]) => mockUseMealsQuery(...args),
  useLowStock: (...args: unknown[]) => mockUseLowStock(...args),
}));

vi.mock('@/lib/plausible', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Skeleton', () => ({
  DashboardSkeleton: () => (
    <div data-testid="dashboard-skeleton" role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard</span>
    </div>
  ),
  Skeleton: ({ variant }: { variant?: string }) => (
    <div data-testid={`skeleton-${variant || 'rect'}`} />
  ),
  TableSkeleton: ({ rows }: { rows?: number }) => (
    <div data-testid="table-skeleton" />
  ),
  ProductGridSkeleton: ({ count }: { count?: number }) => (
    <div data-testid="product-grid-skeleton" />
  ),
  POSDashboardSkeleton: () => (
    <div data-testid="pos-dashboard-skeleton" />
  ),
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => (
    <span data-testid="status-tag">{status}</span>
  ),
}));

const defaultHooks = {
  useOrdersQuery: { data: { data: [], total: 0 }, isLoading: false, error: null, isFetching: false },
  useRoomsQuery: { data: [], isLoading: false, error: null, isFetching: false },
  useProductsQuery: { data: [], isLoading: false, error: null },
  usePlansQuery: { data: [], isLoading: false, error: null },
  useMealsQuery: { data: [], isLoading: false, error: null },
  useLowStock: { data: { items: [], total: 0, page: 1, pageSize: 20, hasMore: false }, isLoading: false, error: null },
};

function setupMocks(overrides: Partial<typeof defaultHooks> = {}) {
  const merged = { ...defaultHooks, ...overrides };
  mockUseOrdersQuery.mockReturnValue(merged.useOrdersQuery);
  mockUseRoomsQuery.mockReturnValue(merged.useRoomsQuery);
  mockUseProductsQuery.mockReturnValue(merged.useProductsQuery);
  mockUsePlansQuery.mockReturnValue(merged.usePlansQuery);
  mockUseMealsQuery.mockReturnValue(merged.useMealsQuery);
  mockUseLowStock.mockReturnValue(merged.useLowStock);
}

describe('DashboardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton loading initially', () => {
    setupMocks({
      useOrdersQuery: { data: { data: [], total: 0 }, isLoading: true, error: null, isFetching: false },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('renders stat cards with correct labels', () => {
    setupMocks();
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByText('Total Rooms')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
  });

  it('occupancy percentage calculation is correct', () => {
    setupMocks({
      useRoomsQuery: {
        data: [
          { id: '1', campId: 'c1', status: 'occupied', name: 'R1' },
          { id: '2', campId: 'c1', status: 'occupied', name: 'R2' },
          { id: '3', campId: 'c1', status: 'occupied', name: 'R3' },
          { id: '4', campId: 'c1', status: 'available', name: 'R4' },
        ],
        isLoading: false,
        error: null,
        isFetching: false,
      },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('monthly revenue sums paid orders', () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    setupMocks({
      useOrdersQuery: {
        data: {
          data: [
            { id: 'o1', campId: 'c1', paymentStatus: 'paid', totalAmount: 500, checkInDate: today, orderStateId: 'confirmed', customerFirstName: 'A', customerLastName: 'B' },
            { id: 'o2', campId: 'c1', paymentStatus: 'paid', totalAmount: 300, checkInDate: today, orderStateId: 'confirmed', customerFirstName: 'C', customerLastName: 'D' },
          ],
          total: 2,
        },
        isLoading: false,
        error: null,
        isFetching: false,
      },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByText('$800.00')).toBeInTheDocument();
  });

  it('recent reservations list shows guest names', () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    setupMocks({
      useOrdersQuery: {
        data: {
          data: [
            { id: 'o1', campId: 'c1', customerFirstName: 'John', customerLastName: 'Doe', checkInDate: today, orderStateId: 'confirmed', reference: 'REF001' },
          ],
          total: 1,
        },
        isLoading: false,
        error: null,
        isFetching: false,
      },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('counts upcoming plans for the selected camps', () => {
    setupMocks({
      usePlansQuery: {
        data: [
          { id: 'p1', campId: 'c1', status: 'upcoming', name: 'Plan 1' },
          { id: 'p2', campId: 'c1', status: 'completed', name: 'Plan 2' },
          { id: 'p3', campId: 'c2', status: 'upcoming', name: 'Plan 3' },
        ],
        isLoading: false,
        error: null,
      },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('fires the dashboard view analytics event on mount', () => {
    setupMocks();
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(mockTrackEvent).toHaveBeenCalledWith('Tenant: Dashboard View');
  });

  it('renders the low-stock card with the top five items', () => {
    setupMocks({
      useLowStock: {
        data: {
          items: [
            { id: 'i1', name: 'Water Bottles', stockQuantity: 2, minStockLevel: 10, unit: 'pcs', category: 'Beverages', status: 'low' },
            { id: 'i2', name: 'Firewood', stockQuantity: 0, minStockLevel: 5, unit: 'kg', category: 'Supplies', status: 'out' },
            { id: 'i3', name: 'Sleeping Bags', stockQuantity: 1, minStockLevel: 4, unit: 'pcs', category: 'Gear', status: 'low' },
            { id: 'i4', name: 'Flashlights', stockQuantity: 0, minStockLevel: 3, unit: 'pcs', category: 'Gear', status: 'out' },
            { id: 'i5', name: 'First Aid Kits', stockQuantity: 2, minStockLevel: 2, unit: 'pcs', category: 'Medical', status: 'low' },
            { id: 'i6', name: 'Extra Item', stockQuantity: 1, minStockLevel: 4, unit: 'pcs', category: 'Gear', status: 'low' },
          ],
          total: 6,
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
        isLoading: false,
        error: null,
      },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByTestId('low-stock-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('low-stock-list')).toBeInTheDocument();
    expect(screen.getByText('Water Bottles')).toBeInTheDocument();
    expect(screen.getByText('Firewood')).toBeInTheDocument();
    expect(screen.getByText('First Aid Kits')).toBeInTheDocument();
    // Only the top 5 items are listed — the 6th stays hidden.
    expect(screen.queryByText('Extra Item')).not.toBeInTheDocument();
    expect(screen.getAllByText('Out of Stock').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Low').length).toBeGreaterThanOrEqual(1);
  });

  it('renders an empty state when no items are low on stock', () => {
    setupMocks();
    render(<DashboardPanel campIds={['c1']} camps={[]} />);
    expect(screen.getByTestId('low-stock-alerts')).toBeInTheDocument();
    expect(screen.getByText('All stocked up')).toBeInTheDocument();
    expect(screen.queryByTestId('low-stock-list')).not.toBeInTheDocument();
  });

  it('navigates to the low-stock tab from the View All CTA', () => {
    const onNavigateToTab = vi.fn();
    setupMocks({
      useLowStock: {
        data: {
          items: [{ id: 'i1', name: 'Water Bottles', stockQuantity: 2, minStockLevel: 10, unit: 'pcs', category: 'Beverages', status: 'low' }],
          total: 1,
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
        isLoading: false,
        error: null,
      },
    });
    render(<DashboardPanel campIds={['c1']} camps={[]} onNavigateToTab={onNavigateToTab} />);
    fireEvent.click(screen.getByTestId('low-stock-view-all'));
    expect(onNavigateToTab).toHaveBeenCalledWith('low-stock');
  });
});
