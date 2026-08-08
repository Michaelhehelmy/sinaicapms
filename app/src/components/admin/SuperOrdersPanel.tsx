import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusTag } from '@/components/ui/StatusTag';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { getAdminTenants, getOrders } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  [key: string]: unknown;
}

interface OrderRecord {
  id: string;
  reference: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  checkInDate: string;
  checkOutDate: string;
  orderStateId: string;
  paymentStatus: string;
  totalAmount: number;
  [key: string]: unknown;
}

const orderColumns = [
  {
    key: 'reference',
    header: 'Ref',
    sortable: true,
    render: (o: OrderRecord) => (
      <span className="font-medium text-gray-800">
        {o.reference || (typeof o.id === 'string' ? o.id.slice(0, 8) : String(o.id))}
      </span>
    ),
  },
  {
    key: 'customerFirstName',
    header: 'Guest',
    sortable: true,
    render: (o: OrderRecord) => (
      <span className="text-gray-700">
        {[o.customerFirstName, o.customerLastName].filter(Boolean).join(' ') || 'Guest'}
      </span>
    ),
  },
  {
    key: 'checkInDate',
    header: 'Check-in',
    sortable: true,
    render: (o: OrderRecord) => (
      <span className="text-gray-500">
        {o.checkInDate ? formatDate(o.checkInDate) : '—'}
      </span>
    ),
  },
  {
    key: 'orderStateId',
    header: 'Status',
    render: (o: OrderRecord) => <StatusTag status={o.orderStateId} />,
  },
  {
    key: 'totalAmount',
    header: 'Amount',
    sortable: true,
    render: (o: OrderRecord) => (
      <span className="text-right font-medium text-gray-800">
        {formatCurrency(o.totalAmount ?? 0)}
      </span>
    ),
  },
];

export default function SuperOrdersPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const loadTenants = useCallback(async () => {
    try {
      // T6: use the dedicated paginated super-admin endpoint
      const data = await getAdminTenants();
      const list = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown })?.data) ? ((data as { data: TenantRecord[] }).data) : [];
      setTenants(list);
      if (list.length > 0 && !selectedTenantId) {
        setSelectedTenantId(list[0].id);
      }
    } catch (err) {
      showToast('Failed to load tenants: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingTenants(false);
    }
  }, [showToast, selectedTenantId]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const loadOrders = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setLoadingOrders(true);
    setError(null);
    setOrders([]);
    try {
      const res = await getOrders({ tenantId });
      const list = res.data ?? [];
      setOrders(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      showToast('Failed to load orders: ' + msg, 'error');
    } finally {
      setLoadingOrders(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedTenantId) loadOrders(selectedTenantId);
  }, [selectedTenantId, loadOrders]);

  const selectedTenantName = tenants.find((t) => t.id === selectedTenantId)?.name ?? 'All Tenants';
  const tenantOptions = tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.status})` }));

  return (
    <div data-testid="reservation-log-panel" aria-busy={loadingTenants || loadingOrders || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants ? (
        <LoadingSpinner text="Loading tenants..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">All Tenant Orders</h2>
        <span className="text-sm text-gray-500">
          {orders.length} order{orders.length !== 1 ? 's' : ''} for {selectedTenantName}
        </span>
      </div>

      {/* Tenant Selector */}
      <Card padding="md" className="mb-6" data-testid="tenant-filter">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="min-w-[220px]">
            <Select
              label="Select Tenant"
              options={tenantOptions}
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              placeholder="Choose a tenant"
            />
          </div>
          <Button
            variant="success"
            size="md"
            loading={loadingOrders}
            disabled={!selectedTenantId}
            onClick={() => selectedTenantId && loadOrders(selectedTenantId)}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="md"
            data-testid="export-csv-btn"
            onClick={() => {
              if (!orders.length) return;
              const headers = ['Ref', 'Guest', 'Check-in', 'Status', 'Amount'];
              const rows = orders.map(o => [
                o.reference || String(o.id).slice(0, 8),
                [o.customerFirstName, o.customerLastName].filter(Boolean).join(' ') || 'Guest',
                o.checkInDate || '',
                o.orderStateId || '',
                String(o.totalAmount ?? 0),
              ]);
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'orders.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Orders are scoped per-tenant. Select a tenant above to view their reservations.
        </p>
      </Card>

      {/* Orders Table */}
      {loadingOrders ? (
        <LoadingSpinner text="Loading orders..." />
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <Button
            variant="success"
            size="md"
            onClick={() => selectedTenantId && loadOrders(selectedTenantId)}
          >
            Retry
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <Card padding="md">
          <EmptyState
            title="No orders found"
            description={`No orders found for ${selectedTenantName}.`}
          />
        </Card>
      ) : (
        <DataTable
          columns={orderColumns}
          data={orders}
          rowKey="id"
          size="md"
        />
      )}
      </>
      )}
    </div>
  );
}
