import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperDashboardPanel from '@/components/admin/SuperDashboardPanel';

const mockShowToast = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockUseAdminStatsQuery = vi.fn();
const mockUseAuth = vi.fn().mockReturnValue({ user: { role: 'super_admin' } });

vi.mock('@/hooks/useQueryHooks', () => ({
  useAdminStatsQuery: (...args: unknown[]) => mockUseAdminStatsQuery(...args),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/api', () => ({
  getAdminStats: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/ChartCard', () => ({
  ChartCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <div data-testid="chart-card"><h3>{title}</h3>{children}</div>
  ),
}));
vi.mock('@/components/ui/BarChart', () => ({
  BarChart: () => <div data-testid="bar-chart" />,
}));
vi.mock('@/components/ui/LineChart', () => ({
  LineChart: () => <div data-testid="line-chart" />,
}));
vi.mock('@/components/ui/PieChart', () => ({
  PieChart: () => <div data-testid="pie-chart" />,
}));
vi.mock('@/components/ui/DateRangePicker', () => ({
  DateRangePicker: () => <div data-testid="date-range-picker" />,
}));

import * as api from '@/lib/api';
const mockGetAdminStats = vi.mocked(api.getAdminStats);

const defaultStats = {
  totalTenants: 5,
  totalCamps: 12,
  totalRooms: 80,
  totalOrders: 150,
  totalRevenue: 25000,
  totalAdmins: 8,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { role: 'super_admin' } });
  mockUseAdminStatsQuery.mockReturnValue({
    data: defaultStats,
    isLoading: false,
    refetch: mockGetAdminStats,
  });
  mockGetAdminStats.mockResolvedValue(defaultStats);
});

describe('SuperDashboardPanel', () => {
  it('renders loading state', () => {
    mockUseAdminStatsQuery.mockReturnValue({ data: null, isLoading: true, refetch: mockGetAdminStats });
    render(<SuperDashboardPanel />);
    expect(screen.getByText('Loading platform stats...')).toBeInTheDocument();
  });

  it('renders stats after loading', async () => {
    render(<SuperDashboardPanel />);
    await waitFor(() => {
      expect(screen.getByText('Platform Overview')).toBeInTheDocument();
    });
    expect(screen.getByText('Total Tenants')).toBeInTheDocument();
    expect(screen.getByText('Total Camps')).toBeInTheDocument();
    expect(screen.getByText('Total Rooms')).toBeInTheDocument();
  });

  it('shows error state with retry', async () => {
    mockUseAdminStatsQuery.mockReturnValue({ data: null, isLoading: false, isError: true, error: new Error('Failed'), refetch: mockGetAdminStats });
    render(<SuperDashboardPanel />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load platform stats')).toBeInTheDocument();
    });
  });

  it('shows Quick Actions', async () => {
    render(<SuperDashboardPanel />);
    await waitFor(() => {
      expect(screen.getByText('Create Tenant')).toBeInTheDocument();
    });
    expect(screen.getByText('View All Orders')).toBeInTheDocument();
  });

  it('calls onNavigateToTab when clicking quick actions', async () => {
    const onNavigate = vi.fn();
    render(<SuperDashboardPanel onNavigateToTab={onNavigate} />);
    await waitFor(() => {
      expect(screen.getByText('Create Tenant')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Create Tenant').closest('button')!);
    expect(onNavigate).toHaveBeenCalledWith('super_tenants');
  });

  it('navigates to super reservations from the second quick action', async () => {
    const onNavigate = vi.fn();
    render(<SuperDashboardPanel onNavigateToTab={onNavigate} />);
    await waitFor(() => {
      expect(screen.getAllByTestId('quick-action').length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getAllByTestId('quick-action')[1]);
    expect(onNavigate).toHaveBeenCalledWith('super_reservations');
  });

  it('shows access denied for non-super-admin', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    render(<SuperDashboardPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });
});
