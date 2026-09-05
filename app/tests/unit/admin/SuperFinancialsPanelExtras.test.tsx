import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import SuperFinancialsPanel from '@/components/admin/SuperFinancialsPanel';

// ── Mock conventions mirroring tests/unit/components/admin/hr-financial.test.tsx ──
const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'super_admin' };

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  getAdminTenants: vi.fn(),
  getAdminPublicPayments: vi.fn(),
  getAdminPayouts: vi.fn(),
  getAdminPayout: vi.fn(),
  createAdminPayout: vi.fn(),
  markAdminPayoutPaid: vi.fn(),
  cancelAdminPayout: vi.fn(),
}));

import * as api from '@/lib/api';
const mockApiFetch = vi.mocked(api.apiFetch);
const mockGetAdminTenants = vi.mocked(api.getAdminTenants);
const mockGetAdminPublicPayments = vi.mocked(api.getAdminPublicPayments);
const mockGetAdminPayouts = vi.mocked(api.getAdminPayouts);
const mockGetAdminPayout = vi.mocked(api.getAdminPayout);
const mockCreateAdminPayout = vi.mocked(api.createAdminPayout);

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${Number(v).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

// DataTable mock forwards onRowClick so row clicks drive handleRowClick.
vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    actions,
    onRowClick,
  }: {
    data: unknown[];
    columns: { key: string; header?: string; render?: (item: unknown) => React.ReactNode }[];
    actions?: (row: unknown) => React.ReactNode;
    onRowClick?: (row: unknown) => void;
  }) => (
    <div data-testid="data-table">
      {data.map((row, i) => (
        <div key={i} data-testid="data-row" onClick={onRowClick ? () => onRowClick(row) : undefined}>
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({
    open,
    title,
    children,
    onClose,
    onSubmit,
    submitLabel,
    submitDisabled,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    onSubmit?: () => void;
    submitLabel?: string;
    submitDisabled?: boolean;
  }) =>
    open ? (
      <div data-testid="form-modal">
        <h2>{title}</h2>
        {children}
        {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
        {onSubmit && (
          <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel || 'Submit'}
          </button>
        )}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    options,
    value,
    onChange,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    label,
    value,
    onChange,
    placeholder,
    type,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} data-testid={label ? `input-${label}` : 'input'} />
    </div>
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, loading, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; [key: string]: unknown }) => (
    <button onClick={onClick} disabled={disabled} data-testid={rest['data-testid'] as string | undefined} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div {...rest}>{children}</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state"><h3>{title}</h3>{description && <p>{description}</p>}</div>
  ),
}));

vi.mock('@/components/ui/StatCard', () => ({
  StatCard: ({ title, value }: { title: string; value: unknown }) => (
    <div data-testid="stat-card"><span>{title}</span><span>{String(value)}</span></div>
  ),
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => <span data-testid="status-tag">{status}</span>,
}));

// ── Fixtures ──
const mockTenants = [
  { id: 't1', name: 'Acacia Camp', subdomain: 'acacia', status: 'active' },
  { id: 't2', name: 'Sinai Lodge', subdomain: 'sinai', status: 'active' },
];

const mockOverview = {
  totalAccounts: 5,
  totalInvoices: 12,
  totalRevenue: 5000,
  totalCollected: 3000,
  overdueCount: 1,
  totalGross: 1000,
  totalFees: 100,
  totalNet: 900,
  tenantBreakdown: [
    { tenant_id: 't1', tenant_name: 'Acacia Camp', invoice_count: 5, total_revenue: 2000, total_collected: 1000 },
    { tenant_id: 't2', tenant_name: 'Sinai Lodge', invoice_count: 7, total_revenue: 3000, total_collected: 2000 },
  ],
  marketplaceBreakdown: [
    { tenantId: 't1', tenantName: 'Acacia Camp', paymentCount: 3, gross: 600, fees: 60, net: 540 },
    { tenantId: 't2', tenantName: 'Sinai Lodge', paymentCount: 2, gross: 400, fees: 40, net: 360 },
  ],
};

const mockPublicPayments = [
  {
    id: 'mp1', orderId: 'o1', tenantId: '1', orderReference: 'REF-1001', channel: 'marketplace',
    grossAmount: 600, marketplaceFee: 60, netAmount: 540, currency: 'EGP', paymentStatus: 'captured',
    capturedAt: '2025-07-01T10:00:00Z', tenantName: 'Acacia Camp',
  },
  {
    id: 'mp2', orderId: 'o2', tenantId: '2', orderReference: 'REF-1002', channel: 'pos',
    grossAmount: 400, marketplaceFee: 40, netAmount: 360, currency: 'EGP', paymentStatus: 'settled',
    capturedAt: '2025-07-02T12:00:00Z', tenantName: 'Sinai Lodge',
  },
];

const mockPayouts = [
  {
    id: 'po_1', tenantId: 1, tenantName: 'Acacia Camp', amount: 540, currency: 'EGP',
    method: 'bank_transfer', status: 'pending', reference: null, notes: null, itemCount: 2,
    createdAt: '2025-07-03T09:00:00Z', paidAt: null, cancelledAt: null,
  },
];

const mockInvoices = [
  { id: 'i1', invoice_number: 'INV-100', type: 'sales', status: 'paid', total_amount: 150, tenant_name: 'Acacia Camp', issue_date: '2025-06-01' },
  { id: 'i2', invoice_number: 'INV-101', type: 'purchase', status: 'overdue', total_amount: 250, tenant_name: 'Sinai Lodge', issue_date: '2025-05-01' },
];

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SuperFinancialsPanel /></QueryClientProvider>);
}

function mockApi() {
  mockGetAdminTenants.mockReset();
  mockGetAdminPublicPayments.mockReset();
  mockGetAdminPayouts.mockReset();
  mockGetAdminPayout.mockReset();
  mockCreateAdminPayout.mockReset();
  mockGetAdminTenants.mockResolvedValue(mockTenants as never);
  mockGetAdminPublicPayments.mockResolvedValue({ data: mockPublicPayments, total: 2, page: 1, pageSize: 20, hasMore: false } as never);
  mockGetAdminPayouts.mockResolvedValue({ data: mockPayouts, total: 1, page: 1, pageSize: 20, hasMore: false } as never);
  mockApiFetch.mockImplementation(((url: string) => {
    if (url === '/admin/financials/overview') return Promise.resolve(mockOverview);
    if (url.startsWith('/admin/financials/invoices')) return Promise.resolve({ data: mockInvoices, total: 2 });
    return Promise.resolve(null);
  }) as never);
}

describe('SuperFinancialsPanel extras coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'super_admin' };
    mockApi();
  });

  it('changes the marketplace payments status filter', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('REF-1001')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('select-Filter by Status'), { target: { value: 'captured' } });
    // triggers setPaymentsStatus + setPaymentsPage(1); payments query refetches
    await waitFor(() => {
      expect(mockGetAdminPublicPayments).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'captured', page: 1 }),
      );
    });
  });

  it('changes the payouts status filter', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('super-financials-panel')).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByTestId('data-row').length).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByTestId('select-Filter Payouts by Status'), { target: { value: 'pending' } });
    await waitFor(() => {
      expect(mockGetAdminPayouts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', page: 1 }),
      );
    });
  });

  it('opens payout line items when a payout row is clicked', async () => {
    mockGetAdminPayout.mockResolvedValue({
      id: 'po_1',
      items: [
        { id: 'li_1', orderReference: 'REF-1001', grossAmount: 300, marketplaceFee: 30, netAmount: 270, currency: 'EGP', capturedAt: '2025-07-01T10:00:00Z' },
      ],
    } as never);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('super-financials-panel')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('cancel-payout-po_1')).toBeInTheDocument());
    const row = screen.getByTestId('cancel-payout-po_1').closest('[data-testid="data-row"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as Element);
    await waitFor(() => {
      expect(mockGetAdminPayout).toHaveBeenCalledWith('po_1');
      expect(screen.getByText('Payout Line Items')).toBeInTheDocument();
      expect(screen.getByText('REF-1001')).toBeInTheDocument();
    });
  });

  it('shows a toast when loading payout details fails', async () => {
    mockGetAdminPayout.mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('super-financials-panel')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('cancel-payout-po_1')).toBeInTheDocument());
    const row = screen.getByTestId('cancel-payout-po_1').closest('[data-testid="data-row"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as Element);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load payout details'), 'error');
    });
  });

  it('clears the captured-payment selection from the selection bar', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('REF-1001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-payment-mp1'));
    expect(screen.getByTestId('payout-selection-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      expect(screen.queryByTestId('payout-selection-bar')).not.toBeInTheDocument();
    });
  });

  it('edits payout method, reference and notes, then closes the modal', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('REF-1001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-payment-mp1'));
    fireEvent.click(screen.getByTestId('create-payout-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payout' })).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('select-Payment Method'), { target: { value: 'cash' } });
    fireEvent.change(screen.getByTestId('input-Reference'), { target: { value: 'batch#9' } });
    fireEvent.change(screen.getByTestId('payout-notes'), { target: { value: 'note here' } });

    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateAdminPayout).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          paymentIds: ['mp1'],
          method: 'cash',
          reference: 'batch#9',
          notes: 'note here',
        }),
      );
    });

    // Re-open and close the modal via its close button (FormModal onClose).
    fireEvent.click(screen.getByTestId('select-payment-mp1'));
    fireEvent.click(screen.getByTestId('create-payout-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payout' })).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create Payout' })).not.toBeInTheDocument();
    });
  });
});
