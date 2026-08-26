import React, { useState, useCallback } from 'react';
import type { Promotion } from '@/lib/api';
import { usePromotionsQuery } from '@/hooks/useQueryHooks';
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
import { trackEvent } from '@/lib/plausible';
import * as api from '@/lib/api';

interface PromotionForm {
  name: string;
  type: 'percentage' | 'fixed' | 'bogo';
  value: string;
  applies_to: 'all' | 'category' | 'product';
  applies_to_id: string;
  min_purchase: string;
  day_of_week: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const emptyForm: PromotionForm = {
  name: '',
  type: 'percentage',
  value: '',
  applies_to: 'all',
  applies_to_id: '',
  min_purchase: '',
  day_of_week: '',
  start_date: '',
  end_date: '',
  is_active: true,
};

const typeOptions = [
  { value: 'percentage', label: 'Percentage Off' },
  { value: 'fixed', label: 'Fixed Amount Off' },
  { value: 'bogo', label: 'Buy One Get One Free' },
];

const appliesToOptions = [
  { value: 'all', label: 'All Products' },
  { value: 'category', label: 'Specific Category' },
  { value: 'product', label: 'Specific Product' },
];

const dayOfWeekOptions = [
  { value: '', label: 'Every Day' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PromotionsPanel() {
  const { showToast } = useToast();
  const { data: promos = [], isLoading: loading } = usePromotionsQuery(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((p: Promotion) => {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      type: p.type,
      value: String(p.value ?? ''),
      applies_to: p.applies_to || 'all',
      applies_to_id: p.applies_to_id || '',
      min_purchase: String(p.min_purchase ?? ''),
      day_of_week: p.day_of_week != null ? String(p.day_of_week) : '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      is_active: p.is_active === 1,
    });
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { showToast('Name is required.', 'warning'); return; }
    if ((form.type === 'percentage' || form.type === 'fixed') && (!form.value || parseFloat(form.value) < 0)) {
      showToast('Value must be a non-negative number.', 'warning'); return;
    }
    setSaving(true);
    try {
      const payload: Partial<Promotion> = {
        name: form.name.trim(),
        type: form.type,
        value: parseFloat(form.value) || 0,
        applies_to: form.applies_to,
        applies_to_id: form.applies_to_id || null,
        min_purchase: parseFloat(form.min_purchase) || 0,
        day_of_week: form.day_of_week !== '' ? parseInt(form.day_of_week) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active ? 1 : 0,
      };
      await api.savePromotion(payload, editingId ?? undefined);
      showToast(editingId ? 'Promotion updated.' : 'Promotion created.', 'success');
      trackEvent('Tenant: Promotion Updated', { promoId: editingId ?? 'new' });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [form, editingId, showToast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePromotion(deleteTarget.id);
      showToast('Promotion deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast]);

  const formatValue = useCallback((p: Promotion) => {
    if (p.type === 'percentage') return `${p.value}%`;
    if (p.type === 'fixed') return formatCurrency(p.value);
    return 'BOGO';
  }, []);

  const formatApplies = useCallback((p: Promotion) => {
    if (p.applies_to === 'all') return 'All Products';
    if (p.applies_to === 'category') return `Category: ${p.applies_to_id}`;
    return `Product: ${p.applies_to_id}`;
  }, []);

  const formatSchedule = useCallback((p: Promotion) => {
    const parts: string[] = [];
    if (p.day_of_week != null) parts.push(DAYS[p.day_of_week] ?? `Day ${p.day_of_week}`);
    if (p.start_date) parts.push(`From ${p.start_date}`);
    if (p.end_date) parts.push(`Until ${p.end_date}`);
    return parts.length > 0 ? parts.join(', ') : 'Every day';
  }, []);

  return (
    <Card padding="none" className="p-6" data-testid="promotions-panel" aria-busy={loading || undefined}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Promotions</h2>
        <Button
          variant="success"
          size="md"
          onClick={openAdd}
          data-testid="add-promotion-btn"
          leftIcon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Add Promotion
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Create discounts, percentage-offs, and buy-one-get-one promotions that apply at POS checkout.
      </p>
      {loading ? (
        <LoadingSpinner text="Loading promotions..." />
      ) : promos.length === 0 ? (
        <EmptyState
          title="No promotions yet"
          description="Create your first promotion to offer discounts at checkout."
          action={{ label: 'Add Promotion', onClick: openAdd }}
        />
      ) : (
        <DataTable<Promotion & Record<string, unknown>>
          columns={[
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              render: (p) => (
                <div>
                  <strong className="text-gray-900">{String(p.name)}</strong>
                  <div className="text-xs text-gray-500 mt-0.5">{formatApplies(p as unknown as Promotion)}</div>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              sortable: true,
              render: (p) => <Badge variant="info" size="sm">{String(p.type).toUpperCase()}</Badge>,
            },
            {
              key: 'value',
              header: 'Value',
              sortable: true,
              render: (p) => <span className="font-medium text-gray-900">{formatValue(p as unknown as Promotion)}</span>,
            },
            {
              key: 'min_purchase',
              header: 'Min Purchase',
              render: (p) => Number(p.min_purchase) > 0 ? formatCurrency(Number(p.min_purchase)) : '-',
            },
            {
              key: 'schedule',
              header: 'Schedule',
              render: (p) => <span className="text-sm text-gray-600">{formatSchedule(p as unknown as Promotion)}</span>,
            },
            {
              key: 'is_active',
              header: 'Status',
              render: (p) => (
                <Badge variant={Number(p.is_active) === 1 ? 'success' : 'neutral'} dot size="sm">
                  {Number(p.is_active) === 1 ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
          ]}
          data={promos as (Promotion & Record<string, unknown>)[]}
          emptyMessage="No promotions configured."
          actions={(p) => (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(p as unknown as Promotion)}
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
                onClick={() => setDeleteTarget(p as unknown as Promotion)}
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

      {/* ── Create / Edit Form ─────────────────────────────── */}
      <FormModal
        open={showForm}
        title={editingId ? 'Edit Promotion' : 'Add Promotion'}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        onSubmit={handleSave}
        submitLabel={saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
        submitDisabled={saving}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Name *"
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Summer Sale 20%"
            />
          </div>
          <Select
            label="Type *"
            options={typeOptions}
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as PromotionForm['type'] }))}
          />
          <Input
            label={form.type === 'bogo' ? 'Value (auto-calculated)' : form.type === 'percentage' ? 'Percentage *' : 'Amount Off *'}
            type="number"
            value={form.type === 'bogo' ? '0' : form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            min="0"
            step={form.type === 'percentage' ? '1' : '0.01'}
            disabled={form.type === 'bogo'}
            placeholder={form.type === 'percentage' ? 'e.g. 10' : form.type === 'fixed' ? 'e.g. 5.00' : ''}
          />
          <Select
            label="Applies To"
            options={appliesToOptions}
            value={form.applies_to}
            onChange={(e) => setForm((p) => ({ ...p, applies_to: e.target.value as PromotionForm['applies_to'] }))}
          />
          {form.applies_to !== 'all' && (
            <Input
              label={form.applies_to === 'category' ? 'Category ID' : 'Product ID'}
              type="text"
              value={form.applies_to_id}
              onChange={(e) => setForm((p) => ({ ...p, applies_to_id: e.target.value }))}
              placeholder={form.applies_to === 'category' ? 'e.g. cat_desserts' : 'e.g. prod_coke'}
            />
          )}
          <Input
            label="Min Purchase ($)"
            type="number"
            value={form.min_purchase}
            onChange={(e) => setForm((p) => ({ ...p, min_purchase: e.target.value }))}
            min="0"
            step="0.01"
            placeholder="0 = no minimum"
          />
          <Select
            label="Day of Week"
            options={dayOfWeekOptions}
            value={form.day_of_week}
            onChange={(e) => setForm((p) => ({ ...p, day_of_week: e.target.value }))}
          />
          <Input
            label="Start Date"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
          />
          <Input
            label="End Date"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
          />
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>
        </div>
      </FormModal>

      {/* ── Delete Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Promotion"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
