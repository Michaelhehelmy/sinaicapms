import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { session } from '@/lib/session';
import { posKeys, usePosActiveShift } from '@/hooks/usePosQueries';
import { posUrl } from '@/lib/posUrl';
import { push, replace, onNavigation } from '@/lib/navigation';
import type { PosUser, Shift, CartItem } from './types';
import { IconDashboard, IconOrders, IconProducts, IconShift } from '@/components/ui/icons';
import { AppSidebar, type ShellNavItem } from '@/components/shell/AppSidebar';

// ─── Lazy-loaded views (code-split per tab) ────────────────
// Each view is loaded only when the user navigates to it, reducing the
// initial POS bundle from ~90KB to ~15KB + ~10KB per visited tab.
const LoginView = React.lazy(() => import('./views/LoginView'));
const DashboardView = React.lazy(() => import('./views/DashboardView'));
const ProductsView = React.lazy(() => import('./views/ProductsView'));
const CartPanel = React.lazy(() => import('./views/CartPanel'));
const OrdersView = React.lazy(() => import('./views/OrdersView'));
const ShiftOverlay = React.lazy(() => import('./views/ShiftOverlay'));
const ShiftDashboard = React.lazy(() => import('./views/ShiftDashboard'));

// ─── Shared fallback for lazy-loaded POS views ─────────────
function POSFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <LoadingSpinner text="Loading..." />
    </div>
  );
}

// ─── Sidebar (always visible, no lazy loading needed) ──────
/** POS nav — promoted inline SVG icons (Phase 8: no emoji in shells). */
const POS_NAV: ShellNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'products', label: 'Products', icon: IconProducts },
  { id: 'orders', label: 'Orders', icon: IconOrders },
  { id: 'shift', label: 'Shift', icon: IconShift },
];

function Sidebar({
  view,
  onNavigate,
  onLogout,
  user,
}: {
  view: string;
  onNavigate: (v: string) => void;
  onLogout: () => void;
  user: PosUser;
}) {
  return (
    <AppSidebar
      sidebarTestId="pos-sidebar"
      ariaLabel="POS sidebar navigation"
      className="hidden sm:flex w-56 bg-sidebar text-sidebar-text flex-col shrink-0 border-r border-white/5"
      header={
        <div className="px-5 py-5 border-b border-white/10">
          <div className="font-display text-lg font-bold tracking-tight">SinaiCamps</div>
          <div className="text-xs text-sidebar-text/60 mt-0.5">POS Terminal</div>
        </div>
      }
      groups={[{ items: POS_NAV }]}
      activeId={view}
      onNavigate={onNavigate}
      getNavItemTestId={(id) => `pos-nav-${id}`}
      getItemClassName={(active) =>
        `w-full text-left px-5 py-3 border-none cursor-pointer text-sm font-[inherit] transition-colors ${
          active
            ? 'bg-brand-600 text-white hover:bg-brand-700'
            : 'bg-transparent text-sidebar-text/70 hover:bg-sidebar-hover hover:text-white'
        }`
      }
      iconWrapClassName="mr-3 flex items-center justify-center"
      footer={
        <div className="px-5 py-4 border-t border-white/10">
          <div className="text-xs text-sidebar-text/60 truncate" data-testid="pos-user-name">{user.firstName} {user.lastName}</div>
          <button
            onClick={onLogout}
            data-testid="pos-signout-btn"
            className="text-xs text-red-300 hover:text-red-200 mt-1 px-0 bg-transparent border-none cursor-pointer font-[inherit]"
          >
            Sign out
          </button>
        </div>
      }
    />
  );
}

// ─── Main POSApp shell (query client lives here) ──────────
// POS context: 10s stale time (real-time POS needs fresher data), 2min garbage
// collection. Retries stay OFF — a POS fetch surfaces failure immediately so
// cashiers never act on silent stale state (matches legacy single-fetch).
export const posQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 2 * 60_000,
      refetchOnWindowFocus: true,
      retry: false,
    },
  },
});

export default function POSApp() {
  return (
    <QueryClientProvider client={posQueryClient}>
      <POSAppShell />
    </QueryClientProvider>
  );
}

// ─── Path → view mapping (Phase 7: pushState routing) ──────
function viewFromPath(pathname: string): string {
  if (pathname.includes('/login')) return 'login';
  if (pathname.includes('/products')) return 'products';
  if (pathname.includes('/orders')) return 'orders';
  if (pathname.includes('/shift')) return 'shift';
  return 'dashboard';
}

function POSAppShell() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<PosUser | null>(() => session.getUser<PosUser>('pos'));
  const [token, setToken] = useState<string | null>(() => session.getAccessToken('pos'));
  const [view, setView] = useState<string>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    return viewFromPath(window.location.pathname);
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  // Shift opened in this tab (overrides the server probe until invalidated).
  const [openedShift, setOpenedShift] = useState<Shift | null>(null);

  // Active-shift probe — failed checks are non-fatal (cashier can open manually).
  const shiftProbe = usePosActiveShift(Boolean(user && token));
  const probeShift = shiftProbe.data?.active ? (shiftProbe.data.shift as Shift) : null;
  const activeShift = openedShift ?? probeShift;

  // Phase 7: keep `view` in sync with every URL change — sidebar clicks,
  // checkout → orders, receipt close, and browser back/forward all flow
  // through the navigation kernel instead of full page reloads.
  useEffect(
    () =>
      onNavigation((event) => {
        if (!event.path.startsWith('/pos')) return;
        setView(viewFromPath(event.path));
      }),
    [],
  );

  // Redirect to /pos/login when not authenticated (pushState replace — no reload)
  useEffect(() => {
    if (!user || !token) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/pos/login') {
        replace(posUrl('/pos/login'));
      }
    }
  }, [user, token]);

  const navigate = useCallback((v: string) => {
    setView(v);
    const target = v === 'login' ? '/pos/login' : `/pos/${v}`;
    push(posUrl(target));
  }, []);

  function handleLogin(u: PosUser, t: string) {
    // Auth transition → wipe every cached query from the previous identity.
    queryClient.clear();
    // Phase 7: pushState navigation no longer remounts the shell (the old
    // full-reload did), so the token must land in state for the render gate.
    setToken(t);
    setUser(u);
    navigate('dashboard');
  }

  function handleLogout() {
    session.clear('pos');
    // Auth transition → wipe every cached query from the previous identity.
    queryClient.clear();
    setToken(null);
    setUser(null);
    setCart([]);
    setOpenedShift(null);
    navigate('login');
  }

  function handleCheckout() {
    queryClient.invalidateQueries({ queryKey: posKeys.all });
  }

  if (!user || !token || view === 'login') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<POSFallback />}>
          <LoginView onLogin={handleLogin} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Show full-screen shift overlay if no active shift (except on shift view, which renders inline)
  if (!shiftProbe.isLoading && !activeShift && view !== 'shift') {
    return (
      <ErrorBoundary>
        <div className="h-screen flex flex-col sm:flex-row overflow-hidden bg-gray-100">
          <Sidebar view={view} onNavigate={navigate} onLogout={handleLogout} user={user} />
          <main id="main-content" className="flex-1 flex items-center justify-center">
            <Suspense fallback={<POSFallback />}>
              <ShiftOverlay onShiftOpened={(shift) => setOpenedShift(shift)} />
            </Suspense>
          </main>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col sm:flex-row overflow-hidden bg-gray-100">
        <Sidebar view={view} onNavigate={navigate} onLogout={handleLogout} user={user} />
        <main id="main-content" className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {view === 'dashboard' && (
            <Suspense fallback={<POSFallback />}>
              <DashboardView />
            </Suspense>
          )}
          {view === 'products' && (
            <Suspense fallback={<POSFallback />}>
              <ProductsView cart={cart} setCart={setCart} />
            </Suspense>
          )}
          {view === 'orders' && (
            <Suspense fallback={<POSFallback />}>
              <OrdersView />
            </Suspense>
          )}
          {view === 'shift' && (
            <Suspense fallback={<POSFallback />}>
              <ShiftDashboard shift={activeShift} onShiftClosed={() => { setOpenedShift(null); navigate('dashboard'); }} />
            </Suspense>
          )}
          {view === 'products' && (
            <Suspense fallback={<POSFallback />}>
              <CartPanel
                cart={cart}
                setCart={setCart}
                user={user}
                onCheckout={handleCheckout}
              />
            </Suspense>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
