import React, { useEffect, useMemo } from 'react';
import { useRoomsQuery, useOrdersQuery, useProductsQuery, usePlansQuery, useMealsQuery, useLowStock } from '@/hooks/useQueryHooks';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { StatusTag } from '@/components/ui/StatusTag';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import { trackEvent } from '@/lib/plausible';
import type { Camp } from '@/hooks/useAdminData';

interface DashboardPanelProps {
  campIds: string[];
  camps: Camp[];
  /** Navigate to another shell tab (used by the low-stock card CTA). */
  onNavigateToTab?: (tab: string) => void;
}

export default function DashboardPanel({ campIds, camps, onNavigateToTab }: DashboardPanelProps) {
  const { data: ordersRes, isLoading: loadingOrders } = useOrdersQuery();
  const { data: rooms, isLoading: loadingRooms } = useRoomsQuery();
  const { data: products } = useProductsQuery();
  const { data: plans } = usePlansQuery();
  const { data: meals } = useMealsQuery();
  const { data: lowStockRes } = useLowStock();
  const orders = ordersRes?.data ?? [];

  // Log the dashboard view once per mount (analytics).
  useEffect(() => {
    trackEvent('Tenant: Dashboard View');
  }, []);

  const loading = loadingOrders || loadingRooms;

  const lowStockItems = useMemo(() => (lowStockRes?.items ?? []).slice(0, 5), [lowStockRes]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const campRooms = (rooms ?? []).filter((r) => campIds.includes(r.campId));
    const campOrders = orders.filter((o) => campIds.includes(o.campId));

    const totalRooms = campRooms.length;
    const available = campRooms.filter((r) => r.status === 'available').length;
    const occupied = campRooms.filter((r) => r.status === 'occupied').length;
    const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    const todayCheckins = campOrders.filter((o) => o.checkInDate === today && o.orderStateId === 'confirmed').length;
    const todayCheckouts = campOrders.filter((o) => o.checkOutDate === today && o.orderStateId === 'checked_in').length;

    const activeOrders = campOrders.filter((o) => o.orderStateId === 'checked_in');
    const pendingOrders = campOrders.filter((o) => o.orderStateId === 'pending');

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthOrders = campOrders.filter((o) => o.checkInDate >= monthStart);
    const monthlyRevenue = monthOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    return {
      totalRooms,
      available,
      occupied,
      occupancyRate,
      todayCheckins,
      todayCheckouts,
      activeGuests: activeOrders.length,
      pendingBookings: pendingOrders.length,
      monthlyRevenue,
      totalProducts: (products ?? []).length,
      totalMeals: (meals ?? []).length,
      upcomingPlans: (plans ?? []).filter((p) => p.campId && campIds.includes(p.campId) && p.status === 'upcoming').length,
    };
  }, [orders, rooms, products, meals, plans, campIds]);

  const recentOrders = useMemo(() => {
    return orders
      .filter((o) => campIds.includes(o.campId))
      .sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime())
      .slice(0, 5);
  }, [orders, campIds]);

  return (
    <div data-testid="dashboard-panel" aria-busy={loading || undefined} className="space-y-6">
      {loading ? <DashboardSkeleton /> : (
      <>
      <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>

      {/* Room Overview */}
      <div data-testid="admin-stat-cards" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Rooms"
          value={stats.totalRooms}
          color="blue"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          title="Available"
          value={stats.available}
          color="green"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Occupied"
          value={stats.occupied}
          color="yellow"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
        <StatCard
          title="Occupancy"
          value={`${stats.occupancyRate}%`}
          color="blue"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
      </div>

      {/* Guest Activity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Today Check-ins"
          value={stats.todayCheckins}
          color="green"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          }
        />
        <StatCard
          title="Today Check-outs"
          value={stats.todayCheckouts}
          color="yellow"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          }
        />
        <StatCard
          title="Active Guests"
          value={stats.activeGuests}
          color="purple"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          title="Pending Bookings"
          value={stats.pendingBookings}
          color="yellow"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Inventory */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(stats.monthlyRevenue)}
          color="green"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Products"
          value={stats.totalProducts}
          color="blue"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="Meals"
          value={stats.totalMeals}
          color="purple"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          }
        />
        <StatCard
          title="Upcoming Events"
          value={stats.upcomingPlans}
          color="red"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Recent Reservations */}
      {recentOrders.length > 0 && (
        <Card data-testid="recent-reservations" padding="sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Recent Reservations</h3>
          <div className="space-y-2">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-gray-800">
                    {[o.customerFirstName, o.customerLastName].filter(Boolean).join(' ') || 'Guest'}
                  </span>
                  <span className="text-gray-500 mx-2">&middot;</span>
                  <span className="text-gray-500">{o.reference || o.id?.slice(0, 8)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{formatDate(o.checkInDate)}</span>
                  <StatusTag status={o.orderStateId} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Low Stock */}
      <Card data-testid="low-stock-alerts" padding="sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">Low Stock</h3>
          {lowStockItems.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigateToTab?.('low-stock')}
              data-testid="low-stock-view-all"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 bg-transparent border-none cursor-pointer font-[inherit]"
            >
              View All
            </button>
          )}
        </div>
        {lowStockItems.length === 0 ? (
          <EmptyState
            title="All stocked up"
            description="No inventory items are below their minimum stock level."
          />
        ) : (
          <div data-testid="low-stock-list" className="space-y-2">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-gray-800">{item.name}</span>
                  <span className="text-gray-500 mx-2">&middot;</span>
                  <span className="text-gray-500">{item.category ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{item.stockQuantity} / {item.minStockLevel}</span>
                  {item.status === 'out' ? (
                    <Badge variant="error" dot>Out of Stock</Badge>
                  ) : (
                    <Badge variant="warning" dot>Low</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      </>
    )}
    </div>
  );
}
