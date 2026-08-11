import React, { useState, useCallback } from 'react';
import { useCampsQuery, useSaveCampMutation, useDeleteCampMutation } from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import ListingWizard from './ListingWizard';
import type { Camp } from '@/hooks/useAdminData';

interface CampsPanelProps {
  onRefreshCamps: () => void;
}

interface CampForm {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  capacity: string;
  status: string;
  notes: string;
}

const emptyForm: CampForm = {
  name: '',
  location: '',
  startDate: '',
  endDate: '',
  capacity: '',
  status: 'active',
  notes: '',
};

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'planning', label: 'Planning' },
  { value: 'completed', label: 'Completed' },
];

/**
 * Single-camp admin (B3): a tenant owns exactly one camp. When no camp exists
 * yet the empty state launches the listing wizard (camp + first room type +
 * rate plan in one flow); once a camp exists it is edited in place — there is
 * no "add another camp" button and no wizard entry point.
 */
export default function CampsPanel({ onRefreshCamps }: CampsPanelProps) {
  const { data: camps, isLoading: loading } = useCampsQuery();
  const { showToast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const saveMutation = useSaveCampMutation(editingId ?? undefined);
  const deleteMutation = useDeleteCampMutation();

  const campList = camps ?? [];

  const openEdit = useCallback((camp: Camp) => {
    setEditingId(camp.id);
    setForm({
      name: camp.name || '',
      location: camp.location || '',
      startDate: camp.startDate || '',
      endDate: camp.endDate || '',
      capacity: String(camp.capacity ?? ''),
      status: camp.status || 'active',
      notes: camp.notes || '',
    });
    setShowForm(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      showToast('Camp name is required.', 'warning');
      return;
    }
    if (!form.location.trim()) {
      showToast('Camp location is required.', 'warning');
      return;
    }
    if (form.startDate && form.endDate) {
      if (new Date(form.startDate) >= new Date(form.endDate)) {
        showToast('Start date must be before end date.', 'warning');
        return;
      }
    }

    saveMutation.mutate(
      {
        name: form.name.trim(),
        location: form.location.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        capacity: parseInt(form.capacity) || 0,
        status: form.status as 'active' | 'inactive' | 'completed',
        notes: form.notes.trim(),
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setEditingId(null);
          setForm(emptyForm);
          onRefreshCamps();
        },
      },
    );
  }, [form, editingId, showToast, saveMutation, onRefreshCamps]);

  const handleDelete = useCallback(() => {
    // Defensive guard: the confirm dialog is only rendered when deleteTarget is set,
    // so this branch is unreachable from the UI. Kept for type-safety.
    /* v8 ignore next */
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget, {
      onSuccess: () => {
        setDeleteTarget(null);
        onRefreshCamps();
      },
    });
  }, [deleteTarget, deleteMutation, onRefreshCamps]);

  const updateField = (field: keyof CampForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card padding="none" className="p-6" data-testid="camps-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Camp</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your camp's profile and listing details.</p>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : campList.length === 0 ? (
        <EmptyState
          title="No camp yet"
          description="Create your camp to start managing rooms, rate plans, and reservations."
          action={{ label: 'Create Camp', onClick: () => setShowWizard(true) }}
        />
      ) : (
        <DataTable<Camp & Record<string, unknown>>
          columns={[
            { key: 'name', header: 'Name', sortable: true, render: (c) => <strong>{String(c.name)}</strong> },
            { key: 'location', header: 'Location', sortable: true, render: (c) => String(c.location) },
            {
              key: 'startDate',
              header: 'Dates',
              sortable: true,
              render: (c) => `${String(c.startDate)} → ${String(c.endDate)}`,
            },
            { key: 'capacity', header: 'Capacity', sortable: true, render: (c) => String(c.capacity) },
            { key: 'status', header: 'Status', render: (c) => <StatusTag status={String(c.status)} /> },
          ]}
          data={campList as (Camp & Record<string, unknown>)[]}
          emptyMessage="No camps found."
          actions={(c) => (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(c as unknown as Camp)}
                leftIcon={
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget(c.id as string)}
                leftIcon={
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              >
                Delete
              </Button>
            </div>
          )}
        />
      )}

      <FormModal
        open={showForm}
        title={editingId ? 'Edit Camp' : 'Create Camp'}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        onSubmit={handleSave}
        submitLabel={saveMutation.isPending ? 'Saving...' : editingId ? 'Update Camp' : 'Save Camp'}
        submitDisabled={saveMutation.isPending}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Name *"
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Camp name"
          />
          <Input
            label="Location *"
            type="text"
            value={form.location}
            onChange={(e) => updateField('location', e.target.value)}
            placeholder="Camp location"
          />
          <Input
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={(e) => updateField('startDate', e.target.value)}
          />
          <Input
            label="End Date"
            type="date"
            value={form.endDate}
            onChange={(e) => updateField('endDate', e.target.value)}
          />
          <Input
            label="Capacity"
            type="number"
            value={form.capacity}
            onChange={(e) => updateField('capacity', e.target.value)}
            placeholder="0"
            min="0"
          />
          <Select
            label="Status"
            options={statusOptions}
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          />
          <div className="md:col-span-2">
            <label htmlFor="camp-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              id="camp-notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
              rows={3}
              placeholder="Additional notes..."
            />
          </div>
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Camp"
        message="Delete this camp? This will also remove ALL associated rooms, reservations, staff, expenses, inventory, and plans!"
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ListingWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={onRefreshCamps}
      />
    </Card>
  );
}
