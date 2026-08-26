import React, { useState, useMemo, useCallback } from 'react';
import type { Camp } from '@/hooks/useAdminData';
import { useProductsQuery, useRatePlansQuery, useSaveRatePlanMutation, useDeleteRatePlanMutation } from '@/hooks/useQueryHooks';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatCurrency } from '@/lib/utils';
import { trackEvent } from '@/lib/plausible';

interface RatePlan {
  id: string;
  campId?: string;
  name: string;
  productId: string;
  pricePerNight: number;
  minStay: number;
  isActive: number;
  startDate: string | null;
  endDate: string | null;
  season: string;
  [key: string]: unknown;
}

interface RatePlansPanelProps {
  campIds: string[];
  camps: Camp[];
}

interface PlanForm {
  name: string;
  productId: string;
  pricePerNight: string;
  minStay: string;
  startDate: string;
  endDate: string;
  season: string;
}

const emptyForm: PlanForm = { name: '', productId: '', pricePerNight: '', minStay: '1', startDate: '', endDate: '', season: 'all' };

const seasonOptions = [
  { value: 'all', label: 'All Seasons' },
  { value: 'peak', label: 'Peak' },
  { value: 'off', label: 'Off-Peak' },
];

export default function RatePlansPanel({ campIds, camps }: RatePlansPanelProps) {
  const { showToast } = useToast();
  const { data: products, isLoading: productsLoading } = useProductsQuery();
  const { data: plansData, isLoading: plansLoading, error: plansError } = useRatePlansQuery();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const saveMutation = useSaveRatePlanMutation(editingId ?? undefined);
  const deleteMutation = useDeleteRatePlanMutation();

  const plans = useMemo(() => (plansData ?? []) as RatePlan[], [plansData]);
  const loading = plansLoading || productsLoading;

  React.useEffect(() => {
    if (plansError) {
      showToast('Failed to load rate plans: ' + (plansError instanceof Error ? plansError.message : String(plansError)), 'error');
    }
  }, [plansError, showToast]);

  const filtered = useMemo(() => plans.filter((p) => !p.campId || campIds.includes(p.campId)), [plans, campIds]);

  const productSelectOptions = useMemo(
    () => (products ?? []).map((p: { id: string; name: string }) => ({ value: p.id, label: p.name })),
    [products],
  );

  const openAdd = useCallback(() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }, []);
  const openEdit = useCallback((p: RatePlan) => {
    setEditingId(p.id);
    setForm({ name: p.name || '', productId: p.productId || '', pricePerNight: String(p.pricePerNight ?? ''), minStay: String(p.minStay ?? 1), startDate: p.startDate || '', endDate: p.endDate || '', season: p.season || 'all' });
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { showToast('Name is required.', 'warning'); return; }
    if (!form.productId) { showToast('Product is required.', 'warning'); return; }
    try {
      const saved = await saveMutation.mutateAsync({ name: form.name.trim(), productId: form.productId, pricePerNight: parseFloat(form.pricePerNight) || 0, minStay: parseInt(form.minStay) || 1, startDate: form.startDate || undefined, endDate: form.endDate || undefined, season: form.season, isActive: 1 } as never);
      trackEvent('Tenant: Price Updated', { productId: form.productId, planId: (saved as { id?: string })?.id ?? editingId });
      showToast(editingId ? 'Plan updated.' : 'Plan created.', 'success');
      setShowForm(false); setEditingId(null); setForm(emptyForm);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [form, editingId, showToast, saveMutation]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget);
      showToast('Deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, deleteMutation, showToast]);

  if (loading) return <LoadingSpinner text="Loading rate plans..." />;

  return (
    <Card padding="none" className="p-6" data-testid="rate-plans-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Rate Plans</h2>
        <Button
          variant="success"
          size="md"
          onClick={openAdd}
          data-testid="add-rateplan-btn"
          leftIcon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Add Plan
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Set seasonal pricing per room type to manage rates effectively across seasons.</p>
      {filtered.length === 0 ? (
        <EmptyState
          title="No rate plans yet"
          description="Create your first rate plan to define pricing for your accommodations."
          action={{ label: 'Add Plan', onClick: openAdd }}
        />
      ) : (
        <DataTable<RatePlan & Record<string, unknown>>
          columns={[
            { key: 'name', header: 'Name', sortable: true, render: (p) => <strong>{String(p.name)}</strong> },
            { key: 'campId', header: 'Camp', render: (p) => camps.find((c) => c.id === String(p.campId))?.name ?? 'N/A' },
            { key: 'pricePerNight', header: 'Price', sortable: true, render: (p) => formatCurrency(parseFloat(String(p.pricePerNight || 0))) },
            { key: 'minStay', header: 'Min Stay', render: (p) => String(p.minStay) },
            { key: 'season', header: 'Season', render: (p) => <Badge variant="info" size="sm">{String(p.season || 'all')}</Badge> },
            { key: 'isActive', header: 'Status', render: (p) => <Badge variant={Number(p.isActive) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(p.isActive) === 1 ? 'Active' : 'Inactive'}</Badge> },
          ]}
          data={filtered as (RatePlan & Record<string, unknown>)[]}
          emptyMessage="No rate plans configured."
          actions={(p) => (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(p as unknown as RatePlan)}
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
                onClick={() => setDeleteTarget(p.id as string)}
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
      <FormModal open={showForm} title={editingId ? 'Edit Rate Plan' : 'Add Rate Plan'} onClose={() => { setShowForm(false); setEditingId(null); }} onSubmit={handleSave} submitLabel={saveMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Save'} submitDisabled={saveMutation.isPending}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Name *"
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Select
            label="Product *"
            options={productSelectOptions}
            value={form.productId}
            onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))}
            placeholder="Select Product"
          />
          <Input
            label="Price Per Night"
            type="number"
            value={form.pricePerNight}
            onChange={(e) => setForm((p) => ({ ...p, pricePerNight: e.target.value }))}
            min="0"
            step="0.01"
          />
          <Select
            label="Season"
            options={seasonOptions}
            value={form.season}
            onChange={(e) => setForm((p) => ({ ...p, season: e.target.value }))}
          />
          <Input
            label="Min Stay (nights)"
            type="number"
            value={form.minStay}
            onChange={(e) => setForm((p) => ({ ...p, minStay: e.target.value }))}
            min="1"
          />
          <Input
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
          <Input
            label="End Date"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </div>
      </FormModal>
      <ConfirmDialog open={!!deleteTarget} title="Delete Rate Plan" message="Are you sure you want to delete this rate plan?" confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </Card>
  );
}
