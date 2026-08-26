import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { session } from '@/lib/session';
import { useToast } from '@/components/ui/Toast';
import type { Camp } from '@/hooks/useAdminData';
import { useCampsQuery, useSettingsQuery, useInboxUnreadQuery, queryKeys } from '@/hooks/useQueryHooks';
import { buildTenantTheme } from '@/lib/theme';
import { parseHashTab, onNavigation, push } from '@/lib/navigation';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  IconAnalytics,
  IconCalendar,
  IconCamps,
  IconCRM,
  IconDashboard,
  IconAI,
  IconFinancials,
  IconHR,
  IconInbox,
  IconLowStock,
  IconMeals,
  IconMenu,
  IconOrders,
  IconPlanning,
  IconPromotions,
  IconRatePlans,
  IconReports,
  IconRooms,
  IconServices,
  IconSettings,
  IconStaff,
  IconStorefront,
  IconSupply,
  type IconProps,
} from './icons';
import { LoginForm } from '@/components/shell/LoginForm';
import { AppSidebar, type ShellNavItem, type ShellNavGroup } from '@/components/shell/AppSidebar';
import { AppTopbar } from '@/components/shell/AppTopbar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';

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
const StaffPanel = React.lazy(() => import('./StaffPanel'));
const InboxPanel = React.lazy(() => import('./InboxPanel'));
const AnalyticsPanel = React.lazy(() => import('./AnalyticsPanel'));
const PromotionsPanel = React.lazy(() => import('./PromotionsPanel'));
const ServicesPanel = React.lazy(() => import('./ServicesPanel'));
const ServiceBookingsPanel = React.lazy(() => import('./ServiceBookingsPanel'));
const BillingPanel = React.lazy(() => import('./BillingPanel'));
const SuperTenantsPanel = React.lazy(() => import('./SuperTenantsPanel'));
const SuperDashboardPanel = React.lazy(() => import('./SuperDashboardPanel'));
const SuperOrdersPanel = React.lazy(() => import('./SuperOrdersPanel'));
const FinancialPanel = React.lazy(() => import('./FinancialPanel'));
const HRPanel = React.lazy(() => import('./HRPanel'));
const SupplyPanel = React.lazy(() => import('./SupplyPanel'));
const CRMPanel = React.lazy(() => import('./CRMPanel'));
const StorefrontPanel = React.lazy(() => import('./StorefrontPanel'));
const AIPanel = React.lazy(() => import('./AIPanel'));
const SuperFinancialsPanel = React.lazy(() => import('./SuperFinancialsPanel'));
const SuperHRPanel = React.lazy(() => import('./SuperHRPanel'));
const SuperSupplyPanel = React.lazy(() => import('./SuperSupplyPanel'));
const SuperCRMPanel = React.lazy(() => import('./SuperCRMPanel'));
const SuperStorefrontPanel = React.lazy(() => import('./SuperStorefrontPanel'));
const SuperAIPanel = React.lazy(() => import('./SuperAIPanel'));
const UsersPanel = React.lazy(() => import('./UsersPanel'));
const SystemSettingsPanel = React.lazy(() => import('./SystemSettingsPanel'));
const AuditLogPanel = React.lazy(() => import('./AuditLogPanel'));
const SubscriptionsPanel = React.lazy(() => import('./SubscriptionsPanel'));
const SuperReportsPanel = React.lazy(() => import('./SuperReportsPanel'));
const SystemHealthPanel = React.lazy(() => import('./SystemHealthPanel'));
const TenantPerformancePanel = React.lazy(() => import('./TenantPerformancePanel'));

type Tab = string;

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<IconProps>;
}

const TENANT_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'camps', label: 'Projects', icon: IconCamps },
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
  { id: 'analytics', label: 'Analytics', icon: IconAnalytics },
  { id: 'low-stock', label: 'Low Stock', icon: IconLowStock },
  { id: 'promotions', label: 'Promotions', icon: IconPromotions },
  { id: 'services', label: 'Services', icon: IconServices },
  { id: 'service-bookings', label: 'Service Bookings', icon: IconServices },
  { id: 'staff', label: 'Staff', icon: IconStaff },
  { id: 'financials', label: 'Financials', icon: IconReports },
  { id: 'hr', label: 'HR & Payroll', icon: IconStaff },
  { id: 'supply', label: 'Supply Chain', icon: IconLowStock },
  { id: 'crm', label: 'CRM', icon: IconInbox },
  { id: 'storefront', label: 'Storefront', icon: IconCamps },
  { id: 'ai', label: 'AI & Intelligence', icon: IconAnalytics },
  { id: 'billing', label: 'Billing', icon: IconSettings },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

/** Primary tabs surfaced on the mobile bottom nav (mobile-optimized subset). */
const MOBILE_NAV_IDS = ['dashboard', 'camps', 'rooms', 'reservations', 'calendar'];

/** Super-admin mobile bottom nav — the 3 super panels fit comfortably. */
const SUPER_MOBILE_NAV_IDS = ['super_dashboard', 'super_tenants', 'super_reservations', 'super_financials', 'super_settings'];

const SUPER_NAV: NavItem[] = [
  { id: 'super_dashboard', label: 'Super Dashboard', icon: IconDashboard },
  { id: 'super_tenants', label: 'Tenants', icon: IconRooms },
  { id: 'super_reservations', label: 'All Orders', icon: IconOrders },
  { id: 'super_users', label: 'Users', icon: IconStaff },
  { id: 'super_settings', label: 'System Settings', icon: IconSettings },
  { id: 'super_audit', label: 'Audit Log', icon: IconReports },
  { id: 'super_subscriptions', label: 'Subscriptions', icon: IconSettings },
  { id: 'super_financials', label: 'Financials', icon: IconFinancials },
  { id: 'super_hr', label: 'HR', icon: IconHR },
  { id: 'super_supply', label: 'Supply Chain', icon: IconSupply },
  { id: 'super_crm', label: 'CRM', icon: IconCRM },
  { id: 'super_storefront', label: 'Storefront', icon: IconStorefront },
  { id: 'super_ai', label: 'AI & Insights', icon: IconAI },
  { id: 'super_reports', label: 'Reports', icon: IconReports },
  { id: 'super_health', label: 'System Health', icon: IconAnalytics },
  { id: 'super_performance', label: 'Performance', icon: IconAnalytics },
];

// ─── Phase 7 navigation: pushState tabs with legacy-hash fallback ────────
//
// Canonical deep links are now paths: `/admin/<tab>` (e.g. `/admin/camps`).
// Pre-kernel bookmarks (`/admin#tab=camps`) keep resolving through
// parseHashTab() during the migration window; a hashchange listener honors
// them even mid-session.

/** Resolve the active tab from the current URL. Legacy `#tab=` wins over path. */
function tabFromLocation(pathname: string): string {
  const legacy = parseHashTab();
  if (legacy) return legacy;
  if (typeof pathname !== 'string') return 'dashboard';
  const match = /^\/admin\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : 'dashboard';
}

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'dashboard';
  return tabFromLocation(window.location.pathname);
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
  const queryClient = useQueryClient();
  const { data: camps } = useCampsQuery();
  // Phase 6: camp list lives in the TanStack cache under ['admin','camps'] —
  // refreshes invalidate that concern instead of refetching a private hook.
  const refreshCamps = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.camps }),
    [queryClient],
  );
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

  const [tab, setTab] = useState<Tab>(() => getInitialTab());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Single-camp admin (B3): each tenant owns exactly one camp. Every panel is
  // scoped to that camp — the topbar camp picker and multi-camp flows are gone.
  const activeCamp = camps && camps.length > 0 ? camps[0] : null;
  const activeCampIds = useMemo(() => (activeCamp ? [activeCamp.id] : []), [activeCamp]);
  const activeCamps = useMemo<Camp[]>(() => (activeCamp ? [activeCamp] : []), [activeCamp]);

  const isSuperAdmin = hasRole('super_admin');
  // Phase 2: super admins get ONLY the super panels; tenant admins get the full tenant nav.
  const navItems = isSuperAdmin ? SUPER_NAV : TENANT_NAV;

  // Single navigation stream: sidebar/mobile clicks push new `/admin/<tab>`
  // paths; browser back/forward and external pushes re-derive the tab here.
  useEffect(
    () =>
      onNavigation((event) => {
        if (!event.path.startsWith('/admin')) return;
        setTab(tabFromLocation(event.path));
      }),
    [],
  );

  // Migration window: pre-kernel bookmarks use `#tab=<id>` — keep honoring
  // hash edits mid-session (pushState navigations clear the stale fragment).
  useEffect(() => {
    const handleHash = () => {
      const legacy = parseHashTab(window.location.hash ?? '');
      if (legacy) setTab(legacy);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const switchTab = useCallback((newTab: string) => {
    setTab(newTab);
    setSidebarOpen(false);
    // Carry the current query string (`?tenant=` in staging/E2E) so a manual
    // reload after navigation still resolves the same zone.
    const search = (typeof window !== 'undefined' && window.location.search) || '';
    push(`/admin/${newTab}${search}`);
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
    return <LoginForm realm="admin" onAdminSubmit={login} />;
  }

  const renderPanel = () => {
    switch (tab) {
      case 'dashboard':
        return <DashboardPanel campIds={activeCampIds} camps={activeCamps} onNavigateToTab={switchTab} />;
      case 'camps':
        return <CampsPanel onRefreshCamps={refreshCamps} />;
      case 'rooms':
        return <RoomsPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'rateplans':
        return <RatePlansPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'reservations':
        return <OrdersPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'inbox':
        return (
          <InboxPanel
            tenantId={user?.tenantId}
            token={session.getAccessToken('admin') ?? undefined}
            onOpenOrder={() => switchTab('reservations')}
          />
        );
      case 'calendar':
        return <BookingCalendar campIds={activeCampIds} camps={activeCamps} />;
      case 'meals':
        return <MealsPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'menu-planner':
        return <MenuPlannerPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'menu':
        return <MenuPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'planning':
        return <PlanningPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'reports':
        return <ReportsPanel campIds={activeCampIds} camps={activeCamps} />;
      case 'analytics':
        return <AnalyticsPanel />;
      case 'low-stock':
        return <LowStockPanel />;
      case 'promotions':
        return <PromotionsPanel />;
      case 'services':
        return <ServicesPanel />;
      case 'service-bookings':
        return <ServiceBookingsPanel />;
      case 'staff':
        return <StaffPanel />;
      case 'financials':
        return <FinancialPanel />;
      case 'hr':
        return <HRPanel />;
      case 'supply':
        return <SupplyPanel />;
      case 'crm':
        return <CRMPanel />;
      case 'storefront':
        return <StorefrontPanel />;
      case 'ai':
        return <AIPanel />;
      case 'billing':
        return <BillingPanel />;
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
        if (tab === 'super_financials') {
          return <SuperFinancialsPanel />;
        }
        if (tab === 'super_hr') {
          return <SuperHRPanel />;
        }
        if (tab === 'super_supply') {
          return <SuperSupplyPanel />;
        }
        if (tab === 'super_crm') {
          return <SuperCRMPanel />;
        }
        if (tab === 'super_storefront') {
          return <SuperStorefrontPanel />;
        }
        if (tab === 'super_ai') {
          return <SuperAIPanel />;
        }
        if (tab === 'super_users') {
          return <UsersPanel />;
        }
        if (tab === 'super_settings') {
          return <SystemSettingsPanel />;
        }
        if (tab === 'super_audit') {
          return <AuditLogPanel />;
        }
        if (tab === 'super_subscriptions') {
          return <SubscriptionsPanel />;
        }
        if (tab === 'super_reports') {
          return <SuperReportsPanel />;
        }
        if (tab === 'super_health') {
          return <SystemHealthPanel />;
        }
        if (tab === 'super_performance') {
          return <TenantPerformancePanel />;
        }
        if (tab.startsWith('super_')) {
          return <SuperPlaceholder tab={tab} />;
        }
        return <DashboardPanel campIds={activeCampIds} camps={activeCamps} onNavigateToTab={switchTab} />;
    }
  };

  const userDisplayName = user?.name || user?.fullName || user?.email || 'Admin';

  // ─── Shared shell wiring (Phase 8): pure config → AppSidebar/MobileBottomNav
  const adminItemClassName = (active: boolean) =>
    `flex items-center gap-2.5 w-full py-3 px-5 border-none bg-transparent text-sidebar-text cursor-pointer text-[0.9rem] text-left transition-all border-l-[3px] font-[inherit] tracking-[0.2px] ${
      active
        ? 'bg-white/10 text-white border-l-brand-400 font-semibold'
        : 'hover:bg-sidebar-hover hover:text-white border-l-transparent'
    }`;

  const sidebarGroups: ShellNavGroup[] = isSuperAdmin
    ? [
        {
          className: 'border-b border-white/10 pb-2 mb-2',
          heading: (
            <p className="px-5 py-1 text-[0.65rem] uppercase tracking-wider text-sidebar-text/50 font-semibold">
              Super Admin
            </p>
          ),
          items: SUPER_NAV,
        },
      ]
    : [
        {
          items: TENANT_NAV.map((item) =>
            item.id === 'inbox' && user?.tenantId ? { ...item, trailing: <InboxUnreadBadge /> } : item,
          ),
        },
      ];

  /** Primary tabs surfaced on the mobile bottom nav (mobile-optimized subset). */
  const mobileItems: ShellNavItem[] = navItems.filter((item) =>
    isSuperAdmin ? SUPER_MOBILE_NAV_IDS.includes(item.id) : MOBILE_NAV_IDS.includes(item.id),
  );

  return (
    <ErrorBoundary>
      <div style={themeStyle} className="flex min-h-screen bg-stone-100 font-['Plus_Jakarta_Sans',system-ui,-apple-system,sans-serif] text-stone-800">
      <AppSidebar
        sidebarTestId="admin-sidebar"
        ariaLabel="Admin sidebar navigation"
        navTestId="sidebar-nav"
        navClassName="flex-1 py-2.5 overflow-y-auto"
        className={`fixed top-0 left-0 bottom-0 z-[100] w-[240px] bg-sidebar text-sidebar-text flex flex-col border-r border-white/5 shadow-[2px_0_15px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        backdrop={{ open: sidebarOpen, onDismiss: () => setSidebarOpen(false) }}
        header={
          <div data-testid="sidebar-branding" className="border-b border-white/10 p-5 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-brand-300"><IconCamps size={22} /></span>
              <h1 className="font-display text-xl font-bold text-white">SinaiCamps</h1>
            </div>
            <div className="text-[0.7rem] text-sidebar-text/60 uppercase tracking-[1.5px] mt-0.5">Management Panel</div>
          </div>
        }
        groups={sidebarGroups}
        activeId={tab}
        onNavigate={switchTab}
        getNavItemTestId={(id) => `nav-tab-${id}`}
        getItemClassName={adminItemClassName}
        iconWrapClassName="w-6 shrink-0 flex items-center justify-center"
        footer={
          <>
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
          </>
        }
      />

      <div className="ml-0 md:ml-[240px] flex-1 min-h-screen w-full md:w-[calc(100%-240px)]">
        <AppTopbar onMenuClick={() => setSidebarOpen((prev) => !prev)}>
          {!isSuperAdmin && (
            <div className="flex items-center gap-2.5">
              <span data-testid="active-camp-badge" className="bg-brand-600 text-white px-2.5 py-1 rounded-full text-xs font-semibold">
                {activeCamp?.name ?? 'Camp'}
              </span>
            </div>
          )}

          {isSuperAdmin && (
            <div className="flex items-center gap-2.5">
              <span className="bg-purple-700 text-white px-2.5 py-1 rounded-full text-xs font-semibold">Global Operator Mode</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2.5">
            <span className="text-sm text-gray-500">{userDisplayName}</span>
          </div>
        </AppTopbar>

        <main id="main-content" data-testid="content-area" role="main" className="p-3 sm:p-6 pb-24 md:pb-6">
          <Suspense fallback={<div data-testid="panel-loading"><LoadingSpinner text="Loading panel..." /></div>}>
            {renderPanel()}
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation — primary tabs only, hidden on md+ */}
      <MobileBottomNav
        testId="mobile-bottom-nav"
        ariaLabel="Mobile navigation"
        items={mobileItems}
        activeId={tab}
        onNavigate={switchTab}
        getNavItemTestId={(id) => `mobile-nav-${id}`}
      />
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
