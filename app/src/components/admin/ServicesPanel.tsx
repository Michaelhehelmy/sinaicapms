import React, { useState, useCallback } from 'react';
import type { ServiceDefinition, ServiceItem, ServiceBooking } from '@/lib/api';
import { useServiceDefinitionsQuery, useServiceItemsQuery, useServiceBookingsQuery } from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import * as api from '@/lib/api';

type Tab = 'definitions' | 'items' | 'bookings';

interface DefForm {
  slug: string;
  name: string;
  description: string;
}

const emptyDefForm: DefForm = { slug: '', name: '', description: '' };

interface ItemForm {
  service_definition_id: string;
  project_id: string;
  name: string;
  description: string;
  base_price: string;
  status: string;
}

const emptyItemForm: ItemForm = { service_definition_id: '', project_id: '', name: '', description: '', base_price: '', status: 'active' };

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const BOOKING_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'en_route', label: 'En Route' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
];

export default function ServicesPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('definitions');

  const { data: defs = [], isLoading: defsLoading } = useServiceDefinitionsQuery();
  const { data: items = [], isLoading: itemsLoading } = useServiceItemsQuery();
  const { data: bookings = [], isLoading: bookingsLoading } = useServiceBookingsQuery();

  // Definitions modal
  const [showDefForm, setShowDefForm] = useState(false);
  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [defForm, setDefForm] = useState<DefForm>(emptyDefForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'def' | 'item'; item: ServiceDefinition | ServiceItem } | null>(null);

  // Items modal
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);

  // Bookings status update
  const [bookingStatusTarget, setBookingStatusTarget] = useState<ServiceBooking | null>(null);

  const loading = defsLoading || itemsLoading || bookingsLoading;

  // ── Definition handlers ──────────────────────────────────────────────
  const openAddDef = useCallback(() => { setEditingDefId(null); setDefForm(emptyDefForm); setShowDefForm(true); }, []);
  const openEditDef = useCallback((d: ServiceDefinition) => {
    setEditingDefId(d.id);
    setDefForm({ slug: d.slug, name: d.name, description: d.description || '' });
    setShowDefForm(true);
  }, []);

  const handleSaveDef = useCallback(async () => {
    if (!defForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveServiceDefinition({
        slug: defForm.slug || undefined,
        name: defForm.name.trim(),
        description: defForm.description || undefined,
      }, editingDefId ?? undefined);
      showToast(editingDefId ? 'Definition updated.' : 'Definition created.', 'success');
      setShowDefForm(false);
      setEditingDefId(null);
      setDefForm(emptyDefForm);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [defForm, editingDefId, showToast]);

  // ── Item handlers ────────────────────────────────────────────────────
  const openAddItem = useCallback(() => { setEditingItemId(null); setItemForm(emptyItemForm); setShowItemForm(true); }, []);
  const openEditItem = useCallback((i: ServiceItem) => {
    setEditingItemId(i.id);
    setItemForm({
      service_definition_id: i.service_definition_id,
      project_id: i.project_id || '',
      name: i.name,
      description: i.description || '',
      base_price: String(i.base_price ?? ''),
      status: i.status,
    });
    setShowItemForm(true);
  }, []);

  const handleSaveItem = useCallback(async () => {
    if (!itemForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    if (!itemForm.service_definition_id) { showToast('Service type is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveServiceItem({
        service_definition_id: itemForm.service_definition_id,
        project_id: itemForm.project_id || null,
        name: itemForm.name.trim(),
        description: itemForm.description || undefined,
        base_price: parseFloat(itemForm.base_price) || 0,
        status: itemForm.status,
      }, editingItemId ?? undefined);
      showToast(editingItemId ? 'Item updated.' : 'Item created.', 'success');
      setShowItemForm(false);
      setEditingItemId(null);
      setItemForm(emptyItemForm);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [itemForm, editingItemId, showToast]);

  // ── Delete handler ───────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'def') {
        await api.deleteServiceDefinition(deleteTarget.item.id);
      } else {
        await api.deleteServiceItem(deleteTarget.item.id);
      }
      showToast('Deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast]);

  // ── Booking status update ────────────────────────────────────────────
  const handleBookingStatus = useCallback(async (newStatus: string) => {
    if (!bookingStatusTarget) return;
    try {
      await api.updateBookingStatus(bookingStatusTarget.id, newStatus);
      showToast(`Booking marked as ${newStatus}.`, 'success');
      setBookingStatusTarget(null);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [bookingStatusTarget, showToast]);

  const bookingStatusLabel: Record<string, { text: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
    pending: { text: 'Pending', variant: 'warning' },
    confirmed: { text: 'Confirmed', variant: 'info' },
    en_route: { text: 'En Route', variant: 'info' },
    completed: { text: 'Completed', variant: 'success' },
    canceled: { text: 'Canceled', variant: 'danger' },
  };

  if (loading) return <LoadingSpinner text="Loading services..." />;

  return (
    <Card padding="none" className="p-6" data-testid="services-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Services</h2>
        {tab === 'definitions' && (
          <Button variant="success" size="md" onClick={openAddDef} data-testid="add-def-btn">
            Add Service Type
          </Button>
        )}
        {tab === 'items' && (
          <Button variant="success" size="md" onClick={openAddItem} data-testid="add-item-btn">
            Add Service
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Define service types (plumber, electrician, tour guide) and bookable items for each.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['definitions', 'items', 'bookings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`tab-${t}`}
          >
            {t === 'definitions' ? 'Service Types' : t === 'items' ? 'Bookable Items' : `Bookings (${bookings.length})`}
          </button>
        ))}
      </div>

      {/* ── Definitions Tab ─────────────────────────────────── */}
      {tab === 'definitions' && (
        defs.length === 0 ? (
          <EmptyState title="No service types" description="Create your first service type to start accepting bookings." action={{ label: 'Add Service Type', onClick: openAddDef }} />
        ) : (
          <DataTable<ServiceDefinition & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (d) => <div><strong className="text-gray-900">{String(d.name)}</strong><div className="text-xs text-gray-500 mt-0.5">/{String(d.slug)}</div></div> },
              { key: 'description', header: 'Description', render: (d) => <span className="text-sm text-gray-600 truncate max-w-[200px] block">{String(d.description || '-')}</span> },
              { key: 'is_active', header: 'Status', render: (d) => <Badge variant={Number(d.is_active) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(d.is_active) === 1 ? 'Active' : 'Inactive'}</Badge> },
            ]}
            data={defs as (ServiceDefinition & Record<string, unknown>)[]}
            emptyMessage="No service types configured."
            actions={(d) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditDef(d as unknown as ServiceDefinition)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'def', item: d as unknown as ServiceDefinition })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Items Tab ───────────────────────────────────────── */}
      {tab === 'items' && (
        items.length === 0 ? (
          <EmptyState title="No bookable items" description="Add service items under a service type." action={{ label: 'Add Service', onClick: openAddItem }} />
        ) : (
          <DataTable<ServiceItem & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (i) => <div><strong className="text-gray-900">{String(i.name)}</strong><div className="text-xs text-gray-500 mt-0.5">{String(i.definition_name || '')}</div></div> },
              { key: 'base_price', header: 'Price', render: (i) => <span className="font-medium">{formatCurrency(Number(i.base_price))}</span> },
              { key: 'status', header: 'Status', render: (i) => <Badge variant={String(i.status) === 'active' ? 'success' : 'neutral'} dot size="sm">{String(i.status)}</Badge> },
            ]}
            data={items as (ServiceItem & Record<string, unknown>)[]}
            emptyMessage="No service items."
            actions={(i) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditItem(i as unknown as ServiceItem)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'item', item: i as unknown as ServiceItem })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Bookings Tab ────────────────────────────────────── */}
      {tab === 'bookings' && (
        bookings.length === 0 ? (
          <EmptyState title="No bookings yet" description="Bookings will appear here when customers request services." />
        ) : (
          <DataTable<ServiceBooking & Record<string, unknown>>
            columns={[
              { key: 'item_name', header: 'Service', sortable: true, render: (b) => <strong className="text-gray-900">{String(b.item_name || '')}</strong> },
              { key: 'customer_name', header: 'Customer', render: (b) => <span className="text-sm text-gray-600">{String(b.customer_name || '-')}</span> },
              { key: 'scheduled_date', header: 'Scheduled', render: (b) => <span className="text-sm text-gray-600">{b.scheduled_date ? String(b.scheduled_date).slice(0, 10) : '-'}</span> },
              { key: 'status', header: 'Status', render: (b) => { const s = bookingStatusLabel[String(b.status)] || { text: String(b.status), variant: 'neutral' as const }; return <Badge variant={s.variant} dot size="sm">{s.text}</Badge>; } },
            ]}
            data={bookings as (ServiceBooking & Record<string, unknown>)[]}
            emptyMessage="No bookings."
            actions={(b) => (
              <Button variant="ghost" size="sm" onClick={() => setBookingStatusTarget(b as unknown as ServiceBooking)}>
                Update Status
              </Button>
            )}
          />
        )
      )}

      {/* ── Definition Form Modal ───────────────────────────── */}
      <FormModal open={showDefForm} title={editingDefId ? 'Edit Service Type' : 'Add Service Type'} onClose={() => { setShowDefForm(false); setEditingDefId(null); }} onSubmit={handleSaveDef} submitLabel={saving ? 'Saving...' : editingDefId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={defForm.name} onChange={(e) => setDefForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Plumbing Services" />
          <Input label="Slug" type="text" value={defForm.slug} onChange={(e) => setDefForm((p) => ({ ...p, slug: e.target.value }))} placeholder="auto-generated from name" />
          <Input label="Description" type="text" value={defForm.description} onChange={(e) => setDefForm((p) => ({ ...p, description: e.target.value }))} placeholder="Brief description" />
        </div>
      </FormModal>

      {/* ── Item Form Modal ─────────────────────────────────── */}
      <FormModal open={showItemForm} title={editingItemId ? 'Edit Service' : 'Add Service'} onClose={() => { setShowItemForm(false); setEditingItemId(null); }} onSubmit={handleSaveItem} submitLabel={saving ? 'Saving...' : editingItemId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Select label="Service Type *" options={defs.filter((d) => Number(d.is_active) === 1).map((d) => ({ value: d.id, label: d.name }))} value={itemForm.service_definition_id} onChange={(e) => setItemForm((p) => ({ ...p, service_definition_id: e.target.value }))} />
          </div>
          <Input label="Name *" type="text" value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Emergency Plumbing" />
          <Input label="Base Price ($)" type="number" value={itemForm.base_price} onChange={(e) => setItemForm((p) => ({ ...p, base_price: e.target.value }))} min="0" step="0.01" />
          <Input label="Description" type="text" value={itemForm.description} onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))} />
          <Select label="Status" options={STATUS_OPTIONS} value={itemForm.status} onChange={(e) => setItemForm((p) => ({ ...p, status: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Booking Status Modal ────────────────────────────── */}
      {bookingStatusTarget && (
        <FormModal open title="Update Booking Status" onClose={() => setBookingStatusTarget(null)} onSubmit={() => {}} submitLabel="" submitDisabled>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Current status: <strong>{bookingStatusLabel[bookingStatusTarget.status]?.text || bookingStatusTarget.status}</strong></p>
            <p className="text-sm text-gray-600">Service: {bookingStatusTarget.item_name || ''}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {BOOKING_STATUS_OPTIONS.filter((o) => o.value !== bookingStatusTarget.status).map((o) => (
                <Button key={o.value} variant="secondary" size="sm" onClick={() => handleBookingStatus(o.value)}>{o.label}</Button>
              ))}
            </div>
          </div>
        </FormModal>
      )}

      {/* ── Delete Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === 'def' ? 'Service Type' : 'Service Item'}`}
        message={`Are you sure you want to delete "${deleteTarget?.item?.name || ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
