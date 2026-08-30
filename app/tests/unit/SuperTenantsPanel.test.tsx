import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SuperTenantsPanel from '@/components/admin/SuperTenantsPanel';

const mockShowToast = vi.fn();
const mockGetAdminTenants = vi.fn();
const mockUpdateAdminTenant = vi.fn();
const mockGetAdmins = vi.fn();
const mockUpdateAdminUser = vi.fn();
const mockCreateAdminUser = vi.fn();
const mockDeleteAdminUser = vi.fn();
const mockCreateTenant = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'super_admin' } }),
}));

vi.mock('@/lib/api', () => ({
  getAdminTenants: (...args: unknown[]) => mockGetAdminTenants(...args),
  updateAdminTenant: (...args: unknown[]) => mockUpdateAdminTenant(...args),
  getAdmins: (...args: unknown[]) => mockGetAdmins(...args),
  updateAdminUser: (...args: unknown[]) => mockUpdateAdminUser(...args),
  createAdminUser: (...args: unknown[]) => mockCreateAdminUser(...args),
  deleteAdminUser: (...args: unknown[]) => mockDeleteAdminUser(...args),
  createTenant: (...args: unknown[]) => mockCreateTenant(...args),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div>{text}</div>,
}));

// T9: stub the drill-down so the directory wiring is tested here; the real
// component (scope override + scoped panels) is covered in TenantDrilldown.test.tsx.
vi.mock('@/components/admin/TenantDrilldown', () => ({
  default: ({ tenant, onBack }: { tenant: { id: string; name: string }; onBack: () => void }) => (
    <div data-testid="tenant-drilldown-stub">
      <span>{tenant.name}</span>
      <button data-testid="drilldown-back-btn" onClick={onBack}>
        Back to tenants
      </button>
    </div>
  ),
}));

const sampleTenants = [
  { id: 't1', name: 'Camp Alpha', subdomain: 'alpha', customDomain: null, location: 'Sinai', phone: '123', email: 'a@test.com', status: 'active', currency: 'USD', type: 'camp' },
  { id: 't2', name: 'Camp Beta', subdomain: 'beta', customDomain: 'beta.com', location: 'Cairo', phone: '456', email: 'b@test.com', status: 'suspended', currency: 'EGP', type: 'supermarket' },
];

const sampleAdmins = [
  { id: 'a1', tenantId: 't1', email: 'admin1@test.com', role: 'tenant_admin', firstName: 'Admin', lastName: 'One', isActive: 1 },
  { id: 'a2', tenantId: 't2', email: 'super@test.com', role: 'super_admin', firstName: 'Super', lastName: 'Admin', isActive: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminTenants.mockResolvedValue([]);
  mockGetAdmins.mockResolvedValue([]);
});

describe('SuperTenantsPanel', () => {
  it('renders tenant directory for super admin', async () => {
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Tenant Directory')).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    mockGetAdminTenants.mockReturnValue(new Promise(() => {}));
    render(<SuperTenantsPanel />);
    expect(screen.getByText('Loading tenants...')).toBeInTheDocument();
  });

  it('shows empty state when no tenants', async () => {
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('No tenants found.')).toBeInTheDocument();
    });
  });

  it('shows tenant count', async () => {
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('0 tenants')).toBeInTheDocument();
    });
  });

  it('shows Show Admin Users button', async () => {
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Show Admin Users/)).toBeInTheDocument();
    });
  });

  it('handles API error on load', async () => {
    mockGetAdminTenants.mockRejectedValue(new Error('API Error'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load tenants'), 'error');
    });
  });

  it('displays tenants with data', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Camp Alpha')).toBeInTheDocument();
      expect(screen.getByText('Camp Beta')).toBeInTheDocument();
      expect(screen.getByText('2 tenants')).toBeInTheDocument();
    });
  });

  it('shows subdomain and custom domain info', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      // alpha has no custom domain -> subdomain.sinaicamps.com is shown
      expect(screen.getByText(/alpha\.sinaicamps\.com/)).toBeInTheDocument();
      // beta has a custom domain -> ONLY the custom domain is shown
      expect(screen.getByText(/beta\.com/)).toBeInTheDocument();
      expect(screen.queryByText(/beta\.sinaicamps\.com/)).not.toBeInTheDocument();
    });
  });

  it('shows suspend/activate buttons', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Suspend')).toBeInTheDocument();
      expect(screen.getByText('Activate')).toBeInTheDocument();
    });
  });

  it('toggles tenant status', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Suspend')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Suspend'));
    await waitFor(() => {
      expect(mockUpdateAdminTenant).toHaveBeenCalledWith('t1', { status: 'suspended' });
    });
  });

  it('shows error when toggle status fails', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockRejectedValue(new Error('Toggle failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Suspend')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Suspend'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Toggle failed', 'error');
    });
  });

  it('opens edit form for tenant', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByText('Admin Account for "Camp Alpha"')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('admin@camp.com')).toBeInTheDocument();
    });
  });

  it('cancels edit form', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByText('Admin Account for "Camp Alpha"')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Cancel')[1]);
    await waitFor(() => {
      expect(screen.queryByText('Admin Account for "Camp Alpha"')).not.toBeInTheDocument();
    });
  });

  it('saves tenant admin with data', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByText('Save Admin')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('admin@camp.com'), { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByText('Save Admin'));
    await waitFor(() => {
      expect(mockUpdateAdminTenant).toHaveBeenCalledWith('t1', expect.objectContaining({ adminEmail: 'new@test.com' }));
    });
  });

  it('captures password, first name and last name in the edit form', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByText('Save Admin')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('admin@camp.com'), { target: { value: 'new@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Leave blank to keep current'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'NewFirst' } });
    fireEvent.change(screen.getByPlaceholderText('Admin'), { target: { value: 'NewLast' } });
    fireEvent.click(screen.getByText('Save Admin'));
    await waitFor(() => {
      expect(mockUpdateAdminTenant).toHaveBeenCalledWith('t1', expect.objectContaining({
        adminEmail: 'new@test.com',
        adminPassword: 'secret123',
        adminFirstName: 'NewFirst',
        adminLastName: 'NewLast',
      }));
    });
  });

  it('shows info toast when no changes to save', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByText('Save Admin')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Admin'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('No changes to save', 'info');
    });
  });

  it('handles save error', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockRejectedValue(new Error('Save failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByText('Save Admin')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('admin@camp.com'), { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByText('Save Admin'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Save failed', 'error');
    });
  });

  it('toggles admin users section', async () => {
    mockGetAdminTenants.mockResolvedValue([]);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Show Admin Users/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Show Admin Users/));
    await waitFor(() => {
      expect(mockGetAdmins).toHaveBeenCalled();
      expect(screen.getByText(/Hide/)).toBeInTheDocument();
    });
  });

  it('shows empty admins state', async () => {
    mockGetAdmins.mockResolvedValue([]);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByText('No admin users found.')).toBeInTheDocument();
    });
  });

  it('shows admin users with data', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
      expect(screen.getByText('Super Admin')).toBeInTheDocument();
    });
  });

  it('handles admin toggle active', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockUpdateAdminUser.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByText('Deactivate')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('a1', { isActive: false });
    });
  });

  it('handles admin toggle active error', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockUpdateAdminUser.mockRejectedValue(new Error('Toggle error'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByText('Deactivate')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Toggle error', 'error');
    });
  });

  it('hides super_admin from toggle', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByText('Super Admin')).toBeInTheDocument();
    });
    const buttons = screen.getAllByText(/Activate|Deactivate/);
    expect(buttons.length).toBe(1);
  });

  it('handles getAdmins API error', async () => {
    mockGetAdmins.mockRejectedValue(new Error('Admins load failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load admins'), 'error');
    });
  });

  it('shows currency badge when currency exists', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('USD')).toBeInTheDocument();
      expect(screen.getByText('EGP')).toBeInTheDocument();
    });
  });

  it('shows localized type badge on tenant cards', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      const badges = screen.getAllByTestId('tenant-type-badge');
      expect(badges).toHaveLength(2);
      expect(badges[0]).toHaveTextContent('Camp');
      expect(badges[1]).toHaveTextContent('Supermarket');
    });
  });

  it('pre-selects the tenant type in the edit form and persists via PATCH', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    // t2 = supermarket -> edit that card
    fireEvent.click(screen.getAllByText('Edit Admin')[1]);
    await waitFor(() => {
      expect(screen.getByTestId('edit-tenant-type')).toBeInTheDocument();
      expect((screen.getByTestId('edit-tenant-type') as HTMLSelectElement).value).toBe('supermarket');
    });
    fireEvent.change(screen.getByTestId('edit-tenant-type'), { target: { value: 'transportation' } });
    fireEvent.click(screen.getByText('Save Admin'));
    await waitFor(() => {
      expect(mockUpdateAdminTenant).toHaveBeenCalledWith('t2', expect.objectContaining({ type: 'transportation' }));
    });
  });

  it('omits type from PATCH when unchanged', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockUpdateAdminTenant.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('Edit Admin').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('Edit Admin')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('edit-tenant-type')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('admin@camp.com'), { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByText('Save Admin'));
    await waitFor(() => {
      expect(mockUpdateAdminTenant).toHaveBeenCalledWith('t1', { adminEmail: 'new@test.com' });
    });
  });

  it('opens tenant drilldown from Manage button', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByTestId('manage-tenant-btn').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('manage-tenant-btn')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('tenant-drilldown-stub')).toBeInTheDocument();
      expect(screen.getByText('Camp Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Tenant Directory')).not.toBeInTheDocument();
    });
  });

  it('returns to the directory from drilldown back button', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getAllByTestId('manage-tenant-btn').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('manage-tenant-btn')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('tenant-drilldown-stub')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('drilldown-back-btn'));
    await waitFor(() => {
      expect(screen.getByText('Tenant Directory')).toBeInTheDocument();
      expect(screen.queryByTestId('tenant-drilldown-stub')).not.toBeInTheDocument();
    });
  });

  it('create tenant: shows validation error when fields missing', async () => {
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('create-tenant-btn'));
    });
    fireEvent.click(screen.getByText('Create Tenant'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name, subdomain, and admin password are required', 'error');
    });
    expect(mockCreateTenant).not.toHaveBeenCalled();
  });

  it('create tenant: success', async () => {
    mockCreateTenant.mockResolvedValue({ id: 't9' });
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('create-tenant-btn'));
    });
    fireEvent.change(screen.getByPlaceholderText('e.g., Acacia Camp'), { target: { value: 'New Camp' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., acaciacamp'), { target: { value: 'newcamp' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'admin@new.com' } });
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'First' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Last' } });
    fireEvent.change(screen.getByPlaceholderText('Google Maps link or address'), { target: { value: 'Sinai' } });
    fireEvent.click(screen.getByText('Create Tenant'));
    await waitFor(() => {
      expect(mockCreateTenant).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Camp',
        subdomain: 'newcamp',
        adminPassword: 'secret123',
        adminEmail: 'admin@new.com',
        adminFirstName: 'First',
        adminLastName: 'Last',
        location: 'Sinai',
      }));
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Tenant created successfully', 'success');
      expect(mockGetAdminTenants).toHaveBeenCalled();
      expect(screen.queryByTestId('create-tenant-form')).not.toBeInTheDocument();
    });
  });

  it('create tenant: error', async () => {
    mockCreateTenant.mockRejectedValue(new Error('Create failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('create-tenant-btn'));
    });
    fireEvent.change(screen.getByPlaceholderText('e.g., Acacia Camp'), { target: { value: 'New Camp' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., acaciacamp'), { target: { value: 'newcamp' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('Create Tenant'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Create failed', 'error');
    });
  });

  it('cancel create tenant hides the form', async () => {
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('create-tenant-btn'));
    });
    expect(screen.getByTestId('create-tenant-form')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('create-tenant-form')).getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('create-tenant-form')).not.toBeInTheDocument();
    });
  });

  it('create admin: shows validation error when email/password missing', async () => {
    mockGetAdmins.mockResolvedValue([]);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    fireEvent.click(screen.getByTestId('create-admin-btn'));
    fireEvent.click(screen.getByText('Create Admin'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Email and password are required', 'error');
    });
  });

  it('create admin: success', async () => {
    mockGetAdmins.mockResolvedValue([]);
    mockCreateAdminUser.mockResolvedValue({ id: 'a9' });
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    fireEvent.click(screen.getByTestId('create-admin-btn'));
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'newadmin@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('Create Admin'));
    await waitFor(() => {
      expect(mockCreateAdminUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'newadmin@test.com',
        password: 'secret123',
        role: 'admin',
      }));
      expect(mockShowToast).toHaveBeenCalledWith('Admin user created', 'success');
    });
  });

  it('create admin: error', async () => {
    mockGetAdmins.mockResolvedValue([]);
    mockCreateAdminUser.mockRejectedValue(new Error('Create admin failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    fireEvent.click(screen.getByTestId('create-admin-btn'));
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'newadmin@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('Create Admin'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Create admin failed', 'error');
    });
  });

  it('edit admin: opens inline edit and saves', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockUpdateAdminUser.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('edit-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-admin-a1'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('a1', expect.objectContaining({ firstName: 'Admin', lastName: 'One', role: 'tenant_admin' }));
      expect(mockShowToast).toHaveBeenCalledWith('Admin user updated', 'success');
    });
  });

  it('edit admin: error', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockUpdateAdminUser.mockRejectedValue(new Error('Edit failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('edit-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-admin-a1'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Edit failed', 'error');
    });
  });

  it('edit admin: cancel inline edit', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('edit-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-admin-a1'));
    fireEvent.click(screen.getAllByText('Cancel').pop() as HTMLElement);
    await waitFor(() => {
      expect(screen.getByTestId('edit-admin-a1')).toBeInTheDocument();
    });
  });

  it('delete admin: confirms and deletes', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockDeleteAdminUser.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('delete-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('delete-admin-a1'));
    await waitFor(() => {
      expect(screen.getByText('Delete Admin User')).toBeInTheDocument();
    });
    // ConfirmDialog renders its "Delete" confirm last after the per-row Delete buttons
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => {
      expect(mockDeleteAdminUser).toHaveBeenCalledWith('a1');
      expect(mockShowToast).toHaveBeenCalledWith('Admin user deleted', 'success');
    });
  });

  it('delete admin: error', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockDeleteAdminUser.mockRejectedValue(new Error('Delete failed'));
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('delete-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('delete-admin-a1'));
    await waitFor(() => {
      expect(screen.getByText('Delete Admin User')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: Delete failed', 'error');
    });
  });

  it('delete admin: cancel dialog', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('delete-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('delete-admin-a1'));
    await waitFor(() => {
      expect(screen.getByText('Delete Admin User')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(mockDeleteAdminUser).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete Admin User')).not.toBeInTheDocument();
    });
  });

  it('create admin: captures firstName/lastName/role/tenantId fields', async () => {
    mockGetAdminTenants.mockResolvedValue(sampleTenants);
    mockGetAdmins.mockResolvedValue([]);
    mockCreateAdminUser.mockResolvedValue({ id: 'a10' });
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    fireEvent.click(screen.getByTestId('create-admin-btn'));
    // firstName / lastName (create-tenant form is closed, so these are the create-admin ones)
    const firstNameInputs = screen.getAllByPlaceholderText('First name');
    fireEvent.change(firstNameInputs[0], { target: { value: 'NewFirst' } });
    const lastNameInputs = screen.getAllByPlaceholderText('Last name');
    fireEvent.change(lastNameInputs[0], { target: { value: 'NewLast' } });
    // role select -> super_admin
    fireEvent.change(screen.getByDisplayValue('Admin'), { target: { value: 'super_admin' } });
    // tenantId select -> t1 (tenants loaded)
    fireEvent.change(screen.getByDisplayValue('No tenant (global)'), { target: { value: 't1' } });
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'new@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('Create Admin'));
    await waitFor(() => {
      expect(mockCreateAdminUser).toHaveBeenCalledWith(expect.objectContaining({
        firstName: 'NewFirst',
        lastName: 'NewLast',
        role: 'super_admin',
        tenantId: 't1',
      }));
    });
  });

  it('edit admin: captures firstName/lastName/role fields', async () => {
    mockGetAdmins.mockResolvedValue(sampleAdmins);
    mockUpdateAdminUser.mockResolvedValue({});
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Show Admin Users/));
    });
    await waitFor(() => {
      expect(screen.getByTestId('edit-admin-a1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-admin-a1'));
    // Inline edit mode: one role <select>
    const selects = screen.getAllByRole('combobox');
    const roleSelect = selects[selects.length - 1];
    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'EditedFirst' } });
    fireEvent.change(inputs[1], { target: { value: 'EditedLast' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('a1', expect.objectContaining({
        firstName: 'EditedFirst',
        lastName: 'EditedLast',
        role: 'admin',
      }));
    });
  });

  it('create tenant: captures type select value', async () => {
    mockCreateTenant.mockResolvedValue({ id: 't11' });
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('create-tenant-btn'));
    });
    fireEvent.change(screen.getByPlaceholderText('e.g., Acacia Camp'), { target: { value: 'New Camp' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., acaciacamp'), { target: { value: 'camp1' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByDisplayValue('Camp'), { target: { value: 'supermarket' } });
    fireEvent.click(screen.getByText('Create Tenant'));
    await waitFor(() => {
      expect(mockCreateTenant).toHaveBeenCalledWith(expect.objectContaining({ type: 'supermarket' }));
    });
  });
});

describe('SuperTenantsPanel - non-super-admin', () => {
  it('shows access denied for non-super-admin', async () => {
    const authModule = await import('@/lib/auth');
    const spy = vi.spyOn(authModule, 'useAuth').mockReturnValue({ user: { role: 'admin' } } as any);
    render(<SuperTenantsPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('SuperTenantsPanel - non-array response', () => {
  it('handles non-array API response', async () => {
    mockGetAdminTenants.mockResolvedValue(null);
    render(<SuperTenantsPanel />);
    await waitFor(() => {
      expect(screen.getByText('0 tenants')).toBeInTheDocument();
    });
  });
});
