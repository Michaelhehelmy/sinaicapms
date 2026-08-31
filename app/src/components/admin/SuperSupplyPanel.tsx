import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { getAdminTenants } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  [key: string]: unknown;
}

interface SupplyOverview {
  totalWarehouses: number;
  totalProducts: number;
  pendingPurchaseOrders: number;
  lowStockItems: number;
  tenantBreakdown: Array<{
    tenant_id: string;
    tenant_name: string;
    warehouse_count: number;
    product_count: number;
  }>;
}

interface PORecord {
  id: string;
  reference: string;
  status: string;
  total_amount: number;
  tenant_name: string;
  created_at: string;
  [key: string]: unknown;
}

const poColumns = [
  {
    key: 'reference',
    header: 'PO #',
    sortable: true,
    render: (r: PORecord) => <span className="font-medium text-gray-800">{r.reference || r.id?.slice(0, 8) || '—'}</span>,
  },
  {
    key: 'tenant_name',
    header: 'Tenant',
    sortable: true,
    render: (r: PORecord) => <span className="text-gray-600">{r.tenant_name || '—'}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: PORecord) => <Badge variant={r.status === 'received' ? 'success' : r.status === 'canceled' ? 'danger' : 'warning'}>{r.status}</Badge>,
  },
  {
    key: 'total_amount',
    header: 'Amount',
    sortable: true,
    render: (r: PORecord) => <span className="text-right font-medium text-gray-800">{formatCurrency(r.total_amount ?? 0)}</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    sortable: true,
    render: (r: PORecord) => <span className="text-gray-500">{r.created_at ? formatDate(r.created_at) : '—'}</span>,
  },
];

export default function SuperSupplyPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<SupplyOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [purchaseOrders, setPurchaseOrders] = useState<PORecord[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const loadTenants = useCallback(async () => {
    try {
      const data = await getAdminTenants();
      const list = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown })?.data) ? ((data as { data: TenantRecord[] }).data) : [];
      setTenants(list);
    } catch (err) {
      showToast('Failed to load tenants: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingTenants(false);
    }
  }, [showToast]);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const data = await apiFetch<SupplyOverview>('/admin/supply/overview');
      setOverview(data);
    } catch (err) {
      showToast('Failed to load supply overview: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  const loadPOs = useCallback(async (tenantId?: string) => {
    setLoadingPOs(true);
    try {
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const data = await apiFetch<{ data: PORecord[]; total: number }>(`/admin/supply/purchase-orders${qs}`);
      setPurchaseOrders(data.data || []);
    } catch (err) {
      showToast('Failed to load purchase orders: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingPOs(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); loadOverview(); }, [loadTenants, loadOverview]);
  useEffect(() => { loadPOs(selectedTenantId || undefined); }, [selectedTenantId, loadPOs]);

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div data-testid="super-supply-panel" aria-busy={loadingTenants || loadingOverview || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants || loadingOverview ? (
        <LoadingSpinner text="Loading supply data..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Supply Chain Overview</h2>
        <span className="text-sm text-gray-500">Cross-tenant inventory & procurement</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Warehouses" value={overview?.totalWarehouses ?? 0} color="blue" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>} />
        <StatCard title="Products" value={overview?.totalProducts ?? 0} color="green" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
        <StatCard title="Pending POs" value={overview?.pendingPurchaseOrders ?? 0} color="yellow" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        <StatCard title="Low Stock" value={overview?.lowStockItems ?? 0} color="red" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>} />
      </div>

      {overview?.tenantBreakdown && overview.tenantBreakdown.length > 0 && (
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Inventory by Tenant</h3>
          <div className="space-y-2">
            {overview.tenantBreakdown.slice(0, 5).map((t) => (
              <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenant_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.warehouse_count} warehouses</span>
                  <span className="font-medium text-gray-800">{t.product_count} products</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="min-w-[200px]">
            <Select label="Filter by Tenant" options={tenantOptions} value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)} />
          </div>
          <Button variant="success" size="md" loading={loadingPOs} onClick={() => loadPOs(selectedTenantId || undefined)}>Refresh</Button>
        </div>
      </Card>

      {loadingPOs ? (
        <LoadingSpinner text="Loading purchase orders..." />
      ) : purchaseOrders.length === 0 ? (
        <Card padding="md"><EmptyState title="No purchase orders found" description="No purchase orders found for the selected filter." /></Card>
      ) : (
        <DataTable columns={poColumns} data={purchaseOrders} rowKey="id" size="md" />
      )}
      </>
      )}
    </div>
  );
}
