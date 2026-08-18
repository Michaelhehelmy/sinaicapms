import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { setTenantScope } from '@/lib/api';
import { useCampsQuery, queryKeys } from '@/hooks/useQueryHooks';
import type { Camp } from '@/hooks/useAdminData';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import CampsPanel from './CampsPanel';
import RoomsPanel from './RoomsPanel';
import RatePlansPanel from './RatePlansPanel';
import OrdersPanel from './OrdersPanel';
import MenuPanel from './MenuPanel';
import StaffPanel from './StaffPanel';

/**
 * T9 — super-admin tenant drill-down.
 *
 * Renders the existing admin panels (camps/rooms/rate-plans/orders/menu) scoped
 * to a single tenant while the super admin sits on the marketplace host. The
 * api client's tenant-scope override (setTenantScope) makes every panel fetch
 * send `x-tenant-id: <tenant.id>`, and the backend lets super_admin access any
 * tenant partition — so the panels themselves stay untouched.
 *
 * The whole subtree gets its OWN QueryClient (fresh per tenant.id via the
 * `key` remount in SuperTenantsPanel) so react-query caches can never leak
 * across tenants or back into the main admin app (query keys are not
 * tenant-scoped).
 */
interface TenantDrilldownProps {
  tenant: { id: string; name: string; subdomain: string | null; customDomain?: string | null; type?: string };
  onBack: () => void;
}

const VIEWS = ['camp', 'rooms', 'rateplans', 'orders', 'menu', 'staff'] as const;
type DrillView = (typeof VIEWS)[number];

const VIEW_LABELS: Record<DrillView, string> = {
  camp: 'Camp',
  rooms: 'Rooms',
  rateplans: 'Rate Plans',
  orders: 'Orders',
  menu: 'Menu',
  staff: 'Staff',
};

const TENANT_TYPE_LABELS: Record<string, string> = {
  camp: 'Camp',
  supermarket: 'Supermarket',
  transportation: 'Transportation',
  other: 'Other',
};

export default function TenantDrilldown({ tenant, onBack }: TenantDrilldownProps) {
  // Fresh query client per mount — SuperTenantsPanel remounts with key={tenant.id}.
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    setTenantScope(tenant.id);
    return () => setTenantScope(null);
  }, [tenant.id]);

  return (
    <QueryClientProvider client={queryClient}>
      <DrilldownContent tenant={tenant} onBack={onBack} />
    </QueryClientProvider>
  );
}

function DrilldownContent({ tenant, onBack }: TenantDrilldownProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<DrillView>('camp');
  const { data: camps, isLoading: loading } = useCampsQuery();

  const refreshCamps = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.camps });
  }, [queryClient]);

  // Single-camp hub (B3): the tenant owns exactly one camp, so every panel is
  // wired to camps[0] — no camp pickers, no multi-camp arrays.
  const activeCamp = camps && camps.length > 0 ? camps[0] : null;
  const campIds = useMemo(() => (activeCamp ? [activeCamp.id] : []), [activeCamp]);
  const activeCamps = useMemo<Camp[]>(() => (activeCamp ? [activeCamp] : []), [activeCamp]);

  const typeLabel = (value?: string) => {
    const v = value || 'camp';
    return TENANT_TYPE_LABELS[v] ?? v;
  };

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer transition-colors ${
      active ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`;

  return (
    <div data-testid="tenant-drilldown">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            data-testid="drilldown-back-btn"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 border-none cursor-pointer"
          >
            ← Back to tenants
          </button>
          <h2 className="text-xl font-bold text-gray-800">{tenant.name}</h2>
          <span
            data-testid="drilldown-tenant-type-badge"
            className="px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 text-xs"
          >
            {typeLabel(tenant.type)}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {tenant.customDomain ? tenant.customDomain : tenant.subdomain ? `${tenant.subdomain}.sinaicamps.com` : tenant.id}
        </span>
      </div>

      <div className="flex gap-2 mb-4">
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            data-testid={`drilldown-tab-${v}`}
            className={tabClass(view === v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner text="Loading camp..." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {view === 'camp' && <CampsPanel onRefreshCamps={refreshCamps} />}
          {view === 'rooms' && <RoomsPanel campIds={campIds} camps={activeCamps} />}
          {view === 'rateplans' && <RatePlansPanel campIds={campIds} camps={activeCamps} />}
          {view === 'orders' && <OrdersPanel campIds={campIds} camps={activeCamps} />}
          {view === 'menu' && <MenuPanel campIds={campIds} camps={activeCamps} />}
          {view === 'staff' && <StaffPanel scopedTenantId={tenant.id} />}
        </div>
      )}
    </div>
  );
}
