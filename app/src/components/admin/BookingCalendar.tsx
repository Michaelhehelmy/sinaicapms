import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  getDay,
  isToday,
  parseISO,
  startOfMonth,
} from 'date-fns';
import {
  useProductsQuery,
  useRoomsQuery,
  useOrdersQuery,
  useRatePlansQuery,
  usePriceOverridesQuery,
  useAvailabilityQuery,
  useSetPriceOverrideMutation,
  useDeletePriceOverrideMutation,
} from '@/hooks/useQueryHooks';
import { useSseOrders } from '@/hooks/useSseOrders';
import { useAuth } from '@/lib/auth';
import { session } from '@/lib/session';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import type { Camp, Order, RatePlan } from '@/hooks/useAdminData';

interface BookingCalendarProps {
  campIds: string[];
  camps: Camp[];
}

/**
 * Dual-month availability calendar with a per-night price-override drawer.
 *
 * Day state precedence (mirrors backend calc: override > rate plan > base):
 *   1. override — a price override exists for that date (price-overrides API)
 *   2. booked   — every room of the selected product is occupied that night
 *                 (derived from active orders, the same signal the backend
 *                 availability endpoint uses)
 *   3. rate-plan — an active rate plan covers that date
 *   4. base     — the product's base price applies
 */

type DayState = 'override' | 'booked' | 'rate-plan' | 'base';

interface ProductOption {
  id: string;
  name: string;
  basePrice: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_STATE_CLASSES: Record<DayState, string> = {
  override: 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200',
  booked: 'bg-error-50 text-error-700 border-error-200 hover:bg-error-100',
  'rate-plan': 'bg-info-50 text-info-700 border-info-200 hover:bg-info-100',
  base: 'bg-white text-gray-700 border-gray-200 hover:bg-warm-100',
};

const DAY_STATE_LABELS: Record<DayState, string> = {
  override: 'Override',
  booked: 'Booked',
  'rate-plan': 'Rate plan',
  base: 'Base price',
};

const LEGEND_ITEMS: { state: DayState; swatch: string }[] = [
  { state: 'override', swatch: 'bg-violet-400' },
  { state: 'booked', swatch: 'bg-error-300' },
  { state: 'rate-plan', swatch: 'bg-info-300' },
  { state: 'base', swatch: 'bg-gray-200' },
];

function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function parseDay(s: string): Date {
  return parseISO(s);
}

function isActiveOrder(order: Order): boolean {
  return order.orderStateId !== 'cancelled' && order.orderStateId !== 'no_show';
}

/** Build the cells for one month grid — leading nulls align the first weekday. */
function buildMonthCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < getDay(first); i += 1) cells.push(null);
  let d = new Date(first);
  while (d <= last) {
    cells.push(d);
    d = addDays(d, 1);
  }
  return cells;
}

export default function BookingCalendar({ campIds, camps }: BookingCalendarProps) {
  const { data: productsData, isLoading: loadingProducts } = useProductsQuery();
  const { data: roomsData, isLoading: loadingRooms } = useRoomsQuery();
  const { data: ordersData, isLoading: loadingOrders } = useOrdersQuery();
  const { data: ratePlansData, isLoading: loadingRatePlans } = useRatePlansQuery();
  const { showToast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

  const [viewStart, setViewStart] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [overrideInput, setOverrideInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const dayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // ─── Derived data ───────────────────────────────────────────────────

  const rooms = useMemo(
    () => (roomsData ?? []).filter((r) => campIds.includes(r.campId)),
    [roomsData, campIds],
  );

  const productOptions = useMemo<ProductOption[]>(() => {
    const roomProductIds = new Set(rooms.map((r) => r.productId));
    const byId = new Map<string, ProductOption>();
    for (const p of productsData ?? []) {
      if (roomProductIds.has(p.id)) {
        byId.set(p.id, {
          id: p.id,
          name: p.name || p.sku || `Room type ${p.id}`,
          basePrice: p.basePrice ?? 0,
        });
      }
    }
    // Fallback: derive product options from rooms when the products query is
    // empty or does not include camp-scoped products.
    if (byId.size === 0) {
      for (const r of rooms) {
        if (!byId.has(r.productId)) {
          byId.set(r.productId, {
            id: r.productId,
            name: `Room type ${r.productId}`,
            basePrice: r.basePrice ?? 0,
          });
        }
      }
    }
    return Array.from(byId.values());
  }, [rooms, productsData]);

  const activeProductId = selectedProductId || productOptions[0]?.id || '';
  const activeProduct = productOptions.find((p) => p.id === activeProductId);

  // ─── Live refresh via the SSE orders stream ─────────────────────────
  // The admin JWT cannot travel in an EventSource header, so it is read from
  // the session kernel (same storage slot auth.tsx/api.ts use) and sent as a
  // query param. The stream only opens when the admin is authed, a tenant is
  // resolved (user.tenantId matches the JWT the backend validates), and a
  // product is in view.
  const accessToken = session.getAccessToken('admin');
  const tenantId = user?.tenantId;
  const sseEnabled =
    isAuthenticated && Boolean(accessToken) && Boolean(tenantId) && Boolean(activeProductId);

  const handleSseEvent = useCallback(
    (event: unknown) => {
      const ev = (event ?? {}) as { type?: string; campId?: string | number };
      if (ev.type !== 'new-booking') return;
      // Ignore bookings for camps outside the current view. When no camp is
      // filtered in (or the event carries no campId) refresh conservatively.
      if (campIds.length > 0 && ev.campId !== undefined && !campIds.includes(String(ev.campId))) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'price-overrides'] });
    },
    [campIds, queryClient],
  );

  const { connected: sseConnected } = useSseOrders({
    enabled: sseEnabled,
    tenantId,
    token: accessToken ?? undefined,
    onEvent: handleSseEvent,
  });

  const firstDay = startOfMonth(viewStart);
  const lastDay = endOfMonth(addMonths(viewStart, 1));
  const fromKey = toDateKey(firstDay);
  const toKey = toDateKey(lastDay);
  const windowEndKey = toDateKey(addDays(lastDay, 1));

  const {
    data: overridesData,
    // Overrides are window-scoped (query key changes on month navigation), so
    // their loading state must NOT gate the whole calendar render — that would
    // flash a spinner on every prev/next click. The drawer and day cells simply
    // render with empty data until the new window's overrides arrive.
  } = usePriceOverridesQuery({
    productId: activeProductId,
    from: fromKey,
    to: toKey,
    // No product selected yet -> the backend 400s on a missing productId.
    // Skip the request entirely until a room type is active.
    enabled: !!activeProductId,
  });

  const { data: availabilityData } = useAvailabilityQuery({
    checkIn: fromKey,
    checkOut: windowEndKey,
  });

  const orders = useMemo(() => ordersData?.data ?? [], [ordersData]);

  const overrideByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of overridesData?.overrides ?? []) {
      map.set(o.date, o.price);
    }
    return map;
  }, [overridesData]);

  const ratePlanByDate = useMemo(() => {
    const map = new Map<string, number>();
    const plans = (ratePlansData ?? []).filter(
      (rp) => rp.productId === activeProductId && rp.isActive !== 0,
    );
    let d = new Date(firstDay);
    while (d <= lastDay) {
      const key = toDateKey(d);
      const plan = plans.find(
        (rp: RatePlan) => (!rp.startDate || rp.startDate <= key) && (!rp.endDate || rp.endDate >= key),
      );
      if (plan) map.set(key, plan.pricePerNight);
      d = addDays(d, 1);
    }
    return map;
  }, [ratePlansData, activeProductId, firstDay, lastDay]);

  const roomIdsByProduct = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of rooms) {
      const list = map.get(r.productId) ?? [];
      list.push(r.id);
      map.set(r.productId, list);
    }
    return map;
  }, [rooms]);

  /** Dates where every room of the selected product is occupied by an active order. */
  const bookedDateKeys = useMemo(() => {
    const roomIds = roomIdsByProduct.get(activeProductId) ?? [];
    if (roomIds.length === 0) return new Set<string>();
    const occupiedByDay = new Map<string, Set<string>>();
    for (const order of orders) {
      if (!isActiveOrder(order) || !roomIds.includes(order.roomId)) continue;
      let d = parseDay(order.checkInDate);
      const out = parseDay(order.checkOutDate);
      while (d < out) {
        const key = toDateKey(d);
        const set = occupiedByDay.get(key) ?? new Set<string>();
        set.add(order.roomId);
        occupiedByDay.set(key, set);
        d = addDays(d, 1);
      }
    }
    const fullyBooked = new Set<string>();
    for (const [key, occupied] of occupiedByDay) {
      if (occupied.size >= roomIds.length) fullyBooked.add(key);
    }
    return fullyBooked;
  }, [orders, roomIdsByProduct, activeProductId]);

  const months = useMemo(() => [viewStart, addMonths(viewStart, 1)], [viewStart]);

  const visibleDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const month of months) {
      for (const cell of buildMonthCells(month)) {
        if (cell) keys.add(toDateKey(cell));
      }
    }
    return keys;
  }, [months]);

  const getDayState = useCallback(
    (key: string): DayState => {
      if (overrideByDate.has(key)) return 'override';
      if (bookedDateKeys.has(key)) return 'booked';
      if (ratePlanByDate.has(key)) return 'rate-plan';
      return 'base';
    },
    [overrideByDate, bookedDateKeys, ratePlanByDate],
  );

  const getDayPrice = useCallback(
    (key: string): number => {
      if (overrideByDate.has(key)) return overrideByDate.get(key) as number;
      if (ratePlanByDate.has(key)) return ratePlanByDate.get(key) as number;
      return activeProduct?.basePrice ?? 0;
    },
    [overrideByDate, ratePlanByDate, activeProduct],
  );

  const windowAvailability = useMemo(() => {
    if (!availabilityData || !('availability' in availabilityData)) return null;
    return availabilityData.availability?.find((a) => a.productId === activeProductId) ?? null;
  }, [availabilityData, activeProductId]);

  const selectedDate = selectedDateKey ? parseDay(selectedDateKey) : null;
  const selectedState = selectedDateKey ? getDayState(selectedDateKey) : null;
  const selectedOverride = selectedDateKey ? overrideByDate.get(selectedDateKey) : undefined;
  const selectedIsBooked = selectedDateKey ? bookedDateKeys.has(selectedDateKey) : false;
  const selectedEffectivePrice = selectedDateKey ? getDayPrice(selectedDateKey) : 0;

  // Only the base queries gate the initial loading state — their keys never
  // change, so this only shows once on first load (never on month navigation).
  const loading = loadingProducts || loadingRooms || loadingOrders || loadingRatePlans;

  // ─── Interactions ───────────────────────────────────────────────────

  const focusDay = useCallback((key: string) => {
    window.setTimeout(() => {
      dayRefs.current.get(key)?.focus();
    }, 0);
  }, []);

  const selectDay = useCallback(
    (key: string) => {
      setSelectedDateKey(key);
      setOverrideInput(overrideByDate.has(key) ? String(overrideByDate.get(key)) : '');
    },
    [overrideByDate],
  );

  const closeDrawer = useCallback(() => {
    setSelectedDateKey(null);
    setOverrideInput('');
  }, []);

  const shiftWindow = useCallback((delta: number) => {
    setViewStart((prev) => addMonths(startOfMonth(prev), delta));
  }, []);

  const goToday = useCallback(() => {
    setViewStart(startOfMonth(new Date()));
  }, []);

  const handleDayKeyDown = useCallback(
    (e: React.KeyboardEvent, key: string) => {
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const sorted = Array.from(visibleDayKeys).sort();
        const targetKey = e.key === 'Home' ? sorted[0] : sorted[sorted.length - 1];
        selectDay(targetKey);
        focusDay(targetKey);
        return;
      }
      const offsets: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      const offset = offsets[e.key];
      if (offset === undefined) return;
      e.preventDefault();
      const target = addDays(parseDay(key), offset);
      const targetKey = toDateKey(target);
      if (!visibleDayKeys.has(targetKey)) {
        const targetMonth = startOfMonth(target);
        if (targetMonth < startOfMonth(viewStart) || targetMonth > startOfMonth(addMonths(viewStart, 1))) {
          setViewStart(targetMonth);
        }
      }
      selectDay(targetKey);
      focusDay(targetKey);
    },
    [visibleDayKeys, viewStart, selectDay, focusDay],
  );

  const saveOverride = useSetPriceOverrideMutation();
  const clearOverride = useDeletePriceOverrideMutation();

  const handleSaveOverride = () => {
    if (!selectedDateKey || !activeProductId) return;
    const trimmed = overrideInput.trim();
    const parsed = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(parsed) || parsed < 0) {
      showToast('Enter a valid non-negative integer price', 'warning');
      return;
    }
    setSaving(true);
    saveOverride.mutate(
      { productId: activeProductId, overrides: [{ date: selectedDateKey, price: parsed }] },
      {
        onSuccess: () => {
          setOverrideInput(String(parsed));
          setSaving(false);
        },
        onError: () => setSaving(false),
      },
    );
  };

  const handleClearOverride = () => {
    if (!selectedDateKey || !activeProductId || selectedOverride === undefined) return;
    setClearing(true);
    clearOverride.mutate(
      { productId: activeProductId, date: selectedDateKey },
      {
        onSuccess: () => {
          setOverrideInput('');
          setClearing(false);
        },
        onError: () => setClearing(false),
      },
    );
  };

  // ─── States ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card data-testid="booking-calendar" padding="none" className="flex items-center justify-center min-h-[320px]">
        <LoadingSpinner />
      </Card>
    );
  }

  if (productOptions.length === 0) {
    return (
      <Card data-testid="booking-calendar" padding="none">
        <EmptyState
          title="No rooms available"
          description="Add rooms to see availability and manage per-night prices on the calendar."
        />
      </Card>
    );
  }

  return (
    <Card data-testid="booking-calendar" padding="none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-800">Availability Calendar</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-500">
              {camps.length} camp{camps.length !== 1 ? 's' : ''} in view
            </p>
            {sseConnected && (
              <Badge variant="success" size="sm" dot data-testid="live-badge">
                Live
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="product-filter" className="sr-only">
            Select room type
          </label>
          <select
            id="product-filter"
            value={activeProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              setSelectedDateKey(null);
            }}
            aria-label="Select room type"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <Button variant="secondary" size="sm" onClick={() => shiftWindow(-1)} aria-label="Previous months">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => shiftWindow(1)} aria-label="Next months">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Availability summary */}
      <div className="flex flex-wrap items-center gap-4 px-6 py-2 bg-gray-50 text-xs text-gray-500">
        <span>
          {activeProduct ? activeProduct.name : ''} —{' '}
          {formatCurrency(getDayPrice(fromKey))} base / night
        </span>
        <span className="text-gray-300">|</span>
        <span>
          {windowAvailability === null
            ? 'Availability loading'
            : windowAvailability.availableCount > 0
              ? `${windowAvailability.availableCount} room${windowAvailability.availableCount !== 1 ? 's' : ''} available this period`
              : 'All rooms booked this period'}
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-6 py-3 text-xs text-gray-500 border-b border-gray-100">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.state} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.swatch}`} aria-hidden="true" />
            {DAY_STATE_LABELS[item.state]}
          </span>
        ))}
      </div>

      {/* Month grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 py-5">
        {months.map((month) => (
          <div key={toDateKey(month)} data-testid="month-grid">
            <div className="text-sm font-semibold text-gray-700 mb-2 text-center">
              {format(month, 'MMMM yyyy')}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-center text-[10px] uppercase tracking-wide text-gray-400">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {buildMonthCells(month).map((day, i) => {
                if (!day) {
                  return <span key={`blank-${month.getMonth()}-${i}`} className="h-14" aria-hidden="true" />;
                }
                const key = toDateKey(day);
                const state = getDayState(key);
                const price = getDayPrice(key);
                const isSelected = selectedDateKey === key;
                const isTodayDay = isToday(day);
                return (
                  <button
                    key={key}
                    type="button"
                    ref={(el) => {
                      if (el) dayRefs.current.set(key, el);
                      else dayRefs.current.delete(key);
                    }}
                    aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                    aria-pressed={isSelected}
                    aria-current={isTodayDay ? 'date' : undefined}
                    data-date={key}
                    data-state={state}
                    data-price={price}
                    onClick={() => selectDay(key)}
                    onKeyDown={(e) => handleDayKeyDown(e, key)}
                    className={`relative flex flex-col items-center justify-center h-14 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                      isSelected ? 'ring-2 ring-brand-500 border-brand-500' : ''
                    } ${DAY_STATE_CLASSES[state]}`}
                  >
                    <span className="font-semibold leading-none">{day.getDate()}</span>
                    <span className="text-[10px] mt-1 leading-none opacity-80 truncate max-w-full px-1">
                      {state === 'booked' ? 'Booked' : formatCurrency(price)}
                    </span>
                    {isTodayDay && (
                      <span
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-600"
                        aria-label="Today"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Drawer */}
      {selectedDateKey && selectedDate && (
        <div className="fixed inset-0 z-50" data-testid="override-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Price for ${format(selectedDate, 'EEEE, MMMM d, yyyy')}`}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h4 className="text-base font-semibold text-gray-800">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">{activeProduct?.name}</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close"
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selectedIsBooked ? 'error' : 'success'}>
                  {selectedIsBooked ? 'Booked' : 'Available'}
                </Badge>
                {selectedOverride !== undefined && (
                  <Badge variant="default" dot>
                    Override active
                  </Badge>
                )}
              </div>

              <div className="rounded-lg border border-gray-100 divide-y divide-gray-100 text-sm">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-gray-500">Base price</span>
                  <span className="font-medium text-gray-800">{formatCurrency(activeProduct?.basePrice ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-gray-500">Rate plan price</span>
                  <span className="font-medium text-gray-800">
                    {selectedDateKey && ratePlanByDate.has(selectedDateKey)
                      ? formatCurrency(ratePlanByDate.get(selectedDateKey) as number)
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-gray-500">Override</span>
                  <span className="font-medium text-gray-800">
                    {selectedOverride !== undefined ? formatCurrency(selectedOverride) : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-warm-50">
                  <span className="font-semibold text-gray-700">Effective price</span>
                  <span className="font-bold text-gray-900">{formatCurrency(selectedEffectivePrice)}</span>
                </div>
              </div>

              <div>
                <Input
                  label="Override price (per night)"
                  type="number"
                  min={0}
                  step={1}
                  value={overrideInput}
                  onChange={(e) => setOverrideInput(e.target.value)}
                  placeholder="e.g. 150"
                  disabled={saving || clearing}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Set a fixed price for this night. Saving replaces the base or rate-plan price.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2">
              <Button onClick={handleSaveOverride} loading={saving} disabled={clearing} fullWidth>
                Save override
              </Button>
              <Button
                variant="secondary"
                onClick={handleClearOverride}
                loading={clearing}
                disabled={saving || selectedOverride === undefined}
              >
                Clear
              </Button>
            </div>
          </aside>
        </div>
      )}
    </Card>
  );
}
