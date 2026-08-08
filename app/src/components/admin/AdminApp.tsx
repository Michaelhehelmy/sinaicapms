import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { useCamps } from '@/hooks/useAdminData';
import { useSettingsQuery, useInboxUnreadQuery } from '@/hooks/useQueryHooks';
import { buildTenantTheme } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  IconCalendar,
  IconCamps,
  IconDashboard,
  IconInbox,
  IconLowStock,
  IconMeals,
  IconMenu,
  IconOrders,
  IconPlanning,
  IconRatePlans,
  IconReports,
  IconRooms,
  IconSettings,
  type IconProps,
} from './icons';

// Admin context: 30s stale time (data changes infrequently), 5min garbage collection
const adminQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';

// Admin JWT storage key — kept in lockstep with auth.tsx / api.ts.
const TOKEN_KEY = 'sinaicamps_token';

// ─── Lazy-loaded panels (code-split per tab) ──────────────────────────
// Each panel is loaded only when the user navigates to it, reducing the
// initial bundle from ~160KB to ~20KB + ~10KB per visited tab.
const DashboardPanel = React.lazy(() => import('./DashboardPanel'));
const CampsPanel = React.lazy(() => import('./CampsPanel'));
const RoomsPanel = React.lazy(() => import('./RoomsPanel'));
const OrdersPanel = React.lazy(() => import('./OrdersPanel'));
const SettingsPanel = React.lazy(() => import('./SettingsPanel'));
const PasswordPanel = React.lazy(() => import('./PasswordPanel'));
const RatePlansPanel = React.lazy(() => import('./RatePlansPanel'));
const MealsPanel = React.lazy(() => import('./MealsPanel'));
const PlanningPanel = React.lazy(() => import('./PlanningPanel'));
const ReportsPanel = React.lazy(() => import('./ReportsPanel'));
const MenuPanel = React.lazy(() => import('./MenuPanel'));
const BookingCalendar = React.lazy(() => import('./BookingCalendar'));
const MenuPlannerPanel = React.lazy(() => import('./MenuPlannerPanel'));
const LowStockPanel = React.lazy(() => import('./LowStockPanel'));
const InboxPanel = React.lazy(() => import('./InboxPanel'));
const SuperTenantsPanel = React.lazy(() => import('./SuperTenantsPanel'));
const SuperDashboardPanel = React.lazy(() => import('./SuperDashboardPanel'));
const SuperOrdersPanel = React.lazy(() => import('./SuperOrdersPanel'));

type Tab = string;

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<IconProps>;
}

const TENANT_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'camps', label: 'Camps', icon: IconCamps },
  { id: 'rooms', label: 'Rooms', icon: IconRooms },
  { id: 'rateplans', label: 'Rate Plans', icon: IconRatePlans },
  { id: 'reservations', label: 'Orders', icon: IconOrders },
  { id: 'inbox', label: 'Inbox', icon: IconInbox },
  { id: 'calendar', label: 'Booking Calendar', icon: IconCalendar },
  { id: 'meals', label: 'Meals', icon: IconMeals },
  { id: 'menu-planner', label: 'Menu Planner', icon: IconPlanning },
  { id: 'menu', label: 'Menu Page', icon: IconMenu },
  { id: 'planning', label: 'Planning', icon: IconPlanning },
  { id: 'reports', label: 'Reports', icon: IconReports },
  { id: 'low-stock', label: 'Low Stock', icon: IconLowStock },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

/** Primary tabs surfaced on the mobile bottom nav (mobile-optimized subset). */
const MOBILE_NAV_IDS = ['dashboard', 'camps', 'rooms', 'reservations', 'calendar'];

const SUPER_NAV: NavItem[] = [
  { id: 'super_dashboard', label: 'Super Dashboard', icon: IconDashboard },
  { id: 'super_tenants', label: 'Tenants', icon: IconRooms },
  { id: 'super_reservations', label: 'All Orders', icon: IconOrders },
];

function getHashTab(): string {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('tab') || 'dashboard';
}

function setHashTab(tab: string) {
  window.location.hash = `#tab=${tab}`;
}

function LoginOverlay({ onLogin }: { onLogin: (email: string, pass: string) => Promise<{ success: boolean; error?: string }> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await onLogin(email.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div data-testid="login-overlay" className="fixed inset-0 z-[10000] flex items-center justify-center bg-stone-50">
      <div className="w-[90%] max-w-[400px] bg-white border border-gray-200 p-10 rounded-2xl shadow-lg text-center">
        <div className="mb-3 flex justify-center"><IconCamps size={48} /></div>
        <h2 className="text-2xl font-extrabold text-gray-800 mb-2">SinaiCamps</h2>
        <p className="text-sm text-gray-500 mb-8">Sign in to manage your camp platform</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="loginEmail" className="block text-sm font-semibold text-gray-600 mb-1.5 text-left">Email</label>
          <input
            type="email"
            required
            placeholder="admin@camp.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            id="loginEmail"
            data-testid="login-email"
            className="w-full p-3 rounded-lg border border-gray-300 text-sm font-[inherit] mb-4 focus:outline-none focus:border-green-600"
          />
          <label htmlFor="loginPassword" className="block text-sm font-semibold text-gray-600 mb-1.5 text-left">Password</label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            id="loginPassword"
            data-testid="login-password"
            className="w-full p-3 rounded-lg border border-gray-300 text-sm font-[inherit] mb-5 focus:outline-none focus:border-green-600"
          />
          {error && <p data-testid="login-error" className="text-red-600 text-xs mb-3">{error}</p>}
          <a href="/forgot-password" data-testid="forgot-password" className="text-sm text-green-600 hover:text-green-700 no-underline font-medium block text-center mb-4">
            Forgot Password?
          </a>
          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full p-3.5 rounded-lg text-sm font-bold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 cursor-pointer border-none"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Renders a nav item icon inside a fixed-width slot (SVG, inherits color). */
function NavIcon({ icon }: { icon: React.ComponentType<IconProps> }) {
  const Icon = icon;
  return (
    <span className="w-6 shrink-0 flex items-center justify-center">
      <Icon size={18} />
    </span>
  );
}

/**
 * Pill that displays the unread inbox count on the sidebar Inbox nav item.
 * Hidden at 0, capped at "99+" so the sidebar never overflows.
 */
export function InboxNavBadge({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      data-testid="nav-inbox-unread"
      className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[0.65rem] font-bold leading-none text-white"
      aria-label={`${count} unread inbox items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Hook wrapper — polls the unread count and feeds the pure badge. */
function InboxUnreadBadge() {
  const { data: unreadCount } = useInboxUnreadQuery();
  return <InboxNavBadge count={unreadCount ?? 0} />;
}

function AdminAppInner() {
  const { user, loading: authLoading, isAuthenticated, login, logout, hasRole } = useAuth();
  const { showToast } = useToast();
  const { data: camps, refresh: refreshCamps } = useCamps();
  const { data: settings } = useSettingsQuery();

  // Derive tenant branding (colors + font) and scope it to the shell so every
  // brand-* utility below resolves against the tenant's palette.
  const theme = useMemo(
    () => buildTenantTheme({ primaryColor: settings?.primaryColor ?? null }),
    [settings?.primaryColor],
  );
  const themeStyle = useMemo<React.CSSProperties>(
    () => ({ ...theme.cssVars }) as React.CSSProperties,
    [theme],
  );

  const [tab, setTab] = useState<Tab>(() => getHashTab());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [campFilter, setCampFilter] = useState<string>('all');

  const isSuperAdmin = hasRole('super_admin');
  const navItems = isSuperAdmin ? [...SUPER_NAV, ...TENANT_NAV] : TENANT_NAV;

  useEffect(() => {
    const handleHash = () => setTab(getHashTab());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const switchTab = useCallback((newTab: string) => {
    setTab(newTab);
    setHashTab(newTab);
    setSidebarOpen(false);
  }, []);

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup logout timer on unmount
  useEffect(() => {
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);

  const handleLogout = useCallback(async () => {
    showToast('Logged out successfully', 'info');
    // Delay redirect slightly so toast is visible before auth state clears the page
    logoutTimerRef.current = setTimeout(() => { logout(); }, 500);
  }, [logout, showToast]);

  const filteredCampIds = useMemo(() => {
    if (campFilter === 'all') return camps?.map((c) => c.id) ?? [];
    return [campFilter];
  }, [campFilter, camps]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-100">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

  if (!isAuthenticated) {
    return <LoginOverlay onLogin={login} />;
  }

  const renderPanel = () => {
    switch (tab) {
      case 'dashboard':
        return <DashboardPanel campIds={filteredCampIds} camps={camps ?? []} onNavigateToTab={switchTab} />;
      case 'camps':
        return <CampsPanel onRefreshCamps={refreshCamps} />;
      case 'rooms':
        return <RoomsPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'rateplans':
        return <RatePlansPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'reservations':
        return <OrdersPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'inbox':
        return (
          <InboxPanel
            tenantId={user?.tenantId}
            token={
              typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) ?? undefined : undefined
            }
            onOpenOrder={() => switchTab('reservations')}
          />
        );
      case 'calendar':
        return <BookingCalendar campIds={filteredCampIds} camps={camps ?? []} />;
      case 'meals':
        return <MealsPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'menu-planner':
        return <MenuPlannerPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'menu':
        return <MenuPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'planning':
        return <PlanningPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'reports':
        return <ReportsPanel campIds={filteredCampIds} camps={camps ?? []} />;
      case 'low-stock':
        return <LowStockPanel />;
      case 'settings':
        return <><SettingsPanel /><PasswordPanel /></>;
      default:
        if (tab === 'super_dashboard') {
          return <SuperDashboardPanel onNavigateToTab={switchTab} />;
        }
        if (tab === 'super_tenants') {
          return <SuperTenantsPanel />;
        }
        if (tab === 'super_reservations') {
          return <SuperOrdersPanel />;
        }
        if (tab.startsWith('super_')) {
          return <SuperPlaceholder tab={tab} />;
        }
        return <DashboardPanel campIds={filteredCampIds} camps={camps ?? []} onNavigateToTab={switchTab} />;
    }
  };

  const userDisplayName = user?.name || user?.fullName || user?.email || 'Admin';

  return (
    <ErrorBoundary>
      <div style={themeStyle} className="flex min-h-screen bg-stone-100 font-['Plus_Jakarta_Sans',system-ui,-apple-system,sans-serif] text-stone-800">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[90] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        data-testid="admin-sidebar"
        className={`fixed top-0 left-0 bottom-0 z-[100] w-[240px] bg-sidebar text-sidebar-text flex flex-col border-r border-white/5 shadow-[2px_0_15px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div data-testid="sidebar-branding" className="border-b border-white/10 p-5 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-brand-300"><IconCamps size={22} /></span>
            <h1 className="font-display text-xl font-bold text-white">SinaiCamps</h1>
          </div>
          <div className="text-[0.7rem] text-sidebar-text/60 uppercase tracking-[1.5px] mt-0.5">Management Panel</div>
        </div>

        <nav data-testid="sidebar-nav" role="navigation" aria-label="Admin sidebar navigation" className="flex-1 py-2.5 overflow-y-auto">
          {isSuperAdmin && (
            <div className="border-b border-white/10 pb-2 mb-2">
              <p className="px-5 py-1 text-[0.65rem] uppercase tracking-wider text-sidebar-text/50 font-semibold">Super Admin</p>
              {SUPER_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => switchTab(item.id)}
                  data-testid={`nav-tab-${item.id}`}
                  className={`flex items-center gap-2.5 w-full py-3 px-5 border-none bg-transparent text-sidebar-text cursor-pointer text-[0.9rem] text-left transition-all border-l-[3px] font-[inherit] tracking-[0.2px] ${
                    tab === item.id
                      ? 'bg-white/10 text-white border-l-brand-400 font-semibold'
                      : 'hover:bg-sidebar-hover hover:text-white border-l-transparent'
                  }`}
                >
                  <NavIcon icon={item.icon} />
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {TENANT_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => switchTab(item.id)}
              data-testid={`nav-tab-${item.id}`}
              className={`flex items-center gap-2.5 w-full py-3 px-5 border-none bg-transparent text-sidebar-text cursor-pointer text-[0.9rem] text-left transition-all border-l-[3px] font-[inherit] tracking-[0.2px] ${
                tab === item.id
                  ? 'bg-white/10 text-white border-l-brand-400 font-semibold'
                  : 'hover:bg-sidebar-hover hover:text-white border-l-transparent'
              }`}
            >
              <NavIcon icon={item.icon} />
              {item.label}
              {item.id === 'inbox' && user?.tenantId ? <InboxUnreadBadge /> : null}
            </button>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          data-testid="logout-btn"
          className="mx-[18px] mt-4 mb-0 text-red-300 font-bold border border-red-400/30 bg-red-500/10 rounded-xl flex items-center gap-2 p-2.5 cursor-pointer text-[0.9rem] font-[inherit] justify-center hover:bg-red-500/20 hover:text-red-200"
        >
          Logout
        </button>
        <div className="px-5 py-3 border-t border-white/10 text-[0.7rem] text-sidebar-text/50 text-green-300/50 text-center">
          Cloudflare D1 Serverless<br />SinaiCamps v3.0
        </div>
      </aside>

      <div className="ml-0 md:ml-[240px] flex-1 min-h-screen w-full md:w-[calc(100%-240px)]">
        <div data-testid="admin-topbar" className="bg-white/95 backdrop-blur-sm px-3 py-3 sm:px-6 sm:py-3.5 border-b border-warm-200 flex items-center gap-3 sm:gap-4 flex-wrap shadow-[0_1px_4px_rgba(0,0,0,0.05)] sticky top-0 z-50">
          <button
            data-testid="mobile-toggle"
            aria-label="Toggle navigation menu"
            className="md:hidden bg-brand-600 text-white border-none text-xl px-3 py-2 rounded-lg cursor-pointer hover:bg-brand-700 transition-colors flex items-center justify-center"
            onClick={() => setSidebarOpen(prev => !prev)}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {!isSuperAdmin && (
            <div className="flex items-center gap-2.5">
              <label htmlFor="camp-filter" className="text-sm text-warm-600 font-medium whitespace-nowrap">Active Camp:</label>
              <select
                id="camp-filter"
                value={campFilter}
                onChange={(e) => setCampFilter(e.target.value)}
                data-testid="camp-filter"
                className="py-2 px-3.5 rounded-md border-2 border-stone-200 text-sm bg-white cursor-pointer font-[inherit] min-w-0 max-w-[200px] sm:min-w-[200px] focus:outline-none focus:border-brand-600"
              >
                <option value="all">All Camps</option>
                {(camps ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="bg-brand-600 text-white px-2.5 py-1 rounded-full text-xs font-semibold">
                {campFilter === 'all' ? 'All Camps' : (camps ?? []).find((c) => c.id === campFilter)?.name ?? 'Camp'}
              </span>
            </div>
          )}

          {isSuperAdmin && (
            <div className="flex items-center gap-2.5">
              <span className="bg-purple-700 text-white px-2.5 py-1 rounded-full text-xs font-semibold">Global Operator Mode</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2.5">
            <LanguageSwitcher />
            <span className="text-sm text-gray-500">{userDisplayName}</span>
          </div>
        </div>

        <main id="main-content" data-testid="content-area" role="main" className="p-3 sm:p-6 pb-24 md:pb-6">
          <Suspense fallback={<div data-testid="panel-loading"><LoadingSpinner text="Loading panel..." /></div>}>
            {renderPanel()}
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation — primary tabs only, hidden on md+ */}
      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-[95] md:hidden bg-white border-t border-stone-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex"
      >
        {navItems
          .filter((item) => MOBILE_NAV_IDS.includes(item.id))
          .map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => switchTab(item.id)}
                data-testid={`mobile-nav-${item.id}`}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 px-1 border-none bg-transparent cursor-pointer text-[0.65rem] font-[inherit] tracking-[0.2px] transition-colors ${
                  active ? 'text-brand-600 font-semibold' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
      </nav>
      </div>
    </ErrorBoundary>
  );
}

/**
 * Wraps AdminAppInner in the React Query provider so every data hook
 * (including useSettingsQuery in the shell body) has a QueryClient.
 * (Provider must sit ABOVE the component that calls useQuery — the shell
 * previously rendered the provider only around the returned JSX, which
 * made hydration throw "No QueryClient set" and blank the whole admin SPA.)
 */
export default function AdminApp() {
  return (
    <QueryClientProvider client={adminQueryClient}>
      <AdminAppInner />
    </QueryClientProvider>
  );
}

function SuperPlaceholder({ tab }: { tab: string }) {
  const titles: Record<string, string> = {
    super_dashboard: 'Super Admin Dashboard',
    super_tenants: 'Tenant Directory',
    super_reservations: 'All Orders',
  };

  return (
    <div className="text-center py-16">
      <h2 className="text-2xl font-bold text-gray-700 mb-2">{titles[tab] ?? tab}</h2>
      <p className="text-gray-500 text-sm">This panel is under construction.</p>
    </div>
  );
}
