import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsPanel from '@/components/admin/ReportsPanel';

const mockShowToast = vi.fn();
const mockGetOccupancyReport = vi.fn();
const mockGetRevenueReport = vi.fn();
const mockGetBookingsReport = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  getOccupancyReport: (...args: unknown[]) => mockGetOccupancyReport(...args),
  getRevenueReport: (...args: unknown[]) => mockGetRevenueReport(...args),
  getBookingsReport: (...args: unknown[]) => mockGetBookingsReport(...args),
}));

vi.mock('@/hooks/useAdminData', () => ({
  useCamps: () => ({ data: [] }),
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

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOccupancyReport.mockResolvedValue({ totalRooms: 10, occupiedRooms: 7, occupancyRate: 70 });
  mockGetRevenueReport.mockResolvedValue({ details: [{ date: '2025-07-01', total: 5000, count: 10 }] });
  mockGetBookingsReport.mockResolvedValue({ byState: [{ state: 'confirmed', count: 5 }] });
});

describe('ReportsPanel', () => {
  it('renders with default occupancy report', async () => {
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Reports')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Occupancy Report')).toBeInTheDocument();
    });
  });

  it('displays occupancy data', async () => {
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('70%')).toBeInTheDocument();
    });
  });

  it('shows error toast on API failure', async () => {
    mockGetOccupancyReport.mockRejectedValue(new Error('API Error'));
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: API Error', 'error');
    });
  });

  it('handles empty occupancy data', async () => {
    mockGetOccupancyReport.mockResolvedValue(null);
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('No occupancy data available.')).toBeInTheDocument();
    });
  });

  it('handles occupancy rate color coding - high', async () => {
    mockGetOccupancyReport.mockResolvedValue({ totalRooms: 10, occupiedRooms: 9, occupancyRate: 90 });
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });

  it('switches to revenue report', async () => {
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Occupancy Report')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
    });
  });

  it('displays revenue data', async () => {
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(screen.getByText('$5000.00')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  it('handles empty revenue data', async () => {
    mockGetRevenueReport.mockResolvedValue(null);
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(screen.getByText('No revenue data available.')).toBeInTheDocument();
    });
  });

  it('switches to bookings report', async () => {
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
    });
  });

  it('displays bookings data', async () => {
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(screen.getByText('confirmed')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('handles empty bookings data', async () => {
    mockGetBookingsReport.mockResolvedValue(null);
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(screen.getByText('No booking data available.')).toBeInTheDocument();
    });
  });

  it('handles array-style revenue response', async () => {
    mockGetRevenueReport.mockResolvedValue([
      { period: '2025-07-01', totalRevenue: 3000, bookingCount: 5, averagePerBooking: 600 },
    ]);
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(screen.getByText('$3000.00')).toBeInTheDocument();
    });
  });

  it('handles array-style bookings response', async () => {
    mockGetBookingsReport.mockResolvedValue([
      { status: 'pending', count: 3, totalAmount: 900 },
    ]);
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('handles occupancy rate color coding - low', async () => {
    mockGetOccupancyReport.mockResolvedValue({ totalRooms: 10, occupiedRooms: 3, occupancyRate: 30 });
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });

  it('handles array occupancy response', async () => {
    mockGetOccupancyReport.mockResolvedValue([
      { date: '2025-07-01', totalRooms: 10, occupiedRooms: 5, occupancyRate: 50 },
    ]);
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('2025-07-01')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('includes the date range in revenue and bookings requests', async () => {
    const { container } = render(<ReportsPanel campIds={['c1']} camps={camps} />);
    await waitFor(() => {
      expect(screen.getByText('Occupancy Report')).toBeInTheDocument();
    });
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    fireEvent.change(dateInputs[0], { target: { value: '2025-07-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2025-07-31' } });
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      expect(mockGetRevenueReport).toHaveBeenCalledWith({ start: '2025-07-01', end: '2025-07-31' });
    });
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(screen.getByText('Bookings by Status')).toBeInTheDocument();
      expect(mockGetBookingsReport).toHaveBeenCalledWith({ start: '2025-07-01', end: '2025-07-31' });
    });
  });

  it('handles bookings error', async () => {
    mockGetBookingsReport.mockRejectedValue(new Error('Bookings error'));
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'bookings' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: Bookings error', 'error');
    });
  });

  it('handles revenue error', async () => {
    mockGetRevenueReport.mockRejectedValue(new Error('Revenue error'));
    render(<ReportsPanel campIds={['c1']} camps={camps} />);
    fireEvent.change(screen.getByTestId('report-type-select'), { target: { value: 'revenue' } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error loading report: Revenue error', 'error');
    });
  });
});
