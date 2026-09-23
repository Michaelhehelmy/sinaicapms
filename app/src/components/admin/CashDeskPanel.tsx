import React, { useMemo, useState } from 'react';
import {
  useOrdersQuery,
  useRoomsQuery,
  useCampsQuery,
  useCashDeskPayments,
} from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import {
  filterTodayPayments,
  isOutstanding,
  orderBalance,
  sumTodayCash,
  type PaymentRecord,
} from '@/lib/cashdesk';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order, Camp } from '@/hooks/useAdminData';
import RecordPaymentModal from './RecordPaymentModal';

interface CashDeskPanelProps {
  campIds: string[];
  camps: Camp[];
  onNavigateToTab?: (tab: string) => void;
}

// ─── Cash Desk panel (Phase 3.5) ──────────────────────────────────
// Tenant tab: outstanding booking balances + today's cash intake.
// Outstanding derives from the tenant-scoped orders list filtered to the
// active projects (campIds); today's cash aggregates payment records of the
// tenant's orders. A project tag is shown per row when the backend echoes
// one on the payment record (else the camp name is used).
export default function CashDeskPanel({ campIds, camps, onNavigateToTab }: CashDeskPanelProps) {
  const { data: ordersRes, isLoading } = useOrdersQuery();
  const orders = ordersRes?.data ?? [];
  const { data: rooms } = useRoomsQuery();
  const { data: campsData } = useCampsQuery();
  const [paymentTarget, setPaymentTarget] = useState<Order | null>(null);

  const scopedOrders = useMemo(
    () => orders.filter((o) => campIds.includes(o.campId)),
    [orders, campIds],
  );

  const outstanding = useMemo(
    () => scopedOrders.filter((o) => o.orderStateId !== 'cancelled' && isOutstanding(o)),
    [scopedOrders],
  );

  const paidOrderIds = useMemo(
    () => scopedOrders.filter((o) => Number(o.amountPaid || 0) > 0).map((o) => o.id),
    [scopedOrders],
  );

  const paymentQueries = useCashDeskPayments(paidOrderIds);
  const allPayments: PaymentRecord[] = useMemo(
    () => paymentQueries.flatMap((q) => q.data ?? []),
    [paymentQueries],
  );
  const todayPayments = useMemo(() => filterTodayPayments(allPayments), [allPayments]);
  const todayCash = useMemo(() => sumTodayCash(allPayments), [allPayments]);

  const outstandingTotal = useMemo(
    () => Math.round(outstanding.reduce((sum, o) => sum + orderBalance(o), 0) * 100) / 100,
    [outstanding],
  );

  const roomMap = useMemo(() => {
    const map: Record<string, { name: string; campId: string }> = {};
    (rooms ?? []).forEach((r) => {
      map[r.id] = { name: r.name, campId: r.campId };
    });
    return map;
  }, [rooms]);

  const campNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (campsData ?? []).forEach((c) => {
      map[c.id] = c.name;
    });
    (camps ?? []).forEach((c) => {
      if (!map[c.id]) map[c.id] = c.name;
    });
    return map;
  }, [campsData, camps]);

  const orderById = useMemo(() => {
    const map: Record<string, Order> = {};
    scopedOrders.forEach((o) => {
      map[String(o.id)] = o;
    });
    return map;
  }, [scopedOrders]);

  return (
    <Card padding="none" className="p-6" data-testid="cashdesk-panel">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Cash Desk</h2>

      <div data-testid="cashdesk-stats" className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Outstanding orders', value: outstanding.length, variant: 'warning' as const },
          {
            label: 'Outstanding total',
            value: formatCurrency(outstandingTotal),
            variant: 'warning' as const,
          },
          { label: "Today's cash", value: formatCurrency(todayCash), variant: 'success' as const },
        ].map((s) => (
          <Card key={s.label} padding="sm" className="text-center">
            <div className="text-xl font-bold">
              <Badge variant={s.variant} size="lg">
                {s.value}
              </Badge>
            </div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      <h3 className="text-base font-semibold text-gray-700 mb-2">Outstanding balances</h3>
      {isLoading ? (
        <TableSkeleton rows={5} columns={7} />
      ) : outstanding.length === 0 ? (
        <EmptyState
          title="No outstanding balances"
          description="All bookings for the active projects are fully paid."
          action={
            onNavigateToTab
              ? { label: 'Go to Orders', onClick: () => onNavigateToTab('reservations') }
              : undefined
          }
        />
      ) : (
        <DataTable<Order & Record<string, unknown>>
          columns={[
            {
              key: 'reference',
              header: 'Ref #',
              sortable: true,
              render: (o) => (
                <strong className="text-green-700">{String(o.reference || o.id).slice(0, 12)}</strong>
              ),
            },
            {
              key: 'customerFirstName',
              header: 'Guest',
              render: (o) => {
                const name = [o.customerFirstName, o.customerLastName]
                  .filter(Boolean)
                  .join(' ');
                return name || 'N/A';
              },
            },
            {
              key: 'campId',
              header: 'Project',
              render: (o) => campNameMap[String(o.campId)] ?? 'N/A',
            },
            {
              key: 'totalAmount',
              header: 'Total',
              sortable: true,
              render: (o) => formatCurrency(Number(o.totalAmount || 0)),
            },
            {
              key: 'amountPaid',
              header: 'Paid',
              render: (o) => formatCurrency(Number(o.amountPaid || 0)),
            },
            {
              key: 'balance',
              header: 'Balance',
              sortable: true,
              render: (o) => formatCurrency(orderBalance(o as unknown as Order)),
            },
          ]}
          data={outstanding as (Order & Record<string, unknown>)[]}
          emptyMessage="No outstanding balances."
          actions={(o) => (
            <Button variant="secondary" size="sm" onClick={() => setPaymentTarget(o as unknown as Order)}>
              Record
            </Button>
          )}
        />
      )}

      <h3 className="text-base font-semibold text-gray-700 mt-6 mb-2">Today&apos;s payments</h3>
      {todayPayments.length === 0 ? (
        <EmptyState
          title="No payments today"
          description="Payments recorded today will appear here."
        />
      ) : (
        <DataTable<PaymentRecord & Record<string, unknown>>
          columns={[
            {
              key: 'createdAt',
              header: 'Time',
              render: (p) => (p.createdAt ? formatDate(String(p.createdAt)) : 'N/A'),
            },
            {
              key: 'orderId',
              header: 'Order',
              render: (p) => {
                const o = orderById[String(p.orderId)];
                return <strong className="text-green-700">{o?.reference || String(p.orderId).slice(0, 12)}</strong>;
              },
            },
            {
              key: 'projectTag',
              header: 'Project',
              render: (p) =>
                p.projectTag ||
                p.campName ||
                campNameMap[String(orderById[String(p.orderId)]?.campId)] ||
                'N/A',
            },
            {
              key: 'method',
              header: 'Method',
              render: (p) => <Badge variant="info" size="sm">{String(p.method)}</Badge>,
            },
            {
              key: 'amount',
              header: 'Amount',
              render: (p) => formatCurrency(Number(p.amount || 0)),
            },
            {
              key: 'receivedBy',
              header: 'Received by',
              render: (p) => p.receivedBy || 'N/A',
            },
          ]}
          data={todayPayments as (PaymentRecord & Record<string, unknown>)[]}
          emptyMessage="No payments today."
        />
      )}

      {paymentTarget && (
        <RecordPaymentModal
          order={paymentTarget}
          open
          onClose={() => setPaymentTarget(null)}
        />
      )}
    </Card>
  );
}
