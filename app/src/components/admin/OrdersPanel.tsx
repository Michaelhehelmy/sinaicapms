import React, { useState, useMemo, useCallback } from 'react';
import { useOrdersQuery, useRoomsQuery, useCampsQuery, useSaveOrderMutation, useDeleteOrderMutation } from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order, Camp } from '@/hooks/useAdminData';

interface OrdersPanelProps {
  campIds: string[];
  camps: Camp[];
}

const ORDER_STATES: Record<string, string> = {
  pending: 'pending',
  confirmed: 'confirmed',
  checked_in: 'checked_in',
  checked_out: 'checked_out',
  cancelled: 'cancelled',
  no_show: 'no_show',
};

const statusFilterOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
];

const orderStateOptions = Object.entries(ORDER_STATES).map(([key, val]) => ({
  value: val,
  label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

function getOrderStateVariant(stateId: string): 'warning' | 'info' | 'success' | 'neutral' | 'error' {
  switch (stateId) {
    case 'pending': return 'warning';
    case 'confirmed': return 'info';
    case 'checked_in': return 'success';
    case 'checked_out': return 'neutral';
    case 'cancelled': return 'error';
    default: return 'neutral';
  }
}

export default function OrdersPanel({ campIds, camps }: OrdersPanelProps) {
  const { data: ordersRes, isLoading, isFetching } = useOrdersQuery();
  const orders = ordersRes?.data ?? [];
  const { data: rooms } = useRoomsQuery();
  const { data: campsData } = useCampsQuery();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDetail, setShowDetail] = useState<Order | null>(null);
  const [showStateChange, setShowStateChange] = useState<Order | null>(null);
  const [newState, setNewState] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const saveMutation = useSaveOrderMutation();
  const deleteMutation = useDeleteOrderMutation();

  const filteredOrders = useMemo(() => {
    let result = orders.filter((o) => campIds.includes(o.campId));
    if (statusFilter !== 'all') {
      result = result.filter((o) => o.paymentStatus === statusFilter);
    }
    return result;
  }, [orders, campIds, statusFilter]);

  const stats = useMemo(() => {
    const filtered = orders.filter((o) => campIds.includes(o.campId));
    return {
      total: filtered.length,
      pending: filtered.filter((o) => o.orderStateId === 'pending').length,
      confirmed: filtered.filter((o) => o.orderStateId === 'confirmed').length,
      active: filtered.filter((o) => o.orderStateId === 'checked_in').length,
      revenue: filtered
        .filter((o) => o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    };
  }, [orders, campIds]);

  const roomMap = useMemo(() => {
    const map: Record<string, { name: string; campId: string }> = {};
    (rooms ?? []).forEach((r) => {
      map[r.id] = { name: r.name, campId: r.campId };
    });
    return map;
  }, [rooms]);

  const campNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (campsData ?? []).forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [campsData]);

  const handleStateChange = useCallback(() => {
    if (!showStateChange || !newState) return;
    saveMutation.mutate(
      {
        id: showStateChange.id,
        orderStateId: newState,
      },
      {
        onSuccess: () => {
          setShowStateChange(null);
          setNewState('');
        },
      },
    );
  }, [showStateChange, newState, saveMutation]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
      },
    });
  }, [deleteTarget, deleteMutation]);

  return (
    <Card padding="none" className="p-6" data-testid="orders-panel" aria-busy={isLoading || undefined}>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Reservations (Orders)</h2>

      <div data-testid="order-stats" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, variant: 'default' as const },
          { label: 'Pending', value: stats.pending, variant: 'warning' as const },
          { label: 'Confirmed', value: stats.confirmed, variant: 'info' as const },
          { label: 'Checked In', value: stats.active, variant: 'success' as const },
          { label: 'Revenue', value: formatCurrency(stats.revenue), variant: 'default' as const },
        ].map((s) => (
          <Card key={s.label} padding="sm" className="text-center">
            <div className="text-xl font-bold">
              <Badge variant={s.variant} size="lg">{s.value}</Badge>
            </div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      <div data-testid="status-filter" className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <Select
          label="Filter"
          options={statusFilterOptions}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        {isFetching && !isLoading && (
          <span className="text-xs text-gray-500 animate-pulse">Updating...</span>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={8} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No reservations found"
          description="When guests make reservations, they will appear here."
        />
      ) : (
        <DataTable<Order & Record<string, unknown>>
          columns={[
            { key: 'reference', header: 'Ref #', sortable: true, render: (o) => <strong className="text-green-700">{String(o.reference || o.id).slice(0, 12)}</strong> },
            {
              key: 'customerFirstName',
              header: 'Guest',
              render: (o) => {
                const name = [o.customerFirstName, o.customerLastName].filter(Boolean).join(' ');
                return name || 'N/A';
              },
            },
            {
              key: 'campId',
              header: 'Camp',
              render: (o) => campNameMap[String(o.campId)] ?? 'N/A',
            },
            {
              key: 'roomId',
              header: 'Room',
              render: (o) => roomMap[String(o.roomId)]?.name ?? 'N/A',
            },
            {
              key: 'checkInDate',
              header: 'Check-in',
              sortable: true,
              render: (o) => formatDate(String(o.checkInDate)),
            },
            {
              key: 'checkOutDate',
              header: 'Check-out',
              sortable: true,
              render: (o) => formatDate(String(o.checkOutDate)),
            },
            {
              key: 'totalAmount',
              header: 'Total',
              sortable: true,
              render: (o) => formatCurrency(Number(o.totalAmount || 0)),
            },
            {
              key: 'orderStateId',
              header: 'Status',
              render: (o) => (
                <Badge variant={getOrderStateVariant(String(o.orderStateId))} size="sm" dot>
                  {String(o.stateName || o.orderStateId)}
                </Badge>
              ),
            },
          ]}
          data={filteredOrders as (Order & Record<string, unknown>)[]}
          emptyMessage="No reservations found."
          actions={(o) => (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetail(o as unknown as Order)}
              >
                View
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowStateChange(o as unknown as Order);
                  setNewState(String(o.orderStateId));
                }}
              >
                State
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget(o as unknown as Order)}
              >
                Del
              </Button>
            </div>
          )}
        />
      )}

      {showDetail && (
        <FormModal
          open
          title={`Reservation — ${showDetail.reference || showDetail.id}`}
          onClose={() => setShowDetail(null)}
          onSubmit={() => setShowDetail(null)}
          submitLabel="Close"
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><strong>Reference:</strong> {showDetail.reference}</div>
              <div><strong>State:</strong> {showDetail.stateName || showDetail.orderStateId}</div>
              <div><strong>Guest:</strong> {[showDetail.customerFirstName, showDetail.customerLastName].filter(Boolean).join(' ') || 'N/A'}</div>
              <div><strong>Email:</strong> {showDetail.customerEmail || 'N/A'}</div>
              <div><strong>Phone:</strong> {showDetail.customerPhone || 'N/A'}</div>
              <div><strong>Room:</strong> {roomMap[String(showDetail.roomId)]?.name ?? 'N/A'}</div>
              <div><strong>Check-in:</strong> {formatDate(String(showDetail.checkInDate))}</div>
              <div><strong>Check-out:</strong> {formatDate(String(showDetail.checkOutDate))}</div>
              <div><strong>People:</strong> {showDetail.numberOfPeople}</div>
              <div><strong>Total:</strong> {formatCurrency(showDetail.totalAmount || 0)}</div>
              <div><strong>Paid:</strong> {formatCurrency(showDetail.amountPaid || 0)}</div>
              <div><strong>Payment:</strong> {showDetail.paymentMethod || 'N/A'}</div>
            </div>
            {showDetail.notes && (
              <div className="bg-gray-50 rounded-lg p-3">
                <strong>Notes:</strong> {showDetail.notes}
              </div>
            )}
          </div>
        </FormModal>
      )}

      {showStateChange && (
        <FormModal
          open
          title="Change Order State"
          onClose={() => { setShowStateChange(null); setNewState(''); }}
          onSubmit={handleStateChange}
          submitLabel={saveMutation.isPending ? 'Saving...' : 'Update State'}
          submitDisabled={saveMutation.isPending}
        >
          <Select
            label="New State"
            options={orderStateOptions}
            value={newState}
            onChange={(e) => setNewState(e.target.value)}
          />
        </FormModal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Reservation"
        message="Are you sure you want to delete this reservation?"
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
