import React, { useState, useMemo, useCallback } from 'react';
import * as api from '@/lib/api';
import { usePlans, useCamps, type Plan, type Camp } from '@/hooks/useAdminData';
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
import { formatDate } from '@/lib/utils';

interface PlanningPanelProps {
  campIds: string[];
  camps: Camp[];
}

interface PlanForm {
  campId: string;
  name: string;
  description: string;
  date: string;
  time: string;
  capacity: string;
  status: string;
  category: string;
}

const emptyPlanForm: PlanForm = {
  campId: '',
  name: '',
  description: '',
  date: '',
  time: '',
  capacity: '',
  status: 'upcoming',
  category: '',
};

const PLAN_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];

const planStatusOptions = PLAN_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

const filterStatusOptions = [
  { value: 'all', label: 'All Statuses' },
  ...planStatusOptions,
];

export default function PlanningPanel({ campIds, camps }: PlanningPanelProps) {
  const { data: plans, loading, refresh } = usePlans();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlanForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredPlans = useMemo(() => {
    let result = (plans ?? []).filter((p) => campIds.includes(p.campId));
    if (filterStatus !== 'all') {
      result = result.filter((p) => p.status === filterStatus);
    }
    return result.sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      return da.localeCompare(db);
    });
  }, [plans, campIds, filterStatus]);

  const campNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    camps.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [camps]);

  const campSelectOptions = useMemo(
    () => camps.map((c) => ({ value: c.id, label: c.name })),
    [camps],
  );

  const openAdd = useCallback(() => {
    setEditId(null);
    setForm(emptyPlanForm);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((p: Plan) => {
    setEditId(p.id);
    setForm({
      campId: p.campId || '',
      name: p.name || '',
      description: p.description || '',
      date: p.date || '',
      time: p.time || '',
      capacity: String(p.capacity ?? ''),
      status: p.status || 'upcoming',
      category: p.category || '',
    });
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.campId || !form.name.trim()) {
      showToast('Camp and plan name are required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await api.savePlan({
        id: editId ?? undefined,
        campId: form.campId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        date: form.date || undefined,
        time: form.time || undefined,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        status: form.status,
        category: form.category.trim() || undefined,
      });
      showToast(editId ? 'Plan updated.' : 'Plan created.', 'success');
      setShowForm(false);
      setEditId(null);
      setForm(emptyPlanForm);
      refresh();
    } catch (err) {
      showToast('Error saving plan: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [form, editId, showToast, refresh]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePlan(deleteTarget.id);
      showToast('Plan deleted.', 'success');
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      showToast('Error deleting plan: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast, refresh]);

  return (
    <Card padding="none" className="p-6" data-testid="planning-panel" aria-busy={loading || undefined}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Camp Planning</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <Button
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              List
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
            >
              Calendar
            </Button>
          </div>
          <Button
            variant="success"
            size="md"
            onClick={openAdd}
            data-testid="add-plan-btn"
            leftIcon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Add Plan
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">Plan activities and events with a schedule and calendar — set dates, times, and titles for each activity.</p>

      <div className="flex items-center gap-2 mb-4">
        <Select
          options={filterStatusOptions}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        />
      </div>

      {loading ? (
        <LoadingSpinner text="Loading plans..." />
      ) : filteredPlans.length === 0 ? (
        <EmptyState
          title="No plans yet"
          description="Create your first camp plan to organize activities, meals, and events."
          action={{ label: 'Add Plan', onClick: openAdd }}
        />
      ) : viewMode === 'list' ? (
        <DataTable<Plan & Record<string, unknown>>
          columns={[
            { key: 'name', header: 'Name', sortable: true, render: (p) => <strong>{String(p.name)}</strong> },
            {
              key: 'campId',
              header: 'Camp',
              render: (p) => campNameMap[String(p.campId)] ?? 'N/A',
            },
            { key: 'date', header: 'Date', sortable: true, render: (p) => p.date ? formatDate(String(p.date)) : '-' },
            { key: 'time', header: 'Time', render: (p) => String(p.time || '-') },
            { key: 'category', header: 'Category', render: (p) => String(p.category || '-') },
            {
              key: 'capacity',
              header: 'Capacity',
              sortable: true,
              render: (p) => String(p.capacity ?? '-'),
            },
            {
              key: 'status',
              header: 'Status',
              render: (p) => <StatusTag status={String(p.status)} />,
            },
          ]}
          data={filteredPlans as (Plan & Record<string, unknown>)[]}
          emptyMessage="No plans found."
          actions={(p) => (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(p as unknown as Plan)}
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
                onClick={() => setDeleteTarget(p as unknown as Plan)}
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
      ) : (
        <CalendarView plans={filteredPlans} onEdit={openEdit} />
      )}

      <FormModal
        open={showForm}
        title={editId ? 'Edit Plan' : 'Add New Plan'}
        onClose={() => { setShowForm(false); setEditId(null); }}
        onSubmit={handleSave}
        submitLabel={saving ? 'Saving...' : editId ? 'Update Plan' : 'Save Plan'}
        submitDisabled={saving}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Camp *"
            options={campSelectOptions}
            value={form.campId}
            onChange={(e) => setForm((prev) => ({ ...prev, campId: e.target.value }))}
            placeholder="Select Camp"
          />
          <Input
            label="Name *"
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Plan name"
          />
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
          />
          <Input
            label="Time"
            type="time"
            value={form.time}
            onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
          />
          <Input
            label="Capacity"
            type="number"
            value={form.capacity}
            onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
            min="0"
          />
          <Select
            label="Status"
            options={planStatusOptions}
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
          />
          <Input
            label="Category"
            type="text"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            placeholder="e.g. Activity, Meal, Meeting"
          />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
              rows={2}
            />
          </div>
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Plan"
        message="Are you sure you want to delete this plan?"
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

function CalendarView({ plans, onEdit }: { plans: Plan[]; onEdit: (p: Plan) => void }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();

  const plansByDate = useMemo(() => {
    const map: Record<string, Plan[]> = {};
    plans.forEach((p) => {
      if (p.date) {
        const key = p.date.slice(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push(p);
      }
    });
    return map;
  }, [plans]);

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const d = new Date(year, month, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="min-h-[80px]" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayPlans = plansByDate[dateStr] || [];
    cells.push(
      <div key={day} className="min-h-[80px] border border-gray-100 rounded-lg p-1.5 hover:bg-gray-50 transition-colors">
        <div className="text-xs font-medium text-gray-500 mb-1">{day}</div>
        {dayPlans.slice(0, 2).map((p) => (
          <div
            key={p.id}
            onClick={() => onEdit(p)}
            className={`text-xs rounded px-1.5 py-0.5 mb-0.5 cursor-pointer truncate ${
              p.status === 'completed' ? 'bg-gray-100 text-gray-600' :
              p.status === 'cancelled' ? 'bg-red-50 text-red-600 line-through' :
              p.status === 'ongoing' ? 'bg-blue-50 text-blue-600' :
              'bg-green-50 text-green-600'
            }`}
          >
            {p.name}
          </div>
        ))}
        {dayPlans.length > 2 && (
          <div className="text-xs text-gray-500">+{dayPlans.length - 2} more</div>
        )}
      </div>,
    );
  }

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={prevMonth}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Prev
        </Button>
        <h3 className="font-bold text-gray-800">
          {new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <Button variant="ghost" size="sm" onClick={nextMonth}>
          Next
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
        ))}
        {cells}
      </div>
    </Card>
  );
}
