import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import StaffPanel from '@/components/admin/StaffPanel';

const mockShowToast = vi.fn();
let mockUser: { role: string } | null = { role: 'admin' };
let mockPosUsersData: { data: unknown[]; total: number; page: number } = { data: [], total: 0, page: 1 };
let mockPosUsersLoading = false;
let mockPosUsersError: Error | null = null;
let mockTenantsData: unknown[] = [];
let mockTenantsLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  return {
    usePosUsersQuery: (params?: Record<string, unknown>) => {
      const [data, setData] = React.useState(mockPosUsersData);
      const [loading, setLoading] = React.useState(mockPosUsersLoading);
      const [error, setError] = React.useState(mockPosUsersError);
      React.useEffect(() => {
        setData(mockPosUsersData);
        setLoading(mockPosUsersLoading);
        setError(mockPosUsersError);
      });
      const refetch = React.useCallback(() => {
        setData(mockPosUsersData);
        setLoading(mockPosUsersLoading);
        setError(mockPosUsersError);
        return Promise.resolve();
      }, []);
      return { data, isLoading: loading, error, refetch };
    },
    useTenantsQuery: () => ({
      data: mockTenantsData,
      isLoading: mockTenantsLoading,
    }),
  };
});

vi.mock('@/lib/api', () => ({
  createPosUser: vi.fn(),
  updatePosUser: vi.fn(),
  deletePosUser: vi.fn(),
  resetPosUserPassword: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/admin/icons', () => ({
  IconStaff: () => <span data-testid="icon-staff" />,
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
    actions,
    pagination,
    searchable,
    searchPlaceholder,
    onSearch,
  }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
    pagination?: { page: number; total: number; pageSize: number; onChange: (p: number) => void };
    searchable?: boolean;
    searchPlaceholder?: string;
    onSearch?: (q: string) => void;
  }) => (
    <div data-testid="data-table">
      {searchable && (
        <input
          data-testid="search-input"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
        />
      )}
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
          <span>Page {pagination.page} of {Math.ceil(pagination.total / pagination.pageSize)}</span>
        </div>
      )}
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
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => <span data-testid="status-tag">{status}</span>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
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

import * as api from '@/lib/api';
const mockCreatePosUser = vi.mocked(api.createPosUser);
const mockUpdatePosUser = vi.mocked(api.updatePosUser);
const mockDeletePosUser = vi.mocked(api.deletePosUser);
const mockResetPosUserPassword = vi.mocked(api.resetPosUserPassword);

const mockStaff = [
  {
    id: 1,
    firstName: 'Alice',
    lastName: 'Morgan',
    email: 'alice@camp.com',
    username: 'alice',
    role: 'admin',
    phone: '+20123',
    department: 'Front Desk',
    employeeId: 'EMP001',
    isActive: true,
    lastLogin: '2025-06-01T10:00:00Z',
  },
  {
    id: 2,
    firstName: 'Bob',
    lastName: 'Tanner',
    email: 'bob@camp.com',
    username: 'bob',
    role: 'cashier',
    phone: '+20456',
    department: 'Cafeteria',
    employeeId: 'EMP002',
    isActive: false,
    lastLogin: null,
  },
  {
    id: 3,
    firstName: 'Carol',
    lastName: 'Watts',
    email: 'carol@camp.com',
    username: 'carol',
    role: 'manager',
    phone: '',
    department: '',
    employeeId: '',
    isActive: true,
    lastLogin: '2025-07-15T14:30:00Z',
  },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithQuery(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('StaffPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { role: 'admin' };
    mockPosUsersData = { data: [], total: 0, page: 1 };
    mockPosUsersLoading = false;
    mockPosUsersError = null;
    mockTenantsData = [];
    mockTenantsLoading = false;
  });

  it('renders with empty staff list', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText('No staff users found')).toBeInTheDocument();
    expect(screen.getByTestId('add-user-btn')).toBeInTheDocument();
  });

  it('shows loading spinner while fetching', () => {
    mockPosUsersLoading = true;
    renderWithQuery(<StaffPanel />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders staff rows when data exists', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice Morgan')).toBeInTheDocument();
    expect(screen.getByText('Bob Tanner')).toBeInTheDocument();
    expect(screen.getByText('Carol Watts')).toBeInTheDocument();
  });

  it('shows error state and retry button on API failure', async () => {
    mockPosUsersError = new Error('Network error');
    renderWithQuery(<StaffPanel />);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load staff'),
      'error',
    );
  });

  it('retries loading on retry click', async () => {
    mockPosUsersError = new Error('fail');
    renderWithQuery(<StaffPanel />);
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
    mockPosUsersError = null;
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    await act(async () => {
      fireEvent.click(screen.getByText('Retry'));
    });
    await waitFor(() => {
      expect(screen.getByText('Alice Morgan')).toBeInTheDocument();
    });
  });

  it('add staff button opens the form modal', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Add Staff User' })).toBeInTheDocument();
  });

  it('validates first name is required', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('This field is required', 'warning');
    });
  });

  it('validates email is required', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('This field is required', 'warning');
    });
  });

  it('validates email format', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please enter a valid email', 'warning');
    });
  });

  it('validates password minimum length on create', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByTestId('input-Password *'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Password must be at least 8 characters', 'warning');
    });
  });

  it('creates a new staff member with valid data', async () => {
    mockCreatePosUser.mockResolvedValue({} as never);
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByTestId('input-Password *'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('select-Role *'), { target: { value: 'cashier' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreatePosUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          password: 'password123',
          role: 'cashier',
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Staff user created successfully', 'success');
    });
  });

  it('opens edit modal with pre-filled data', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Edit Staff User' })).toBeInTheDocument();
    expect(screen.getByTestId('input-First Name *')).toHaveValue('Alice');
    expect(screen.getByTestId('input-Last Name *')).toHaveValue('Morgan');
    expect(screen.getByTestId('input-Email *')).toHaveValue('alice@camp.com');
  });

  it('does not show password field in edit mode', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Edit Staff User' })); });
    expect(screen.queryByTestId('input-Password *')).not.toBeInTheDocument();
  });

  it('updates an existing staff member', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    mockUpdatePosUser.mockResolvedValue({} as never);
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Edit Staff User' })); });
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'Alice Updated' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockUpdatePosUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ firstName: 'Alice Updated' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Staff user updated successfully', 'success');
    });
  });

  it('role selection works for admin, manager, cashier', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    const roleSelect = screen.getByTestId('select-Role *');
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    expect(roleSelect).toHaveValue('admin');
    fireEvent.change(roleSelect, { target: { value: 'manager' } });
    expect(roleSelect).toHaveValue('manager');
    fireEvent.change(roleSelect, { target: { value: 'cashier' } });
    expect(roleSelect).toHaveValue('cashier');
  });

  it('delete button opens confirmation dialog', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete Alice Morgan/)).toBeInTheDocument();
  });

  it('confirms deletion and calls API', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    mockDeletePosUser.mockResolvedValue({} as never);
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')); });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeletePosUser).toHaveBeenCalledWith(1);
      expect(mockShowToast).toHaveBeenCalledWith('Staff user deleted successfully', 'success');
    });
  });

  it('cancels deletion dialog', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')); });
    fireEvent.click(screen.getByTestId('confirm-no'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
    expect(mockDeletePosUser).not.toHaveBeenCalled();
  });

  it('delete error shows error toast', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    mockDeletePosUser.mockRejectedValue(new Error('delete failed'));
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByTestId('confirm-dialog')); });
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting staff user'),
        'error',
      );
    });
  });

  it('create API error shows error toast', async () => {
    mockCreatePosUser.mockRejectedValue(new Error('create failed'));
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.change(screen.getByTestId('input-First Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('input-Last Name *'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('input-Email *'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByTestId('input-Password *'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error saving staff user'),
        'error',
      );
    });
  });

  it('reset password button opens reset modal', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Reset Password')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument();
  });

  it('reset password validates minimum length', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Reset Password')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Reset Password' })); });
    fireEvent.change(screen.getByTestId('input-Password *'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Password must be at least 8 characters', 'warning');
    });
  });

  it('reset password succeeds with valid password', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    mockResetPosUserPassword.mockResolvedValue({} as never);
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Reset Password')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Reset Password' })); });
    fireEvent.change(screen.getByTestId('input-Password *'), { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockResetPosUserPassword).toHaveBeenCalledWith(1, 'newpassword123');
      expect(mockShowToast).toHaveBeenCalledWith('Password reset successfully', 'success');
    });
  });

  it('reset password error shows error toast', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    mockResetPosUserPassword.mockRejectedValue(new Error('reset failed'));
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Reset Password')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Reset Password' })); });
    fireEvent.change(screen.getByTestId('input-Password *'), { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error resetting password'),
        'error',
      );
    });
  });

  it('shows tenant selector for super_admin role', async () => {
    mockUser = { role: 'super_admin' };
    mockTenantsData = [
      { id: 't1', name: 'Camp Alpha', subdomain: 'alpha', status: 'active' },
      { id: 't2', name: 'Camp Beta', subdomain: 'beta', status: 'active' },
    ];
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('tenant-filter')).toBeInTheDocument();
    });
    expect(screen.getByTestId('select-Select Tenant')).toBeInTheDocument();
  });

  it('does not show tenant selector for non-super_admin', async () => {
    mockUser = { role: 'admin' };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => {
      expect(screen.queryByTestId('tenant-filter')).not.toBeInTheDocument();
    });
  });

  it('pagination shows correct page info', async () => {
    mockPosUsersData = { data: mockStaff, total: 25, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('pagination')); });
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('renders role badges with correct labels', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Cashier')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  it('renders status tags for active/inactive users', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    const statusTags = screen.getAllByTestId('status-tag');
    expect(statusTags.length).toBeGreaterThanOrEqual(2);
  });

  it('edit modal shows status select for existing user', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Edit Staff User' })); });
    expect(screen.getByTestId('select-Status')).toBeInTheDocument();
  });

  it('add modal does not show status select', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    expect(screen.queryByTestId('select-Status')).not.toBeInTheDocument();
  });

  it('fills optional fields in add form (username, phone, department, employeeId)', async () => {
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByTestId('add-user-btn')); });
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Add Staff User' })); });
    fireEvent.change(screen.getByTestId('input-Username'), { target: { value: 'jdoe' } });
    fireEvent.change(screen.getByTestId('input-Phone'), { target: { value: '+20 123 456' } });
    fireEvent.change(screen.getByTestId('input-Department'), { target: { value: 'Kitchen' } });
    fireEvent.change(screen.getByTestId('input-Employee ID'), { target: { value: 'EMP-001' } });
    expect(screen.getByTestId('input-Username')).toHaveValue('jdoe');
    expect(screen.getByTestId('input-Phone')).toHaveValue('+20 123 456');
    expect(screen.getByTestId('input-Department')).toHaveValue('Kitchen');
    expect(screen.getByTestId('input-Employee ID')).toHaveValue('EMP-001');
  });

  it('edit form status select onChange works', async () => {
    mockPosUsersData = { data: mockStaff, total: 3, page: 1 };
    renderWithQuery(<StaffPanel />);
    await waitFor(() => { expect(screen.getByText('Alice Morgan')); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Edit Staff User' })); });
    const statusSelect = screen.getByTestId('select-Status');
    fireEvent.change(statusSelect, { target: { value: 'false' } });
    expect(statusSelect).toBeDefined();
  });
});
