import React from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth';
import { useAdminStatsQuery } from '@/hooks/useQueryHooks';
import { formatCurrency } from '@/lib/utils';

interface SuperDashboardPanelProps {
  onNavigateToTab?: (tab: string) => void;
}

export default function SuperDashboardPanel({ onNavigateToTab }: SuperDashboardPanelProps) {
  const { user } = useAuth();
  const { data: stats, isLoading, error } = useAdminStatsQuery();

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div data-testid="super-dashboard-panel" aria-busy={isLoading || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : isLoading ? (
        <div className="py-16">
          <LoadingSpinner text="Loading platform stats..." />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <div className="text-red-500 text-sm mb-4">Failed to load platform stats</div>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Platform Overview</h2>
        <span className="text-sm text-gray-500">Global Operator Mode</span>
      </div>

      {/* Primary Stats Grid */}
      <div data-testid="stat-cards" className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total Tenants"
          value={stats?.totalTenants ?? 0}
          color="blue"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          title="Total Camps"
          value={stats?.totalCamps ?? 0}
          color="green"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Rooms"
          value={stats?.totalRooms ?? 0}
          color="purple"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders ?? 0}
          color="yellow"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          }
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats?.totalRevenue ?? 0)}
          color="green"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Admins"
          value={stats?.totalAdmins ?? 0}
          color="red"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          data-testid="quick-action"
          onClick={() => onNavigateToTab?.('super_tenants')}
          className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-xs hover:shadow-md transition-shadow cursor-pointer text-left group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Create Tenant</p>
            <p className="text-xs text-gray-500 mt-0.5">Set up a new camp tenant</p>
          </div>
        </button>
        <button
          data-testid="quick-action"
          onClick={() => onNavigateToTab?.('super_reservations')}
          className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-xs hover:shadow-md transition-shadow cursor-pointer text-left group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600 group-hover:bg-yellow-100 transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">View All Orders</p>
            <p className="text-xs text-gray-500 mt-0.5">Browse orders across all tenants</p>
          </div>
        </button>
      </div>

      {/* Recent Activity */}
      <Card padding="md">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Recent Activity</h3>
        <div className="text-center py-8 text-gray-500 text-sm">
          <svg className="h-8 w-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Activity feed coming soon
        </div>
      </Card>
    </>
    )}
    </div>
  );
}
