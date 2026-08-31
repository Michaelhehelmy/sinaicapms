import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminApp from '@/components/admin/AdminApp';
import { push } from '@/lib/navigation';
import { QueryClient } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────────────
// Self-contained expansion of AdminApp.test.tsx coverage.
//
// These tests target the branches/functions the existing suite leaves open:
//   • every remaining tenant + super panel's lazy render (analytics,
//     promotions, services, service-bookings, staff, financials, hr, supply,
//     crm, storefront, ai, billing + the 13 optional super panels)
//   • panel callbacks (CampsPanel.onRefreshCamps → cache invalidation;
//     InboxPanel.onOpenOrder → tab switch to reservations)
//   • the onNavigation route listener (applies /admin paths, ignores others)
//   • InboxNavBadge edge cases (0 hides, >99 caps at "99+", tenant scoping)
//   • no-camp / unknown-name / empty-CSS-var rendering branches
//   • role-aware user display name + logout-timer cleanup
//
// Uses vi.hoisted so module-scope mock ids exist before hoisted vi.mock runs.
// ─────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const showToast = vi.fn();
  const login = vi.fn();
  const logout = vi.fn();
  const invalidationCalls: string[] = [];
  const refreshCamps = vi.fn();
  return { showToast, login, logout, invalidationCalls, refreshCamps };
});

// A richer CampsPanel mock that can trigger onRefreshCamps.
vi.mock('@/components/admin/CampsPanel', () => ({
  default: ({ onRefreshCamps }: { onRefreshCamps?: () => void }) => (
    <div data-testid="camps-panel">
      <button data-testid="camps-refresh" onClick={() => onRefreshCamps && onRefreshCamps()}>
        Refresh
      </button>
    </div>
  ),
}));

// A richer InboxPanel mock that can trigger onOpenOrder.
vi.mock('@/components/admin/InboxPanel', () => ({
  default: ({ onOpenOrder }: { onOpenOrder?: () => void }) => (
    <div data-testid="inbox-panel">
      <button data-testid="inbox-open-order" onClick={() => onOpenOrder && onOpenOrder()}>
        Open Order
      </button>
    </div>
  ),
}));

vi.mock('@/components/admin/DashboardPanel', () => ({
  default: () => <div data-testid="dashboard-panel">Dashboard</div>,
}));
vi.mock('@/components/admin/RoomsPanel', () => ({
  default: () => <div data-testid="rooms-panel">Rooms</div>,
}));
vi.mock('@/components/admin/OrdersPanel', () => ({
  default: () => <div data-testid="orders-panel">Orders</div>,
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
  default: () => <div data-testid="booking-calendar">Calendar</div>,
}));
vi.mock('@/components/admin/MenuPlannerPanel', () => ({
  default: () => <div data-testid="menu-planner-panel">MenuPlanner</div>,
}));
vi.mock('@/components/admin/LowStockPanel', () => ({
  default: () => <div data-testid="low-stock-panel">LowStock</div>,
}));
vi.mock('@/components/admin/AnalyticsPanel', () => ({
  default: () => <div data-testid="analytics-panel">Analytics</div>,
}));
vi.mock('@/components/admin/PromotionsPanel', () => ({
  default: () => <div data-testid="promotions-panel">Promotions</div>,
}));
vi.mock('@/components/admin/ServicesPanel', () => ({
  default: () => <div data-testid="services-panel">Services</div>,
}));
vi.mock('@/components/admin/ServiceBookingsPanel', () => ({
  default: () => <div data-testid="service-bookings-panel">ServiceBookings</div>,
}));
vi.mock('@/components/admin/StaffPanel', () => ({
  default: () => <div data-testid="staff-panel">Staff</div>,
}));
vi.mock('@/components/admin/BillingPanel', () => ({
  default: () => <div data-testid="billing-panel">Billing</div>,
}));
vi.mock('@/components/admin/FinancialPanel', () => ({
  default: () => <div data-testid="financials-panel">Financials</div>,
}));
vi.mock('@/components/admin/HRPanel', () => ({
  default: () => <div data-testid="hr-panel">HR</div>,
}));
vi.mock('@/components/admin/SupplyPanel', () => ({
  default: () => <div data-testid="supply-panel">Supply</div>,
}));
vi.mock('@/components/admin/CRMPanel', () => ({
  default: () => <div data-testid="crm-panel">CRM</div>,
}));
vi.mock('@/components/admin/StorefrontPanel', () => ({
  default: () => <div data-testid="storefront-panel">Storefront</div>,
}));
vi.mock('@/components/admin/AIPanel', () => ({
  default: () => <div data-testid="ai-panel">AI</div>,
}));

// Super panels
vi.mock('@/components/admin/SuperTenantsPanel', () => ({
  default: () => <div data-testid="super-tenants-panel">SuperTenants</div>,
}));
vi.mock('@/components/admin/SuperDashboardPanel', () => ({
  default: () => <div data-testid="super-dashboard-panel">SuperDashboard</div>,
}));
vi.mock('@/components/admin/SuperOrdersPanel', () => ({
  default: () => <div data-testid="super-orders-panel">SuperOrders</div>,
}));
vi.mock('@/components/admin/SuperFinancialsPanel', () => ({
  default: () => <div data-testid="super-financials-panel">SuperFinancials</div>,
}));
vi.mock('@/components/admin/SuperHRPanel', () => ({
  default: () => <div data-testid="super-hr-panel">SuperHR</div>,
}));
vi.mock('@/components/admin/SuperSupplyPanel', () => ({
  default: () => <div data-testid="super-supply-panel">SuperSupply</div>,
}));
vi.mock('@/components/admin/SuperCRMPanel', () => ({
  default: () => <div data-testid="super-crm-panel">SuperCRM</div>,
}));
vi.mock('@/components/admin/SuperStorefrontPanel', () => ({
  default: () => <div data-testid="super-storefront-panel">SuperStorefront</div>,
}));
vi.mock('@/components/admin/SuperAIPanel', () => ({
  default: () => <div data-testid="super-ai-panel">SuperAI</div>,
}));
vi.mock('@/components/admin/UsersPanel', () => ({
  default: () => <div data-testid="users-panel">Users</div>,
}));
vi.mock('@/components/admin/SystemSettingsPanel', () => ({
  default: () => <div data-testid="system-settings-panel">SystemSettings</div>,
}));
vi.mock('@/components/admin/AuditLogPanel', () => ({
  default: () => <div data-testid="audit-log-panel">AuditLog</div>,
}));
vi.mock('@/components/admin/SubscriptionsPanel', () => ({
  default: () => <div data-testid="subscriptions-panel">Subscriptions</div>,
}));
vi.mock('@/components/admin/SuperReportsPanel', () => ({
  default: () => <div data-testid="super-reports-panel">SuperReports</div>,
}));
vi.mock('@/components/admin/SystemHealthPanel', () => ({
  default: () => <div data-testid="system-health-panel">SystemHealth</div>,
}));
vi.mock('@/components/admin/TenantPerformancePanel', () => ({
  default: () => <div data-testid="tenant-performance-panel">TenantPerformance</div>,
}));

// Toast + auth
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

// Mutable auth that per-test tweaks role/isAuthenticated/loading.
const authState = {
  user: null as {
    name?: string; email?: string; fullName?: string;
    role: string; tenantId: string | null;
  } | null,
  loading: false,
  isAuthenticated: true,
  login: h.login,
  logout: h.logout,
  hasRole: (role: string) => role === 'admin',
};

vi.mock('@/lib/auth', () => ({
  useAuth: () => authState,
}));

// Query hooks with per-test-tunable data through mutable refs.
const queryState = vi.hoisted(() => ({
  camps: [
    { id: 'c1', name: 'Camp Alpha', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' },
    { id: 'c2', name: 'Camp Beta', location: 'Cairo', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 30, status: 'active', notes: '' },
  ],
  inboxUnread: 3,
  settings: { primaryColor: '#4a7c4f' },
}));

const useQueryHooksMock = vi.hoisted(() => {
  return {
    queryKeys: { camps: ['admin', 'camps'], settings: ['admin', 'settings'], inboxUnread: ['admin', 'inbox', 'unread'] },
    useCampsQuery: () => ({ data: queryState.camps, isLoading: false }),
    useInboxUnreadQuery: () => ({ data: queryState.inboxUnread }),
    useSettingsQuery: () => ({ data: queryState.settings }),
  };
});

vi.mock('@/hooks/useQueryHooks', () => useQueryHooksMock);



vi.mock('@/lib/session', () => ({
  session: {
    getAccessToken: () => 'token',
    getRefreshToken: () => null,
    setTokens: vi.fn(),
    clear: vi.fn(),
    getUser: () => null,
    setUser: vi.fn(),
    onAuthChange: () => () => {},
  },
}));

vi.mock('@/lib/theme', () => ({
  buildTenantTheme: () => ({ cssVars: { '--brand-primary': '#4a7c4f' } }),
}));

// navigation: override push, keep onNavigation/parseHashTab real.
vi.mock('@/lib/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/navigation')>()),
  push: vi.fn(),
}));

const baseUser = {
  name: 'Admin User',
  email: 'admin@test.com',
  role: 'admin',
  tenantId: null as string | null,
};

function setLocation(pathname = '/admin', search = '', hash = '') {
  Object.defineProperty(window, 'location', {
    value: { pathname, search, hash, assign: vi.fn(), reload: vi.fn(), href: pathname + search + hash },
    writable: true,
  });
}

describe('AdminApp extra coverage', () => {
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on the real QueryClient so we can assert camps-cache invalidation.
    invalidateSpy = vi
      .spyOn(QueryClient.prototype, 'invalidateQueries')
      .mockImplementation((() => ({})) as never);
    Object.assign(authState, {
      user: { ...baseUser },
      loading: false,
      isAuthenticated: true,
      login: h.login,
      logout: h.logout,
      hasRole: (role: string) => role === 'admin',
    });
    Object.assign(queryState, {
      camps: [
        { id: 'c1', name: 'Camp Alpha', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' },
        { id: 'c2', name: 'Camp Beta', location: 'Cairo', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 30, status: 'active', notes: '' },
      ],
      inboxUnread: 3,
      settings: { primaryColor: '#4a7c4f' },
    });
    setLocation('/admin', '', '#tab=dashboard');
  });

  // ── Panel renders: tenant (non-primary) ─────────────────────────────
  it.each([
    ['analytics', 'analytics-panel'],
    ['promotions', 'promotions-panel'],
    ['services', 'services-panel'],
    ['service-bookings', 'service-bookings-panel'],
    ['staff', 'staff-panel'],
    ['financials', 'financials-panel'],
    ['hr', 'hr-panel'],
    ['supply', 'supply-panel'],
    ['crm', 'crm-panel'],
    ['storefront', 'storefront-panel'],
    ['ai', 'ai-panel'],
    ['billing', 'billing-panel'],
  ] as const)('renders tenant panel for tab=%s', async (tabId, testId) => {
    setLocation(`/admin/${tabId}`, '', '');
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });
  });

  // ── Panel renders: super (optional panels) ──────────────────────────
  it.each([
    ['super_financials', 'super-financials-panel'],
    ['super_hr', 'super-hr-panel'],
    ['super_supply', 'super-supply-panel'],
    ['super_crm', 'super-crm-panel'],
    ['super_storefront', 'super-storefront-panel'],
    ['super_ai', 'super-ai-panel'],
    ['super_users', 'users-panel'],
    ['super_settings', 'system-settings-panel'],
    ['super_audit', 'audit-log-panel'],
    ['super_subscriptions', 'subscriptions-panel'],
    ['super_reports', 'super-reports-panel'],
    ['super_health', 'system-health-panel'],
    ['super_performance', 'tenant-performance-panel'],
  ] as const)('renders super panel for tab=%s', async (tabId, testId) => {
    authState.hasRole = (() => true) as unknown as typeof authState.hasRole;
    setLocation(`/admin/${tabId}`, '', '');
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });
  });

  // ── Panel callback: CampsPanel.onRefreshCamps → cache invalidation ──
  it('CampsPanel refresh triggers camps query invalidation', async () => {
    render(<AdminApp />);
    fireEvent.click(screen.getByTestId('nav-tab-camps'));
    await waitFor(() => {
      expect(screen.getByTestId('camps-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('camps-refresh'));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin', 'camps'] }));
    expect(vi.mocked(push)).toHaveBeenCalled();
  });

  // ── Panel callback: InboxPanel.onOpenOrder → switch to reservations ──
  it('InboxPanel onOpenOrder switches to reservations and pushes URL', async () => {
    authState.user = { ...baseUser, tenantId: 't1' };
    render(<AdminApp />);
    fireEvent.click(screen.getByTestId('nav-tab-inbox'));
    await waitFor(() => {
      expect(screen.getByTestId('inbox-panel')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('inbox-open-order'));
    await waitFor(() => {
      expect(screen.getByTestId('orders-panel')).toBeInTheDocument();
    });
    expect(vi.mocked(push)).toHaveBeenCalledWith(expect.stringContaining('/admin/reservations'));
  });

  // ── onNavigation route listener ─────────────────────────────────────
  it('applies navigation events whose path starts with /admin (back/forward)', async () => {
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    });
    // Simulate a kernel navigation to /admin/rooms (popstate broadcast).
    setLocation('/admin/rooms', '', '');
    fireEvent(window, new Event('popstate'));
    await waitFor(() => {
      expect(screen.getByTestId('rooms-panel')).toBeInTheDocument();
    });
  });

  it('ignores navigation events outside /admin', async () => {
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    });
    setLocation('/pos', '', '');
    fireEvent(window, new Event('popstate'));
    // Still on dashboard — /pos path is ignored by the listener.
    expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('pos-panel')).not.toBeInTheDocument();
  });

  // ── InboxNavBadge edge cases ────────────────────────────────────────
  it('hides the inbox unread badge when count is 0', () => {
    queryState.inboxUnread = 0;
    authState.user = { ...baseUser, tenantId: 't1' };
    render(<AdminApp />);
    expect(screen.queryByTestId('nav-inbox-unread')).not.toBeInTheDocument();
  });

  it('caps the inbox unread badge at 99+', () => {
    queryState.inboxUnread = 150;
    authState.user = { ...baseUser, tenantId: 't1' };
    render(<AdminApp />);
    expect(screen.getByTestId('nav-inbox-unread')).toHaveTextContent('99+');
  });

  it('treats null unread count as 0 (badge hidden)', () => {
    (queryState as any).inboxUnread = null;
    authState.user = { ...baseUser, tenantId: 't1' };
    render(<AdminApp />);
    expect(screen.queryByTestId('nav-inbox-unread')).not.toBeInTheDocument();
  });

  // ── No-camp / fallback rendering branches ───────────────────────────
  it('renders a generic camp badge when no camps exist', async () => {
    queryState.camps = [];
    render(<AdminApp />);
    const badge = await screen.findByTestId('active-camp-badge');
    expect(badge).toHaveTextContent('Camp');
  });

  it('falls back to email/fullName when name is absent in the topbar', () => {
    authState.user = { ...baseUser, name: '' as any, email: 'fallback@test.com' };
    render(<AdminApp />);
    expect(screen.getByText('fallback@test.com')).toBeInTheDocument();
  });

  it('uses fullName when neither name nor email present', () => {
    authState.user = { ...baseUser, name: '' as any, email: '' as any, fullName: 'Full Name' };
    render(<AdminApp />);
    expect(screen.getByText('Full Name')).toBeInTheDocument();
  });

  it('shows the "Admin" fallback when no identity fields exist', () => {
    authState.user = { ...baseUser, name: '' as any, email: '' as any, fullName: '' as any };
    render(<AdminApp />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  // ── Hash deep-link honored mid-session ──────────────────────────────
  it('honors a legacy #tab= deep link via hashchange while mounted', async () => {
    render(<AdminApp />);
    window.location.hash = '#tab=staff';
    fireEvent(window, new Event('hashchange'));
    await waitFor(() => {
      expect(screen.getByTestId('staff-panel')).toBeInTheDocument();
    });
  });

  // ── Role / theme ────────────────────────────────────────────────────
  it('renders super panel on switchTab from the sidebar in super mode', async () => {
    authState.hasRole = (() => true) as unknown as typeof authState.hasRole;
    render(<AdminApp />);
    fireEvent.click(screen.getByTestId('nav-tab-super_health'));
    await waitFor(() => {
      expect(screen.getByTestId('system-health-panel')).toBeInTheDocument();
    });
  });

  // ── Additional defensive branches ───────────────────────────────────
  it('falls back to dashboard for a root /admin path (no tab segment)', async () => {
    setLocation('/admin', '', '');
    render(<AdminApp />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    });
  });

  it('builds the shell theme when settings has no primaryColor', () => {
    queryState.settings = {};
    render(<AdminApp />);
    // Shell still renders with default theme vars.
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
  });

  it('ignores a hashchange whose fragment is not a #tab= deep link', async () => {
    render(<AdminApp />);
    window.location.hash = '#some-other-fragment';
    fireEvent(window, new Event('hashchange'));
    // Stays on the default dashboard tab.
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel')).toBeInTheDocument();
    });
  });
});
