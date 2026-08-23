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
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';

interface MealsPanelProps {
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

const mealStatusOptions = [
  { value: '1', label: 'Active' },
  { value: '0', label: 'Inactive' },
];

export default function MealsPanel({ campIds, camps }: MealsPanelProps) {
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

  const [showMealForm, setShowMealForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editMealId, setEditMealId] = useState<string | null>(null);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);
  const [catName, setCatName] = useState('');
  const [activeSection, setActiveSection] = useState<'meals' | 'categories'>('meals');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'meal' | 'category'; id: string } | null>(null);

  const catMap = useMemo(() => {
    const map: Record<string, string> = {};
    (mealCategories ?? []).forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [mealCategories]);

  const categorySelectOptions = useMemo(
    () => (mealCategories ?? []).map((c) => ({ value: c.id, label: c.name })),
    [mealCategories],
  );

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

  return (
    <Card padding="none" className="p-6" data-testid="meals-panel" aria-busy={loading || undefined}>
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-xl font-bold text-gray-800">Menu Meals</h2>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <Button
            variant={activeSection === 'meals' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('meals')}
          >
            Meals
          </Button>
          <Button
            variant={activeSection === 'categories' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('categories')}
          >
            Categories
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">Manage your kitchen menu — track ingredients, selling prices, and profit margin for each meal.</p>

      {loading ? (
        <LoadingSpinner text="Loading meals..." />
      ) : activeSection === 'meals' ? (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              variant="success"
              size="md"
              onClick={openAddMeal}
              data-testid="add-meal-btn"
              leftIcon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Meal
            </Button>
          </div>
          {meals?.length === 0 ? (
            <EmptyState
              title="No meals yet"
              description="Add your first meal to build your camp menu."
              action={{ label: 'Add Meal', onClick: openAddMeal }}
            />
          ) : (
            <div data-testid="meals-list">
            <DataTable<Meal & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (m) => <strong>{String(m.name)}</strong> },
                {
                  key: 'mealCategoryId',
                  header: 'Category',
                  render: (m) => catMap[String(m.mealCategoryId)] ?? 'Uncategorized',
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
                  header: 'Active',
                  render: (m) => <StatusTag status={Number(m.isActive) === 1 ? 'active' : 'inactive'} />,
                },
              ]}
              data={meals as (Meal & Record<string, unknown>)[]}
              emptyMessage="No meals found."
              actions={(m) => (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditMeal(m as unknown as Meal)}
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
                    onClick={() => setDeleteTarget({ type: 'meal', id: m.id as string })}
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
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              variant="success"
              size="md"
              onClick={() => { setEditCatId(null); setCatName(''); setShowCatForm(true); }}
              leftIcon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Category
            </Button>
          </div>
          {mealCategories?.length === 0 ? (
            <EmptyState
              title="No categories yet"
              description="Create categories to organize your meals (e.g. Appetizers, Main Course)."
              action={{ label: 'Add Category', onClick: () => { setEditCatId(null); setCatName(''); setShowCatForm(true); } }}
            />
          ) : (
            <DataTable<MealCategory & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (c) => <strong>{String(c.name)}</strong> },
                { key: 'position', header: 'Position', sortable: true, render: (c) => String(c.position || 0) },
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
                    onClick={() => setDeleteTarget({ type: 'category', id: c.id as string })}
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
            options={categorySelectOptions}
            value={mealForm.mealCategoryId}
            onChange={(e) => setMealForm((prev) => ({ ...prev, mealCategoryId: e.target.value }))}
            placeholder="Select Category"
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
              options={mealStatusOptions}
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
        <Input
          label="Category Name *"
          type="text"
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          placeholder="e.g. Appetizers, Main Course, Desserts"
        />
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
