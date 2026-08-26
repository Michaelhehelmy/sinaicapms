import React, { useMemo } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card } from '@/components/ui/Card';
import { useAdminHealthQuery, useAdminHealthMetricsQuery } from '@/hooks/useQueryHooks';
import { LineChart } from '@/components/ui/LineChart';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
  skipped: 'bg-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  ok: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  skipped: 'N/A',
};

export default function SystemHealthPanel() {
  const { data: health, isLoading: loadingHealth } = useAdminHealthQuery();
  const { data: metricsData, isLoading: loadingMetrics } = useAdminHealthMetricsQuery();

  const metrics = metricsData?.metrics ?? [];

  // Build chart data from metrics
  const workersLatencyData = useMemo(
    () => metrics.map((m) => ({ name: m.timestamp.slice(11, 16), value: m.workers.latencyMs })),
    [metrics],
  );
  const d1LatencyData = useMemo(
    () => metrics.map((m) => ({ name: m.timestamp.slice(11, 16), value: m.d1.latencyMs })),
    [metrics],
  );
  const workersErrorsData = useMemo(
    () => metrics.map((m) => ({ name: m.timestamp.slice(11, 16), value: m.workers.errors })),
    [metrics],
  );
  const d1ErrorsData = useMemo(
    () => metrics.map((m) => ({ name: m.timestamp.slice(11, 16), value: m.d1.errors })),
    [metrics],
  );

  // Aggregate 24h totals
  const totals = useMemo(() => {
    return metrics.reduce(
      (acc, m) => ({
        workersRequests: acc.workersRequests + m.workers.requests,
        workersErrors: acc.workersErrors + m.workers.errors,
        d1Queries: acc.d1Queries + m.d1.queries,
        d1Errors: acc.d1Errors + m.d1.errors,
        kvOps: acc.kvOps + m.kv.operations,
        kvErrors: acc.kvErrors + m.kv.errors,
      }),
      { workersRequests: 0, workersErrors: 0, d1Queries: 0, d1Errors: 0, kvOps: 0, kvErrors: 0 },
    );
  }, [metrics]);

  if (loadingHealth || loadingMetrics) {
    return (
      <div className="py-16">
        <LoadingSpinner text="Loading system health..." />
      </div>
    );
  }

  const overall = health?.overall ?? 'unknown';

  return (
    <div data-testid="system-health-panel">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">System Health</h2>
        <p className="text-xs text-gray-500 mt-0.5">Real-time monitoring of Workers, D1, KV, and R2 services</p>
      </div>

      {/* Overall Status Banner */}
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[overall] ?? 'bg-gray-400'}`} />
          <div>
            <span className="text-sm font-bold text-gray-800">
              Overall Status: {STATUS_LABELS[overall] ?? overall}
            </span>
            <span className="text-xs text-gray-500 ml-2">
              Last checked: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </Card>

      {/* Service Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card padding="md">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[health?.workers?.status ?? 'unknown']}`} />
            <span className="text-xs font-bold text-gray-700">Workers</span>
          </div>
          <div className="text-lg font-bold text-gray-800">{STATUS_LABELS[health?.workers?.status ?? 'unknown']}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            Uptime: {health?.workers?.uptime ? `${Math.floor(health.workers.uptime / 86400_000)}d` : 'N/A'}
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[health?.d1?.status ?? 'unknown']}`} />
            <span className="text-xs font-bold text-gray-700">D1 Database</span>
          </div>
          <div className="text-lg font-bold text-gray-800">{STATUS_LABELS[health?.d1?.status ?? 'unknown']}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            Latency: {health?.d1?.latencyMs ?? '—'}ms
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[health?.kv?.status ?? 'unknown']}`} />
            <span className="text-xs font-bold text-gray-700">KV Cache</span>
          </div>
          <div className="text-lg font-bold text-gray-800">{STATUS_LABELS[health?.kv?.status ?? 'unknown']}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            Latency: {health?.kv?.latencyMs ?? '—'}ms
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[health?.r2?.status ?? 'unknown']}`} />
            <span className="text-xs font-bold text-gray-700">R2 Storage</span>
          </div>
          <div className="text-lg font-bold text-gray-800">{STATUS_LABELS[health?.r2?.status ?? 'unknown']}</div>
          <div className="text-[10px] text-gray-500 mt-1">Media bucket</div>
        </Card>
      </div>

      {/* 24h Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard title="Worker Requests (24h)" value={totals.workersRequests.toLocaleString()} color="blue" />
        <StatCard title="Worker Errors (24h)" value={totals.workersErrors} color={totals.workersErrors > 10 ? 'red' : 'green'} />
        <StatCard title="D1 Queries (24h)" value={totals.d1Queries.toLocaleString()} color="purple" />
        <StatCard title="D1 Errors (24h)" value={totals.d1Errors} color={totals.d1Errors > 5 ? 'red' : 'green'} />
        <StatCard title="KV Operations (24h)" value={totals.kvOps.toLocaleString()} color="yellow" />
        <StatCard title="KV Errors (24h)" value={totals.kvErrors} color={totals.kvErrors > 0 ? 'red' : 'green'} />
      </div>

      {/* Latency Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Workers Latency (24h)</h3>
          <LineChart data={workersLatencyData} color="#3b82f6" height={160} />
        </Card>
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-2">D1 Query Latency (24h)</h3>
          <LineChart data={d1LatencyData} color="#8b5cf6" height={160} />
        </Card>
      </div>

      {/* Error Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Workers Errors (24h)</h3>
          <LineChart data={workersErrorsData} color="#ef4444" height={140} />
        </Card>
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-2">D1 Errors (24h)</h3>
          <LineChart data={d1ErrorsData} color="#f59e0b" height={140} />
        </Card>
      </div>
    </div>
  );
}
