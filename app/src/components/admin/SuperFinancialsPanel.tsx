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
import { formatCurrency } from '@/lib/utils';

interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  [key: string]: unknown;
}

interface FinancialOverview {
  totalAccounts: number;
  totalInvoices: number;
  totalRevenue: number;
  totalCollected: number;
  overdueCount: number;
  tenantBreakdown: Array<{
    tenant_id: string;
    tenant_name: string;
    invoice_count: number;
    total_revenue: number;
    total_collected: number;
  }>;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  type: string;
  status: string;
  total_amount: number;
  tenant_name: string;
  issue_date: string;
  [key: string]: unknown;
}

const invoiceColumns = [
  {
    key: 'invoice_number',
    header: 'Invoice #',
    sortable: true,
    render: (r: InvoiceRecord) => <span className="font-medium text-gray-800">{r.invoice_number || '—'}</span>,
  },
  {
    key: 'tenant_name',
    header: 'Tenant',
    sortable: true,
    render: (r: InvoiceRecord) => <span className="text-gray-600">{r.tenant_name || '—'}</span>,
  },
  {
    key: 'type',
    header: 'Type',
    render: (r: InvoiceRecord) => <Badge variant={r.type === 'sales' ? 'success' : 'info'}>{r.type}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: InvoiceRecord) => <Badge variant={r.status === 'paid' ? 'success' : r.status === 'overdue' ? 'danger' : 'warning'}>{r.status}</Badge>,
  },
  {
    key: 'total_amount',
    header: 'Amount',
    sortable: true,
    render: (r: InvoiceRecord) => <span className="text-right font-medium text-gray-800">{formatCurrency(r.total_amount ?? 0)}</span>,
  },
];

export default function SuperFinancialsPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

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
      const data = await apiFetch<FinancialOverview>('/admin/financials/overview');
      setOverview(data);
    } catch (err) {
      showToast('Failed to load financial overview: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  const loadInvoices = useCallback(async (tenantId?: string) => {
    setLoadingInvoices(true);
    try {
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const data = await apiFetch<{ data: InvoiceRecord[]; total: number }>(`/admin/financials/invoices${qs}`);
      setInvoices(data.data || []);
    } catch (err) {
      showToast('Failed to load invoices: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingInvoices(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); loadOverview(); }, [loadTenants, loadOverview]);
  useEffect(() => { loadInvoices(selectedTenantId || undefined); }, [selectedTenantId, loadInvoices]);

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div data-testid="super-financials-panel" aria-busy={loadingTenants || loadingOverview || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants || loadingOverview ? (
        <LoadingSpinner text="Loading financials..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Financial Overview</h2>
        <span className="text-sm text-gray-500">Cross-tenant financial management</span>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={formatCurrency(overview?.totalRevenue ?? 0)} color="green" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Collected" value={formatCurrency(overview?.totalCollected ?? 0)} color="blue" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Invoices" value={overview?.totalInvoices ?? 0} color="purple" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>} />
        <StatCard title="Overdue" value={overview?.overdueCount ?? 0} color="red" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      {/* Tenant Breakdown */}
      {overview?.tenantBreakdown && overview.tenantBreakdown.length > 0 && (
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Revenue by Tenant</h3>
          <div className="space-y-2">
            {overview.tenantBreakdown.slice(0, 5).map((t) => (
              <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenant_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.invoice_count} invoices</span>
                  <span className="font-medium text-gray-800">{formatCurrency(t.total_revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tenant Filter + Invoices */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="min-w-[200px]">
            <Select label="Filter by Tenant" options={tenantOptions} value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)} />
          </div>
          <Button variant="success" size="md" loading={loadingInvoices} onClick={() => loadInvoices(selectedTenantId || undefined)}>Refresh</Button>
        </div>
      </Card>

      {loadingInvoices ? (
        <LoadingSpinner text="Loading invoices..." />
      ) : invoices.length === 0 ? (
        <Card padding="md"><EmptyState title="No invoices found" description="No invoices found for the selected filter." /></Card>
      ) : (
        <DataTable columns={invoiceColumns} data={invoices} rowKey="id" size="md" />
      )}
      </>
      )}
    </div>
  );
}
