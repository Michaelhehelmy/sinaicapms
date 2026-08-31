import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import HRPanel from '@/components/admin/HRPanel';

const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'super_admin' };

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const state = {
    employees: [] as unknown[],
    leaveTypes: [] as unknown[],
    leaveRequests: [] as unknown[],
    payrollRuns: [] as unknown[],
    jobPosts: [] as unknown[],
    loading: false,
  };
  return {
    queryKeys: {
      hrEmployees: ['admin', 'hr', 'employees'],
      hrLeaveTypes: ['admin', 'hr', 'leaveTypes'],
      hrLeaveRequests: ['admin', 'hr', 'leaveRequests'],
      hrPayrollRuns: ['admin', 'hr', 'payrollRuns'],
      hrJobPosts: ['admin', 'hr', 'jobPosts'],
    },
    useHrEmployeesQuery: () => ({ data: state.employees, isLoading: state.loading }),
    useHrLeaveTypesQuery: () => ({ data: state.leaveTypes, isLoading: state.loading }),
    useHrLeaveRequestsQuery: () => ({ data: state.leaveRequests, isLoading: state.loading }),
    useHrPayrollRunsQuery: () => ({ data: state.payrollRuns, isLoading: state.loading }),
    useHrJobPostsQuery: () => ({ data: state.jobPosts, isLoading: state.loading }),
    __reset: () => {
      state.employees = [];
      state.leaveTypes = [];
      state.leaveRequests = [];
      state.payrollRuns = [];
      state.jobPosts = [];
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
}));

import * as api from '@/lib/api';
const mockCreateHrEmployee = vi.mocked(api.createHrEmployee);
const mockUpdateHrEmployee = vi.mocked(api.updateHrEmployee);
const mockDeleteHrEmployee = vi.mocked(api.deleteHrEmployee);
const mockCreateHrLeaveType = vi.mocked(api.createHrLeaveType);
const mockCreateHrLeaveRequest = vi.mocked(api.createHrLeaveRequest);
const mockApproveHrLeaveRequest = vi.mocked(api.approveHrLeaveRequest);
const mockCreateHrPayrollRun = vi.mocked(api.createHrPayrollRun);
const mockCreateHrJobPost = vi.mocked(api.createHrJobPost);
const mockCreateHrApplicant = vi.mocked(api.createHrApplicant);

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
];

const mockPayrollRuns = [
  { id: 'pr_1', periodStart: '2025-06-01', periodEnd: '2025-06-30', status: 'completed', totalGross: 5000, totalDeductions: 500, totalNet: 4500 },
];

const mockJobPosts = [
  { id: 'jp_1', title: 'Front Desk Clerk', department: 'Front Desk', location: 'Sinai', status: 'open' },
  { id: 'jp_2', title: 'Chef', department: 'Kitchen', location: 'Sinai', status: 'filled' },
];

describe('HRPanel extra coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hooks as Record<string, unknown>).__reset();
    Object.defineProperty(window, 'open', { writable: true, value: vi.fn().mockReturnValue(fakePrintWindow) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Error toasts for remaining catch blocks ──────────────────────────────

  it('leave type API error shows error toast', async () => {
    mockCreateHrLeaveType.mockRejectedValue(new Error('db boom'));
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    fireEvent.click(screen.getByTestId('add-leave-type-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Leave Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Maternity' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: db boom', 'error');
    });
  });

  it('leave request API error shows error toast', async () => {
    mockCreateHrLeaveRequest.mockRejectedValue(new Error('nope'));
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('add-leave-request-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Leave Request' })));
    fireEvent.change(screen.getByTestId('select-Employee *'), { target: { value: 'emp_1' } });
    fireEvent.change(screen.getByTestId('select-Leave Type *'), { target: { value: 'lt_1' } });
    fireEvent.change(screen.getByTestId('input-Start Date *'), { target: { value: '2025-08-10' } });
    fireEvent.change(screen.getByTestId('input-End Date *'), { target: { value: '2025-08-12' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: nope', 'error');
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('payroll run API error shows error toast', async () => {
    mockCreateHrPayrollRun.mockRejectedValue(new Error('payroll failed'));
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getByTestId('create-payroll-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payroll Run' })));
    fireEvent.change(screen.getByTestId('input-Period Start *'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByTestId('input-Period End *'), { target: { value: '2025-07-31' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: payroll failed', 'error');
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('job post API error shows error toast', async () => {
    mockCreateHrJobPost.mockRejectedValue(new Error('post boom'));
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('add-job-post-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Job Post' })));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Reservation Agent' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: post boom', 'error');
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('submit application API error shows error toast', async () => {
    mockCreateHrApplicant.mockRejectedValue(new Error('app boom'));
    setHrData({ employees: mockEmployees, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getAllByText('Apply')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Submit Application' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Sara' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'sara@x.com' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: app boom', 'error');
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  // ── Non-Error throw (String(err) branch in catch blocks) ────────────────

  it('employee create catch handles non-Error throw', async () => {
    mockCreateHrEmployee.mockRejectedValue('plain string error');
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'ali@x.com' } });
    fireEvent.change(screen.getByTestId('input-Hire Date *'), { target: { value: '2025-09-01' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: plain string error', 'error');
    });
  });

  it('approve leave request catch handles non-Error throw', async () => {
    mockApproveHrLeaveRequest.mockRejectedValue('stringy');
    setHrData({ employees: mockEmployees, leaveRequests: mockLeaveRequests });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getAllByText('Approve')[0]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: stringy', 'error');
    });
  });

  it('delete employee catch handles non-Error throw', async () => {
    mockDeleteHrEmployee.mockRejectedValue('oops');
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: oops', 'error');
    });
  });

  // ── handleDelete guard (no delete target) ────────────────────────────────

  it('handleDelete does nothing when no delete target', async () => {
    mockDeleteHrEmployee.mockResolvedValue({ success: true } as never);
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    // ConfirmDialog is not open; render the panel and ensure no crash + no API call
    expect(screen.getByTestId('hr-panel')).toBeInTheDocument();
    // Directly invoke the guarded path via the delete button flow but cancel first
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(mockDeleteHrEmployee).not.toHaveBeenCalled();
  });

  // ── Empty state action buttons for remaining tabs ────────────────────────

  it('leave types empty state action opens add form', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    fireEvent.click(screen.getByTestId('empty-state').querySelector('button') as HTMLButtonElement);
    expect(screen.getByRole('heading', { name: 'Add Leave Type' })).toBeInTheDocument();
  });

  it('leave requests empty state action opens add form', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('empty-state').querySelector('button') as HTMLButtonElement);
    expect(screen.getByRole('heading', { name: 'New Leave Request' })).toBeInTheDocument();
  });

  it('payroll empty state action opens create form', () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getByTestId('empty-state').querySelector('button') as HTMLButtonElement);
    expect(screen.getByRole('heading', { name: 'Create Payroll Run' })).toBeInTheDocument();
  });

  it('recruitment empty state action opens add form', () => {
    setHrData({ employees: mockEmployees });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('empty-state').querySelector('button') as HTMLButtonElement);
    expect(screen.getByRole('heading', { name: 'New Job Post' })).toBeInTheDocument();
  });

  // ── Full employee form field onChange coverage ───────────────────────────

  it('add employee passes through all optional fields', async () => {
    mockCreateHrEmployee.mockResolvedValue({ id: 'emp_new', success: true } as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));

    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'ali@x.com' } });
    fireEvent.change(screen.getByTestId('input-Hire Date *'), { target: { value: '2025-09-01' } });
    // Optional fields (exercise the onChange updater callbacks)
    fireEvent.change(screen.getByTestId('input-Phone'), { target: { value: '+2010000000' } });
    fireEvent.change(screen.getByTestId('input-Department'), { target: { value: 'Ops' } });
    fireEvent.change(screen.getByTestId('input-Position'), { target: { value: 'Manager' } });
    fireEvent.change(screen.getByTestId('select-Salary Type'), { target: { value: 'hourly' } });
    fireEvent.change(screen.getByTestId('input-Salary Amount'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('input-Currency'), { target: { value: 'EGP' } });
    fireEvent.change(screen.getByTestId('input-Bank Account'), { target: { value: '123456' } });
    fireEvent.change(screen.getByTestId('input-Tax ID'), { target: { value: 'TAX-1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));

    await waitFor(() => {
      expect(mockCreateHrEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Ali', lastName: 'Khan', email: 'ali@x.com', hireDate: '2025-09-01',
          phone: '+2010000000', department: 'Ops', position: 'Manager',
          salaryType: 'hourly', salaryAmount: 25, currency: 'EGP',
          bankAccount: '123456', taxId: 'TAX-1',
        }),
      );
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'hr'] });
  });

  it('edit employee pre-fills snake_case fields and saves', async () => {
    mockUpdateHrEmployee.mockResolvedValue({ success: true } as never);
    const snakeEmp = {
      id: 'emp_9', first_name: 'Jane', last_name: 'Smith', email: 'jane@x.com',
      department: 'Kitchen', position: 'Chef', status: 'active',
      salary_type: 'annual', salary_amount: 40000, currency: 'USD',
      hire_date: '2023-01-01', phone: '555', bank_account: 'BA', tax_id: 'TX',
    };
    setHrData({ employees: [snakeEmp] });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Employee' })));
    // Verify snake_case fields populate into the form
    expect(screen.getByTestId('input-First Name *')).toHaveValue('Jane');
    expect(screen.getByTestId('input-Last Name *')).toHaveValue('Smith');
    expect(screen.getByTestId('input-Hire Date *')).toHaveValue('2023-01-01');
    expect(screen.getByTestId('input-Salary Amount')).toHaveValue(40000);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdateHrEmployee).toHaveBeenCalledWith('emp_9', expect.objectContaining({ firstName: 'Jane' }));
    });
  });

  // ── Leave request notes field ────────────────────────────────────────────

  it('new leave request includes notes', async () => {
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
    fireEvent.change(screen.getByTestId('input-Notes'), { target: { value: 'Family emergency' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrLeaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Family emergency' }),
      );
    });
  });

  // ── Job post location & description fields ───────────────────────────────

  it('new job post includes location and description', async () => {
    mockCreateHrJobPost.mockResolvedValue({ id: 'jp_new', success: true } as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('add-job-post-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Job Post' })));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Reservation Agent' } });
    fireEvent.change(screen.getByTestId('input-Department'), { target: { value: 'Reservations' } });
    fireEvent.change(screen.getByTestId('input-Location'), { target: { value: 'Sinai' } });
    fireEvent.change(screen.getByTestId('input-Description'), { target: { value: 'Handle bookings' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrJobPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Reservation Agent', department: 'Reservations', location: 'Sinai', description: 'Handle bookings' }),
      );
    });
  });

  // ── Applicant phone & job post select field ──────────────────────────────

  it('submit application includes phone', async () => {
    mockCreateHrApplicant.mockResolvedValue({ id: 'app_new', success: true } as never);
    const twoOpenJobs = [
      { id: 'jp_1', title: 'Front Desk Clerk', department: 'Front Desk', location: 'Sinai', status: 'open' },
      { id: 'jp_3', title: 'Waiter', department: 'Restaurant', location: 'Sinai', status: 'open' },
    ];
    setHrData({ employees: mockEmployees, jobPosts: twoOpenJobs });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getAllByText('Apply')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Submit Application' })));
    expect(screen.getByTestId('select-Job Post *')).toHaveValue('jp_1');
    fireEvent.change(screen.getByTestId('select-Job Post *'), { target: { value: 'jp_3' } });
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Sara' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'sara@x.com' } });
    fireEvent.change(screen.getByTestId('input-Phone'), { target: { value: '0100' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateHrApplicant).toHaveBeenCalledWith(
        expect.objectContaining({ jobPostId: 'jp_3', name: 'Sara', email: 'sara@x.com', phone: '0100' }),
      );
    });
  });

  // ── Payslip with snake_case payroll fields ───────────────────────────────

  it('download payslip handles snake_case payroll run', async () => {
    const snakePr = { id: 'pr_2', period_start: '2025-05-01', period_end: '2025-05-31', status: 'processing', total_gross: 4000, total_deductions: 400, total_net: 3600 };
    setHrData({ employees: mockEmployees, payrollRuns: [snakePr] });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    expect(screen.getByText('Processing')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Download Payslip'));
    await waitFor(() => {
      expect(window.open).toHaveBeenCalled();
    });
    expect(fakePrintWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('2025-05-01'));
    expect(fakePrintWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('processing'));
  });

  // ── "Saving..." states while a request is in-flight ──────────────────────
  // These cover the submitLabel/submitDisabled ternary branches that render
  // "Saving..." / "Creating..." when `saving` is true and the modal is open.

  it('employee form shows Saving label while request is pending', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateHrEmployee.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Khan' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'ali@x.com' } });
    fireEvent.change(screen.getByTestId('input-Hire Date *'), { target: { value: '2025-09-01' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    await act(async () => { resolve({ id: 'x', success: true }); });
  });

  it('leave type form shows Saving label while request is pending', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateHrLeaveType.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    fireEvent.click(screen.getByTestId('add-leave-type-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Leave Type' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Maternity' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    await act(async () => { resolve({ id: 'x', success: true }); });
  });

  it('leave request form shows Saving label while request is pending', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateHrLeaveRequest.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('add-leave-request-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Leave Request' })));
    fireEvent.change(screen.getByTestId('select-Employee *'), { target: { value: 'emp_1' } });
    fireEvent.change(screen.getByTestId('select-Leave Type *'), { target: { value: 'lt_1' } });
    fireEvent.change(screen.getByTestId('input-Start Date *'), { target: { value: '2025-08-10' } });
    fireEvent.change(screen.getByTestId('input-End Date *'), { target: { value: '2025-08-12' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    await act(async () => { resolve({ id: 'x', success: true }); });
  });

  it('payroll form shows Creating label while request is pending', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateHrPayrollRun.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getByTestId('create-payroll-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payroll Run' })));
    fireEvent.change(screen.getByTestId('input-Period Start *'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByTestId('input-Period End *'), { target: { value: '2025-07-31' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    await act(async () => { resolve({ id: 'x', success: true }); });
  });

  it('job post form shows Saving label while request is pending', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateHrJobPost.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('add-job-post-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Job Post' })));
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Reservation Agent' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    await act(async () => { resolve({ id: 'x', success: true }); });
  });

  it('applicant form shows Saving label while request is pending', async () => {
    let resolve!: (v: unknown) => void;
    mockCreateHrApplicant.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    setHrData({ employees: mockEmployees, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getAllByText('Apply')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Submit Application' })));
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Sara' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'sara@x.com' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    await act(async () => { resolve({ id: 'x', success: true }); });
  });

  // ── Modal close handlers (onClose for each form) ─────────────────────────

  it('closes employee modal via close button', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('add-employee-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Employee' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add Employee' })).not.toBeInTheDocument());
  });

  it('closes leave type modal via close button', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-types'));
    fireEvent.click(screen.getByTestId('add-leave-type-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Leave Type' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add Leave Type' })).not.toBeInTheDocument());
  });

  it('closes leave request modal via close button', async () => {
    setHrData({ employees: mockEmployees, leaveTypes: mockLeaveTypes });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    fireEvent.click(screen.getByTestId('add-leave-request-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Leave Request' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'New Leave Request' })).not.toBeInTheDocument());
  });

  it('closes payroll modal via close button', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-payroll'));
    fireEvent.click(screen.getByTestId('create-payroll-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Payroll Run' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Payroll Run' })).not.toBeInTheDocument());
  });

  it('closes job post modal via close button', async () => {
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getByTestId('add-job-post-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Job Post' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'New Job Post' })).not.toBeInTheDocument());
  });

  it('closes applicant modal via close button', async () => {
    setHrData({ employees: mockEmployees, jobPosts: mockJobPosts });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-recruitment'));
    fireEvent.click(screen.getAllByText('Apply')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Submit Application' })));
    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Submit Application' })).not.toBeInTheDocument());
  });

  // ── Leave request with snake_case fields renders correctly ───────────────

  it('renders snake_case leave request fields and unknown status', () => {
    const snakeRequests = [
      { id: 'lr_x', first_name: 'Bob', last_name: 'Brown', leave_type_name: 'Vacation', start_date: '2025-09-01', end_date: '2025-09-02', days: 1, status: 'pending' },
    ];
    setHrData({ employees: mockEmployees, leaveRequests: snakeRequests });
    renderWithClient(<HRPanel />);
    fireEvent.click(screen.getByTestId('tab-leave-requests'));
    expect(screen.getByText('Bob Brown')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
    expect(screen.getByText('2025-09-01 - 2025-09-02')).toBeInTheDocument();
    expect(screen.getAllByText('Approve')).toHaveLength(1);
    expect(screen.getAllByText('Reject')).toHaveLength(1);
  });
});
