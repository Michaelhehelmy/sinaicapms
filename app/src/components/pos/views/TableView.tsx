import { useMemo, useState } from 'react';
import { usePosTables, useEnrichedOrders, useCreateTableMutation, useUpdateTableStatusMutation, type KitchenOrder } from '@/hooks/usePosQueries';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import type { PosTable } from '@/lib/api';

type TableStatus = PosTable['status'];

// ─── Status palette (green/red/yellow/blue floor semantics) ─
const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-emerald-100 border-emerald-400 text-emerald-800',
  occupied: 'bg-red-100 border-red-400 text-red-800',
  reserved: 'bg-amber-100 border-amber-400 text-amber-800',
  cleaning: 'bg-blue-100 border-blue-400 text-blue-800',
};

const STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
};

/** Quick status moves offered per state (PATCH /pos-tables/:id/status). */
const STATUS_ACTIONS: Record<TableStatus, { label: string; next: TableStatus; testid: string }[]> = {
  available: [{ label: 'Seat', next: 'occupied', testid: 'table-seat-btn' }],
  occupied: [{ label: 'Clear', next: 'available', testid: 'table-clear-btn' }],
  reserved: [
    { label: 'Seat', next: 'occupied', testid: 'table-seat-btn' },
    { label: 'Mark Available', next: 'available', testid: 'table-available-btn' },
  ],
  cleaning: [{ label: 'Mark Available', next: 'available', testid: 'table-available-btn' }],
};

function formatMoney(n: unknown): string {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

/** Latest active (pre-serve) dine-in ticket bound to a table, if any. */
function findCurrentOrder(orders: (KitchenOrder | null)[], tableId: string): KitchenOrder | null {
  const candidates = orders.filter(
    (o): o is KitchenOrder =>
      !!o && o.tableId === tableId && ['pending', 'confirmed', 'preparing', 'ready'].includes(o.kitchenStatus || ''),
  );
  if (candidates.length === 0) return null;
  // Most recent first (the list endpoint already sorts created_at DESC).
  return candidates[0];
}

// ─── Add-table form ─────────────────────────────────────────
function AddTableForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [section, setSection] = useState('');
  const createTable = useCreateTableMutation();
  const { showToast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedCapacity = parseInt(capacity, 10);
    createTable.mutate(
      {
        name: trimmed,
        capacity: Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : undefined,
        section: section.trim() || undefined,
      },
      {
        onSuccess: () => {
          showToast(`Table ${trimmed} added`, 'success');
          setName('');
          setCapacity('2');
          setSection('');
          onDone();
        },
        onError: (err: Error) => showToast(err.message || 'Failed to add table', 'error'),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} data-testid="add-table-form" className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-gray-600 mb-1">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="T5"
          aria-label="Table name"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>
      <label className="text-sm">
        <span className="block text-gray-600 mb-1">Capacity</span>
        <input
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          inputMode="numeric"
          aria-label="Table capacity"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>
      <label className="text-sm">
        <span className="block text-gray-600 mb-1">Section</span>
        <input
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="Terrace"
          aria-label="Table section"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>
      <button
        type="submit"
        disabled={createTable.isPending}
        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md cursor-pointer border-none"
      >
        {createTable.isPending ? 'Adding…' : 'Add Table'}
      </button>
    </form>
  );
}

// ─── Single table card ──────────────────────────────────────
function TableCard({
  table,
  selected,
  currentOrder,
  onSelect,
  onStatusChange,
}: {
  table: PosTable;
  selected: boolean;
  currentOrder: KitchenOrder | null;
  onSelect: () => void;
  onStatusChange: (next: TableStatus) => void;
}) {
  const actions = selected ? STATUS_ACTIONS[table.status] : [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      data-testid={`table-card-${table.name}`}
      className={`cursor-pointer rounded-xl border-2 p-4 transition-shadow ${
        STATUS_COLORS[table.status]
      } ${selected ? 'ring-2 ring-offset-2 ring-gray-800 shadow-md' : 'hover:shadow'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-base leading-tight">{table.name}</span>
        <span className="text-xs font-medium bg-white/70 rounded-full px-2 py-0.5 whitespace-nowrap">
          {STATUS_LABELS[table.status]}
        </span>
      </div>
      <div className="text-xs mt-1 opacity-80">{table.capacity} seats{table.section ? ` · ${table.section}` : ''}</div>

      {/* Occupied + selected → reveal the ticket bound to this table */}
      {selected && table.status === 'occupied' && (
        <div data-testid="table-current-order" className="mt-3 pt-3 border-t border-black/10 text-xs">
          {currentOrder ? (
            <>
              <div className="font-semibold">
                #{currentOrder.orderNumber} · {formatMoney(currentOrder.totalAmount)}
              </div>
              {(currentOrder.items?.length ?? 0) > 0 && (
                <div className="mt-1 opacity-80 truncate">
                  {currentOrder.items!.map((i) => `${i.quantity}× ${i.productName ?? 'Item'}`).join(', ')}
                </div>
              )}
            </>
          ) : (
            <div className="opacity-70">No active kitchen ticket linked.</div>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.next + a.label}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(a.next);
              }}
              data-testid={a.testid}
              className="text-xs font-semibold bg-white/90 hover:bg-white text-gray-900 rounded-lg px-3 py-1.5 border border-black/10 cursor-pointer"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table Grid View ────────────────────────────────────────
export default function TableView() {
  const { data, isLoading, error, refetch } = usePosTables();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const updateStatus = useUpdateTableStatusMutation();
  const { showToast } = useToast();

  const sections = data?.sections ?? [];
  const allTables = useMemo(() => sections.flatMap((s) => s.tables), [sections]);
  const selectedTable = allTables.find((t) => t.id === selectedId) ?? null;
  // Hydrate orders only while an occupied table is inspected — the detail
  // queries are shared with the Kitchen board via the same cache keys.
  const enriched = useEnrichedOrders(selectedTable?.status === 'occupied');
  const currentOrder = selectedTable && selectedTable.status === 'occupied'
    ? findCurrentOrder(enriched.orders, selectedTable.id)
    : null;

  function handleSelect(table: PosTable) {
    setSelectedId((prev) => (prev === table.id ? null : table.id));
  }

  function handleStatusChange(next: TableStatus) {
    if (!selectedTable) return;
    updateStatus.mutate(
      { id: selectedTable.id, status: next },
      {
        onSuccess: () => {
          showToast(`${selectedTable.name} → ${STATUS_LABELS[next]}`, 'success');
          setSelectedId(null);
        },
        onError: (err: Error) => showToast(err.message || 'Failed to update table', 'error'),
      },
    );
  }

  if (isLoading) return <div className="p-6"><TableSkeleton rows={4} columns={4} /></div>;
  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-3">{(error as Error).message || 'Failed to load tables'}</div>
      <button onClick={() => refetch()} className="text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-md px-4 py-2 border-none cursor-pointer">Try Again</button>
    </div>
  );

  return (
    <div className="p-6 space-y-4 overflow-y-auto" data-testid="pos-tables">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900">Tables</h2>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          data-testid="toggle-add-table"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md cursor-pointer border-none"
        >
          {showAddForm ? 'Close' : '+ Add Table'}
        </button>
      </div>

      {showAddForm && (
        <Card>
          <AddTableForm onDone={() => setShowAddForm(false)} />
        </Card>
      )}

      {/* Floor legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500" data-testid="tables-legend">
        {(Object.keys(STATUS_COLORS) as TableStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm border ${STATUS_COLORS[s].split(' ').slice(0, 2).join(' ')}`} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {sections.length === 0 && (
        <Card>
          <EmptyState
            title="No tables yet"
            description="Add your first floor table to start seating guests."
          />
        </Card>
      )}

      {sections.map((group) => (
        <section key={group.section ?? '__unassigned'} data-testid={`table-section-${group.section ?? 'unassigned'}`}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {group.section ?? 'Unassigned'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {group.tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                selected={table.id === selectedId}
                currentOrder={currentOrder}
                onSelect={() => handleSelect(table)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </section>
      ))}

      {updateStatus.isPending && (
        <div className="fixed bottom-4 right-4"><LoadingSpinner text="Updating…" /></div>
      )}
    </div>
  );
}
