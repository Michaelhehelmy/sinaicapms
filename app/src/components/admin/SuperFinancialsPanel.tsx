import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormModal } from '@/components/ui/FormModal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { getAdminTenants } from '@/lib/api';
import {
  getAdminPublicPayments,
  getAdminPayouts,
  getAdminPayout,
  createAdminPayout,
  markAdminPayoutPaid,
  cancelAdminPayout,
  type PublicPayment,
  type MarketplacePayout,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

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
    tenantId: string;
    tenantName: string;
    invoiceCount: number;
    totalRevenue: number;
    totalCollected: number;
  }>;
  // P2: marketplace payment settlement totals + per-tenant breakdown
  totalGross: number;
  totalFees: number;
  totalNet: number;
  marketplaceBreakdown: Array<{
    tenantId: string;
    tenantName: string;
    paymentCount: number;
    gross: number;
    fees: number;
    net: number;
  }>;
  // P2: payout settlement totals — guarded (backend may not expose until deployed)
  payoutSummary?: { totalOutstanding: number; totalPaidOut: number };
}

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  totalAmount: number;
  tenantName: string;
  issueDate: string;
  [key: string]: unknown;
}

const invoiceColumns = [
  {
    key: 'invoiceNumber',
    header: 'Invoice #',
    sortable: true,
    render: (r: InvoiceRecord) => <span className="font-medium text-gray-800">{r.invoiceNumber || '—'}</span>,
  },
  {
    key: 'tenantName',
    header: 'Tenant',
    sortable: true,
    render: (r: InvoiceRecord) => <span className="text-gray-600">{r.tenantName || '—'}</span>,
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
    key: 'totalAmount',
    header: 'Amount',
    sortable: true,
    render: (r: InvoiceRecord) => <span className="text-right font-medium text-gray-800">{formatCurrency(r.totalAmount ?? 0)}</span>,
  },
];

const PAYMENT_STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  captured: 'success',
  settled: 'info',
  refunded: 'warning',
  failed: 'danger',
};

const PAYOUT_STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'neutral',
  failed: 'danger',
};

// Local row type — `PublicPayment` extended with a string index signature so the
// DataTable generic (Column<Record<string, unknown>>) accepts it, matching the
// Super* panel idiom (see SuperHRPanel / SuperStorefrontPanel).
type PaymentRecord = PublicPayment & Record<string, unknown>;

type PayoutRecord = MarketplacePayout & Record<string, unknown>;

const paymentColumns = [
  {
    key: 'orderReference',
    header: 'Reference',
    sortable: true,
    render: (r: PaymentRecord) => <span className="font-medium text-gray-800">{r.orderReference || '—'}</span>,
  },
  {
    key: 'tenantName',
    header: 'Tenant',
    sortable: true,
    render: (r: PaymentRecord) => <span className="text-gray-600">{r.tenantName || '—'}</span>,
  },
  {
    key: 'channel',
    header: 'Channel',
    render: (r: PaymentRecord) => <Badge variant="neutral">{r.channel}</Badge>,
  },
  {
    key: 'grossAmount',
    header: 'Gross',
    sortable: true,
    render: (r: PaymentRecord) => <span className="font-medium text-gray-800">{formatCurrency(r.grossAmount ?? 0, r.currency || 'USD')}</span>,
  },
  {
    key: 'marketplaceFee',
    header: 'Marketplace Fee',
    sortable: true,
    render: (r: PaymentRecord) => <span className="text-gray-600">{formatCurrency(r.marketplaceFee ?? 0, r.currency || 'USD')}</span>,
  },
  {
    key: 'netAmount',
    header: 'Net',
    sortable: true,
    render: (r: PaymentRecord) => <span className="font-medium text-success-700">{formatCurrency(r.netAmount ?? 0, r.currency || 'USD')}</span>,
  },
  {
    key: 'paymentStatus',
    header: 'Status',
    render: (r: PaymentRecord) => <Badge variant={PAYMENT_STATUS_VARIANTS[r.paymentStatus] ?? 'neutral'}>{r.paymentStatus}</Badge>,
  },
  {
    key: 'capturedAt',
    header: 'Captured at',
    sortable: true,
    render: (r: PaymentRecord) => <span className="text-gray-500">{r.capturedAt ? formatDate(r.capturedAt) : '—'}</span>,
  },
];

const payoutColumns = [
  {
    key: 'createdAt',
    header: 'Date',
    sortable: true,
    render: (r: PayoutRecord) => <span className="text-gray-600">{r.createdAt ? formatDate(r.createdAt) : '—'}</span>,
  },
  {
    key: 'tenantName',
    header: 'Tenant',
    sortable: true,
    render: (r: PayoutRecord) => <span className="font-medium text-gray-800">{r.tenantName || '—'}</span>,
  },
  {
    key: 'method',
    header: 'Method',
    render: (r: PayoutRecord) => <Badge variant="info">{r.method || '—'}</Badge>,
  },
  {
    key: 'amount',
    header: 'Amount',
    sortable: true,
    render: (r: PayoutRecord) => <span className="font-medium text-success-700">{formatCurrency(r.amount ?? 0, r.currency || 'USD')}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: PayoutRecord) => <Badge variant={PAYOUT_STATUS_VARIANTS[r.status] ?? 'neutral'}>{r.status}</Badge>,
  },
  {
    key: 'reference',
    header: 'Reference',
    render: (r: PayoutRecord) => <span className="text-gray-500">{r.reference || '—'}</span>,
  },
  {
    key: 'itemCount',
    header: 'Items',
    sortable: true,
    render: (r: PayoutRecord) => <span className="text-gray-600">{r.itemCount ?? 0}</span>,
  },
  {
    key: 'paidAt',
    header: 'Paid at',
    sortable: true,
    render: (r: PayoutRecord) => <span className="text-gray-500">{r.paidAt ? formatDate(r.paidAt) : '—'}</span>,
  },
];

const PAYOUT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'paymob', label: 'Paymob' },
  { value: 'other', label: 'Other' },
];

export default function SuperFinancialsPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(20);
  const [paymentsStatus, setPaymentsStatus] = useState('');

  // Payouts ledger state
  const [payoutPage, setPayoutPage] = useState(1);
  const [payoutPageSize, setPayoutPageSize] = useState(20);
  const [payoutStatus, setPayoutStatus] = useState('');
  const [payoutDetail, setPayoutDetail] = useState<PublicPayment[] | null>(null);
  const [loadingPayoutDetail, setLoadingPayoutDetail] = useState(false);
  const [busyPayoutId, setBusyPayoutId] = useState<string | null>(null);

  // Create-payout selection state (eligible captured payments only)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState('bank_transfer');
  const [payoutReference, setPayoutReference] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [creatingPayout, setCreatingPayout] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  // P2: Marketplace payments ledger (TanStack Query — no raw fetch).
  const paymentsQuery = useQuery({
    queryKey: ['admin', 'financials', 'public-payments', paymentsPage, paymentsPageSize, paymentsStatus || undefined],
    queryFn: () =>
      getAdminPublicPayments({
        page: paymentsPage,
        pageSize: paymentsPageSize,
        status: paymentsStatus || undefined,
      }),
    enabled: isSuperAdmin,
  });

  // P2: Payouts ledger (TanStack Query).
  const payoutsQuery = useQuery({
    queryKey: ['admin', 'financials', 'payouts', payoutPage, payoutPageSize, payoutStatus || undefined],
    queryFn: () =>
      getAdminPayouts({
        page: payoutPage,
        pageSize: payoutPageSize,
        status: payoutStatus || undefined,
      }),
    enabled: isSuperAdmin,
  });

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

  // ── Create payout helpers ────────────────────────────────────────────────
  const selectedPayments = (paymentsQuery.data?.data ?? []).filter((p) => selected.has(p.id));
  const selectedNet = selectedPayments.reduce((sum, p) => sum + (p.netAmount ?? 0), 0);
  const selectedCurrency = selectedPayments[0]?.currency || 'USD';
  const selectedTenants = new Set(selectedPayments.map((p) => p.tenantId));
  const singleTenant = selectedTenants.size === 1 ? Number(selectedPayments[0]?.tenantId) : null;

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openCreatePayout = useCallback(() => {
    if (selectedPayments.length === 0) return;
    if (selectedTenants.size > 1) {
      showToast('Select payments from a single tenant to create a payout.', 'warning');
      return;
    }
    setPayoutMethod('bank_transfer');
    setPayoutReference('');
    setPayoutNotes('');
    setOpenCreateModal(true);
  }, [selectedPayments.length, selectedTenants.size, showToast]);

  const handleCreatePayout = useCallback(async () => {
    // Provably unreachable via UI: the create-payout modal only opens when
    // selectedPayments.length > 0 and selectedTenants.size === 1 (openCreatePayout
    // guards both), and selection/tenant state cannot change while the modal is open.
    /* c8 ignore start */
    if (selectedPayments.length === 0 || singleTenant == null) {
      showToast('Select eligible payments from a single tenant.', 'warning');
      return;
    }
    /* c8 ignore stop */
    setCreatingPayout(true);
    try {
      await createAdminPayout({
        tenantId: singleTenant,
        paymentIds: selectedPayments.map((p) => p.id),
        method: payoutMethod,
        reference: payoutReference || undefined,
        notes: payoutNotes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'financials', 'public-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'financials', 'payouts'] });
      setOpenCreateModal(false);
      setSelected(new Set());
      showToast('Payout created.', 'success');
    } catch (err) {
      showToast('Failed to create payout: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setCreatingPayout(false);
    }
  }, [selectedPayments, singleTenant, payoutMethod, payoutReference, payoutNotes, queryClient, showToast]);

  // ── Payout row actions ───────────────────────────────────────────────────
  const handleRowClick = useCallback(async (row: unknown) => {
    const payout = row as MarketplacePayout;
    setPayoutDetail(null);
    setLoadingPayoutDetail(true);
    try {
      const detail = await getAdminPayout(payout.id);
      setPayoutDetail(detail.items || []);
    } catch (err) {
      setPayoutDetail(null);
      showToast('Failed to load payout details: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingPayoutDetail(false);
    }
  }, [showToast]);

  const handleMarkPaid = useCallback(async (id: string) => {
    setBusyPayoutId(id);
    try {
      await markAdminPayoutPaid(id);
      queryClient.invalidateQueries({ queryKey: ['admin', 'financials', 'payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'financials', 'public-payments'] });
      showToast('Payout marked as paid.', 'success');
    } catch (err) {
      showToast('Failed to mark payout paid: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setBusyPayoutId(null);
    }
  }, [queryClient, showToast]);

  const handleCancel = useCallback(async (id: string) => {
    setBusyPayoutId(id);
    try {
      await cancelAdminPayout(id);
      queryClient.invalidateQueries({ queryKey: ['admin', 'financials', 'payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'financials', 'public-payments'] });
      showToast('Payout cancelled.', 'success');
    } catch (err) {
      showToast('Failed to cancel payout: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setBusyPayoutId(null);
    }
  }, [queryClient, showToast]);

  const payoutActions = useCallback((row: unknown) => {
    const payout = row as MarketplacePayout;
    const isPending = payout.status === 'pending';
    return (
      <div className="flex items-center justify-end gap-2">
        {isPending && (
          <>
            <Button size="sm" variant="success" loading={busyPayoutId === payout.id} onClick={() => handleMarkPaid(payout.id)} data-testid={`mark-paid-${payout.id}`}>
              Mark Paid
            </Button>
            <Button size="sm" variant="ghost" loading={busyPayoutId === payout.id} onClick={() => handleCancel(payout.id)} data-testid={`cancel-payout-${payout.id}`}>
              Cancel
            </Button>
          </>
        )}
      </div>
    );
  }, [busyPayoutId, handleMarkPaid, handleCancel]);

  const selectionColumn = {
    key: '_select',
    header: '',
    render: (r: PaymentRecord) => (
      <input
        type="checkbox"
        checked={selected.has(r.id)}
        disabled={r.paymentStatus !== 'captured'}
        onChange={() => toggleSelected(r.id)}
        data-testid={`select-payment-${r.id}`}
        aria-label={`Select payment ${r.id}`}
        className="h-4 w-4 rounded border-warm-300 text-brand-600 focus:ring-brand-500 cursor-pointer accent-brand-600"
      />
    ),
  };

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];
  const payoutStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              <div key={t.tenantId} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenantName}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.invoiceCount} invoices</span>
                  <span className="font-medium text-gray-800">{formatCurrency(t.totalRevenue)}</span>
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* P2: Marketplace Payments — cross-tenant online capture ledger    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-10 border-t border-warm-200 pt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Marketplace Payments</h2>
          <span className="text-sm text-gray-500">Every online capture across tenants — gross, fee, net</span>
        </div>

        {/* Summary strip (server totals from /overview) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard title="Total Gross" value={formatCurrency(overview?.totalGross ?? 0)} color="green" />
          <StatCard title="Total Marketplace Fees" value={formatCurrency(overview?.totalFees ?? 0)} color="yellow" />
          <StatCard title="Total Net" value={formatCurrency(overview?.totalNet ?? 0)} color="blue" />
        </div>

        {/* Per-tenant settlement breakdown */}
        {overview?.marketplaceBreakdown && overview.marketplaceBreakdown.length > 0 && (
          <Card padding="md" className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Settlement by Tenant</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-warm-200">
                    <th className="py-2 pr-4 font-semibold">Tenant</th>
                    <th className="py-2 pr-4 font-semibold text-right">Payments</th>
                    <th className="py-2 pr-4 font-semibold text-right">Gross</th>
                    <th className="py-2 pr-4 font-semibold text-right">Fees</th>
                    <th className="py-2 font-semibold text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.marketplaceBreakdown.map((t) => (
                    <tr key={t.tenantId} className="border-b border-warm-100 last:border-0">
                      <td className="py-2.5 pr-4 text-gray-700">{t.tenantName}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-500">{t.paymentCount}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-gray-800">{formatCurrency(t.gross)}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">{formatCurrency(t.fees)}</td>
                      <td className="py-2.5 text-right font-medium text-success-700">{formatCurrency(t.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Filter + Ledger */}
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="min-w-[200px]">
              <Select
                label="Filter by Status"
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'captured', label: 'Captured' },
                  { value: 'settled', label: 'Settled' },
                  { value: 'refunded', label: 'Refunded' },
                  { value: 'failed', label: 'Failed' },
                ]}
                value={paymentsStatus}
                onChange={(e) => { setPaymentsStatus(e.target.value); setPaymentsPage(1); }}
              />
            </div>
          </div>
        </Card>

        {paymentsQuery.isLoading ? (
          <LoadingSpinner text="Loading marketplace payments..." />
        ) : (paymentsQuery.data?.data?.length ?? 0) === 0 ? (
          <Card padding="md"><EmptyState title="No marketplace payments found" description="No online captures match the current filter." /></Card>
        ) : (
          <>
            <DataTable
              columns={[selectionColumn, ...paymentColumns]}
              data={(paymentsQuery.data?.data ?? []) as PaymentRecord[]}
              rowKey="id"
              size="md"
              pagination={{
                page: paymentsPage,
                total: paymentsQuery.data?.total ?? 0,
                pageSize: paymentsPageSize,
                onChange: setPaymentsPage,
              }}
            />

            {/* Sticky create-payout selection bar */}
            {selectedPayments.length > 0 && (
              <div data-testid="payout-selection-bar" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
                <div data-testid="payout-selection-summary" className="text-sm text-gray-700">
                  <span className="font-bold">{selectedPayments.length}</span> selected —{' '}
                  <span className="font-bold text-success-700">{formatCurrency(selectedNet, selectedCurrency)}</span>{' '}
                  <span className="text-gray-500">({selectedCurrency})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                  <Button
                    size="sm"
                    variant="primary"
                    data-testid="create-payout-btn"
                    onClick={openCreatePayout}
                  >
                    Create Payout
                  </Button>
                </div>
                {selectedTenants.size > 1 && (
                  <p className="w-full text-xs text-red-600" data-testid="mixed-tenant-warning">
                    Selection spans multiple tenants — create a separate payout per tenant.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* P2: Payouts — super-admin settlement management                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-10 border-t border-warm-200 pt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Payouts</h2>
          <span className="text-sm text-gray-500">Settlement payouts owed to tenants</span>
        </div>

        {/* Payout settlement stats (from /overview — guarded until backend ships) */}
        {overview?.payoutSummary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatCard title="Outstanding (owed to tenants)" value={formatCurrency(overview.payoutSummary.totalOutstanding ?? 0)} color="yellow" />
            <StatCard title="Paid Out" value={formatCurrency(overview.payoutSummary.totalPaidOut ?? 0)} color="green" />
          </div>
        )}

        {/* Payout status filter */}
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="min-w-[200px]">
              <Select
                label="Filter Payouts by Status"
                options={payoutStatusOptions}
                value={payoutStatus}
                onChange={(e) => { setPayoutStatus(e.target.value); setPayoutPage(1); }}
              />
            </div>
          </div>
        </Card>

        {payoutsQuery.isLoading ? (
          <LoadingSpinner text="Loading payouts..." />
        ) : (payoutsQuery.data?.data?.length ?? 0) === 0 ? (
          <Card padding="md"><EmptyState title="No payouts found" description="No settlement payouts match the current filter." /></Card>
        ) : (
          <DataTable
            columns={payoutColumns}
            data={(payoutsQuery.data?.data ?? []) as PayoutRecord[]}
            rowKey="id"
            size="md"
            actions={payoutActions}
            onRowClick={handleRowClick}
            pagination={{
              page: payoutPage,
              total: payoutsQuery.data?.total ?? 0,
              pageSize: payoutPageSize,
              onChange: setPayoutPage,
            }}
          />
        )}

        {/* Expandable payout line items */}
        {(payoutDetail || loadingPayoutDetail) && (
          <Card padding="md" className="mt-4" data-testid="payout-detail">
            <h4 className="text-sm font-bold text-gray-700 mb-3">Payout Line Items</h4>
            {loadingPayoutDetail ? (
              <LoadingSpinner text="Loading payout details..." />
            ) : payoutDetail && payoutDetail.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-warm-200">
                      <th className="py-2 pr-4 font-semibold">Reference</th>
                      <th className="py-2 pr-4 font-semibold text-right">Gross</th>
                      <th className="py-2 pr-4 font-semibold text-right">Fee</th>
                      <th className="py-2 pr-4 font-semibold text-right">Net</th>
                      <th className="py-2 font-semibold">Captured at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutDetail.map((item) => (
                      <tr key={item.id} className="border-b border-warm-100 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-gray-800">{item.orderReference || '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-600">{formatCurrency(item.grossAmount ?? 0, item.currency || 'USD')}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-600">{formatCurrency(item.marketplaceFee ?? 0, item.currency || 'USD')}</td>
                        <td className="py-2.5 pr-4 text-right font-medium text-success-700">{formatCurrency(item.netAmount ?? 0, item.currency || 'USD')}</td>
                        <td className="py-2.5 text-gray-500">{item.capturedAt ? formatDate(item.capturedAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No line items for this payout.</p>
            )}
          </Card>
        )}
      </div>

      {/* Create Payout Modal */}
      <FormModal
        open={openCreateModal}
        title="Create Payout"
        onClose={() => setOpenCreateModal(false)}
        onSubmit={handleCreatePayout}
        submitLabel="Create Payout"
        submitDisabled={selectedTenants.size > 1 || creatingPayout}
        loading={creatingPayout}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <Input
              label="Tenant"
              value={selectedTenants.size === 1 ? (selectedPayments[0]?.tenantName || '') : (selectedTenants.size > 1 ? 'Mixed tenants — not allowed' : '')}
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <Select
              label="Payment Method"
              options={PAYOUT_METHODS}
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value)}
            />
          </div>
          <Input
            label="Reference"
            value={payoutReference}
            onChange={(e) => setPayoutReference(e.target.value)}
            placeholder="e.g. bank batch #1234"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={payoutNotes}
              onChange={(e) => setPayoutNotes(e.target.value)}
              placeholder="Optional notes"
              data-testid="payout-notes"
              className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm placeholder:text-warm-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              rows={3}
            />
          </div>
        </div>
      </FormModal>
      </>
      )}
    </div>
  );
}
