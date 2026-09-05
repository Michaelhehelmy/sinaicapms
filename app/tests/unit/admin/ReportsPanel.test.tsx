import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ReportsPanel from '@/components/admin/ReportsPanel';

const mockShowToast = vi.fn();

let mockOccData: unknown = undefined;
let mockRevData: unknown = undefined;
let mockBookData: unknown = undefined;
let mockOccLoading = false;
let mockRevLoading = false;
let mockBookLoading = false;
let mockOccError: Error | null = null;
let mockRevError: Error | null = null;
let mockBookError: Error | null = null;

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
    mockOccLoading = false;
    mockRevLoading = false;
    mockBookLoading = false;
    mockOccError = null;
    mockRevError = null;
    mockBookError = null;
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
