import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useInboxQuery,
  useMarkInboxReadMutation,
  useDeleteInboxLeadMutation,
  queryKeys,
} from '@/hooks/useQueryHooks';
import { useSseInbox } from '@/hooks/useSseInbox';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, formatCurrency } from '@/lib/utils';
import * as api from '@/lib/api';
import type { components } from '@/lib/api-types';
import { IconInbox } from './icons';

type Schemas = components['schemas'];
type InboxItem = Schemas['InboxItem'];
type InboxResponse = Schemas['InboxResponse'];
type TabKey = 'all' | 'leads' | 'bookings';

interface InboxPanelProps {
  /** Resolved tenant id (from the auth user). Disables SSE when absent. */
  tenantId?: string;
  /** Short-lived admin JWT read from localStorage by the shell. */
  token?: string;
  /** Called with a booking id when the admin clicks "Open booking". */
  onOpenOrder?: (orderId: string) => void;
}

const LEAD_STATUS_VARIANTS: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info',
  contacted: 'warning',
  converted: 'success',
  archived: 'neutral',
};

const PAYMENT_STATUS_VARIANTS: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  paid: 'success',
  unpaid: 'error',
  partial: 'warning',
};

/** Maps an order state id to a badge variant — mirrors OrdersPanel.getOrderStateVariant. */
function getOrderStateVariant(stateId: string | null | undefined): 'warning' | 'info' | 'success' | 'neutral' | 'error' {
  switch (String(stateId)) {
    case 'pending': return 'warning';
    case 'confirmed': return 'info';
    case 'checked_in': return 'success';
    case 'checked_out': return 'neutral';
    case 'cancelled': return 'error';
    default: return 'neutral';
  }
}

const LEAD_STATUS_ACTION_OPTIONS = [
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'archived', label: 'Archived' },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'leads', label: 'Leads' },
  { key: 'bookings', label: 'Bookings' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'archived', label: 'Archived' },
];

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "checked_in" → "Checked In" — mirrors OrdersPanel's ORDER_STATES label transform. */
function formatStateLabel(value?: string | null): string {
  const raw = value ?? 'booked';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Unified Inbox panel (tenant admin).
 *
 * Merges guest leads and new bookings into one feed with unread tracking,
 * live SSE refresh, and quick actions:
 *  - leads: status dropdown (contacted/converted/archived) + delete
 *  - bookings: "Open booking" jump into the Orders tab
 *
 * Unread rows are rendered bold with a dot and clicking them marks the item
 * read optimistically (cache flip + API mutation).
 */
export default function InboxPanel({ tenantId, token, onOpenOrder }: InboxPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<InboxItem | null>(null);

  // Feed params — the same object shapes the query key, so optimistic cache
  // writes below always target the key the panel is currently showing.
  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (activeTab === 'leads') p.kind = 'lead';
    if (activeTab === 'bookings') p.kind = 'booking';
    if (activeTab === 'leads' && statusFilter !== 'all') p.status = statusFilter;
    return Object.keys(p).length > 0 ? p : undefined;
  }, [activeTab, statusFilter]);

  const { data: feed, isLoading, isError, refetch } = useInboxQuery(params);
  const items = feed?.data ?? [];
  const unread = feed?.unread ?? 0;

  const markReadMutation = useMarkInboxReadMutation();
  const deleteMutation = useDeleteInboxLeadMutation();

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'new' | 'contacted' | 'converted' | 'archived' }) =>
      api.updateLead(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
      showToast('Lead status updated', 'success');
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Failed to update lead: ${message}`, 'error');
    },
  });

  // ─── Live refresh via the SSE inbox stream ─────────────────────────
  // The stream only opens when the shell handed us a resolved tenant + JWT.
  // Any new-lead / new-booking event (deduped by the sse layer) refreshes the
  // feed and the unread count so the panel never goes stale.
  const handleSseEvent = useCallback(
    (event: unknown) => {
      const ev = (event ?? {}) as { type?: string };
      if (ev.type !== 'new-lead' && ev.type !== 'new-booking') return;
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox', 'unread'] });
    },
    [queryClient],
  );

  const { connected: sseConnected } = useSseInbox({
    enabled: Boolean(tenantId) && Boolean(token),
    tenantId,
    token,
    onEvent: handleSseEvent,
  });

  const handleRowClick = useCallback(
    (item: InboxItem) => {
      if (item.isRead) return;
      // Optimistic: flip the row + envelope before the PATCH lands.
      queryClient.setQueryData<InboxResponse>(queryKeys.inbox(params), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unread: Math.max(0, prev.unread - 1),
          data: prev.data.map((it) => (it.id === item.id ? { ...it, isRead: 1 } : it)),
        };
      });
      markReadMutation.mutate({ kind: item.kind, id: item.id });
    },
    [params, queryClient, markReadMutation],
  );

  const leadStatusOptions = (item: InboxItem) => {
    const current = item.status ?? 'new';
    return [
      { value: current, label: capitalize(current), disabled: true },
      ...LEAD_STATUS_ACTION_OPTIONS.filter((o) => o.value !== current),
    ];
  };

  const renderLead = (item: InboxItem) => {
    const title = item.name ?? item.subject ?? item.email ?? 'Lead';
    const detail = [item.subject, item.email, item.phone].filter(Boolean).join(' · ');
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={cn('truncate text-[0.95rem]', item.isRead ? 'text-gray-700 font-medium' : 'text-gray-900 font-bold')}>
            {title}
          </span>
          <Badge variant={LEAD_STATUS_VARIANTS[item.status ?? 'new'] ?? 'neutral'} size="sm">
            {capitalize(item.status ?? 'new')}
          </Badge>
          {item.source ? (
            <span className="text-xs text-gray-400">{item.source}</span>
          ) : null}
        </div>
        {detail ? (
          <p className="text-sm text-gray-500 mt-0.5 truncate">{detail}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            aria-label={`Update status for ${title}`}
            value={item.status ?? 'new'}
            options={leadStatusOptions(item)}
            placeholder="Change status"
            disabled={updateMutation.isPending}
            onChange={(e) => updateMutation.mutate({ id: item.id, status: e.target.value as 'new' | 'contacted' | 'converted' | 'archived' })}
            className="w-40"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(item);
            }}
          >
            Delete
          </Button>
        </div>
      </>
    );
  };

  const renderBooking = (item: InboxItem) => {
    const title = item.customerName ?? 'Booking';
    const stay = [item.checkInDate, item.checkOutDate].some(Boolean)
      ? `${formatDate(item.checkInDate)} → ${formatDate(item.checkOutDate)}`
      : null;
    const detail = [item.campName, item.roomNumber, stay, item.reference].filter(Boolean).join(' · ');
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={cn('truncate text-[0.95rem]', item.isRead ? 'text-gray-700 font-medium' : 'text-gray-900 font-bold')}>
            {title}
          </span>
          <Badge variant={getOrderStateVariant(item.orderStateId)} size="sm">
            {formatStateLabel(item.orderStateId)}
          </Badge>
          {item.paymentStatus ? (
            <Badge variant={PAYMENT_STATUS_VARIANTS[item.paymentStatus ?? ''] ?? 'neutral'} size="sm">
              {capitalize(item.paymentStatus)}
            </Badge>
          ) : null}
          {typeof item.totalAmount === 'number' ? (
            <span className="text-sm font-semibold text-gray-700">{formatCurrency(item.totalAmount)}</span>
          ) : null}
        </div>
        {detail ? (
          <p className="text-sm text-gray-500 mt-0.5 truncate">{detail}</p>
        ) : null}
        {typeof onOpenOrder === 'function' ? (
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onOpenOrder(item.id);
              }}
            >
              Open booking
            </Button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <Card padding="none" className="p-6" data-testid="inbox-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-brand-100 text-brand-700">
            <IconInbox size={20} />
          </span>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Inbox</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-500">Guest inquiries and new bookings.</p>
              {sseConnected && (
                <Badge variant="success" size="sm" dot data-testid="inbox-live-badge">
                  Live
                </Badge>
              )}
            </div>
          </div>
        </div>
        {unread > 0 ? (
          <Badge variant="warning" size="sm" dot data-testid="inbox-unread-count">
            {unread} unread
          </Badge>
        ) : null}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Inbox filters" className="flex flex-wrap items-center gap-1.5 mt-4">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              data-testid={`inbox-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'border rounded-lg px-3.5 py-1.5 text-sm font-semibold cursor-pointer transition-colors font-[inherit]',
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-warm-100',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Lead status filter */}
      {activeTab === 'leads' ? (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <button
                key={f.value}
                data-testid={`inbox-status-${f.value}`}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold cursor-pointer font-[inherit] transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700 border border-brand-200'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-warm-100',
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4">
        {isLoading ? (
          <LoadingSpinner text="Loading inbox..." />
        ) : isError ? (
          <div data-testid="inbox-error" className="text-center py-10">
            <p className="text-sm text-red-600 mb-3">Could not load the inbox.</p>
            <Button variant="primary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={32} />}
            title={
              activeTab === 'leads'
                ? statusFilter !== 'all'
                  ? 'No leads in this status'
                  : 'No leads yet'
                : activeTab === 'bookings'
                  ? 'No bookings yet'
                  : 'Inbox zero'
            }
            description="Guest inquiries and new bookings will appear here as they arrive."
          />
        ) : (
          <ul data-testid="inbox-list" className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {items.map((item) => (
              <li
                key={item.id}
                data-testid={`inbox-item-${item.id}`}
                onClick={() => handleRowClick(item)}
                className={cn(
                  'flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors',
                  item.isRead ? 'bg-white hover:bg-warm-50' : 'bg-brand-50/50 hover:bg-brand-50',
                )}
              >
                {!item.isRead ? (
                  <span
                    data-testid="unread-dot"
                    className="mt-2 h-2 w-2 rounded-full bg-brand-500 shrink-0"
                    aria-label="Unread"
                  />
                ) : (
                  <span className="mt-2 h-2 w-2 rounded-full bg-transparent shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  {item.kind === 'booking' ? renderBooking(item) : renderLead(item)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete lead?"
        message={
          deleteTarget
            ? `This will permanently delete the lead from ${deleteTarget.name ?? deleteTarget.email ?? 'this guest'}. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
