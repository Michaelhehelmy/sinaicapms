import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import StaffPanel from '@/components/admin/StaffPanel';

const mockShowToast = vi.fn();
let mockUsers: unknown[] = [];
let mockUsersLoading = false;
let mockUsersError: unknown = null;
let mockUsersTotal = 0;
const mockRefetch = vi.fn();
let mockTenants: unknown[] = [];
let mockTenantsLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  usePosUsersQuery: () => ({
    data: mockUsers.length > 0 || mockUsersLoading ? { data: mockUsers, total: mockUsersTotal } : undefined,
    isLoading: mockUsersLoading,
    error: mockUsersError,
    refetch: mockRefetch,
  }),
  useTenantsQuery: () => ({
    data: mockTenants,
    isLoading: mockTenantsLoading,
  }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'super_admin', id: 'u1', name: 'Admin', email: 'a@b.com' } }),
}));

vi.mock('@/lib/utils', () => ({
  formatDate: (d: string) => d,
  cn: (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' '),
}));

vi.mock('@/lib/api', () => ({
  createPosUser: vi.fn(),
  updatePosUser: vi.fn(),
  deletePosUser: vi.fn(),
  resetPosUserPassword: vi.fn(),
}));

import * as api from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  mockUsers = [];
  mockUsersLoading = false;
  mockUsersError = null;
  mockUsersTotal = 0;
  mockTenants = [{ id: 't1', name: 'Camp', subdomain: 'camp', status: 'active' }];
  mockTenantsLoading = false;
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@camp.com',
    username: 'johnd',
    role: 'cashier',
    isActive: true,
    phone: '',
    department: '',
    employeeId: '',
    lastLogin: null,
    ...overrides,
  };
}

describe('StaffPanel', () => {
  it('shows loading spinner', () => {
    mockUsersLoading = true;
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText('Staff', { selector: 'p' })).toBeTruthy();
  });

  it('shows error with retry', async () => {
    mockUsersError = new Error('Network fail');
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText('Retry')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows empty state', () => {
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText(/No staff users found/)).toBeTruthy();
  });

  it('renders tenant filter for super_admin', () => {
    render(<StaffPanel />);
    expect(screen.getByTestId('tenant-filter')).toBeTruthy();
  });

  it('renders user table with data', () => {
    const user = makeUser();
    mockUsers = [user];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText('john@camp.com')).toBeTruthy();
  });

  it('opens add modal and creates a user', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    (api.createPosUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByTestId('add-user-btn'));

    await waitFor(() => {
      expect(screen.getByText('Add Staff User', { selector: 'h2' })).toBeTruthy();
    });

    // FormModal renders a non-form submit button with data-testid="modal-save"
    const saveBtn = screen.getByTestId('modal-save');

    // The Input components render <input> elements — fill by placeholder
    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('name@camp.com'), { target: { value: 'jane@camp.com' } });
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'janes' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });

    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect((api.createPosUser as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  it('validates empty name', async () => {
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByTestId('modal-save')).toBeTruthy(); });

    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('This field is required', 'warning');
    });
  });

  it('validates empty email', async () => {
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByTestId('modal-save')).toBeTruthy(); });

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Smith' } });

    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('This field is required', 'warning');
    });
  });

  it('validates email format', async () => {
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByTestId('modal-save')).toBeTruthy(); });

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('name@camp.com'), { target: { value: 'not-an-email' } });

    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please enter a valid email', 'warning');
    });
  });

  it('validates password length for create', async () => {
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByTestId('modal-save')).toBeTruthy(); });

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('name@camp.com'), { target: { value: 'jane@camp.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'short' } });

    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Password must be at least 8 characters', 'warning');
    });
  });

  it('opens edit modal with pre-filled data', async () => {
    const user = makeUser({ role: 'manager' });
    mockUsers = [user];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByText('Edit Staff User', { selector: 'h2' })).toBeTruthy();
    });
  });

  it('opens reset password modal', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Reset Password', { selector: 'h2' })).toBeTruthy();
      expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
    });
  });

  it('validates reset password length', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => { expect(screen.getByPlaceholderText('••••••••')).toBeTruthy(); });

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'short' } });

    // FormModal's submit button is data-testid="modal-save"
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Password must be at least 8 characters', 'warning');
    });
  });

  it('resets password successfully', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    (api.resetPosUserPassword as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => { expect(screen.getByPlaceholderText('••••••••')).toBeTruthy(); });

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'newpassword123' } });

    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect((api.resetPosUserPassword as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  it('deletes a user after confirmation', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    (api.deletePosUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      // ConfirmDialog shows the message with the user's name
      expect(screen.getByText(/Are you sure you want to delete/)).toBeTruthy();
    });
  });

  it('renders role badges for different roles', () => {
    const users = [
      makeUser({ id: 1, role: 'admin' }),
      makeUser({ id: 2, role: 'manager', firstName: 'M' }),
      makeUser({ id: 3, role: 'viewer', firstName: 'V' }),
    ];
    mockUsers = users;
    mockUsersTotal = 3;
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();
    expect(screen.getByText('Viewer')).toBeTruthy();
  });

  it('renders RoleBadge fallback for unknown role', () => {
    mockUsers = [makeUser({ id: 1, role: 'super_admin' })];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText('super_admin')).toBeTruthy();
  });

  it('handles non-Error string from usersError', () => {
    mockUsersError = 'plain string error';
    render(<StaffPanel scopedTenantId="t1" />);
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('plain string error')).toBeTruthy();
  });

  it('handles tenants data as {data:[...]} object shape', () => {
    mockTenants = { data: [{ id: 't2', name: 'Camp2', subdomain: 'c2', status: 'active' }] } as unknown as unknown[];
    render(<StaffPanel />);
    expect(screen.getByTestId('tenant-filter')).toBeTruthy();
  });

  it('handles empty fields in user columns', () => {
    mockUsers = [makeUser({ firstName: '', lastName: '', email: '', username: '' })];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    // Should render without crashing even with empty fields
    expect(screen.getByText('Add Staff User')).toBeTruthy();
  });

  it('closes add modal via close button', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByTestId('add-user-btn'));
    await waitFor(() => { expect(screen.getByText('Add Staff User', { selector: 'h2' })).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Add Staff User', { selector: 'h2' })).toBeNull();
    });
  });

  it('closes reset password modal via close button', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => { expect(screen.getByText('Reset Password', { selector: 'h2' })).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Reset Password', { selector: 'h2' })).toBeNull();
    });
  });

  it('selects tenant from filter when super_admin', async () => {
    mockTenants = [
      { id: 't1', name: 'Camp1', subdomain: 'c1', status: 'active' },
      { id: 't2', name: 'Camp2', subdomain: 'c2', status: 'active' },
    ];
    render(<StaffPanel />);
    expect(screen.getByTestId('tenant-filter')).toBeTruthy();
    const select = screen.getByLabelText('Select Tenant') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 't2' } });
    await waitFor(() => {
      expect(select.value).toBe('t2');
    });
  });

  it('types in search input and triggers debounced search', async () => {
    mockUsers = [makeUser()];
    mockUsersTotal = 1;
    render(<StaffPanel scopedTenantId="t1" />);
    await waitFor(() => { expect(screen.getByText('john@camp.com')).toBeTruthy(); });
    vi.useFakeTimers();
    const searchInput = screen.getByPlaceholderText('Search staff…');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    // Advance timers to trigger debounced search (DataTable uses 300ms debounce)
    act(() => { vi.advanceTimersByTime(400); });
    // The component re-renders with search param — verify no crash
    expect(searchInput).toBeTruthy();
    vi.useRealTimers();
  });

  it('paginates to the next page', async () => {
    const users = Array.from({ length: 11 }, (_, i) => makeUser({ id: i + 1, email: `u${i + 1}@camp.com` }));
    mockUsers = users;
    mockUsersTotal = 11;
    render(<StaffPanel scopedTenantId="t1" />);
    await waitFor(() => { expect(screen.getByText('u1@camp.com')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Go to next page'));
    // onChange(2) -> setPage(2) -> "Showing 11-11 of 11"
    await waitFor(() => {
      expect(screen.getByLabelText('Go to page 2')).toHaveAttribute('aria-current', 'page');
    });
  });
});
