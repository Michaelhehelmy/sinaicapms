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

interface StorefrontOverview {
  totalProducts: number;
  activeProducts: number;
  totalPOSTransactions: number;
  totalPOSRevenue: number;
  tenantBreakdown: Array<{
    tenant_id: string;
    tenant_name: string;
    product_count: number;
    pos_transaction_count: number;
    pos_revenue: number;
  }>;
}

interface ProductRecord {
  id: string;
  name: string;
  sku: string;
  price: number;
  tenant_name: string;
  status: string;
  [key: string]: unknown;
}

const productColumns = [
  {
    key: 'name',
    header: 'Product',
    sortable: true,
    render: (r: ProductRecord) => <span className="font-medium text-gray-800">{r.name || '—'}</span>,
  },
  {
    key: 'tenant_name',
    header: 'Tenant',
    sortable: true,
    render: (r: ProductRecord) => <span className="text-gray-600">{r.tenant_name || '—'}</span>,
  },
  {
    key: 'sku',
    header: 'SKU',
    render: (r: ProductRecord) => <span className="text-gray-600 font-mono text-sm">{r.sku || '—'}</span>,
  },
  {
    key: 'price',
    header: 'Price',
    sortable: true,
    render: (r: ProductRecord) => <span className="text-right font-medium text-gray-800">{formatCurrency(r.price ?? 0)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: ProductRecord) => <Badge variant={r.status === 'active' ? 'success' : 'info'}>{r.status}</Badge>,
  },
];

export default function SuperStorefrontPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<StorefrontOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

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
      const data = await apiFetch<StorefrontOverview>('/admin/storefront/overview');
      setOverview(data);
    } catch (err) {
      showToast('Failed to load storefront overview: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  const loadProducts = useCallback(async (tenantId?: string) => {
    setLoadingProducts(true);
    try {
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const data = await apiFetch<{ data: ProductRecord[]; total: number }>(`/admin/storefront/products${qs}`);
      setProducts(data.data || []);
    } catch (err) {
      showToast('Failed to load products: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingProducts(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); loadOverview(); }, [loadTenants, loadOverview]);
  useEffect(() => { loadProducts(selectedTenantId || undefined); }, [selectedTenantId, loadProducts]);

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div data-testid="super-storefront-panel" aria-busy={loadingTenants || loadingOverview || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants || loadingOverview ? (
        <LoadingSpinner text="Loading storefront data..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Storefront Overview</h2>
        <span className="text-sm text-gray-500">Cross-tenant products & POS</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Products" value={overview?.totalProducts ?? 0} color="blue" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
        <StatCard title="Active Products" value={overview?.activeProducts ?? 0} color="green" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="POS Transactions" value={overview?.totalPOSTransactions ?? 0} color="purple" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>} />
        <StatCard title="POS Revenue" value={formatCurrency(overview?.totalPOSRevenue ?? 0)} color="yellow" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      {overview?.tenantBreakdown && overview.tenantBreakdown.length > 0 && (
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Storefront by Tenant</h3>
          <div className="space-y-2">
            {overview.tenantBreakdown.slice(0, 5).map((t) => (
              <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenant_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.pos_transaction_count} transactions</span>
                  <span className="font-medium text-gray-800">{formatCurrency(t.pos_revenue)}</span>
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
          <Button variant="success" size="md" loading={loadingProducts} onClick={() => loadProducts(selectedTenantId || undefined)}>Refresh</Button>
        </div>
      </Card>

      {loadingProducts ? (
        <LoadingSpinner text="Loading products..." />
      ) : products.length === 0 ? (
        <Card padding="md"><EmptyState title="No products found" description="No products found for the selected filter." /></Card>
      ) : (
        <DataTable columns={productColumns} data={products} rowKey="id" size="md" />
      )}
      </>
      )}
    </div>
  );
}
