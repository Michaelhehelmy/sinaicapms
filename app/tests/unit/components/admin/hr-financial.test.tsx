import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import HRPanel from '@/components/admin/HRPanel';
import SuperHRPanel from '@/components/admin/SuperHRPanel';
import FinancialPanel from '@/components/admin/FinancialPanel';
import SuperFinancialsPanel from '@/components/admin/SuperFinancialsPanel';

const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'super_admin' };

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Both panels consume TanStack Query data hooks. The mock exposes mutable
// module state plus setters so each test can seed data before render.
vi.mock('@/hooks/useQueryHooks', () => {
  const state = {
    employees: [] as unknown[],
    leaveTypes: [] as unknown[],
    leaveRequests: [] as unknown[],
    payrollRuns: [] as unknown[],
    jobPosts: [] as unknown[],
    accounts: [] as unknown[],
    journals: [] as unknown[],
    entries: [] as unknown[],
    invoices: [] as unknown[],
    payments: [] as unknown[],
    taxRates: [] as unknown[],
    loading: false,
  };
  return {
    queryKeys: {
      hrEmployees: ['admin', 'hr', 'employees'],
      hrLeaveTypes: ['admin', 'hr', 'leaveTypes'],
      hrLeaveRequests: ['admin', 'hr', 'leaveRequests'],
      hrPayrollRuns: ['admin', 'hr', 'payrollRuns'],
      hrJobPosts: ['admin', 'hr', 'jobPosts'],
      financialAccounts: ['admin', 'financials', 'accounts'],
      financialJournals: ['admin', 'financials', 'journals'],
      financialJournalEntries: ['admin', 'financials', 'journalEntries'],
      financialInvoices: ['admin', 'financials', 'invoices'],
      financialPayments: ['admin', 'financials', 'payments'],
      financialTaxRates: ['admin', 'financials', 'taxRates'],
    },
    useHrEmployeesQuery: () => ({ data: state.employees, isLoading: state.loading }),
    useHrLeaveTypesQuery: () => ({ data: state.leaveTypes, isLoading: state.loading }),
    useHrLeaveRequestsQuery: () => ({ data: state.leaveRequests, isLoading: state.loading }),
    useHrPayrollRunsQuery: () => ({ data: state.payrollRuns, isLoading: state.loading }),
    useHrJobPostsQuery: () => ({ data: state.jobPosts, isLoading: state.loading }),
    useFinancialAccountsQuery: () => ({ data: state.accounts, isLoading: state.loading }),
    useFinancialJournalsQuery: () => ({ data: state.journals, isLoading: state.loading }),
    useFinancialJournalEntriesQuery: () => ({ data: state.entries, isLoading: state.loading }),
    useFinancialInvoicesQuery: () => ({ data: state.invoices, isLoading: state.loading }),
    useFinancialPaymentsQuery: () => ({ data: state.payments, isLoading: state.loading }),
    useFinancialTaxRatesQuery: () => ({ data: state.taxRates, isLoading: state.loading }),
    __reset: () => {
      state.employees = [];
      state.leaveTypes = [];
      state.leaveRequests = [];
      state.payrollRuns = [];
      state.jobPosts = [];
      state.accounts = [];
      state.journals = [];
      state.entries = [];
      state.invoices = [];
      state.payments = [];
      state.taxRates = [];
      state.loading = false;
    },
    __setData: (patch: Record<string, unknown>) => { Object.assign(state, patch); },
  };
});

const hooks = vi.mocked(await import('@/hooks/useQueryHooks'));

function setHrData(patch: Record<string, unknown>) {
  (hooks as Record<string, unknown>).__setData(patch);
}

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  getAdminTenants: vi.fn(),
  getHrEmployees: vi.fn(),
  getHrLeaveTypes: vi.fn(),
  getHrLeaveRequests: vi.fn(),
  getHrPayrollRuns: vi.fn(),
  getHrJobPosts: vi.fn(),
  createHrEmployee: vi.fn(),
  updateHrEmployee: vi.fn(),
  deleteHrEmployee: vi.fn(),
  createHrLeaveType: vi.fn(),
  createHrLeaveRequest: vi.fn(),
  approveHrLeaveRequest: vi.fn(),
  createHrPayrollRun: vi.fn(),
  createHrJobPost: vi.fn(),
  createHrApplicant: vi.fn(),
  getFinancialAccounts: vi.fn(),
  getFinancialJournals: vi.fn(),
  getJournalEntries: vi.fn(),
  getFinancialInvoices: vi.fn(),
  getTaxRates: vi.fn(),
  createFinancialAccount: vi.fn(),
  updateFinancialAccount: vi.fn(),
  deleteFinancialAccount: vi.fn(),
  createFinancialJournal: vi.fn(),
  createJournalEntry: vi.fn(),
  postJournalEntry: vi.fn(),
  createFinancialInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  createPayment: vi.fn(),
  createTaxRate: vi.fn(),
}));

import * as api from '@/lib/api';
const mockApiFetch = vi.mocked(api.apiFetch);
const mockGetAdminTenants = vi.mocked(api.getAdminTenants);
const mockCreateHrEmployee = vi.mocked(api.createHrEmployee);
const mockUpdateHrEmployee = vi.mocked(api.updateHrEmployee);
const mockDeleteHrEmployee = vi.mocked(api.deleteHrEmployee);
const mockCreateHrLeaveType = vi.mocked(api.createHrLeaveType);
const mockCreateHrLeaveRequest = vi.mocked(api.createHrLeaveRequest);
const mockApproveHrLeaveRequest = vi.mocked(api.approveHrLeaveRequest);
const mockCreateHrPayrollRun = vi.mocked(api.createHrPayrollRun);
const mockCreateHrJobPost = vi.mocked(api.createHrJobPost);
const mockCreateHrApplicant = vi.mocked(api.createHrApplicant);
const mockCreateFinancialAccount = vi.mocked(api.createFinancialAccount);
const mockUpdateFinancialAccount = vi.mocked(api.updateFinancialAccount);
const mockDeleteFinancialAccount = vi.mocked(api.deleteFinancialAccount);
const mockCreateJournalEntry = vi.mocked(api.createJournalEntry);
const mockPostJournalEntry = vi.mocked(api.postJournalEntry);
const mockCreateFinancialInvoice = vi.mocked(api.createFinancialInvoice);
const mockUpdateInvoiceStatus = vi.mocked(api.updateInvoiceStatus);
const mockCreatePayment = vi.mocked(api.createPayment);
const mockCreateTaxRate = vi.mocked(api.createTaxRate);

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${Number(v).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
    actions,
  }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
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

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        {onConfirm && <button data-testid="confirm-yes" onClick={onConfirm}>Confirm</button>}
        {onCancel && <button data-testid="confirm-no" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => <span data-testid="status-tag">{status}</span>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/StatCard', () => ({
  StatCard: ({ title, value }: { title: string; value: unknown }) => (
    <div data-testid="stat-card">
      <span>{title}</span>
      <span>{String(value)}</span>
    </div>
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid={rest['data-testid'] as string | undefined} {...rest}>{children}</button>
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
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={label ? `input-${label}` : 'input'}
      />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    options,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select
        value={value}
        onChange={onChange}
        data-testid={label ? `select-${label}` : 'select'}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div {...rest}>{children}</div>,
}));

// ─── Shared helpers ────────────────────────────────────────────────────────

let invalidateSpy: ReturnType<typeof vi.fn>;

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const fakePrintWindow = {
  document: { write: vi.fn(), close: vi.fn() },
  print: vi.fn(),
};

// ─── Shared mock data ──────────────────────────────────────────────────────

const mockEmployees = [
  { id: 'emp_1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', department: 'Front Desk', position: 'Clerk', status: 'active', salaryType: 'monthly', salaryAmount: 2000, currency: 'USD', hireDate: '2024-01-15' },
  { id: 'emp_2', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', department: 'Kitchen', position: 'Cook', status: 'terminated', salary_type: 'hourly', salary_amount: 15, currency: 'USD', hire_date: '2023-05-01' },
];

const mockLeaveTypes = [
  { id: 'lt_1', name: 'Vacation', accrualRate: 21, isPaid: 1 },
  { id: 'lt_2', name: 'Sick Leave', accrual_rate: 10, is_paid: 0 },
];

const mockLeaveRequests = [
  { id: 'lr_1', firstName: 'John', lastName: 'Doe', leaveTypeName: 'Vacation', startDate: '2025-07-01', endDate: '2025-07-05', days: 5, status: 'pending' },
  { id: 'lr_2', first_name: 'Jane', last_name: 'Smith', leave_type_name: 'Sick Leave', start_date: '2025-06-01', end_date: '2025-06-02', days: 2, status: 'approved' },
  { id: 'lr_3', firstName: 'Sam', lastName: 'Lee', leaveTypeName: 'Unknown', startDate: '2025-08-01', endDate: '2025-08-01', days: 1, status: 'weird' },
];

const mockPayrollRuns = [
  { id: 'pr_1', periodStart: '2025-06-01', periodEnd: '2025-06-30', status: 'completed', totalGross: 5000, totalDeductions: 500, totalNet: 4500 },
  { id: 'pr_2', period_start: '2025-05-01', period_end: '2025-05-31', status: 'draft', total_gross: 4000, total_deductions: 400, total_net: 3600 },
];

const mockJobPosts = [
  { id: 'jp_1', title: 'Front Desk Clerk', department: 'Front Desk', location: 'Sinai', status: 'open' },
  { id: 'jp_2', title: 'Chef', department: 'Kitchen', location: 'Sinai', status: 'filled' },
];

const mockAccounts = [
  { id: 'acc_1', code: '1000', name: 'Cash', type: 'asset', is_active: 1, parent_id: null },
  { id: 'acc_2', code: '2000', name: 'Accounts Payable', type: 'liability', is_active: 0, parent_id: null },
  { id: 'acc_3', code: '3000', name: 'Revenue', type: 'revenue', is_active: 1, parent_id: null },
];

const mockJournals = [
  { id: 'j_1', name: 'Sales Journal', type: 'sales', sequence_next: 1, is_active: 1 },
  { id: 'j_2', name: 'Old Journal', type: 'general', sequence_next: 1, is_active: 0 },
];

const mockEntries = [
  { id: 'e_1', journal_id: 'j_1', journal_name: 'Sales Journal', date: '2025-06-01T00:00:00Z', description: 'Sale', reference: 'INV-1', posted: 0, lines: [] },
  { id: 'e_2', journal_id: 'j_2', journal_name: 'Old Journal', date: '2025-05-01T00:00:00Z', description: 'Adjustment', reference: 'ADJ-1', posted: 1, lines: [] },
];

const mockInvoices = [
  { id: 'inv_1', invoice_number: 'INV-0001', type: 'sales', contact_id: null, issue_date: '2025-06-01', due_date: '2025-07-01', total_amount: 100, paid_amount: 0, status: 'draft', currency: 'USD' },
  { id: 'inv_2', invoice_number: 'INV-0002', type: 'purchase', contact_id: null, issue_date: '2025-06-02', due_date: null, total_amount: 200, paid_amount: 0, status: 'sent', currency: 'USD' },
  { id: 'inv_3', invoice_number: 'INV-0003', type: 'sales', contact_id: null, issue_date: '2025-06-03', due_date: null, total_amount: 300, paid_amount: 300, status: 'paid', currency: 'USD' },
];

const mockPayments = [
  { id: 'pay_1', invoice_id: 'inv_3', amount: 300, payment_date: '2025-06-05T00:00:00Z', method: 'card', status: 'completed', reference: 'REF-1' },
];

const mockTaxRates = [
  { id: 'tax_1', name: 'VAT', rate: 14, jurisdiction: 'EG', is_default: 1 },
  { id: 'tax_2', name: 'Sales Tax', rate: 5, jurisdiction: null, is_default: 0 },
];

const mockSuperTenants = [
  { id: 't1', name: 'Acacia Camp', subdomain: 'acacia', status: 'active' },
  { id: 't2', name: 'Sinai Lodge', subdomain: 'sinai', status: 'active' },
];

const mockHrOverview = {
  totalEmployees: 10,
  activeEmployees: 8,
  pendingLeaveRequests: 2,
  totalPayrollRuns: 3,
  tenantBreakdown: [
    { tenant_id: 't1', tenant_name: 'Acacia Camp', employee_count: 6, active_count: 4 },
    { tenant_id: 't2', tenant_name: 'Sinai Lodge', employee_count: 4, active_count: 4 },
  ],
};

const mockSuperEmployees = [
  { id: 'e1', first_name: 'John', last_name: 'Doe', email: 'j@x.com', department: 'Front Desk', position: 'Clerk', status: 'active', tenant_name: 'Acacia Camp', hire_date: '2024-01-01' },
  { id: 'e2', first_name: 'Jane', last_name: 'Smith', email: 'j2@x.com', department: 'Kitchen', position: 'Cook', status: 'active', tenant_name: 'Sinai Lodge', hire_date: '2023-05-01' },
];

const mockFinancialOverview = {
  totalAccounts: 5,
  totalInvoices: 12,
  totalRevenue: 5000,
  totalCollected: 3000,
  overdueCount: 1,
  tenantBreakdown: [
    { tenant_id: 't1', tenant_name: 'Acacia Camp', invoice_count: 5, total_revenue: 2000, total_collected: 1000 },
    { tenant_id: 't2', tenant_name: 'Sinai Lodge', invoice_count: 7, total_revenue: 3000, total_collected: 2000 },
  ],
};

const mockSuperInvoices = [
  { id: 'i1', invoice_number: 'INV-100', type: 'sales', status: 'paid', total_amount: 150, tenant_name: 'Acacia Camp', issue_date: '2025-06-01' },
  { id: 'i2', invoice_number: 'INV-101', type: 'purchase', status: 'overdue', total_amount: 250, tenant_name: 'Sinai Lodge', issue_date: '2025-05-01' },
];

function mockSuperHrApi() {
  mockGetAdminTenants.mockResolvedValue(mockSuperTenants as never);
  mockApiFetch.mockImplementation(((url: string) => {
    if (url === '/admin/hr/overview') return Promise.resolve(mockHrOverview);
    if (url.startsWith('/admin/hr/employees')) return Promise.resolve({ data: mockSuperEmployees, total: 2 });
    return Promise.resolve(null);
  }) as never);
}

function mockSuperFinancialApi() {
  mockGetAdminTenants.mockResolvedValue(mockSuperTenants as never);
  mockApiFetch.mockImplementation(((url: string) => {
    if (url === '/admin/financials/overview') return Promise.resolve(mockFinancialOverview);
    if (url.startsWith('/admin/financials/invoices')) return Promise.resolve({ data: mockSuperInvoices, total: 2 });
    return Promise.resolve(null);
  }) as never);
}

// ─── HRPanel ───────────────────────────────────────────────────────────────

describe('HRPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hooks as Record<string, unknown>).__reset();
    Object.defineProperty(window, 'open', { writable: true, value: vi.fn().mockReturnValue(fakePrintWindow) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders employee table with data', () => {
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    expect(screen.getByTestId('hr-panel')).toBeInTheDocument();
    expect(screen.getByText('HR & Payroll')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('$2000.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('terminated')).toBeInTheDocument();
  });

  it('shows loading spinner while queries load', () => {
    setHrData({ loading: true });
    renderWithClient(<HRPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading HR data...')).toBeInTheDocument();
  });

  it('shows empty state when no employees exist', () => {
    renderWithClient(<HRPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No employees')).toBeInTheDocument();
  });

  it('opens add employee modal from empty state action', () => {
    renderWithClient(<HRPanel />);
    const emptyAction = screen.getByTestId('empty-state').querySelector('button') as HTMLButtonElement;
    fireEvent.click(emptyAction);
    expect(screen.getByRole('heading', { name: 'Add Employee' })).toBeInTheDocument();
  });

  it('switches between all HR tabs', () => {
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes, leaveRequests: mockLeaveRequests, payrollRuns: mockPayrollRuns, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    expect(screen.getByTestId('add-employee-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-leave-types'));
    expect(screen.getByTestId('add-leave-type-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    expect(screen.getByTestId('add-leave-request-btn')).toBeInTheDocument();
    expect(screen.getByText('Leave Requests (3)')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-payroll'));
    expect(screen.getByTestId('create-payroll-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-recruitment'));
    expect(screen.getByTestId('add-job-post-btn')).toBeInTheDocument();
  });

  it('renders leave types table with paid badges', () => {
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    expect(screen.getByText('Vacation')).toBeInTheDocument();
    expect(screen.getByText('Sick Leave')).toBeInTheDocument();
    expect(screen.getByText('21 days/year')).toBeInTheDocument();
    expect(screen.getByText('10 days/year')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('shows empty state when no leave types', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No leave types')).toBeInTheDocument();
  });

  it('renders leave requests and only pending rows get approve/reject', () => {
    setHrData({ employees: mockEmployees, leaveRequests: mockLeaveRequests });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('weird')).toBeInTheDocument();
    expect(screen.getAllByText('Approve')).toHaveLength(1);
    expect(screen.getAllByText('Reject')).toHaveLength(1);
  });

  it('shows empty state when no leave requests', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No leave requests')).toBeInTheDocument();
  });

  it('renders payroll runs table', () => {
    setHrData({ employees: mockEmployees, payrollRuns: mockPayrollRuns });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    expect(screen.getByText('2025-06-01 - 2025-06-30')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('$5000.00')).toBeInTheDocument();
    expect(screen.getByText('$4500.00')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getAllByText('Download Payslip')).toHaveLength(2);
  });

  it('shows empty state when no payroll runs', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No payroll runs')).toBeInTheDocument();
  });

  it('renders recruitment job posts table', () => {
    setHrData({ employees: mockEmployees, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    expect(screen.getByText('Front Desk Clerk')).toBeInTheDocument();
    expect(screen.getByText('Chef')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('filled')).toBeInTheDocument();
    expect(screen.getAllByText('Apply')).toHaveLength(2);
  });

  it('shows empty state when no job posts', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No job posts')).toBeInTheDocument();
  });

  // ── Employee form ──

  it('employee validation rejects missing name', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
    expect(mockCreateHrEmployee).not.toHaveBeenCalled();
  });

  it('employee validation rejects missing email', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Email is required.', 'warning');
    });
  });

  it('employee validation rejects missing hire date', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'ali@x.com' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Hire date is required.', 'warning');
    });
  });

  it('add employee creates successfully', async () => {
    mockCreateHrEmployee.mockResolvedValue({ id: 'emp_new', success: true } as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));

    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'ali@x.com' } });
    fireEvent.change(screen.getByTestId('input-Hire Date *'), { target: { value: '2025-09-01' } });
    fireEvent.change(screen.getByTestId('input-Department'), { target: { value: 'Ops' } });
    fireEvent.change(screen.getByTestId('input-Salary Amount'), { target: { value: '2500' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockCreateHrEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'Ali', lastName: 'Khan', email: 'ali@x.com', hireDate: '2025-09-01', salaryAmount: 2500 }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Employee created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('add employee API error shows error toast', async () => {
    mockCreateHrEmployee.mockRejectedValue(new Error('db failure'));
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'ali@x.com' } });
    fireEvent.change(screen.getByTestId('input-Hire Date *'), { target: { value: '2025-09-01' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  it('edit employee pre-fills fields', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByRole('heading', { name: 'Edit Employee' })).toBeInTheDocument();
    expect(screen.getByTestId('input-First Name *')).toHaveValue('John');
    expect(screen.getByTestId('input-Last Name *')).toHaveValue('Doe');
    expect(screen.getByTestId('input-Email *')).toHaveValue('john@example.com');
    expect(screen.getByTestId('input-Hire Date *')).toHaveValue('2024-01-15');
    expect(screen.getByTestId('input-Salary Amount')).toHaveValue(2000);
  });

  it('edit employee saves with updated data', async () => {
    mockUpdateHrEmployee.mockResolvedValue({ success: true } as never);
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Employee' })));
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Johnny' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateHrEmployee).toHaveBeenCalledWith('emp_1', expect.objectContaining({ firstName: 'Johnny' }));
      expect(mockShowToast).toHaveBeenCalledWith('Employee updated.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('delete employee shows confirm dialog and deletes', async () => {
    mockDeleteHrEmployee.mockResolvedValue({ success: true } as never);
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete "John"/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteHrEmployee).toHaveBeenCalledWith('emp_1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('delete employee cancel does not call API', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(mockDeleteHrEmployee).not.toHaveBeenCalled();
  });

  it('delete employee API error shows error toast', async () => {
    mockDeleteHrEmployee.mockRejectedValue(new Error('cannot delete'));
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  // ── Leave type form ──

  it('add leave type rejects empty name', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    fireEvent.click(screen.getByTestId('add-leave-type-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Leave Type' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
    expect(mockCreateHrLeaveType).not.toHaveBeenCalled();
  });

  it('add leave type creates successfully with paid toggle', async () => {
    mockCreateHrLeaveType.mockResolvedValue({ id: 'lt_new', success: true } as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    fireEvent.click(screen.getByTestId('add-leave-type-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Leave Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Maternity' } });
    fireEvent.change(screen.getByTestId('input-Accrual Rate (days/year)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrLeaveType).toHaveBeenCalledWith({ name: 'Maternity', accrualRate: 30, isPaid: false });
      expect(mockShowToast).toHaveBeenCalledWith('Leave type created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  // ── Leave request form ──

  it('new leave request rejects missing employee and leave type', async () => {
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('add-leave-request-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Leave Request' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Employee and leave type are required.', 'warning');
    });
    expect(mockCreateHrLeaveRequest).not.toHaveBeenCalled();
  });

  it('new leave request rejects missing dates', async () => {
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('add-leave-request-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Leave Request' })));
    fireEvent.change(screen.getByTestId('select-Employee *'), { target: { value: 'emp_1' } });
    fireEvent.change(screen.getByTestId('select-Leave Type *'), { target: { value: 'lt_1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Start and end dates are required.', 'warning');
    });
  });

  it('new leave request creates successfully', async () => {
    mockCreateHrLeaveRequest.mockResolvedValue({ id: 'lr_new', success: true } as never);
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('add-leave-request-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Leave Request' })));
    fireEvent.change(screen.getByTestId('select-Employee *'), { target: { value: 'emp_1' } });
    fireEvent.change(screen.getByTestId('select-Leave Type *'), { target: { value: 'lt_1' } });
    fireEvent.change(screen.getByTestId('input-Start Date *'), { target: { value: '2025-08-10' } });
    fireEvent.change(screen.getByTestId('input-End Date *'), { target: { value: '2025-08-12' } });
    fireEvent.change(screen.getByTestId('input-Days'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrLeaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp_1', leaveTypeId: 'lt_1', startDate: '2025-08-10', endDate: '2025-08-12', days: 3 }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Leave request submitted.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('approves a pending leave request', async () => {
    mockApproveHrLeaveRequest.mockResolvedValue({ success: true } as never);
    setHrData({ employees: mockEmployees, leaveRequests: mockLeaveRequests });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getAllByText('Approve')[0]);
    await waitFor(() => {
      expect(mockApproveHrLeaveRequest).toHaveBeenCalledWith('lr_1', 'approved');
      expect(mockShowToast).toHaveBeenCalledWith('Leave request approved.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('rejects a pending leave request', async () => {
    mockApproveHrLeaveRequest.mockResolvedValue({ success: true } as never);
    setHrData({ employees: mockEmployees, leaveRequests: mockLeaveRequests });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getAllByText('Reject')[0]);
    await waitFor(() => {
      expect(mockApproveHrLeaveRequest).toHaveBeenCalledWith('lr_1', 'rejected');
      expect(mockShowToast).toHaveBeenCalledWith('Leave request rejected.', 'success');
    });
  });

  it('approve request API error shows error toast', async () => {
    mockApproveHrLeaveRequest.mockRejectedValue(new Error('nope'));
    setHrData({ employees: mockEmployees, leaveRequests: mockLeaveRequests });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getAllByText('Approve')[0]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  // ── Payroll form ──

  it('create payroll run rejects missing period dates', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getByTestId('create-payroll-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payroll Run' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Period dates are required.', 'warning');
    });
    expect(mockCreateHrPayrollRun).not.toHaveBeenCalled();
  });

  it('create payroll run creates successfully', async () => {
    mockCreateHrPayrollRun.mockResolvedValue({ id: 'pr_new', success: true } as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getByTestId('create-payroll-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payroll Run' })));
    fireEvent.change(screen.getByTestId('input-Period Start *'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByTestId('input-Period End *'), { target: { value: '2025-07-31' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrPayrollRun).toHaveBeenCalledWith({ periodStart: '2025-07-01', periodEnd: '2025-07-31' });
      expect(mockShowToast).toHaveBeenCalledWith('Payroll run created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('download payslip opens a print window', async () => {
    setHrData({ employees: mockEmployees, payrollRuns: mockPayrollRuns });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getAllByText('Download Payslip')[0]);
    await waitFor(() => {
      expect(window.open).toHaveBeenCalled();
    });
    expect(fakePrintWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('PAYSLIP'));
    expect(fakePrintWindow.document.close).toHaveBeenCalled();
  });

  // ── Recruitment forms ──

  it('new job post rejects empty title', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('add-job-post-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Job Post' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title is required.', 'warning');
    });
    expect(mockCreateHrJobPost).not.toHaveBeenCalled();
  });

  it('new job post creates successfully', async () => {
    mockCreateHrJobPost.mockResolvedValue({ id: 'jp_new', success: true } as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('add-job-post-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Job Post' })));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Reservation Agent' } });
    fireEvent.change(screen.getByTestId('input-Department'), { target: { value: 'Reservations' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrJobPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Reservation Agent', department: 'Reservations' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Job post created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('submit application rejects missing fields', async () => {
    setHrData({ employees: mockEmployees, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getAllByText('Apply')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Submit Application' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Job, name, and email are required.', 'warning');
    });
    expect(mockCreateHrApplicant).not.toHaveBeenCalled();
  });

  it('submit application creates successfully', async () => {
    mockCreateHrApplicant.mockResolvedValue({ id: 'app_new', success: true } as never);
    setHrData({ employees: mockEmployees, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getAllByText('Apply')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Submit Application' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Sara' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'sara@x.com' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrApplicant).toHaveBeenCalledWith(
        expect.objectContaining({ jobPostId: 'jp_1', name: 'Sara', email: 'sara@x.com' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Application submitted.', 'success');
    });
  });
});

// ─── FinancialPanel ────────────────────────────────────────────────────────

describe('FinancialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hooks as Record<string, unknown>).__reset();
  });

  it('renders accounts table by default', () => {
    setHrData({ accounts: mockAccounts, journals: mockJournals, entries: mockEntries, invoices: mockInvoices, payments: mockPayments, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    expect(screen.getByTestId('financial-panel')).toBeInTheDocument();
    expect(screen.getByText('Financial Management')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows loading spinner while queries load', () => {
    setHrData({ loading: true });
    renderWithClient(<FinancialPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading financial data...')).toBeInTheDocument();
  });

  it('shows empty state for accounts when no data', () => {
    renderWithClient(<FinancialPanel />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No accounts')).toBeInTheDocument();
  });

  it('switches between all financial tabs', () => {
    setHrData({ accounts: mockAccounts, journals: mockJournals, entries: mockEntries, invoices: mockInvoices, payments: mockPayments, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    expect(screen.getByText('Add Account')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.getByText('Journal Entries')).toBeInTheDocument();
    expect(screen.getByText('New Entry')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByText('New Invoice')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-payments'));
    expect(screen.getByText('Record Payment')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-taxes'));
    expect(screen.getByText('Add Tax Rate')).toBeInTheDocument();
  });

  it('renders journal entries with post action for drafts', async () => {
    setHrData({ accounts: mockAccounts, entries: mockEntries });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.getByText('Sale')).toBeInTheDocument();
    expect(screen.getByText('Adjustment')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
    expect(screen.getAllByText('Post')).toHaveLength(1);

    mockPostJournalEntry.mockResolvedValue({ success: true } as never);
    fireEvent.click(screen.getAllByText('Post')[0]);
    await waitFor(() => {
      expect(mockPostJournalEntry).toHaveBeenCalledWith('e_1');
      expect(mockShowToast).toHaveBeenCalledWith('Entry posted.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('post entry API error shows error toast', async () => {
    mockPostJournalEntry.mockRejectedValue(new Error('nope'));
    setHrData({ accounts: mockAccounts, entries: mockEntries });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('Post')[0]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  it('shows empty state when no journal entries', () => {
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No journal entries')).toBeInTheDocument();
  });

  it('renders invoices with send and mark paid actions', async () => {
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
    expect(screen.getByText('INV-0002')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();

    mockUpdateInvoiceStatus.mockResolvedValue({ success: true } as never);
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(mockUpdateInvoiceStatus).toHaveBeenCalledWith('inv_1', 'sent');
      expect(mockShowToast).toHaveBeenCalledWith('Invoice marked as sent.', 'success');
    });

    fireEvent.click(screen.getByText('Mark Paid'));
    await waitFor(() => {
      expect(mockUpdateInvoiceStatus).toHaveBeenCalledWith('inv_2', 'paid');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('shows empty state when no invoices', () => {
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No invoices')).toBeInTheDocument();
  });

  it('renders payments table', () => {
    setHrData({ accounts: mockAccounts, payments: mockPayments });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-payments'));
    expect(screen.getByText('$300.00')).toBeInTheDocument();
    expect(screen.getByText('card')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows empty state when no payments', () => {
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-payments'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No payments')).toBeInTheDocument();
  });

  it('renders tax rates with default badge and edit action', () => {
    setHrData({ accounts: mockAccounts, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    expect(screen.getByText('VAT')).toBeInTheDocument();
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getAllByText('Edit')).toHaveLength(2);
  });

  it('shows empty state when no tax rates', () => {
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No tax rates')).toBeInTheDocument();
  });

  // ── Account form ──

  it('add account rejects missing code/name', async () => {
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Account' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Code and name are required.', 'warning');
    });
    expect(mockCreateFinancialAccount).not.toHaveBeenCalled();
  });

  it('add account creates successfully', async () => {
    mockCreateFinancialAccount.mockResolvedValue({ id: 'acc_new', success: true } as never);
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Account' })));
    fireEvent.change(screen.getByTestId('input-Code *'), { target: { value: '1100' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Petty Cash' } });
    fireEvent.change(screen.getByTestId('select-Type *'), { target: { value: 'asset' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateFinancialAccount).toHaveBeenCalledWith(
        expect.objectContaining({ code: '1100', name: 'Petty Cash', type: 'asset' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Account created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('add account API error shows error toast', async () => {
    mockCreateFinancialAccount.mockRejectedValue(new Error('nope'));
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Add Account')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Account' })));
    fireEvent.change(screen.getByTestId('input-Code *'), { target: { value: '1100' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Petty Cash' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  it('edit account pre-fills and updates', async () => {
    mockUpdateFinancialAccount.mockResolvedValue({ success: true } as never);
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByRole('heading', { name: 'Edit Account' })).toBeInTheDocument();
    expect(screen.getByTestId('input-Code *')).toHaveValue('1000');
    expect(screen.getByTestId('input-Name *')).toHaveValue('Cash');
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Cash & Bank' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateFinancialAccount).toHaveBeenCalledWith('acc_1', { name: 'Cash & Bank', type: 'asset' });
      expect(mockShowToast).toHaveBeenCalledWith('Account updated.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('deactivate account calls delete API', async () => {
    mockDeleteFinancialAccount.mockResolvedValue({ success: true } as never);
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Deactivate')[0]);
    await waitFor(() => {
      expect(mockDeleteFinancialAccount).toHaveBeenCalledWith('acc_1');
      expect(mockShowToast).toHaveBeenCalledWith('Account deactivated.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('deactivate account API error shows error toast', async () => {
    mockDeleteFinancialAccount.mockRejectedValue(new Error('nope'));
    setHrData({ accounts: mockAccounts });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getAllByText('Deactivate')[0]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  // ── Journal entry form ──

  it('new journal entry rejects missing journal', async () => {
    setHrData({ accounts: mockAccounts, journals: mockJournals });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Journal Entry' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Journal is required.', 'warning');
    });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it('new journal entry rejects fewer than 2 lines', async () => {
    setHrData({ accounts: mockAccounts, journals: mockJournals });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Journal Entry' })));
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('At least 2 lines required.', 'warning');
    });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it('new journal entry rejects unbalanced debits/credits', async () => {
    setHrData({ accounts: mockAccounts, journals: mockJournals });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Journal Entry' })));
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    fireEvent.change(screen.getAllByTestId('select')[0], { target: { value: 'acc_1' } });
    fireEvent.change(screen.getAllByTestId('select')[1], { target: { value: 'acc_3' } });
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByTestId('input')[3], { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Debits must equal credits.', 'warning');
    });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });

  it('new journal entry creates balanced entry', async () => {
    mockCreateJournalEntry.mockResolvedValue({ id: 'e_new', success: true } as never);
    setHrData({ accounts: mockAccounts, journals: mockJournals });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Journal Entry' })));
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    fireEvent.change(screen.getAllByTestId('select')[0], { target: { value: 'acc_1' } });
    fireEvent.change(screen.getAllByTestId('select')[1], { target: { value: 'acc_3' } });
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByTestId('input')[3], { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          journalId: 'j_1',
          lines: [
            { accountId: 'acc_1', debit: 100, credit: 0 },
            { accountId: 'acc_3', debit: 0, credit: 100 },
          ],
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Journal entry created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('new journal entry can add extra lines', async () => {
    mockCreateJournalEntry.mockResolvedValue({ id: 'e_new', success: true } as never);
    setHrData({ accounts: mockAccounts, journals: mockJournals });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Journal Entry' })));
    fireEvent.click(screen.getByText('+ Add Line'));
    // 3 lines now: selects 0..2
    expect(screen.getAllByTestId('select')).toHaveLength(3);
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    fireEvent.change(screen.getAllByTestId('select')[0], { target: { value: 'acc_1' } });
    fireEvent.change(screen.getAllByTestId('select')[2], { target: { value: 'acc_3' } });
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByTestId('input')[5], { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            { accountId: 'acc_1', debit: 100, credit: 0 },
            { accountId: 'acc_3', debit: 0, credit: 100 },
          ],
        }),
      );
    });
  });

  it('new journal entry API error shows error toast', async () => {
    mockCreateJournalEntry.mockRejectedValue(new Error('nope'));
    setHrData({ accounts: mockAccounts, journals: mockJournals });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-journals'));
    fireEvent.click(screen.getAllByText('New Entry')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Journal Entry' })));
    fireEvent.change(screen.getByTestId('select-Journal *'), { target: { value: 'j_1' } });
    fireEvent.change(screen.getAllByTestId('select')[0], { target: { value: 'acc_1' } });
    fireEvent.change(screen.getAllByTestId('select')[1], { target: { value: 'acc_3' } });
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByTestId('input')[3], { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  // ── Invoice form ──

  it('new invoice rejects missing line items', async () => {
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('New Invoice'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Invoice' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('At least one line item required.', 'warning');
    });
    expect(mockCreateFinancialInvoice).not.toHaveBeenCalled();
  });

  it('new invoice creates successfully', async () => {
    mockCreateFinancialInvoice.mockResolvedValue({ id: 'inv_new', success: true } as never);
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('New Invoice'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Invoice' })));
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: 'Consulting' } });
    fireEvent.change(screen.getAllByTestId('input')[1], { target: { value: '2' } });
    fireEvent.change(screen.getAllByTestId('input')[2], { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateFinancialInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sales',
          lines: [{ description: 'Consulting', quantity: 2, unitPrice: 150, taxRate: 0 }],
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Invoice created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('new invoice API error shows error toast', async () => {
    mockCreateFinancialInvoice.mockRejectedValue(new Error('nope'));
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('New Invoice'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Invoice' })));
    fireEvent.change(screen.getAllByTestId('input')[0], { target: { value: 'Consulting' } });
    fireEvent.change(screen.getAllByTestId('input')[2], { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  // ── Payment form ──

  it('record payment rejects missing amount', async () => {
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Record Payment' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Amount is required.', 'warning');
    });
    expect(mockCreatePayment).not.toHaveBeenCalled();
  });

  it('record payment creates successfully', async () => {
    mockCreatePayment.mockResolvedValue({ id: 'pay_new', success: true } as never);
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-payments'));
    fireEvent.click(screen.getAllByText('Record Payment')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Record Payment' })));
    fireEvent.change(screen.getByTestId('input-Amount *'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('select-Method *'), { target: { value: 'card' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 50, method: 'card' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Payment recorded.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  // ── Tax rate form ──

  it('add tax rate rejects missing name/rate', async () => {
    setHrData({ accounts: mockAccounts, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getByText('Add Tax Rate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Tax Rate' })));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name and rate are required.', 'warning');
    });
    expect(mockCreateTaxRate).not.toHaveBeenCalled();
  });

  it('add tax rate creates successfully with default toggle', async () => {
    mockCreateTaxRate.mockResolvedValue({ id: 'tax_new', success: true } as never);
    setHrData({ accounts: mockAccounts, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getByText('Add Tax Rate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Tax Rate' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'VAT New' } });
    fireEvent.change(screen.getByTestId('input-Rate (%) *'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateTaxRate).toHaveBeenCalledWith({ name: 'VAT New', rate: 10, jurisdiction: undefined, isDefault: 1 });
      expect(mockShowToast).toHaveBeenCalledWith('Tax rate created.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('edit tax rate pre-fills and saves via createTaxRate', async () => {
    mockCreateTaxRate.mockResolvedValue({ id: 'tax_1', success: true } as never);
    setHrData({ accounts: mockAccounts, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByRole('heading', { name: 'Edit Tax Rate' })).toBeInTheDocument();
    expect(screen.getByTestId('input-Name *')).toHaveValue('VAT');
    expect(screen.getByTestId('input-Rate (%) *')).toHaveValue(14);
    expect(screen.getByTestId('input-Jurisdiction')).toHaveValue('EG');
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'VAT 2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateTaxRate).toHaveBeenCalledWith({ name: 'VAT 2', rate: 14, jurisdiction: 'EG', isDefault: 1 });
      expect(mockShowToast).toHaveBeenCalledWith('Tax rate updated.', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'financials'] });
  });

  it('add tax rate API error shows error toast', async () => {
    mockCreateTaxRate.mockRejectedValue(new Error('nope'));
    setHrData({ accounts: mockAccounts, taxRates: mockTaxRates });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-taxes'));
    fireEvent.click(screen.getByText('Add Tax Rate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Tax Rate' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'VAT' } });
    fireEvent.change(screen.getByTestId('input-Rate (%) *'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });

  it('invoice status update API error shows error toast', async () => {
    mockUpdateInvoiceStatus.mockRejectedValue(new Error('nope'));
    setHrData({ accounts: mockAccounts, invoices: mockInvoices });
    renderWithClient(<FinancialPanel />);
    fireEvent.click(screen.getByTestId('tab-invoices'));
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error:'), 'error');
    });
  });
});

// ─── SuperHRPanel ───────────────────────────────────────────────────────────

describe('SuperHRPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hooks as Record<string, unknown>).__reset();
    mockUser = { role: 'super_admin' };
    mockSuperHrApi();
  });

  it('renders access denied for non-super admin', async () => {
    mockUser = { role: 'admin' };
    renderWithClient(<SuperHRPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
    // Make sure denied view is stable after async loads resolve.
    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
  });

  it('shows loading spinner then overview', async () => {
    renderWithClient(<SuperHRPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('HR & Payroll Overview')).toBeInTheDocument());
  });

  it('renders overview stats, tenant breakdown and employee table', async () => {
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    expect(screen.getByText('HR & Payroll Overview')).toBeInTheDocument();
    expect(screen.getByTestId('super-hr-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('stat-card')).toHaveLength(4);
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Employees by Tenant')).toBeInTheDocument();
    expect(screen.getByText('6 total')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
  });

  it('does not render tenant breakdown when empty', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/hr/overview') return Promise.resolve({ ...mockHrOverview, tenantBreakdown: [] });
      if (url.startsWith('/admin/hr/employees')) return Promise.resolve({ data: mockSuperEmployees, total: 2 });
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => expect(screen.getByText('HR & Payroll Overview')).toBeInTheDocument());
    expect(screen.queryByText('Employees by Tenant')).not.toBeInTheDocument();
  });

  it('renders empty state when no employees', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/hr/overview') return Promise.resolve(mockHrOverview);
      if (url.startsWith('/admin/hr/employees')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => expect(screen.getByText('No employees found')).toBeInTheDocument());
  });

  it('filtering by tenant triggers employee reload with tenantId', async () => {
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => expect(screen.getByText('HR & Payroll Overview')).toBeInTheDocument());
    act(() => {
      fireEvent.change(screen.getByTestId('select-Filter by Tenant'), { target: { value: 't1' } });
    });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/hr/employees?tenantId=t1');
    });
  });

  it('refresh button reloads employees for all tenants', async () => {
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => expect(screen.getByText('HR & Payroll Overview')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/hr/employees');
    });
  });

  it('shows toast when tenants fail to load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('tenant boom'));
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load tenants'), 'error');
    });
  });

  it('shows toast when overview fails to load', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/hr/overview') return Promise.reject(new Error('overview boom'));
      if (url.startsWith('/admin/hr/employees')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load HR overview'), 'error');
    });
  });

  it('shows toast when employees fail to load', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/hr/overview') return Promise.resolve(mockHrOverview);
      if (url.startsWith('/admin/hr/employees')) return Promise.reject(new Error('emp boom'));
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperHRPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load employees'), 'error');
    });
  });
});

// ─── SuperFinancialsPanel ───────────────────────────────────────────────────

describe('SuperFinancialsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hooks as Record<string, unknown>).__reset();
    mockUser = { role: 'super_admin' };
    mockSuperFinancialApi();
  });

  it('renders access denied for non-super admin', async () => {
    mockUser = { role: 'admin' };
    renderWithClient(<SuperFinancialsPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Access Denied')).toBeInTheDocument());
  });

  it('shows loading spinner then overview', async () => {
    renderWithClient(<SuperFinancialsPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Financial Overview')).toBeInTheDocument());
  });

  it('renders overview stats, revenue breakdown and invoices table', async () => {
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => expect(screen.getByText('INV-100')).toBeInTheDocument());
    expect(screen.getByText('Financial Overview')).toBeInTheDocument();
    expect(screen.getByTestId('super-financials-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('stat-card')).toHaveLength(4);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$5000.00')).toBeInTheDocument();
    expect(screen.getByText('Revenue by Tenant')).toBeInTheDocument();
    expect(screen.getByText('5 invoices')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByText('INV-101')).toBeInTheDocument();
    expect(screen.getByText('overdue')).toBeInTheDocument();
  });

  it('does not render revenue breakdown when empty', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/financials/overview') return Promise.resolve({ ...mockFinancialOverview, tenantBreakdown: [] });
      if (url.startsWith('/admin/financials/invoices')) return Promise.resolve({ data: mockSuperInvoices, total: 2 });
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => expect(screen.getByText('Financial Overview')).toBeInTheDocument());
    expect(screen.queryByText('Revenue by Tenant')).not.toBeInTheDocument();
  });

  it('renders empty state when no invoices', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/financials/overview') return Promise.resolve(mockFinancialOverview);
      if (url.startsWith('/admin/financials/invoices')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => expect(screen.getByText('No invoices found')).toBeInTheDocument());
  });

  it('filtering by tenant triggers invoice reload with tenantId', async () => {
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => expect(screen.getByText('Financial Overview')).toBeInTheDocument());
    act(() => {
      fireEvent.change(screen.getByTestId('select-Filter by Tenant'), { target: { value: 't1' } });
    });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/financials/invoices?tenantId=t1');
    });
  });

  it('refresh button reloads invoices for all tenants', async () => {
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => expect(screen.getByText('Financial Overview')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/financials/invoices');
    });
  });

  it('shows toast when tenants fail to load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('tenant boom'));
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load tenants'), 'error');
    });
  });

  it('shows toast when overview fails to load', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/financials/overview') return Promise.reject(new Error('overview boom'));
      if (url.startsWith('/admin/financials/invoices')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load financial overview'), 'error');
    });
  });

  it('shows toast when invoices fail to load', async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url === '/admin/financials/overview') return Promise.resolve(mockFinancialOverview);
      if (url.startsWith('/admin/financials/invoices')) return Promise.reject(new Error('inv boom'));
      return Promise.resolve(null);
    }) as never);
    renderWithClient(<SuperFinancialsPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load invoices'), 'error');
    });
  });
});