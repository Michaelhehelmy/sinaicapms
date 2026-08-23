import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuperTenantsPanel from '@/components/admin/SuperTenantsPanel';

const mockShowToast = vi.fn();
const mockGetAdminTenants = vi.fn();
const mockUpdateAdminTenant = vi.fn();
const mockGetAdmins = vi.fn();
const mockUpdateAdminUser = vi.fn();

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
