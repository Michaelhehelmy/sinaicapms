import React, { useState, useMemo, useCallback } from 'react';
import * as api from '@/lib/api';
import { useMeals, useMealCategories, useCamps, type Meal, type MealCategory, type Camp } from '@/hooks/useAdminData';
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

const emptyMealForm: MealForm = {
  name: '',
  mealCategoryId: '',
  price: '',
  description: '',
  imageUrl: '',
  isActive: 1,
};

const statusOptions = [
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

export default function MenuPanel({ campIds, camps }: MenuPanelProps) {
  const { data: meals, loading: loadingMeals, refresh: refreshMeals } = useMeals();
  const { data: mealCategories, loading: loadingCats, refresh: refreshCats } = useMealCategories();
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<'meals' | 'categories'>('meals');
  const [showMealForm, setShowMealForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editMealId, setEditMealId] = useState<string | null>(null);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);
  const [catName, setCatName] = useState('');
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
        id: editMealId ?? undefined,
        name: mealForm.name.trim(),
        mealCategoryId: mealForm.mealCategoryId,
        price: parseFloat(mealForm.price) || 0,
        description: mealForm.description.trim() || undefined,
        imageUrl: mealForm.imageUrl.trim() || undefined,
        isActive: mealForm.isActive,
      });
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
        { name: catName.trim() },
        editCatId ?? undefined,
      );
      showToast(editCatId ? 'Category updated.' : 'Category created.', 'success');
      setShowCatForm(false);
      setEditCatId(null);
      setCatName('');
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
        <Button
          variant="success"
          size="md"
          onClick={activeSection === 'meals' ? openAddMeal : () => { setEditCatId(null); setCatName(''); setShowCatForm(true); }}
        >
          {activeSection === 'meals' ? 'Add Meal' : 'Add Category'}
        </Button>
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
        open={showCatForm}
        title={editCatId ? 'Edit Category' : 'Add New Category'}
        onClose={() => { setShowCatForm(false); setEditCatId(null); }}
        onSubmit={handleSaveCat}
        submitLabel={saving ? 'Saving...' : editCatId ? 'Update Category' : 'Save Category'}
        submitDisabled={saving}
      >
        <div>
          <Input
            label="Category Name *"
            type="text"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="e.g. Appetizers, Main Course, Desserts"
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
