import React, { useState, useMemo, useCallback } from 'react';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useProjectItemsQuery,
  useSaveProjectItemMutation,
  useDeleteProjectItemMutation,
} from '@/hooks/useQueryHooks';
import type { ProjectItem } from '@/lib/api';
import type { Camp } from '@/hooks/useAdminData';

/* ─── Item-type taxonomy (matches backend/src/api/project-items.js ITEM_TYPES) ─── */

const ITEM_TYPE_OPTIONS = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'product', label: 'Product' },
  { value: 'menu_item', label: 'Menu Item' },
  { value: 'service', label: 'Service' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

/** Humanize an item_type wire value for table display. */
function formatItemType(t: string): string {
  if (!t) return '—';
  const known = ITEM_TYPE_OPTIONS.find((o) => o.value === t);
  if (known) return known.label;
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Small inline icons ─── */

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

/* ─── Component ─────────────────────────────────────────────────────── */

interface ProjectItemsPanelProps {
  /** Owning project id (from the drilldown row). */
  projectId: string;
  /** Operation descriptor from the project-type operations manifest (C1). */
  operation?: { label: string; icon: string };
  /**
   * Optional fixed item_type scope — when present the panel edits ONLY that
   * type (no type selector in the form) and the type column is filtered to it.
   */
  itemType?: string;
  /** Sibling-project ids for cross-connection UI (accepted for parity; unused here). */
  campIds?: string[];
  /** Loaded camps list (accepted for parity with sibling panels). */
  camps?: Camp[];
}

interface ItemFormState {
  itemType: string;
  name: string;
  description: string;
  basePrice: string;
  quantity: string;
  status: string;
  metaData: string;
}

const emptyItemForm: ItemFormState = {
  itemType: 'product',
  name: '',
  description: '',
  basePrice: '',
  quantity: '1',
  status: 'active',
  metaData: '',
};

export default function ProjectItemsPanel({
  projectId,
  operation,
  itemType,
}: ProjectItemsPanelProps) {
  const { data: items, isLoading } = useProjectItemsQuery(projectId, itemType);
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyItemForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const saveItemMutation = useSaveProjectItemMutation(editItemId ?? undefined);
  const deleteItemMutation = useDeleteProjectItemMutation();
  const saving = saveItemMutation.isPending;
  const deleting = deleteItemMutation.isPending;

  /** Defense-in-depth on top of the server-side filter: never show a row of another type. */
  const visibleItems = useMemo(() => {
    const all = items ?? [];
    return itemType ? all.filter((i) => i.itemType === itemType) : all;
  }, [items, itemType]);

  const count = visibleItems.length;

  const openAdd = useCallback(() => {
    setEditItemId(null);
    setForm({ ...emptyItemForm, itemType: itemType || 'product' });
    setShowForm(true);
  }, [itemType]);

  const openEdit = useCallback(
    (item: ProjectItem) => {
      let metaText = '';
      if (item.metaData !== undefined && item.metaData !== null) {
        metaText =
          typeof item.metaData === 'string' ? item.metaData : JSON.stringify(item.metaData, null, 2);
      }
      setEditItemId(item.id);
      setForm({
        itemType: item.itemType || itemType || 'product',
        name: item.name || '',
        description: item.description || '',
        basePrice: item.basePrice != null ? String(item.basePrice) : '',
        quantity: item.quantity != null ? String(item.quantity) : '1',
        status: item.status || 'active',
        metaData: metaText,
      });
      setShowForm(true);
    },
    [itemType],
  );

  const closeForm = useCallback(() => {
    if (saving) return;
    setShowForm(false);
    setEditItemId(null);
  }, [saving]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      showToast('Item name is required.', 'warning');
      return;
    }

    let metaData: unknown;
    if (form.metaData.trim()) {
      try {
        metaData = JSON.parse(form.metaData);
      } catch {
        showToast('Meta data must be valid JSON.', 'warning');
        return;
      }
    }

    await saveItemMutation.mutateAsync({
      projectId,
      itemType: itemType || form.itemType || 'product',
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      basePrice: parseFloat(form.basePrice) || 0,
      quantity: parseInt(form.quantity) || 1,
      ...(metaData !== undefined ? { metaData } : {}),
      status: form.status,
    });
    setShowForm(false);
    setEditItemId(null);
    setForm(emptyItemForm);
  }, [form, projectId, itemType, showToast, saveItemMutation]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteItemMutation.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, deleteItemMutation]);

  const title = operation?.label || 'Project Items';
  const addLabel = `Add ${itemType ? formatItemType(itemType) : 'Item'}`;

  return (
    <Card padding="none" className="p-6" data-testid="project-items-panel">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {operation?.icon ? (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-xl"
              aria-hidden="true"
            >
              {operation.icon}
            </span>
          ) : (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-warm-500"
              aria-hidden="true"
            >
              <PlusIcon />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-800 truncate">{title}</h2>
            <p className="text-sm text-gray-500">
              {count} {count === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>
        <Button
          variant="success"
          size="md"
          onClick={openAdd}
          data-testid="add-item-btn"
          leftIcon={<PlusIcon />}
        >
          {addLabel}
        </Button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Manage this project's {operation?.label ? operation.label.toLowerCase() : 'items'} — track
        availability, pricing, and status.
      </p>

      {isLoading ? (
        <LoadingSpinner text="Loading items..." />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title="No items yet"
          description="Add an item to start building this project's inventory."
          action={{ label: addLabel, onClick: openAdd }}
        />
      ) : (
        <div data-testid="project-items-table">
          <DataTable<ProjectItem & Record<string, unknown>>
            columns={[
              {
                key: 'name',
                header: 'Name',
                sortable: true,
                render: (i) => <span className="font-medium text-gray-800">{String(i.name)}</span>,
              },
              {
                key: 'itemType',
                header: 'Type',
                sortable: true,
                render: (i) => <span className="text-gray-600">{formatItemType(String(i.itemType))}</span>,
              },
              {
                key: 'basePrice',
                header: 'Base Price',
                sortable: true,
                render: (i) => {
                  const price = Number(i.basePrice) || 0;
                  return <span className="text-gray-700">${price.toFixed(2)}</span>;
                },
              },
              {
                key: 'quantity',
                header: 'Qty',
                sortable: true,
                render: (i) => <span className="text-gray-700">{String(i.quantity ?? '—')}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (i) => <StatusTag status={String(i.status || 'active')} size="sm" />,
              },
            ]}
            data={visibleItems as (ProjectItem & Record<string, unknown>)[]}
            emptyMessage="No project items found."
            actions={(item) => (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<EditIcon />}
                  onClick={() => openEdit(item)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<TrashIcon />}
                  onClick={() => setDeleteTarget(item.id)}
                  disabled={deleting}
                >
                  Delete
                </Button>
              </div>
            )}
          />
        </div>
      )}

      {/* Add / Edit form */}
      <FormModal
        open={showForm}
        title={editItemId ? 'Edit Item' : 'Add New Item'}
        onClose={closeForm}
        onSubmit={handleSave}
        submitLabel={saving ? 'Saving...' : editItemId ? 'Update Item' : 'Save Item'}
        submitDisabled={saving}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!itemType && (
            <Select
              label="Item Type *"
              options={ITEM_TYPE_OPTIONS}
              value={form.itemType}
              onChange={(e) => setForm((prev) => ({ ...prev, itemType: e.target.value }))}
              placeholder="Select an item type"
            />
          )}
          <Input
            label="Name *"
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Item name"
          />
          <Input
            label="Base Price"
            type="number"
            value={form.basePrice}
            onChange={(e) => setForm((prev) => ({ ...prev, basePrice: e.target.value }))}
            min="0"
            step="0.01"
            placeholder="0.00"
          />
          <Input
            label="Quantity"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
            min="0"
            step="1"
            placeholder="1"
          />
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            placeholder="Select a status"
          />

          <div className="md:col-span-2">
            <label
              htmlFor="item-description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description
            </label>
            <textarea
              id="item-description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Short description (optional)"
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="item-metadata"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Meta Data (JSON)
            </label>
            <textarea
              id="item-metadata"
              value={form.metaData}
              onChange={(e) => setForm((prev) => ({ ...prev, metaData: e.target.value }))}
              placeholder='{"plate": "ABC-123"}'
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
        </div>
      </FormModal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Item"
        message="Are you sure you want to delete this item? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}