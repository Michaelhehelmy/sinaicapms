import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import SubscriptionsPanel from '@/components/admin/SubscriptionsPanel';

const mockShowToast = vi.fn();
let subscriptionsData: { data: unknown[]; total: number; page: number; pageSize: number } = { data: [], total: 0, page: 1, pageSize: 20 };
let subsLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  updateAdminSubscription: vi.fn(),
  cancelAdminSubscription: vi.fn(),
  resumeAdminSubscription: vi.fn(),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  return {
    queryKeys: {
      adminSubscriptions: () => ['admin', 'subscriptions'],
    },
    useAdminSubscriptionsQuery: () => {
      const [d, setD] = React.useState(subscriptionsData);
      const [l, setL] = React.useState(subsLoading);
      React.useEffect(() => { setD(subscriptionsData); setL(subsLoading); });
      return { data: d, isLoading: l };
    },
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
  Button: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: (e?: React.MouseEvent) => void; disabled?: boolean; [key: string]: unknown }) => (
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
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode; variant?: string; size?: string; dot?: boolean; className?: string }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, actions, pagination, rowKey }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
    pagination?: { page: number; total: number; pageSize: number; onChange: (p: number) => void };
    rowKey?: string;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {data.map((row: Record<string, unknown>, i: number) => (
        <div key={i} data-testid="data-row">
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
      {pagination && (
        <div data-testid="pagination">
          <span>Page {pagination.page}</span>
          <button data-testid="next-page" onClick={() => pagination.onChange(pagination.page + 1)}>Next</button>
        </div>
      )}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel, submitDisabled, danger }: {
    open: boolean; title: string; children: React.ReactNode;
    onClose?: () => void; onSubmit?: () => void; submitLabel?: string; submitDisabled?: boolean; danger?: boolean;
  }) => open ? (
    <div data-testid="form-modal">
      <h2>{title}</h2>
      {children}
      {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
      {onSubmit && <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>{submitLabel || 'Submit'}</button>}
    </div>
  ) : null,
}));

import * as api from '@/lib/api';
const mockUpdateAdminSubscription = vi.mocked(api.updateAdminSubscription);
const mockCancelAdminSubscription = vi.mocked(api.cancelAdminSubscription);
const mockResumeAdminSubscription = vi.mocked(api.resumeAdminSubscription);

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SubscriptionsPanel /></QueryClientProvider>);
}

const mockSubs = [
  { tenantId: 't1', tenantName: 'Camp Alpha', plan: 'pro', status: 'active', usage: { bookings: 500, limit: 10000, percent: 5 }, totalPaid: 999 },
  { tenantId: 't2', tenantName: 'Camp Beta', plan: 'free', status: 'canceled', usage: { bookings: 50, limit: 100, percent: 50 }, totalPaid: 0 },
  { tenantId: 't3', tenantName: 'Camp Gamma', plan: 'starter', status: 'active', usage: { bookings: 900, limit: 1000, percent: 90 }, totalPaid: 250 },
];

describe('SubscriptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionsData = { data: [], total: 0, page: 1, pageSize: 20 };
    subsLoading = false;
  });

  it('renders with empty state', () => {
    renderPanel();
    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    expect(screen.getByText('0 total subscriptions')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    subsLoading = true;
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders subscriptions with data', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByText('3 total subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Camp Alpha')).toBeInTheDocument();
    expect(screen.getByText('Camp Beta')).toBeInTheDocument();
  });

  it('renders plan summary cards', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    // Plan names render as summary-card badges, which also appear as <option> in the Plan filter select
    expect(screen.getAllByText('Free')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Starter')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Pro')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Enterprise')[0]).toBeInTheDocument();
  });

  it('shows usage bar with different percentages', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    // Usage percentages: 5%, 50%, 90%
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('opens change plan modal', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('upgrades subscription plan', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    mockUpdateAdminSubscription.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    fireEvent.change(screen.getByTestId('select-New Plan'), { target: { value: 'enterprise' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateAdminSubscription).toHaveBeenCalledWith('t1', { plan: 'enterprise' });
      expect(mockShowToast).toHaveBeenCalledWith('Subscription updated to enterprise', 'success');
    });
  });

  it('upgrade error shows toast', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    mockUpdateAdminSubscription.mockRejectedValue(new Error('upgrade fail'));
    renderPanel();
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    fireEvent.change(screen.getByTestId('select-New Plan'), { target: { value: 'enterprise' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to update'), 'error');
    });
  });

  it('cancels active subscription', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    mockCancelAdminSubscription.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCancelAdminSubscription).toHaveBeenCalledWith('t1');
      expect(mockShowToast).toHaveBeenCalledWith('Subscription canceled', 'success');
    });
  });

  it('cancels canceled subscription action error', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    mockCancelAdminSubscription.mockRejectedValue(new Error('cancel fail'));
    renderPanel();
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Action failed'), 'error');
    });
  });

  it('resumes canceled subscription', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    mockResumeAdminSubscription.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByText('Resume'));
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockResumeAdminSubscription).toHaveBeenCalledWith('t2');
      expect(mockShowToast).toHaveBeenCalledWith('Subscription resumed', 'success');
    });
  });

  it('resume error shows toast', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    mockResumeAdminSubscription.mockRejectedValue(new Error('resume fail'));
    renderPanel();
    fireEvent.click(screen.getByText('Resume'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Action failed'), 'error');
    });
  });

  it('updates plan filter', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: 'pro' } });
    expect(screen.getByTestId('select-Plan')).toHaveValue('pro');
  });

  it('updates status filter', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Status'), { target: { value: 'active' } });
    expect(screen.getByTestId('select-Status')).toHaveValue('active');
  });

  it('updates search filter', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText('Tenant name...'), { target: { value: 'Alpha' } });
    expect(screen.getByPlaceholderText('Tenant name...')).toHaveValue('Alpha');
  });

  it('clears all filters', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.getByTestId('select-Plan')).toHaveValue('');
  });

  it('removes a single filter when set to empty value', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: 'pro' } });
    fireEvent.change(screen.getByTestId('select-Plan'), { target: { value: '' } });
    expect(screen.getByTestId('select-Plan')).toHaveValue('');
  });

  it('shows pagination', () => {
    subscriptionsData = { data: mockSubs, total: 45, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('next-page'));
  });

  it('renders total paid amounts', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByText('$999.00')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
  });

  it('closes the change plan modal', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('closes the confirmation dialog via cancel button', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('closes the resume confirmation dialog via cancel button', () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.click(screen.getByText('Resume'));
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('does not submit upgrade when no plan selected', async () => {
    subscriptionsData = { data: mockSubs, total: 3, page: 1, pageSize: 20 };
    renderPanel();
    fireEvent.click(screen.getAllByText('Change Plan')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateAdminSubscription).not.toHaveBeenCalled();
    });
  });

  it('usage bar shows critical color for >90% usage', () => {
    const redSubscribe = [
      { tenantId: 't4', tenantName: 'Camp Red', plan: 'pro', status: 'active', usage: { bookings: 950, limit: 1000, percent: 95 }, totalPaid: 999 },
    ];
    subscriptionsData = { data: redSubscribe, total: 1, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('usage bar shows warning color for >70% usage', () => {
    const yellowSubscribe = [
      { tenantId: 't5', tenantName: 'Camp Yellow', plan: 'pro', status: 'active', usage: { bookings: 800, limit: 1000, percent: 80 }, totalPaid: 999 },
    ];
    subscriptionsData = { data: yellowSubscribe, total: 1, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('renders a row with no usage data', () => {
    const noUsage = [
      { tenantId: 't6', tenantName: 'Camp None', plan: 'free', status: 'active', totalPaid: 0 },
    ];
    subscriptionsData = { data: noUsage, total: 1, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });

  it('renders row with undefined plan to fallback badge', () => {
    const weirdPlan = [
      { tenantId: 't7', tenantName: 'Camp Weird', plan: 'mystery', status: 'bizarre', totalPaid: 0 },
    ];
    subscriptionsData = { data: weirdPlan, total: 1, page: 1, pageSize: 20 };
    renderPanel();
    expect(screen.getByText('Mystery')).toBeInTheDocument();
    expect(screen.getByText('bizarre')).toBeInTheDocument();
  });
});
