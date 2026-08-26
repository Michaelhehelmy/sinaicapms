import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPanel from '@/components/admin/ReportsPanel';

const mockShowToast = vi.fn();
let mockOccupancyData: unknown = { totalRooms: 10, occupiedRooms: 7, occupancyRate: 70 };
let mockOccupancyLoading = false;
let mockOccupancyError: Error | null = null;
let mockRevenueData: unknown = { details: [{ date: '2025-07-01', total: 5000, count: 10 }] };
let mockRevenueLoading = false;
let mockRevenueError: Error | null = null;
let mockBookingsData: unknown = { byState: [{ state: 'confirmed', count: 5 }] };
let mockBookingsLoading = false;
let mockBookingsError: Error | null = null;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useOccupancyReportQuery: () => ({
    data: mockOccupancyData,
    isLoading: mockOccupancyLoading,
    error: mockOccupancyError,
  }),
  useRevenueReportQuery: (params?: Record<string, unknown>) => ({
    data: mockRevenueData,
    isLoading: mockRevenueLoading,
    error: mockRevenueError,
  }),
  useBookingsReportQuery: (params?: Record<string, unknown>) => ({
    data: mockBookingsData,
    isLoading: mockBookingsLoading,
    error: mockBookingsError,
  }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ options, value, onChange }: { options: { value: string; label: string }[]; value?: string; onChange: (e: { target: { value: string } }) => void }) => (
    <select
      data-testid="report-type-select"
      value={value || ''}
      onChange={onChange}
    >
      {options.map((opt: { value: string; label: string }) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({ type, value, onChange, ...props }: { type?: string; value?: string; onChange?: (e: { target: { value: string } }) => void; [key: string]: unknown }) => (
    <input type={type} value={value || ''} onChange={onChange} {...props} />
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithQuery(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOccupancyData = { totalRooms: 10, occupiedRooms: 7, occupancyRate: 70 };
  mockOccupancyLoading = false;
  mockOccupancyError = null;
  mockRevenueData = { details: [{ date: '2025-07-01', total: 5000, count: 10 }] };
  mockRevenueLoading = false;
  mockRevenueError = null;
  mockBookingsData = { byState: [{ state: 'confirmed', count: 5 }] };
  mockBookingsLoading = false;
  mockBookingsError = null;
});

describe('ReportsPanel', () => {
  it('renders with default occupancy report', async () => {
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Reports')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Occupancy Report')).toBeInTheDocument();
    });
  });

  it('displays occupancy data', async () => {
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('70%')).toBeInTheDocument();
    });
  });

  it('shows error toast on API failure', async () => {
    mockOccupancyError = new Error('API Error');
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: API Error', 'error');
    });
  });

  it('handles empty occupancy data', async () => {
    mockOccupancyData = null;
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('No occupancy data available.')).toBeInTheDocument();
    });
  });

  it('handles occupancy rate color coding - high', async () => {
    mockOccupancyData = { totalRooms: 10, occupiedRooms: 9, occupancyRate: 90 };
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });

  it('switches to revenue report', async () => {
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Occupancy Report')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
    });
  });

  it('displays revenue data', async () => {
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(screen.getByText('$5000.00')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  it('handles empty revenue data', async () => {
    mockRevenueData = null;
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(screen.getByText('No revenue data available.')).toBeInTheDocument();
    });
  });

  it('switches to bookings report', async () => {
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
    });
  });

  it('displays bookings data', async () => {
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(screen.getByText('confirmed')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('handles empty bookings data', async () => {
    mockBookingsData = null;
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(screen.getByText('No booking data available.')).toBeInTheDocument();
    });
  });

  it('handles array-style revenue response', async () => {
    mockRevenueData = [
      { period: '2025-07-01', totalRevenue: 3000, bookingCount: 5, averagePerBooking: 600 },
    ];
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(screen.getByText('$3000.00')).toBeInTheDocument();
    });
  });

  it('handles array-style bookings response', async () => {
    mockBookingsData = [
      { status: 'pending', count: 3, totalAmount: 900 },
    ];
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('handles occupancy rate color coding - low', async () => {
    mockOccupancyData = { totalRooms: 10, occupiedRooms: 3, occupancyRate: 30 };
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });

  it('handles array occupancy response', async () => {
    mockOccupancyData = [
      { date: '2025-07-01', totalRooms: 10, occupiedRooms: 5, occupancyRate: 50 },
    ];
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('2025-07-01')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('handles bookings error', async () => {
    mockBookingsError = new Error('Bookings error');
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: Bookings error', 'error');
    });
  });

  it('handles revenue error', async () => {
    mockRevenueError = new Error('Revenue error');
    renderWithQuery(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: Revenue error', 'error');
    });
  });
});
