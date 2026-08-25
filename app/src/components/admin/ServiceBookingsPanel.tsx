import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { ServiceBooking } from '@/lib/api';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { queryKeys } from '@/hooks/useQueryHooks';

const BOOKING_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'en_route', label: 'En Route' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
];

const bookingStatusLabel: Record<string, { text: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { text: 'Pending', variant: 'warning' },
  confirmed: { text: 'Confirmed', variant: 'info' },
  en_route: { text: 'En Route', variant: 'info' },
  completed: { text: 'Completed', variant: 'success' },
  canceled: { text: 'Canceled', variant: 'danger' },
};

interface BookingForm {
  service_item_id: string;
  customer_name: string;
  customer_phone: string;
  scheduled_date: string;
  notes: string;
}

const emptyBookingForm: BookingForm = {
  service_item_id: '',
  customer_name: '',
  customer_phone: '',
  scheduled_date: '',
  notes: '',
};

export default function ServiceBookingsPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<BookingForm>(emptyBookingForm);
  const [assignTarget, setAssignTarget] = useState<ServiceBooking | null>(null);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const bookingsQuery = useQuery({
    queryKey: ['admin', 'service-bookings', filterStatus || undefined],
    queryFn: () => api.getServiceBookings(filterStatus || undefined) as Promise<ServiceBooking[]>,
  });

  const itemsQuery = useQuery({
    queryKey: ['admin', 'service-items'],
    queryFn: () => api.getServiceItems(),
  });

  const staffQuery = useQuery({
    queryKey: ['admin', 'pos-users'],
    queryFn: () => api.getPosUsers() as Promise<{ data: Array<{ id: string; firstName: string; lastName: string; isActive: number }> }>,
  });

  const createMutation = useMutation({
    mutationFn: (data: BookingForm) =>
      api.createServiceBooking({
        service_item_id: data.service_item_id,
        customer_name: data.customer_name || undefined,
        customer_phone: data.customer_phone || undefined,
        scheduled_date: data.scheduled_date || undefined,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      showToast('Booking created.', 'success');
      setShowCreateForm(false);
      setForm(emptyBookingForm);
      queryClient.invalidateQueries({ queryKey: queryKeys.camps });
    },
    onError: (err: Error) => showToast('Error: ' + err.message, 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateBookingStatus(id, status),
    onSuccess: () => {
      showToast('Booking status updated.', 'success');
      queryClient.invalidateQueries({ queryKey: queryKeys.camps });
    },
    onError: (err: Error) => showToast('Error: ' + err.message, 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ bookingId, workerId }: { bookingId: string; workerId: string }) =>
      api.assignServiceWorker(bookingId, workerId),
    onSuccess: () => {
      showToast('Worker assigned.', 'success');
      setAssignTarget(null);
      setSelectedWorker('');
      queryClient.invalidateQueries({ queryKey: queryKeys.camps });
    },
    onError: (err: Error) => showToast('Error: ' + err.message, 'error'),
  });

  const handleCreate = useCallback(() => {
    if (!form.service_item_id) { showToast('Service item is required.', 'warning'); return; }
    createMutation.mutate(form);
  }, [form, showToast, createMutation]);

  const handleAssign = useCallback(() => {
    if (!assignTarget || !selectedWorker) return;
    assignMutation.mutate({ bookingId: assignTarget.id, workerId: selectedWorker });
  }, [assignTarget, selectedWorker, assignMutation]);

  const bookings = bookingsQuery.data ?? [];
  const items = (itemsQuery.data ?? []) as Array<{ id: string; name: string }>;
  const staffList = ((staffQuery.data as { data?: Array<{ id: string; firstName: string; lastName: string }> })?.data ?? []);

  const staffOptions = staffList.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }));
  const itemOptions = items.map((i) => ({ value: i.id, label: i.name }));

  if (bookingsQuery.isLoading) return <LoadingSpinner text="Loading bookings..." />;

  return (
    <Card padding="none" className="p-6" data-testid="service-bookings-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Service Bookings</h2>
        <Button variant="success" size="md" onClick={() => { setForm(emptyBookingForm); setShowCreateForm(true); }} data-testid="add-booking-btn">
          Create Booking
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Manage service bookings, assign workers, and track status.
      </p>

      <div className="flex gap-3 mb-4">
        <Select
          label="Filter by status"
          options={[{ value: '', label: 'All Statuses' }, ...BOOKING_STATUS_OPTIONS]}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        />
      </div>

      {bookings.length === 0 ? (
        <EmptyState title="No bookings yet" description="Bookings will appear here when customers request services." />
      ) : (
        <DataTable<ServiceBooking & Record<string, unknown>>
          columns={[
            { key: 'customer_name', header: 'Customer', sortable: true, render: (b) => <span className="text-sm text-gray-700">{String(b.customer_name || '-')}</span> },
            { key: 'item_name', header: 'Service', sortable: true, render: (b) => <strong className="text-gray-900">{String(b.item_name || '')}</strong> },
            { key: 'scheduled_date', header: 'Scheduled', render: (b) => <span className="text-sm text-gray-600">{b.scheduled_date ? String(b.scheduled_date).slice(0, 10) : '-'}</span> },
            { key: 'status', header: 'Status', render: (b) => { const s = bookingStatusLabel[String(b.status)] || { text: String(b.status), variant: 'neutral' as const }; return <Badge variant={s.variant} dot size="sm">{s.text}</Badge>; } },
            { key: 'assigned_worker_id', header: 'Worker', render: (b) => {
              const wid = String((b as Record<string, unknown>).assigned_worker_id || '');
              if (!wid) return <span className="text-xs text-gray-400">Unassigned</span>;
              const worker = staffList.find((s) => s.id === wid);
              return <span className="text-sm text-gray-700">{worker ? `${worker.firstName} ${worker.lastName}` : wid}</span>;
            }},
          ]}
          data={bookings as (ServiceBooking & Record<string, unknown>)[]}
          emptyMessage="No bookings found."
          actions={(b) => (
            <div className="flex gap-1.5">
              <Select
                label=""
                options={BOOKING_STATUS_OPTIONS.filter((o) => o.value !== String(b.status))}
                value=""
                onChange={(e) => {
                  if (e.target.value) statusMutation.mutate({ id: String(b.id), status: e.target.value });
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => { setAssignTarget(b as unknown as ServiceBooking); setSelectedWorker(''); }}>
                Assign Worker
              </Button>
            </div>
          )}
        />
      )}

      {/* Create Booking Modal */}
      <FormModal
        open={showCreateForm}
        title="Create Booking"
        onClose={() => setShowCreateForm(false)}
        onSubmit={handleCreate}
        submitLabel={createMutation.isPending ? 'Creating...' : 'Create Booking'}
        submitDisabled={createMutation.isPending}
      >
        <div className="space-y-4">
          <Select
            label="Service Item *"
            options={itemOptions}
            value={form.service_item_id}
            onChange={(e) => setForm((p) => ({ ...p, service_item_id: e.target.value }))}
          />
          <Input
            label="Customer Name"
            type="text"
            value={form.customer_name}
            onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
            placeholder="Customer name"
          />
          <Input
            label="Customer Phone"
            type="text"
            value={form.customer_phone}
            onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))}
            placeholder="Phone number"
          />
          <Input
            label="Scheduled Date"
            type="date"
            value={form.scheduled_date}
            onChange={(e) => setForm((p) => ({ ...p, scheduled_date: e.target.value }))}
          />
          <Input
            label="Notes"
            type="text"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Additional notes"
          />
        </div>
      </FormModal>

      {/* Assign Worker Modal */}
      {assignTarget && (
        <FormModal
          open
          title="Assign Worker"
          onClose={() => setAssignTarget(null)}
          onSubmit={handleAssign}
          submitLabel={assignMutation.isPending ? 'Assigning...' : 'Assign'}
          submitDisabled={assignMutation.isPending || !selectedWorker}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Booking: <strong>{assignTarget.item_name || ''}</strong> — {assignTarget.customer_name || 'No customer'}
            </p>
            <Select
              label="Select Worker"
              options={staffOptions}
              value={selectedWorker}
              onChange={(e) => setSelectedWorker(e.target.value)}
            />
          </div>
        </FormModal>
      )}
    </Card>
  );
}
