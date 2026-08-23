import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminApp from '@/components/admin/AdminApp';
import { push } from '@/lib/navigation';

// Phase 7: admin tabs navigate via the pushState kernel — mock push so tests
// assert the requested URL; parseHashTab/onNavigation stay real so the
// legacy-hash fallback keeps its coverage.
vi.mock('@/lib/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/navigation')>()),
  push: vi.fn(),
}));

const mockShowToast = vi.fn();
const mockLogin = vi.fn();
const mockLogout = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const authState = {
  user: { name: 'Admin User', email: 'admin@test.com', role: 'admin', tenantId: null as string | null },
  loading: false,
  isAuthenticated: true,
  login: mockLogin,
  logout: mockLogout,
  hasRole: (role: string) => role === 'admin',
};

vi.mock('@/lib/auth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    camps: ['admin', 'camps'],
    settings: ['admin', 'settings'],
    inboxUnread: ['admin', 'inbox', 'unread'],
  },
  useCampsQuery: () => ({
    data: [
      { id: 'c1', name: 'Camp Alpha', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' },
      { id: 'c2', name: 'Camp Beta', location: 'Cairo', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 30, status: 'active', notes: '' },
    ],
    isLoading: false,
  }),
  useSaveCampMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCampMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSettingsQuery: () => ({ data: { primaryColor: '#4a7c4f' } }),
  useInboxUnreadQuery: () => ({ data: 3 }),
}));

vi.mock('@/components/admin/DashboardPanel', () => ({
  default: () => <div data-testid="dashboard-panel">Dashboard</div>,
}));
vi.mock('@/components/admin/CampsPanel', () => ({
  default: () => <div data-testid="camps-panel">CampsPanel</div>,
}));
vi.mock('@/components/admin/RoomsPanel', () => ({
  default: () => <div data-testid="rooms-panel">RoomsPanel</div>,
}));
vi.mock('@/components/admin/OrdersPanel', () => ({
  default: () => <div data-testid="orders-panel">OrdersPanel</div>,
}));
vi.mock('@/components/admin/SettingsPanel', () => ({
  default: () => <div data-testid="settings-panel">Settings</div>,
}));
vi.mock('@/components/admin/PasswordPanel', () => ({
  default: () => <div data-testid="password-panel">Password</div>,
}));
vi.mock('@/components/admin/RatePlansPanel', () => ({
  default: () => <div data-testid="rateplans-panel">RatePlans</div>,
}));
vi.mock('@/components/admin/MealsPanel', () => ({
  default: () => <div data-testid="meals-panel">Meals</div>,
}));
vi.mock('@/components/admin/MenuPanel', () => ({
  default: () => <div data-testid="menu-panel">Menu</div>,
}));
vi.mock('@/components/admin/PlanningPanel', () => ({
  default: () => <div data-testid="planning-panel">Planning</div>,
}));
vi.mock('@/components/admin/ReportsPanel', () => ({
  default: () => <div data-testid="reports-panel">Reports</div>,
}));
vi.mock('@/components/admin/BookingCalendar', () => ({
  default: () => <div data-testid="booking-calendar">BookingCalendar</div>,
}));
vi.mock('@/components/admin/MenuPlannerPanel', () => ({
  default: () => <div data-testid="menu-planner-panel">MenuPlanner</div>,
}));
vi.mock('@/components/admin/LowStockPanel', () => ({
  default: () => <div data-testid="low-stock-panel">LowStock</div>,
}));
vi.mock('@/components/admin/SuperTenantsPanel', () => ({
  default: () => <div data-testid="super-tenants-panel">SuperTenants</div>,
}));
vi.mock('@/components/admin/SuperDashboardPanel', () => ({
  default: () => <div data-testid="super-dashboard-panel">SuperDashboard</div>,
}));
vi.mock('@/components/admin/SuperOrdersPanel', () => ({
  default: () => <div data-testid="super-orders-panel">SuperOrders</div>,
}));
vi.mock('@/components/admin/InboxPanel', () => ({
  default: () => <div data-testid="inbox-panel">Inbox</div>,
}));
vi.mock('@/components/admin/StaffPanel', () => ({
  default: () => <div data-testid="staff-panel">Staff</div>,
}));

describe('AdminApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(authState, {
  user: { name: 'Admin User', email: 'admin@test.com', role: 'admin', tenantId: null as string | null },
      loading: false,
      isAuthenticated: true,
      login: mockLogin,
      logout: mockLogout,
      hasRole: (role: string) => role === 'admin',
    });
    Object.defineProperty(window, 'location', {
      value: { pathname: '/admin', search: '', hash: '#tab=dashboard', assign: vi.fn(), reload: vi.fn(), href: '' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders sidebar with navigation items', async () => {
    render(<AdminApp />);
    expect(screen.getAllByText(/SinaiCamps/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Projects').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rooms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('shows user display name', () => {
    render(<AdminApp />);
    expect(screen.getByText('Admin User')).toBeInTheDocument();
  });

  it('shows logout button', () => {
    render(<AdminApp />);
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('shows the active camp badge for non-super admin (single-camp)', () => {
    render(<AdminApp />);
    expect(screen.getByTestId('active-camp-badge')).toHaveTextContent('Camp Alpha');
  });

  it('handles logout', () => {
    render(<AdminApp />);
    fireEvent.click(screen.getByText('Logout'));
    expect(mockShowToast).toHaveBeenCalledWith('Logged out successfully', 'info');
  });

  it('renders dashboard panel by default', async () => {
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    });
  });

  it('shows all nav items in sidebar', () => {
    render(<AdminApp />);
    expect(screen.getByText('Rate Plans')).toBeInTheDocument();
    expect(screen.getAllByText('Orders').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Meals')).toBeInTheDocument();
    expect(screen.getByText('Menu Planner')).toBeInTheDocument();
    expect(screen.getByText('Menu Page')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getAllByText('Booking Calendar').length).toBeGreaterThanOrEqual(1);
  });

  it('renders settings with password panel when tab=settings', async () => {
    window.location.hash = '#tab=settings';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
      expect(screen.getByTestId('password-panel')).toBeInTheDocument();
    });
  });

  it('renders camps panel when tab=camps', async () => {
    window.location.hash = '#tab=camps';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('camps-panel')).toBeInTheDocument();
    });
  });

  it('renders rooms panel when tab=rooms', async () => {
    window.location.hash = '#tab=rooms';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('rooms-panel')).toBeInTheDocument();
    });
  });

  it('renders meals panel when tab=meals', async () => {
    window.location.hash = '#tab=meals';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('meals-panel')).toBeInTheDocument();
    });
  });

  it('renders orders panel when tab=reservations', async () => {
    window.location.hash = '#tab=reservations';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('orders-panel')).toBeInTheDocument();
    });
  });

  it('renders rateplans panel when tab=rateplans', async () => {
    window.location.hash = '#tab=rateplans';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('rateplans-panel')).toBeInTheDocument();
    });
  });

  it('renders planning panel when tab=planning', async () => {
    window.location.hash = '#tab=planning';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('planning-panel')).toBeInTheDocument();
    });
  });

  it('renders reports panel when tab=reports', async () => {
    window.location.hash = '#tab=reports';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('reports-panel')).toBeInTheDocument();
    });
  });

  it('renders calendar panel when tab=calendar', async () => {
    window.location.hash = '#tab=calendar';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('booking-calendar')).toBeInTheDocument();
    });
  });

  it('renders menu planner when tab=menu-planner', async () => {
    window.location.hash = '#tab=menu-planner';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('menu-planner-panel')).toBeInTheDocument();
    });
  });

  it('renders menu page when tab=menu', async () => {
    window.location.hash = '#tab=menu';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('menu-panel')).toBeInTheDocument();
    });
  });

  it('shows version footer', async () => {
    render(<AdminApp />);
    await waitFor(() => {
      const el = document.querySelector('.text-green-300\\/50');
      expect(el?.textContent).toContain('SinaiCamps v3.0');
    });
  });

  it('shows a single active camp badge with no camp picker', async () => {
    render(<AdminApp />);
    await waitFor(() => {
      const badge = screen.getByTestId('active-camp-badge');
      expect(badge).toHaveTextContent('Camp Alpha');
      expect(badge.tagName).toBe('SPAN');
    });
    // B3: the topbar no longer offers a camp dropdown or an "All Camps" option.
    expect(screen.queryByTestId('camp-filter')).not.toBeInTheDocument();
    expect(screen.queryByText('All Camps')).not.toBeInTheDocument();
  });

  it('shows loading screen while auth is loading', () => {
    authState.loading = true;
    render(<AdminApp />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-sidebar')).not.toBeInTheDocument();
  });

  it('shows login overlay when unauthenticated and validates empty form', async () => {
    authState.isAuthenticated = false;
    render(<AdminApp />);
    expect(screen.getByTestId('login-overlay')).toBeInTheDocument();
    const form = screen.getByTestId('login-overlay').querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(screen.getByText('Email and password are required.')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login and shows error when credentials are rejected', async () => {
    authState.isAuthenticated = false;
    mockLogin.mockResolvedValueOnce({ success: false, error: 'Invalid credentials' });
    render(<AdminApp />);
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'admin@camp.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'secret' } });
    const form = screen.getByTestId('login-overlay').querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledWith('admin@camp.com', 'secret');
  });

  it('shows signing in state while login is pending', async () => {
    authState.isAuthenticated = false;
    let resolveLogin!: (v: { success: boolean }) => void;
    mockLogin.mockReturnValueOnce(new Promise((res) => { resolveLogin = res; }));
    render(<AdminApp />);
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'admin@camp.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'secret' } });
    const form = screen.getByTestId('login-overlay').querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(screen.getByText('Signing in...')).toBeInTheDocument();
    await act(async () => { resolveLogin({ success: true }); });
    expect(screen.queryByText('Signing in...')).not.toBeInTheDocument();
  });

  it('switches tab via nav click and updates the URL via pushState', async () => {
    render(<AdminApp />);
    fireEvent.click(screen.getByTestId('nav-tab-rooms'));
    await waitFor(() => {
      expect(screen.getByTestId('rooms-panel')).toBeInTheDocument();
    });
    expect(vi.mocked(push)).toHaveBeenCalledWith('/admin/rooms');
  });

  it('renders rooms panel for path deep link /admin/rooms (pushState routing)', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/admin/rooms', search: '', hash: '', assign: vi.fn(), reload: vi.fn(), href: '' },
      writable: true,
    });
    render(<AdminApp />);
    expect(screen.getByTestId('rooms-panel')).toBeInTheDocument();
  });

  it('responds to hashchange events', async () => {
    render(<AdminApp />);
    window.location.hash = '#tab=meals';
    fireEvent(window, new Event('hashchange'));
    await waitFor(() => {
      expect(screen.getByTestId('meals-panel')).toBeInTheDocument();
    });
  });

  it('renders dashboard for unknown tabs', async () => {
    window.location.hash = '#tab=unknown';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    });
  });

  it('fires logout after the toast delay', () => {
    vi.useFakeTimers();
    render(<AdminApp />);
    fireEvent.click(screen.getByTestId('logout-btn'));
    expect(mockLogout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(mockLogout).toHaveBeenCalled();
  });

  it('scopes the active camp from the first camp (no filter interaction)', async () => {
    render(<AdminApp />);
    // Even when multiple camps come back from the API, the admin shell pins
    // itself to camps[0] — there is no way to switch the active camp.
    expect(await screen.findByTestId('active-camp-badge')).toHaveTextContent('Camp Alpha');
    fireEvent.click(screen.getByTestId('nav-tab-rooms'));
    await waitFor(() => {
      expect(screen.getByTestId('rooms-panel')).toBeInTheDocument();
    });
  });

  it('toggles the mobile sidebar with the backdrop', () => {
    const { container } = render(<AdminApp />);
    fireEvent.click(screen.getByTestId('mobile-toggle'));
    expect(container.querySelector('[class*="bg-black/40"]')).toBeTruthy();
    const aside = screen.getByTestId('admin-sidebar');
    expect(aside.className).not.toContain('-translate-x-full');
    fireEvent.click(container.querySelector('[class*="bg-black/40"]') as Element);
    expect(container.querySelector('[class*="bg-black/40"]')).toBeNull();
    expect(aside.className).toContain('-translate-x-full');
  });

  it('renders super admin nav and super panels', async () => {
    authState.hasRole = (() => true) as unknown as typeof authState.hasRole;
    render(<AdminApp />);
    const sidebar = within(screen.getByTestId('admin-sidebar'));
    expect(sidebar.getByText('Super Admin')).toBeInTheDocument();
    expect(sidebar.getByText('Super Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Global Operator Mode')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nav-tab-super_dashboard'));
    await waitFor(() => {
      expect(screen.getByTestId('super-dashboard-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('nav-tab-super_tenants'));
    await waitFor(() => {
      expect(screen.getByTestId('super-tenants-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('nav-tab-super_reservations'));
    await waitFor(() => {
      expect(screen.getByTestId('super-orders-panel')).toBeInTheDocument();
    });
  });

  it('super admin sees ONLY the 3 super nav items (no tenant tabs)', async () => {
    authState.hasRole = (() => true) as unknown as typeof authState.hasRole;
    render(<AdminApp />);
    const sidebar = within(screen.getByTestId('admin-sidebar'));
    const tabIds = screen.getAllByTestId(/^nav-tab-/).map((el) => el.getAttribute('data-testid')!.replace('nav-tab-', ''));
    expect(tabIds).toEqual(['super_dashboard', 'super_tenants', 'super_reservations']);
    // Tenant panels must NOT leak into the super-admin sidebar nav.
    expect(sidebar.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(sidebar.queryByText('Camps')).not.toBeInTheDocument();
    expect(sidebar.queryByText('Rooms')).not.toBeInTheDocument();
    expect(sidebar.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('tenant admin sees all 15 tenant nav items (no super tabs)', async () => {
    render(<AdminApp />);
    const tabIds = screen.getAllByTestId(/^nav-tab-/).map((el) => el.getAttribute('data-testid')!.replace('nav-tab-', ''));
    expect(tabIds).toHaveLength(15);
    expect(tabIds).toContain('dashboard');
    expect(tabIds).toContain('camps');
    expect(tabIds).toContain('rooms');
    expect(tabIds).toContain('rateplans');
    expect(tabIds).toContain('reservations');
    expect(tabIds).toContain('inbox');
    expect(tabIds).toContain('calendar');
    expect(tabIds).toContain('meals');
    expect(tabIds).toContain('menu-planner');
    expect(tabIds).toContain('menu');
    expect(tabIds).toContain('planning');
    expect(tabIds).toContain('reports');
    expect(tabIds).toContain('low-stock');
    expect(tabIds).toContain('staff');
    expect(tabIds).toContain('settings');
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument();
  });

  it('renders super mobile bottom nav with the 3 super tabs', () => {
    authState.hasRole = (() => true) as unknown as typeof authState.hasRole;
    render(<AdminApp />);
    const nav = screen.getByTestId('mobile-bottom-nav');
    expect(nav).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-super_dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-super_tenants')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-super_reservations')).toBeInTheDocument();
    // Tenant primary tabs must not leak into the super mobile nav.
    expect(screen.queryByTestId('mobile-nav-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-camps')).not.toBeInTheDocument();
  });

  it('renders placeholder for unknown super tabs', async () => {
    authState.hasRole = (() => true) as unknown as typeof authState.hasRole;
    window.location.hash = '#tab=super_reports';
    render(<AdminApp />);
    expect(await screen.findByText('super_reports')).toBeInTheDocument();
    expect(screen.getByText('This panel is under construction.')).toBeInTheDocument();
  });

  it('renders SVG icons instead of emoji in the sidebar', () => {
    const { container } = render(<AdminApp />);
    const sidebar = screen.getByTestId('admin-sidebar');
    expect(sidebar.querySelectorAll('svg').length).toBeGreaterThan(0);
    // No emoji glyphs anywhere in the rendered shell.
    const emojiPattern = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    expect(emojiPattern.test(sidebar.textContent ?? '')).toBe(false);
    expect(emojiPattern.test(container.textContent ?? '')).toBe(false);
  });

  it('renders the low-stock nav item for regular admins', async () => {
    render(<AdminApp />);
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
  });

  it('renders low-stock panel when tab=low-stock', async () => {
    window.location.hash = '#tab=low-stock';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('low-stock-panel')).toBeInTheDocument();
    });
  });

  it('renders the inbox panel when tab=inbox', async () => {
    window.location.hash = '#tab=inbox';
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('inbox-panel')).toBeInTheDocument();
    });
  });

  it('shows the unread inbox badge for tenant admins', () => {
    authState.user = { ...authState.user, tenantId: 't1' };
    render(<AdminApp />);
    expect(screen.getByTestId('nav-inbox-unread')).toHaveTextContent('3');
  });

  it('renders the mobile bottom nav with the primary tabs', () => {
    render(<AdminApp />);
    const nav = screen.getByTestId('mobile-bottom-nav');
    expect(nav).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-camps')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-rooms')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-reservations')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-nav-calendar')).toBeInTheDocument();
    // Secondary tabs must not leak into the bottom nav.
    expect(screen.queryByTestId('mobile-nav-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-low-stock')).not.toBeInTheDocument();
  });

  it('switches panels from the mobile bottom nav', async () => {
    render(<AdminApp />);
    fireEvent.click(screen.getByTestId('mobile-nav-calendar'));
    await waitFor(() => {
      expect(screen.getByTestId('booking-calendar')).toBeInTheDocument();
    });
    expect(vi.mocked(push)).toHaveBeenCalledWith('/admin/calendar');
  });

  it('applies tenant theme css vars on the shell', () => {
    render(<AdminApp />);
    const shell = document.querySelector('[style*="--brand-primary"]');
    expect(shell).toBeTruthy();
  });
});
