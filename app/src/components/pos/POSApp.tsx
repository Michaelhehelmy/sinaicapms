import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import * as apiClient from '@/lib/api';
import { posUrl } from '@/lib/posUrl';
import type { PosUser, Shift, CartItem } from './types';

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

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pos_token');
}

function getUser(): PosUser | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('pos_user') || 'null');
  } catch {
    return null;
  }
}

// ─── Sidebar (always visible, no lazy loading needed) ──────
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
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🧾' },
    { id: 'shift', label: 'Shift', icon: '🕐' },
  ];
  return (
    <aside className="hidden sm:flex w-56 bg-sidebar text-sidebar-text flex-col shrink-0 border-r border-white/5" data-testid="pos-sidebar">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="font-display text-lg font-bold tracking-tight">SinaiCamps</div>
        <div className="text-xs text-sidebar-text/60 mt-0.5">POS Terminal</div>
      </div>
      <nav className="flex-1 py-3" role="navigation" aria-label="POS sidebar navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            data-testid={`pos-nav-${item.id}`}
            className={`w-full text-left px-5 py-3 border-none cursor-pointer text-sm font-[inherit] transition-colors ${
              view === item.id
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-transparent text-sidebar-text/70 hover:bg-sidebar-hover hover:text-white'
            }`}
          >
            <span className="mr-3">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
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
    </aside>
  );
}

// ─── Main POSApp ───────────────────────────────────────────
// POS context: 10s stale time (real-time POS needs fresher data), 2min garbage collection
const posQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 2 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export default function POSApp() {
  const [user, setUser] = useState<PosUser | null>(getUser);
  const [token, setToken] = useState<string | null>(getToken);
  const [view, setView] = useState<string>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const path = window.location.pathname;
    if (path.includes('/login')) return 'login';
    if (path.includes('/products')) return 'products';
    if (path.includes('/orders')) return 'orders';
    if (path.includes('/shift')) return 'shift';
    return 'dashboard';
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);

  // Redirect to /pos/login when not authenticated (path-based, not hash)
  useEffect(() => {
    if (!user || !token) {
      if (window.location.pathname !== '/pos/login') {
        window.location.href = posUrl('/pos/login');
      }
    }
  }, [user, token]);

  // Check for active shift on mount
  useEffect(() => {
    if (!user || !token) return;
    apiClient.posGetActiveShift()
      .then((res: any) => { if (res.active) setActiveShift(res.shift as Shift); })
      .catch(() => { /* shift check failure is non-fatal; user can open shift manually */ })
      .finally(() => setShiftLoading(false));
  }, [user, token]);

  const navigate = useCallback((v: string) => {
    const target = v === 'login' ? '/pos/login' : `/pos/${v}`;
    window.location.href = posUrl(target);
  }, []);

  function handleLogin(u: PosUser, t: string) {
    setUser(u);
    setToken(t);
    navigate('dashboard');
  }

  function handleLogout() {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    setUser(null);
    setToken(null);
    setCart([]);
    setActiveShift(null);
    navigate('login');
  }

  if (!user || !token || view === 'login') {
    return (
      <QueryClientProvider client={posQueryClient}>
        <Suspense fallback={<POSFallback />}>
          <LoginView onLogin={handleLogin} />
        </Suspense>
      </QueryClientProvider>
    );
  }

  // Show shift overlay if no active shift and not on shift page
  if (!shiftLoading && !activeShift && view !== 'shift') {
    return (
      <QueryClientProvider client={posQueryClient}>
      <ErrorBoundary>
        <div className="h-screen flex flex-col sm:flex-row overflow-hidden bg-gray-100">
          <Sidebar view={view} onNavigate={navigate} onLogout={handleLogout} user={user} />
          <main id="main-content" className="flex-1 flex items-center justify-center">
            <Suspense fallback={<POSFallback />}>
              <ShiftOverlay onShiftOpened={(shift) => setActiveShift(shift)} />
            </Suspense>
          </main>
        </div>
      </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={posQueryClient}>
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
              <OrdersView refreshKey={ordersRefreshKey} />
            </Suspense>
          )}
          {view === 'shift' && activeShift && (
            <Suspense fallback={<POSFallback />}>
              <ShiftDashboard shift={activeShift} onShiftClosed={() => { setActiveShift(null); navigate('dashboard'); }} />
            </Suspense>
          )}
          {view === 'products' && (
            <Suspense fallback={<POSFallback />}>
              <CartPanel
                cart={cart}
                setCart={setCart}
                user={user}
                onCheckout={() => { setOrdersRefreshKey((k) => k + 1); }}
              />
            </Suspense>
          )}
        </main>
      </div>
    </ErrorBoundary>
    </QueryClientProvider>
  );
}
