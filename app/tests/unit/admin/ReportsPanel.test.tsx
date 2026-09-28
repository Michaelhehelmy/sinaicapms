import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ReportsPanel from '@/components/admin/ReportsPanel';

const mockShowToast = vi.fn();

let mockOccData: unknown = undefined;
let mockRevData: unknown = undefined;
let mockBookData: unknown = undefined;
// 5f: profit mock (additive; defaults keep every existing tab byte-identical).
let mockProfitData: unknown = undefined;
let mockOccLoading = false;
let mockRevLoading = false;
let mockBookLoading = false;
let mockProfitLoading = false;
let mockOccError: Error | null = null;
let mockRevError: Error | null = null;
let mockBookError: Error | null = null;
let mockProfitError: Error | null = null;
// T40 client-leg removal: the profit tab makes NO orders-list fetch.
// This spy pins it — the panel no longer imports useOrdersQuery, so any call
// proves a client-leg regression. The union envelope mock stays so a
// non-empty list would double-count under the old merge (3100 + list).
let mockUnionRes: unknown = { data: [], total: 0, page: 1, pageSize: 50, hasMore: false };
let mockUnionLoading = false;
let ordersQueryCalls = 0;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  const useQuery = (data: unknown, loading: boolean, error: Error | null) => {
    const [d, setD] = React.useState(data);
    const [l, setL] = React.useState(loading);
    const [e, setE] = React.useState(error);
    React.useEffect(() => { setD(data); setL(loading); setE(error); });
    return { data: d, isLoading: l, error: e };
  };
  return {
    useOccupancyReportQuery: () => useQuery(mockOccData, mockOccLoading, mockOccError),
    useRevenueReportQuery: () => useQuery(mockRevData, mockRevLoading, mockRevError),
    useBookingsReportQuery: () => useQuery(mockBookData, mockBookLoading, mockBookError),
    // 5f: profit hook mock (same hook-boundary idiom as the other three).
    useProfitReportQuery: () => useQuery(mockProfitData, mockProfitLoading, mockProfitError),
    // T40 client-leg removal: spy — the panel must never call this for profit.
    useOrdersQuery: () => { ordersQueryCalls += 1; return useQuery(mockUnionRes, mockUnionLoading, null); },
  };
});

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; [key: string]: unknown }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({ label, value, onChange, placeholder, type }: { label?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} data-testid={label ? `input-${label}` : 'input'} />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div {...rest}>{children}</div>,
}));

const mockCamps = [
  { id: 'c1', name: 'Camp A', location: 'Cairo', startDate: '2025-06-01', endDate: '2025-08-01', capacity: 50, status: 'active', notes: '' },
];

describe('ReportsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOccData = undefined;
    mockRevData = undefined;
    mockBookData = undefined;
    mockProfitData = undefined;
    mockOccLoading = false;
    mockRevLoading = false;
    mockBookLoading = false;
    mockProfitLoading = false;
    mockOccError = null;
    mockRevError = null;
    mockBookError = null;
    mockProfitError = null;
    mockUnionRes = { data: [], total: 0, page: 1, pageSize: 50, hasMore: false };
    mockUnionLoading = false;
    ordersQueryCalls = 0;
  });

  it('renders the reports panel with header', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByTestId('reports-panel')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('shows occupancy empty state', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByText('No occupancy data available.')).toBeInTheDocument();
  });

  it('shows occupancy data with object shape', () => {
    mockOccData = { totalRooms: 10, occupiedRooms: 5, occupancyRate: 0.5 };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows occupancy data with array shape', () => {
    mockOccData = [{ date: '2025-01-01', totalRooms: 20, occupiedRooms: 15, occupancyRate: 75 }];
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByText('2025-01-01')).toBeInTheDocument();
  });

  it('renders occupancy rate colors for different thresholds', () => {
    mockOccData = { totalRooms: 10, occupiedRooms: 9, occupancyRate: 0.95 };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    // occupancyRate is displayed as-is (0.95 => 0.95%), so it won't match 95%
    expect(screen.getByText('1%')).toBeInTheDocument();
  });

  it('switches to revenue tab and shows empty state', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('No revenue data available.')).toBeInTheDocument();
  });

  it('shows revenue data with details object', () => {
    mockRevData = { details: [{ date: '2025-01-01', total: 500, count: 10 }, { date: '2025-01-02', total: 300, count: 5 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('2025-01-01')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('shows revenue data with array shape', () => {
    mockRevData = [{ period: 'Jan', totalRevenue: 100, bookingCount: 2, averagePerBooking: 50 }];
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
  });

  it('handles revenue details with count=0 for averagePerBooking', () => {
    mockRevData = { details: [{ date: '2025-01-01', total: 100, count: 0 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('handles revenue details with null details', () => {
    mockRevData = { details: null };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('No revenue data available.')).toBeInTheDocument();
  });

  it('switches to bookings tab and shows empty state', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('No booking data available.')).toBeInTheDocument();
  });

  it('shows bookings data with byState object', () => {
    mockBookData = { byState: [{ state: 'confirmed', count: 5 }, { state: 'pending_payment', count: 3 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText('pending payment')).toBeInTheDocument();
  });

  it('shows bookings data with array shape', () => {
    mockBookData = [{ status: 'checked_in', count: 2, totalAmount: 200 }];
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('checked in')).toBeInTheDocument();
  });

  it('handles bookings with null byState', () => {
    mockBookData = { byState: null };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('No booking data available.')).toBeInTheDocument();
  });

  it('handles bookings with empty byState', () => {
    mockBookData = { byState: [] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('No booking data available.')).toBeInTheDocument();
  });

  it('handles bookings with count=0', () => {
    mockBookData = { byState: [{ state: 'cancelled', count: 0 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    mockOccLoading = true;
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Generating report...')).toBeInTheDocument();
  });

  it('shows error toast for occupancy errors', async () => {
    mockOccError = new Error('occ failed');
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: occ failed', 'error');
    });
  });

  it('shows error toast for revenue errors', async () => {
    mockRevError = new Error('rev failed');
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: rev failed', 'error');
    });
  });

  it('shows error toast for bookings errors', async () => {
    mockBookError = new Error('book failed');
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: book failed', 'error');
    });
  });

  it('does not show error toast when error is null', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('updates date range start', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    // Date inputs are rendered via the Input mock with data-testid="input"
    const inputs = screen.getAllByTestId('input');
    fireEvent.change(inputs[0], { target: { value: '2025-01-01' } });
    expect(inputs[0]).toHaveValue('2025-01-01');
  });

  it('updates date range end', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    const inputs = screen.getAllByTestId('input');
    fireEvent.change(inputs[1], { target: { value: '2025-12-31' } });
    expect(inputs[1]).toHaveValue('2025-12-31');
  });

  it('handles occupancy rate at exactly 50%', () => {
    mockOccData = { totalRooms: 10, occupiedRooms: 5, occupancyRate: 0.5 };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    // 0.5 * 10 = 5, round = 5, /10 = 0.5 => displayed as "0.5%"
    expect(screen.getByText('0.5%')).toBeInTheDocument();
  });

  it('handles occupancy rate below 50%', () => {
    mockOccData = [{ date: '2025-01-01', totalRooms: 10, occupiedRooms: 3, occupancyRate: 30 }];
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    // 30 * 10 = 300, round = 300, /10 = 30 => displayed as "30%"
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('handles occupancy with undefined occupancyRate', () => {
    mockOccData = { totalRooms: 10, occupiedRooms: 5 };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    // (undefined || 0) = 0 => displayed as "0%"
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles occupancy data that is not array and not object with totalRooms', () => {
    mockOccData = 'invalid';
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByText('No occupancy data available.')).toBeInTheDocument();
  });

  it('handles revenue data that is not array and not object with details', () => {
    mockRevData = 42;
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('No revenue data available.')).toBeInTheDocument();
  });

  it('handles bookings data that is not array and not object with byState', () => {
    mockBookData = 'invalid';
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('No booking data available.')).toBeInTheDocument();
  });

  it('shows revenue table headers', () => {
    mockRevData = { details: [{ date: '2025-01-01', total: 500, count: 10 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('Revenue Report')).toBeInTheDocument();
  });

  it('shows bookings table headers', () => {
    mockBookData = { byState: [{ state: 'confirmed', count: 5 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bookings' } });
    expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
  });

  it('shows occupancy table headers', () => {
    mockOccData = { totalRooms: 10, occupiedRooms: 5, occupancyRate: 0.5 };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByText('Occupancy Report')).toBeInTheDocument();
  });
});

describe('ReportsPanel profit tab (5f)', () => {
  // Shared Phase-5 vocabulary: one camp project + one restaurant project.
  const profitFixture = {
    byProject: [
      { projectId: 'proj_camp', projectName: 'Accommodation', projectType: 'camp', revenue: 200, lineCount: 1, orderCount: 1 },
      { projectId: 'proj_rest', projectName: 'Restaurant', projectType: 'restaurant', revenue: 50, lineCount: 1, orderCount: 1 },
    ],
    total: { totalRevenue: 250, totalLines: 2, totalOrders: 1 },
  };

  function renderProfit(data: unknown = profitFixture) {
    mockProfitData = data;
    render(<ReportsPanel campIds={['proj_camp', 'proj_rest']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'profit' } });
  }

  it('offers the Profit by Project option', () => {
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    expect(screen.getByRole('option', { name: 'Profit by Project' })).toBeInTheDocument();
  });

  it('order total 250 ⇒ Camp 200 + Restaurant 50 + footer total 250', () => {
    renderProfit();
    // Heading (the option carries the same label, so query the heading role).
    expect(screen.getByRole('heading', { name: 'Profit by Project' })).toBeInTheDocument();
    expect(screen.getByText('Accommodation')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    // Footer total row carries the tenant aggregate (250).
    expect(screen.getByTestId('profit-total')).toBeInTheDocument();
    expect(screen.getByTestId('profit-total')).toHaveTextContent('$250.00');
  });

  it('footer SUM equals the tenant aggregate', () => {
    renderProfit();
    const rows = profitFixture.byProject.reduce((a, r) => a + r.revenue, 0);
    expect(rows).toBe(250);
    expect(profitFixture.total.totalRevenue).toBe(rows);
    expect(screen.getByTestId('profit-total')).toHaveTextContent('$250.00');
  });

  it('shows empty state when no profit data', () => {
    renderProfit({ byProject: [], total: { totalRevenue: 0, totalLines: 0, totalOrders: 0 } });
    expect(screen.getByText('No profit data available.')).toBeInTheDocument();
  });

  it('shows error toast for profit errors', async () => {
    mockProfitError = new Error('profit failed');
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'profit' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: profit failed', 'error');
    });
  });

  it('leaves the other tabs byte-identical (revenue still renders)', () => {
    mockRevData = { details: [{ date: '2025-01-01', total: 500, count: 10 }] };
    render(<ReportsPanel campIds={['c1']} camps={mockCamps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'revenue' } });
    expect(screen.getByText('Revenue Report')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });
});

describe('ReportsPanel profit server-only (T40 client-leg removal)', () => {
  // Server UNION vocabulary (staging truth 2026-09-28): Camp 3000/2/2 +
  // Restaurant 100/2/2 = total 3100/4/2, Unassigned absent. The panel renders
  // these rows verbatim — no orders-list fetch, no client merge.
  const t40Camps = [
    { id: 'proj_camp', name: 'Accommodation', location: '', startDate: '', endDate: '', capacity: 0, status: 'active', notes: '', projectType: 'camp' },
    { id: 'proj_rest', name: 'Restaurant', location: '', startDate: '', endDate: '', capacity: 0, status: 'active', notes: '', projectType: 'restaurant' },
  ];
  const serverProfit3100 = {
    byProject: [
      { projectId: 'proj_camp', projectName: 'Accommodation', projectType: 'camp', revenue: 3000, lineCount: 2, orderCount: 2 },
      { projectId: 'proj_rest', projectName: 'Restaurant', projectType: 'restaurant', revenue: 100, lineCount: 2, orderCount: 2 },
    ],
    total: { totalRevenue: 3100, totalLines: 4, totalOrders: 2 },
  };
  // The old client leg built this header-grain Unassigned bucket from the
  // union list (2x1550, NULL header projectId) and added it on top of the
  // server 3100 ⇒ 6200. It must now be ignored even when present.
  const legacyUnionDoubleCount = {
    data: [
      { id: 'so_1', campId: null, roomId: null, reference: 'ORD-6SJU3V', orderStateId: 'pending', paymentStatus: 'pending', totalAmount: 1550, source: 'storefront', projectId: null },
      { id: 'so_2', campId: null, roomId: null, reference: 'ORD-6S4R6R', orderStateId: 'pending', paymentStatus: 'pending', totalAmount: 1550, source: 'storefront', projectId: null },
    ],
    total: 2, page: 1, pageSize: 50, hasMore: false,
  };

  function renderProfitServer(data: unknown = serverProfit3100) {
    mockProfitData = data;
    render(<ReportsPanel campIds={['proj_camp', 'proj_rest']} camps={t40Camps as never} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'profit' } });
  }

  it('server rows Camp 3000 + Restaurant 100 ⇒ footer total 3100', () => {
    renderProfitServer();
    expect(screen.getByRole('heading', { name: 'Profit by Project' })).toBeInTheDocument();
    expect(screen.getByText('Accommodation')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.getByText('$3000.00')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByTestId('profit-total')).toHaveTextContent('$3100.00');
  });

  it('makes zero orders-list fetches on the profit tab (no client leg, no /storefront/orders)', () => {
    renderProfitServer();
    expect(screen.getByTestId('profit-total')).toHaveTextContent('$3100.00');
    expect(ordersQueryCalls).toBe(0);
  });

  it('ignores union-list rows even when present (3100, never 6200 double-count)', () => {
    mockUnionRes = legacyUnionDoubleCount;
    renderProfitServer();
    expect(screen.getByTestId('profit-total')).toHaveTextContent('$3100.00');
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
    expect(ordersQueryCalls).toBe(0);
  });

  it('keeps the Unassigned fallback for NULL-project server rows (nothing dropped)', () => {
    renderProfitServer({
      byProject: [
        { projectId: null, projectName: null, projectType: null, revenue: 100, lineCount: 1, orderCount: 1 },
      ],
      total: { totalRevenue: 100, totalLines: 1, totalOrders: 1 },
    });
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    // Row cell + footer total share the same value.
    expect(screen.getAllByText('$100.00')).toHaveLength(2);
    expect(screen.getByTestId('profit-total')).toHaveTextContent('$100.00');
    expect(ordersQueryCalls).toBe(0);
  });
});
