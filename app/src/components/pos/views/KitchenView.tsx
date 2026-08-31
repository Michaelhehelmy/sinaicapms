import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useEnrichedOrders,
  usePosTables,
  useUpdateKitchenStatusMutation,
  KITCHEN_REFRESH_MS,
  posKeys,
  type KitchenOrder,
} from '@/hooks/usePosQueries';
import type { KitchenStatus } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

// ─── Kanban column model ────────────────────────────────────
const ACTIVE_STATUSES: KitchenStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];

const STATUS_COLUMNS: { key: KitchenStatus; label: string; headerClass: string; cardAccent: string; action?: string }[] = [
  { key: 'pending', label: 'New Orders', headerClass: 'text-gray-600', cardAccent: 'border-l-gray-400', action: 'Confirm' },
  { key: 'confirmed', label: 'Confirmed', headerClass: 'text-blue-600', cardAccent: 'border-l-blue-400', action: 'Start Preparing' },
  { key: 'preparing', label: 'Preparing', headerClass: 'text-amber-600', cardAccent: 'border-l-amber-400', action: 'Mark Ready' },
  { key: 'ready', label: 'Ready for Pickup', headerClass: 'text-emerald-600', cardAccent: 'border-l-emerald-400', action: 'Mark Served' },
];

/** Next step on the kitchen state machine (served is terminal). */
function nextStatus(current: KitchenStatus): KitchenStatus | null {
  switch (current) {
    case 'pending': return 'confirmed';
    case 'confirmed': return 'preparing';
    case 'preparing': return 'ready';
    case 'ready': return 'served';
    default: return null;
  }
}

function formatMoney(n: unknown): string {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

/** Humanized age ("just now", "5m ago", "2h ago") against a ticking clock. */
export function timeAgo(createdAt: string | undefined, now: number): string {
  if (!createdAt) return '';
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return '';
  const seconds = Math.max(0, Math.floor((now - created) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Single ticket card ─────────────────────────────────────
function KitchenCard({
  order,
  tableName,
  now,
  onAdvance,
  busy,
}: {
  order: KitchenOrder;
  tableName: string | null;
  now: number;
  onAdvance: () => void;
  busy: boolean;
}) {
  const column = STATUS_COLUMNS.find((c) => c.key === order.kitchenStatus);
  const lateMinutes = order.createdAt ? (now - new Date(order.createdAt).getTime()) / 60_000 : 0;

  return (
    <div
      data-testid={`kitchen-card-${order.id}`}
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${column?.cardAccent ?? ''} p-3 shadow-sm ${
        lateMinutes >= 20 ? 'animate-pulse' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-sm text-gray-900">{tableName ?? 'Takeout'}</span>
        <span className="text-xs whitespace-nowrap text-gray-500" data-testid="kitchen-age">
          {timeAgo(order.createdAt, now)}
        </span>
      </div>
      <div className="text-xs text-gray-400 mt-0.5">#{order.orderNumber}</div>

      <ul className="mt-2 space-y-0.5 text-sm text-gray-700" data-testid="kitchen-items">
        {(order.items?.length ?? 0) > 0 ? (
          order.items!.map((i) => (
            <li key={i.id}>
              <span className="font-semibold">{i.quantity}×</span> {i.productName ?? 'Item'}
            </li>
          ))
        ) : (
          <li className="text-gray-400 italic">Items unavailable</li>
        )}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">{formatMoney(order.totalAmount)}</span>
        {column?.action && (
          <button
            onClick={onAdvance}
            disabled={busy}
            data-testid={`kitchen-advance-${order.id}`}
            className="text-xs font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-md px-3 min-h-[40px] border-none cursor-pointer"
          >
            {busy ? '…' : column.action}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Kitchen Display View ───────────────────────────────────
export default function KitchenView() {
  const queryClient = useQueryClient();
  const { orders, isLoading, error } = useEnrichedOrders(true);
  const { data: tableData } = usePosTables();
  const updateKitchen = useUpdateKitchenStatusMutation();
  const { showToast } = useToast();

  // Ticking clock keeps the "5m ago" stamps honest between refreshes
  // (aligned with the 30s data cadence).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), Math.min(KITCHEN_REFRESH_MS, 30_000));
    return () => clearInterval(t);
  }, []);

  // id → display name for dine-in tickets ("Takeout" when unbound/unknown).
  const tableNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of tableData?.sections ?? []) {
      for (const t of group.tables) map.set(t.id, t.name);
    }
    return map;
  }, [tableData]);

  const activeTickets = useMemo(
    () =>
      orders.filter(
        (o): o is KitchenOrder => !!o && ACTIVE_STATUSES.includes((o.kitchenStatus || 'pending') as KitchenStatus),
      ),
    [orders],
  );

  function handleAdvance(order: KitchenOrder) {
    const target = nextStatus((order.kitchenStatus || 'pending') as KitchenStatus);
    if (!target) return;
    updateKitchen.mutate(
      { orderId: order.id, kitchenStatus: target },
      {
        onError: (err: Error) => showToast(err.message || 'Failed to update ticket', 'error'),
      },
    );
  }

  if (isLoading) return <div className="p-6"><TableSkeleton rows={4} columns={4} /></div>;
  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-3">{(error as Error).message || 'Failed to load kitchen orders'}</div>
      <button onClick={() => queryClient.invalidateQueries({ queryKey: posKeys.all })} className="text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-md px-4 py-2 border-none cursor-pointer">Try Again</button>
    </div>
  );

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full" data-testid="pos-kitchen">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-900">Kitchen</h2>
        <span className="text-xs text-gray-400" data-testid="kitchen-refresh-note">
          Auto-refreshes every {KITCHEN_REFRESH_MS / 1000}s
        </span>
      </div>

      {activeTickets.length === 0 ? (
        <Card>
          <EmptyState title="All caught up" description="No open kitchen tickets right now." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {STATUS_COLUMNS.map((col) => {
            const tickets = activeTickets.filter((o) => (o.kitchenStatus || 'pending') === col.key);
            return (
              <section
                key={col.key}
                data-testid={`kitchen-column-${col.key}`}
                className="rounded-xl bg-gray-50 border border-gray-200 p-3"
              >
                <h3 className={`text-sm font-semibold mb-3 flex items-center justify-between ${col.headerClass}`}>
                  {col.label}
                  <span className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-500">
                    {tickets.length}
                  </span>
                </h3>
                <div className="space-y-3">
                  {tickets.map((o) => (
                    <KitchenCard
                      key={o.id}
                      order={o}
                      tableName={o.tableId ? tableNameById.get(o.tableId) ?? null : null}
                      now={now}
                      busy={updateKitchen.isPending}
                      onAdvance={() => handleAdvance(o)}
                    />
                  ))}
                  {tickets.length === 0 && (
                    <div className="text-xs text-gray-300 text-center py-4 border border-dashed border-gray-200 rounded-lg">
                      Empty
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
