import React, { useState, useMemo, useCallback } from 'react';
import { useMeals, useMealSchedules, useCamps, type Meal, type MealSchedule, type Camp } from '@/hooks/useAdminData';
import { createMealSchedule, deleteMealSchedule } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FormModal } from '@/components/ui/FormModal';

interface MenuPlannerPanelProps {
  campIds: string[];
  camps: Camp[];
}

interface ScheduleForm {
  campId: string;
  mealId: string;
  packageType: string;
  maxServings: string;
}

const emptyForm: ScheduleForm = {
  campId: '',
  mealId: '',
  packageType: 'all',
  maxServings: '100',
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDayNum(d: Date): string {
  return String(d.getDate());
}

function formatMonthShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function formatHeaderDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PACKAGE_COLORS: Record<string, string> = {
  all: 'border-l-green-500',
  full_board: 'border-l-blue-500',
  half_board: 'border-l-amber-500',
};

const packageTypeOptions = [
  { value: 'all', label: 'All' },
  { value: 'full_board', label: 'Full Board' },
  { value: 'half_board', label: 'Half Board' },
];

export default function MenuPlannerPanel({ campIds, camps }: MenuPlannerPanelProps) {
  const { data: meals, loading: loadingMeals } = useMeals();
  const { data: schedules, loading: loadingSchedules, refresh: refreshSchedules } = useMealSchedules();
  const { showToast } = useToast();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Single-camp admin (B3): meal schedules always belong to the tenant's one camp.
  const activeCampId = campIds.length > 0 ? campIds[0] : '';

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const goPrevWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  const goThisWeek = useCallback(() => {
    setWeekStart(startOfWeek(new Date()));
  }, []);

  const filteredSchedules = useMemo(() => {
    if (!schedules) return [];
    const weekDates = new Set(weekDays.map((d) => formatDateISO(d)));
    return schedules.filter((s) => {
      if (!weekDates.has(s.date)) return false;
      if (activeCampId && s.campId !== activeCampId) return false;
      return true;
    });
  }, [schedules, weekDays, activeCampId]);

  const schedulesByDate = useMemo(() => {
    const map: Record<string, MealSchedule[]> = {};
    weekDays.forEach((d) => {
      map[formatDateISO(d)] = [];
    });
    filteredSchedules.forEach((s) => {
      if (map[s.date]) {
        map[s.date].push(s);
      }
    });
    return map;
  }, [filteredSchedules, weekDays]);

  const mealMap = useMemo(() => {
    const map: Record<string, Meal> = {};
    (meals ?? []).forEach((m) => { map[m.id] = m; });
    return map;
  }, [meals]);

  const openAddModal = useCallback((date: string) => {
    setModalDate(date);
    setForm({ ...emptyForm, campId: activeCampId });
    setShowModal(true);
  }, [activeCampId]);

  const handleFormChange = useCallback((field: keyof ScheduleForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.mealId) {
      showToast('Please select a meal', 'error');
      return;
    }
    setSaving(true);
    try {
      await createMealSchedule({
        campId: form.campId || activeCampId,
        date: modalDate,
        mealId: form.mealId,
        // T8-C: MealScheduleCreateRequest.packageType is a closed union
        packageType: form.packageType as 'all' | 'full_board' | 'half_board',
        maxServings: parseInt(form.maxServings, 10) || 100,
      });
      showToast('Meal scheduled successfully', 'success');
      setShowModal(false);
      setForm(emptyForm);
      refreshSchedules();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to schedule meal', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, modalDate, showToast, refreshSchedules, activeCampId]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMealSchedule(id);
      showToast('Meal removed', 'success');
      setConfirmDeleteId(null);
      refreshSchedules();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove meal', 'error');
    }
  }, [showToast, refreshSchedules]);

  const loading = loadingMeals || loadingSchedules;

  const mealSelectOptions = useMemo(() => {
    return (meals ?? []).map((m) => ({ value: m.id, label: m.name }));
  }, [meals]);

  const packageBadgeVariant = (type: string): 'success' | 'info' | 'warning' | 'default' => {
    switch (type) {
      case 'all': return 'success';
      case 'full_board': return 'info';
      case 'half_board': return 'warning';
      default: return 'default';
    }
  };

  return (
    <Card padding="none" className="p-5" data-testid="menu-planner-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">🍽️</span>
          <h2 className="text-lg font-bold text-gray-800">Menu Planner</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={goPrevWeek}>
            ←
          </Button>
          <Button variant="ghost" size="sm" onClick={goThisWeek}>
            Week of {formatHeaderDate(weekStart)}
          </Button>
          <Button variant="ghost" size="sm" onClick={goNextWeek}>
            →
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" text="Loading menu planner..." />
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden min-w-[700px]">
            {/* Day headers */}
            {weekDays.map((d) => {
              const isToday = formatDateISO(d) === formatDateISO(new Date());
              return (
                <div
                  key={formatDateISO(d)}
                  className={`bg-gray-50 px-2 py-3 text-center ${isToday ? 'bg-green-50' : ''}`}
                >
                  <div className="font-semibold text-sm text-gray-600">{formatShortDay(d)}</div>
                  <div className={`text-lg font-bold ${isToday ? 'text-green-600' : 'text-gray-800'}`}>
                    {formatDayNum(d)}
                  </div>
                  <div className="text-xs text-gray-500">{formatMonthShort(d)}</div>
                </div>
              );
            })}

            {/* Day columns */}
            {weekDays.map((d) => {
              const dateKey = formatDateISO(d);
              const daySchedules = schedulesByDate[dateKey] ?? [];
              return (
                <div key={`col-${dateKey}`} className="bg-white p-2 min-h-[180px] flex flex-col gap-2">
                  {daySchedules.length === 0 && (
                    <div className="text-xs text-gray-300 text-center mt-4">No meals scheduled</div>
                  )}
                  {daySchedules.map((s) => (
                    <div
                      key={s.id}
                      className={`bg-gray-50 rounded-lg p-2.5 border-l-4 text-sm relative group ${PACKAGE_COLORS[s.packageType] ?? 'border-l-gray-400'}`}
                    >
                      <div className="font-medium text-gray-800 pr-4 leading-tight">{s.mealName}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <span>{s.maxServings} servings</span>
                        <Badge variant={packageBadgeVariant(s.packageType)} size="sm">
                          {s.packageType.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      {s.campName && (
                        <div className="text-xs text-gray-500 mt-0.5">{s.campName}</div>
                      )}
                      {confirmDeleteId === s.id ? (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(s.id)}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(s.id)}
                          className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove meal"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAddModal(dateKey)}
                    className="mt-auto pt-1"
                  >
                    + Add Meal
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <FormModal
          open={showModal}
          title="Schedule Meal"
          onClose={() => { setShowModal(false); setForm(emptyForm); }}
          onSubmit={handleSubmit}
          submitLabel={saving ? 'Scheduling...' : 'Schedule'}
          submitDisabled={saving}
          size="sm"
        >
          <p className="text-sm text-gray-500 mb-4">for {modalDate}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Select
                label="Meal *"
                options={mealSelectOptions}
                value={form.mealId}
                placeholder="Select meal..."
                onChange={(e) => handleFormChange('mealId', e.target.value)}
              />
            </div>
            <div>
              <Select
                label="Package Type"
                options={packageTypeOptions}
                value={form.packageType}
                onChange={(e) => handleFormChange('packageType', e.target.value)}
              />
            </div>
            <div>
              <Input
                label="Max Servings"
                type="number"
                min="1"
                value={form.maxServings}
                onChange={(e) => handleFormChange('maxServings', e.target.value)}
              />
            </div>
          </form>
        </FormModal>
      )}
    </Card>
  );
}
