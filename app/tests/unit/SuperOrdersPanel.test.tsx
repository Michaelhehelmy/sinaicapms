import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperOrdersPanel from '@/components/admin/SuperOrdersPanel';

const mockShowToast = vi.fn();
const mockGetAdminTenants = vi.fn();
const mockGetOrders = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'super_admin' } }),
}));

vi.mock('@/lib/api', () => ({
  getAdminTenants: (...args: unknown[]) => mockGetAdminTenants(...args),
  getOrders: (...args: unknown[]) => mockGetOrders(...args),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div>{text}</div>,
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ columns, data }: { columns?: { key: string; render?: (row: unknown) => React.ReactNode }[]; data: unknown[] }) => (
    <div>
      <p>{data.length} rows</p>
      {data.map((item: unknown, i: number) => (
        <div key={i} data-testid="data-row">
          {columns &&
            columns.map((col) => (
              <span key={col.key} data-testid={`cell-${col.key}`}>
                {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? '')}
              </span>
            ))}
        </div>
      ))}
    </div>
  ),
}));

const sampleTenants = [
  { id: 't1', name: 'Camp Alpha', subdomain: 'alpha', status: 'active' },
  { id: 't2', name: 'Camp Beta', subdomain: 'beta', status: 'active' },
];

const sampleOrders = [
  { id: 'o1', reference: 'REF001', customerFirstName: 'John', customerLastName: 'Doe', checkInDate: '2025-07-15', checkOutDate: '2025-07-20', orderStateId: 'confirmed', paymentStatus: 'paid', totalAmount: 1500 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminTenants.mockResolvedValue([]);
  mockGetOrders.mockResolvedValue([]);
});

describe('SuperOrdersPanel', () => {
  it('shows loading state', () => {
    mockGetAdminTenants.mockReturnValue(new Promise(() => {}));
    render(<SuperOrdersPanel />);
    expect(screen.getByText('Loading tenants...')).toBeInTheDocument();
  });

  it('renders after loading', async () => {
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('All Tenant Orders')).toBeInTheDocument();
    });
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('No orders found')).toBeInTheDocument();
    });
  });

  it('shows access denied for non-super-admin', async () => {
    const authModule = await import('@/lib/auth');
    const spy = vi.spyOn(authModule, 'useAuth').mockReturnValue({ user: { role: 'admin' } } as any);
    render(<SuperOrdersPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('loads and displays tenants', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('All Tenant Orders')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Camp Alpha/ })).toBeInTheDocument();
    });
  });

  it('selects tenant and loads orders', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue({ data: sampleOrders });
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Camp Alpha/ })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockGetOrders).toHaveBeenCalledWith({ tenantId: 't1' });
    });
  });

  it('shows refresh button', async () => {
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('shows error when tenants fail to load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('Tenants error'));
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load tenants: Tenants error', 'error');
    });
  });

  it('shows order count', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue({ data: sampleOrders });
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('All Tenant Orders')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('1 order for Camp Alpha')).toBeInTheDocument();
    });
  });

  it('handles orders API error', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockRejectedValue(new Error('Orders error'));
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load orders: Orders error', 'error');
    });
  });

  it('handles empty tenants response', async () => {
    mockGetAdminTenants.mockResolvedValue(null);
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('All Tenant Orders')).toBeInTheDocument();
    });
  });

  it('handles non-array orders response', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue({ data: sampleOrders });
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('All Tenant Orders')).toBeInTheDocument();
    });
  });

  it('renders order table columns with fallbacks', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue({
      data: [
        { id: 'order-id-12345678', reference: '', customerFirstName: '', customerLastName: '', checkInDate: null, orderStateId: 'confirmed', paymentStatus: 'paid', totalAmount: 0 },
      ],
    });
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cell-reference')).toHaveTextContent('order-id');
    });
    expect(screen.getByTestId('cell-customerFirstName')).toHaveTextContent('Guest');
    expect(screen.getByTestId('cell-checkInDate')).toHaveTextContent('—');
    expect(screen.getByTestId('cell-orderStateId')).toHaveTextContent('confirmed');
    expect(screen.getByTestId('cell-totalAmount')).toHaveTextContent('$0.00');
  });

  it('renders guest full name and formatted date', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue({ data: sampleOrders });
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cell-reference')).toHaveTextContent('REF001');
    });
    expect(screen.getByTestId('cell-customerFirstName')).toHaveTextContent('John Doe');
    expect(screen.getByTestId('cell-checkInDate')).toHaveTextContent('2025-07-15');
    expect(screen.getByTestId('cell-totalAmount')).toHaveTextContent('$1500.00');
  });

  it('loads orders for the newly selected tenant', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue([]);
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Camp Beta/ })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Select Tenant'), { target: { value: 't2' } });
    await waitFor(() => {
      expect(mockGetOrders).toHaveBeenCalledWith({ tenantId: 't2' });
    });
  });

  it('refreshes orders on button click', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue([]);
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('0 orders for Camp Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockGetOrders).toHaveBeenCalledTimes(2);
    });
  });

  it('exports orders to CSV', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders.mockResolvedValue({ data: sampleOrders });
    const createObjectURL = vi.fn(() => 'blob:orders');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('1 order for Camp Alpha')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('export-csv-btn'));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:orders');
    clickSpy.mockRestore();
  });

  it('retries loading orders after an error', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetOrders
      .mockRejectedValueOnce(new Error('Orders error'))
      .mockResolvedValueOnce({ data: sampleOrders });
    render(<SuperOrdersPanel />);
    await waitFor(() => {
      expect(screen.getByText('Orders error')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(mockGetOrders).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText('1 order for Camp Alpha')).toBeInTheDocument();
  });
});
