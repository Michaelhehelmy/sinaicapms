import React, { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { Meal, MealCategory, Camp } from '@/hooks/useAdminData';
import { useMealsQuery, useMealCategoriesQuery, queryKeys } from '@/hooks/useQueryHooks';
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
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { bulkCreateMeals } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface MenuPanelProps {
  campIds: string[];
  camps: Camp[];
}

interface MealForm {
  name: string;
  mealCategoryId: string;
  price: string;
  description: string;
  imageUrl: string;
  isActive: number;
}

interface BulkMealRow {
  name: string;
  mealCategoryId: string;
  price: string;
  description: string;
}

const emptyMealForm: MealForm = {
  name: '',
  mealCategoryId: '',
  price: '',
  description: '',
  imageUrl: '',
  isActive: 1,
};

const emptyBulkMealRow = (): BulkMealRow => ({
  name: '',
  mealCategoryId: '',
  price: '',
  description: '',
});

const statusOptions = [
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

export default function MenuPanel({ campIds, camps }: MenuPanelProps) {
  const queryClient = useQueryClient();
  const { data: mealsData, isLoading: loadingMeals } = useMealsQuery();
  const meals = mealsData ?? [];
  const { data: catsData, isLoading: loadingCats } = useMealCategoriesQuery();
  const mealCategories = catsData ?? [];
  // Phase 6: refresh = invalidate the ['admin', ...] concern in the TanStack cache.
  const refreshMeals = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.meals }),
    [queryClient],
  );
  const refreshCats = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.mealCategories }),
    [queryClient],
  );
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<'meals' | 'categories'>('meals');
  const [showMealForm, setShowMealForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editMealId, setEditMealId] = useState<string | null>(null);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);
  const [catName, setCatName] = useState('');
  const [catPosition, setCatPosition] = useState('0');
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkMealRow[]>(Array.from({ length: 5 }, emptyBulkMealRow));
  const [bulkSaving, setBulkSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'meal' | 'category'; id: string } | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');

  const catMap = useMemo(() => {
    const map: Record<string, string> = {};
    (mealCategories ?? []).forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [mealCategories]);

  const filteredMeals = useMemo(() => {
    if (filterCategory === 'all') return meals ?? [];
    return (meals ?? []).filter((m) => m.mealCategoryId === filterCategory);
  }, [meals, filterCategory]);

  const mealsByCategory = useMemo(() => {
    const groups: Record<string, Meal[]> = {};
    (mealCategories ?? []).forEach((c) => { groups[c.id] = []; });
    (meals ?? []).forEach((m) => {
      const catId = m.mealCategoryId || 'uncategorized';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(m);
    });
    return groups;
  }, [meals, mealCategories]);

  const openAddMeal = useCallback(() => {
    setEditMealId(null);
    setMealForm(emptyMealForm);
    setShowMealForm(true);
  }, []);

  const openEditMeal = useCallback((m: Meal) => {
    setEditMealId(m.id);
    setMealForm({
      name: m.name || '',
      mealCategoryId: m.mealCategoryId || '',
      price: String(m.price ?? ''),
      description: m.description || '',
      imageUrl: m.imageUrl || '',
      isActive: m.isActive ?? 1,
    });
    setShowMealForm(true);
  }, []);

  const addBulkRow = useCallback(() => {
    setBulkRows((prev) => [...prev, emptyBulkMealRow()]);
  }, []);

  const removeBulkRow = useCallback((index: number) => {
    setBulkRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateBulkRow = useCallback((index: number, patch: Partial<BulkMealRow>) => {
    setBulkRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const openBulkAdd = useCallback(() => {
    setBulkRows(Array.from({ length: 5 }, emptyBulkMealRow));
    setShowBulkForm(true);
  }, []);

  const handleSaveBulk = useCallback(async () => {
    const items = bulkRows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        mealCategoryId: r.mealCategoryId || undefined,
        price: parseFloat(r.price) || 0,
        description: r.description.trim() || undefined,
      }));
    if (items.length === 0) {
      showToast('Fill in at least one meal name.', 'warning');
      return;
    }
    setBulkSaving(true);
    try {
      const res = await bulkCreateMeals(items);
      showToast(`${res.count} meal${res.count === 1 ? '' : 's'} created.`, 'success');
      setShowBulkForm(false);
      refreshMeals();
      refreshCats();
    } catch (err) {
      showToast('Bulk create failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setBulkSaving(false);
    }
  }, [bulkRows, showToast, refreshMeals, refreshCats]);

  const handleSaveMeal = useCallback(async () => {
    if (!mealForm.name.trim()) {
      showToast('Meal name is required.', 'warning');
      return;
    }
    if (!mealForm.mealCategoryId) {
      showToast('Category is required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await api.saveMeal({
        name: mealForm.name.trim(),
        mealCategoryId: mealForm.mealCategoryId,
        price: parseFloat(mealForm.price) || 0,
        description: mealForm.description.trim() || undefined,
        imageUrl: mealForm.imageUrl.trim() || undefined,
        isActive: mealForm.isActive,
      }, editMealId ?? undefined);
      showToast(editMealId ? 'Meal updated.' : 'Meal created.', 'success');
      setShowMealForm(false);
      setEditMealId(null);
      setMealForm(emptyMealForm);
      refreshMeals();
    } catch (err) {
      showToast('Error saving meal: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [mealForm, editMealId, showToast, refreshMeals]);

  const handleSaveCat = useCallback(async () => {
    if (!catName.trim()) {
      showToast('Category name is required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await api.saveMealCategory(
        { name: catName.trim(), position: parseInt(catPosition) || 0 },
        editCatId ?? undefined,
      );
      showToast(editCatId ? 'Category updated.' : 'Category created.', 'success');
      setShowCatForm(false);
      setEditCatId(null);
      setCatName('');
      setCatPosition('0');
      refreshCats();
    } catch (err) {
      showToast('Error saving category: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [catName, editCatId, showToast, refreshCats]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'meal') {
        await api.deleteMeal(deleteTarget.id);
        showToast('Meal deleted.', 'success');
        refreshMeals();
      } else {
        await api.deleteMealCategory(deleteTarget.id);
        showToast('Category deleted.', 'success');
        refreshCats();
      }
      setDeleteTarget(null);
    } catch (err) {
      showToast('Error deleting: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast, refreshMeals, refreshCats]);

  const loading = loadingMeals || loadingCats;

  const categoryOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Categories' },
      ...(mealCategories ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    ];
  }, [mealCategories]);

  const mealCategorySelectOptions = useMemo(() => {
    return (mealCategories ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    }));
  }, [mealCategories]);

  return (
    <Card padding="none" className="p-6" data-testid="menu-panel">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">Menu Management</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveSection('meals')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer border-none transition-colors ${
                activeSection === 'meals' ? 'bg-white text-gray-900 shadow-xs' : 'bg-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Meals
            </button>
            <button
              onClick={() => setActiveSection('categories')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer border-none transition-colors ${
                activeSection === 'categories' ? 'bg-white text-gray-900 shadow-xs' : 'bg-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Categories
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeSection === 'meals' && (
            <Button
              variant="secondary"
              size="md"
              onClick={openBulkAdd}
              data-testid="bulk-add-meals-btn"
              leftIcon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            >
              Bulk Add
            </Button>
          )}
          <Button
            variant="success"
            size="md"
            onClick={activeSection === 'meals' ? openAddMeal : () => { setEditCatId(null); setCatName(''); setCatPosition('0'); setShowCatForm(true); }}
          >
            {activeSection === 'meals' ? 'Add Meal' : 'Add Category'}
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading menu..." />
      ) : activeSection === 'meals' ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <label className="text-sm font-medium text-gray-600">Filter by category:</label>
            <Select
              options={categoryOptions}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            />
          </div>

          {filteredMeals.length === 0 ? (
            <EmptyState
              title="No meals found"
              description="Add your first meal to start building your menu."
              action={{ label: 'Add Meal', onClick: openAddMeal }}
            />
          ) : (
            <DataTable<Meal & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (m) => <strong>{String(m.name)}</strong> },
                {
                  key: 'mealCategoryId',
                  header: 'Category',
                  render: (m) => (
                    <Badge variant="info" size="sm">
                      {catMap[String(m.mealCategoryId)] ?? 'Uncategorized'}
                    </Badge>
                  ),
                },
                {
                  key: 'price',
                  header: 'Price',
                  sortable: true,
                  render: (m) => formatCurrency(Number(m.price || 0)),
                },
                { key: 'description', header: 'Description', render: (m) => String(m.description || '') },
                {
                  key: 'isActive',
                  header: 'Status',
                  render: (m) => <StatusTag status={Number(m.isActive) === 1 ? 'active' : 'inactive'} />,
                },
              ]}
              data={filteredMeals as (Meal & Record<string, unknown>)[]}
              emptyMessage="No meals found."
              actions={(m) => (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditMeal(m as unknown as Meal)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget({ type: 'meal', id: m.id as string })}
                  >
                    Del
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      ) : (
        <div>
          {(mealCategories ?? []).length === 0 ? (
            <EmptyState
              title="No categories yet"
              description="Create a category to organize your menu items."
              action={{ label: 'Add Category', onClick: () => { setEditCatId(null); setCatName(''); setShowCatForm(true); } }}
            />
          ) : (
            <DataTable<MealCategory & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (c) => <strong>{String(c.name)}</strong> },
                { key: 'position', header: 'Position', sortable: true, render: (c) => String(c.position || 0) },
                {
                  key: 'id',
                  header: 'Meals',
                  render: (c) => String((mealsByCategory[c.id as string] || []).length),
                },
              ]}
              data={mealCategories as (MealCategory & Record<string, unknown>)[]}
              emptyMessage="No categories found."
              actions={(c) => (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditCatId(c.id as string);
                      setCatName(String(c.name));
                      setCatPosition(String(c.position ?? 0));
                      setShowCatForm(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget({ type: 'category', id: c.id as string })}
                  >
                    Del
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      )}

      <FormModal
        open={showMealForm}
        title={editMealId ? 'Edit Meal' : 'Add New Meal'}
        onClose={() => { setShowMealForm(false); setEditMealId(null); }}
        onSubmit={handleSaveMeal}
        submitLabel={saving ? 'Saving...' : editMealId ? 'Update Meal' : 'Save Meal'}
        submitDisabled={saving}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Name *"
            type="text"
            value={mealForm.name}
            onChange={(e) => setMealForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Meal name"
          />
          <Select
            label="Category *"
            options={mealCategorySelectOptions}
            value={mealForm.mealCategoryId}
            placeholder="Select Category"
            onChange={(e) => setMealForm((prev) => ({ ...prev, mealCategoryId: e.target.value }))}
          />
          <Input
            label="Price"
            type="number"
            value={mealForm.price}
            onChange={(e) => setMealForm((prev) => ({ ...prev, price: e.target.value }))}
            min="0"
            step="0.01"
          />
          <Input
            label="Image URL"
            type="text"
            value={mealForm.imageUrl}
            onChange={(e) => setMealForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
            placeholder="https://..."
          />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={mealForm.description}
              onChange={(e) => setMealForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <Select
              label="Status"
              options={statusOptions}
              value={String(mealForm.isActive)}
              onChange={(e) => setMealForm((prev) => ({ ...prev, isActive: parseInt(e.target.value) }))}
            />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={showBulkForm}
        title="Bulk Add Menu Items"
        onClose={() => { setShowBulkForm(false); }}
        onSubmit={handleSaveBulk}
        submitLabel={bulkSaving ? 'Creating...' : `Create ${bulkRows.filter((r) => r.name.trim()).length || 0} Meals`}
        submitDisabled={bulkSaving}
        size="lg"
      >
        <p className="text-sm text-gray-500 mb-4">
          Add multiple menu items at once. Name is required; leave unused rows blank — they are skipped.
        </p>
        <div className="space-y-3" data-testid="bulk-meal-rows">
          {bulkRows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-start rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              <div className="col-span-4">
                <Input
                  aria-label={`Meal ${idx + 1} name`}
                  type="text"
                  value={row.name}
                  onChange={(e) => updateBulkRow(idx, { name: e.target.value })}
                  placeholder="Name *"
                  data-testid={`bulk-meal-name-${idx}`}
                />
              </div>
              <div className="col-span-3">
                <Select
                  aria-label={`Meal ${idx + 1} category`}
                  options={mealCategorySelectOptions}
                  value={row.mealCategoryId}
                  placeholder="Category"
                  onChange={(e) => updateBulkRow(idx, { mealCategoryId: e.target.value })}
                  data-testid={`bulk-meal-cat-${idx}`}
                />
              </div>
              <div className="col-span-2">
                <Input
                  aria-label={`Meal ${idx + 1} price`}
                  type="number"
                  value={row.price}
                  onChange={(e) => updateBulkRow(idx, { price: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="Price"
                  data-testid={`bulk-meal-price-${idx}`}
                />
              </div>
              <div className="col-span-2">
                <Input
                  aria-label={`Meal ${idx + 1} description`}
                  type="text"
                  value={row.description}
                  onChange={(e) => updateBulkRow(idx, { description: e.target.value })}
                  placeholder="Description"
                />
              </div>
              <div className="col-span-1">
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Remove meal ${idx + 1}`}
                  onClick={() => removeBulkRow(idx)}
                  disabled={bulkRows.length <= 1}
                >
                  —
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-start">
          <Button type="button" variant="secondary" size="md" onClick={addBulkRow} data-testid="add-bulk-meal-row-btn">
            + Add Row
          </Button>
        </div>
      </FormModal>

      <FormModal
        open={showCatForm}
        title={editCatId ? 'Edit Category' : 'Add New Category'}
        onClose={() => { setShowCatForm(false); setEditCatId(null); setCatPosition('0'); }}
        onSubmit={handleSaveCat}
        submitLabel={saving ? 'Saving...' : editCatId ? 'Update Category' : 'Save Category'}
        submitDisabled={saving}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Category Name *"
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Appetizers, Main Course, Desserts"
            />
          </div>
          <Input
            label="Position"
            type="number"
            value={catPosition}
            onChange={(e) => setCatPosition(e.target.value)}
            min="0"
            placeholder="0"
          />
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === 'meal' ? 'Meal' : 'Category'}`}
        message={`Are you sure you want to delete this ${deleteTarget?.type === 'meal' ? 'meal' : 'category'}?`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
