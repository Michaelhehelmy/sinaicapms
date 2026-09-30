import React, { useMemo, useState } from 'react';
import { useFoliosQuery, useCreateFolioMutation } from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Folio, FolioStatus } from '@/lib/api';
import type { Camp } from '@/hooks/useAdminData';
import FolioDetail from './FolioDetail';

interface FoliosPanelProps {
  campIds: string[];
  camps: Camp[];
  onNavigateToTab?: (tab: string) => void;
}

function statusVariant(status: FolioStatus): 'success' | 'info' | 'neutral' {
  if (status === 'open') return 'success';
  if (status === 'settled') return 'info';
  return 'neutral';
}

// ─── Guest Folios panel (B.5) ─────────────────────────────────────
// Tenant tab: open guest folios with their running totals, plus settled /
// voided history. Status + date + guest filters ride the list query key so
// switching filters refetches; the create modal opens walk-in folios
// (no guest/order required). Row click opens the FolioDetail modal.
// Data flows through TanStack Query only — no raw fetch.
export default function FoliosPanel({ campIds, camps, onNavigateToTab }: FoliosPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [guestFilter, setGuestFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [guestId, setGuestId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    if (guestFilter.trim()) p.guest = guestFilter.trim();
    if (dateFilter) p.date = dateFilter;
    return p;
  }, [statusFilter, guestFilter, dateFilter]);

  const { data, isLoading } = useFoliosQuery(params);
  const createMutation = useCreateFolioMutation();

  const folios: Folio[] = data?.folios ?? [];
  const counts = data?.counts ?? { open: 0, settled: 0, voided: 0, total: 0 };

  const campNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (camps ?? []).forEach((c) => {
      map[String(c.id)] = c.name;
    });
    return map;
  }, [camps]);
  void campNameMap;
  void campIds;

  const handleCreate = () => {
    createMutation.mutate(
      {
        ...(guestId.trim() ? { guestId: guestId.trim() } : {}),
        ...(orderId.trim() ? { primaryOrderId: orderId.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setGuestId('');
          setOrderId('');
          setNotes('');
        },
      },
    );
  };

  const columns = useMemo(
    () => [
      {
        key: 'id',
        header: 'Folio',
        render: (f: Folio) => <span className="font-mono text-xs">{f.id}</span>,
      },
      {
        key: 'guest',
        header: 'Guest',
        render: (f: Folio) => <span>{f.guestId || 'Walk-in'}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (f: Folio) => (
          <Badge variant={statusVariant(f.status)} size="sm" dot>
            {f.status}
          </Badge>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        render: (f: Folio) => (
          <span data-testid={`folio-total-${f.id}`}>{formatCurrency(Number(f.totalAmount || 0))}</span>
        ),
      },
      {
        key: 'opened',
        header: 'Opened',
        hideOnMobile: true,
        render: (f: Folio) => <span>{f.openedAt ? formatDate(String(f.openedAt)) : '—'}</span>,
      },
    ],
    [],
  );

  return (
    <Card padding="none" className="p-6" data-testid="folios-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Guest Folios</h2>
          <p className="text-sm text-gray-500">
            Open folios accrue room + POS charges until settled at checkout.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
          Open Folio
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="folios-stats">
        <Badge variant="success" size="lg">
          Open: {counts.open}
        </Badge>
        <Badge variant="info" size="lg">
          Settled: {counts.settled}
        </Badge>
        <Badge variant="neutral" size="lg">
          Voided: {counts.voided}
        </Badge>
        <Badge variant="neutral" size="lg">
          Total: {counts.total}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="folio-filters">
        <select
          aria-label="Status filter"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="settled">Settled</option>
          <option value="voided">Voided</option>
        </select>
        <input
          aria-label="Guest filter"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Guest ID…"
          value={guestFilter}
          onChange={(e) => setGuestFilter(e.target.value)}
        />
        <input
          aria-label="Date filter"
          type="date"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        {(statusFilter || guestFilter || dateFilter) && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setStatusFilter('');
              setGuestFilter('');
              setDateFilter('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="mt-4" data-testid="folios-table">
        {isLoading ? (
          <div data-testid="folios-loading">Loading folios…</div>
        ) : folios.length === 0 ? (
          <EmptyState
            title="No folios found"
            description="Open a folio for a walk-in guest or a checked-in order."
            action={{ label: 'Open Folio', onClick: () => setShowCreate(true) }}
          />
        ) : (
          <DataTable<Folio & Record<string, unknown>>
            columns={columns}
            data={folios as (Folio & Record<string, unknown>)[]}
            rowKey="id"
            onRowClick={(f) => setSelectedId(String(f.id))}
          />
        )}
      </div>

      {folios.length === 0 && !isLoading && onNavigateToTab && (
        <div className="mt-2">
          <Button variant="ghost" size="md" onClick={() => onNavigateToTab('reservations')}>
            Go to Orders
          </Button>
        </div>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Open guest folio"
        testId="folio-create-modal"
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600">Guest ID (optional)</span>
            <input
              aria-label="Guest ID"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Walk-in when empty"
              value={guestId}
              onChange={(e) => setGuestId(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Order ID (optional)</span>
            <input
              aria-label="Order ID"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Link a checked-in order"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Notes (optional)</span>
            <input
              aria-label="Notes"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {createMutation.isError && (
            <p className="text-sm text-red-600" role="alert">
              Failed to open folio
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Opening…' : 'Open Folio'}
            </Button>
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {selectedId && (
        <FolioDetail folioId={selectedId} camps={camps} onClose={() => setSelectedId(null)} />
      )}
    </Card>
  );
}
