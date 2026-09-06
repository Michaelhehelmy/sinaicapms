import React, { Suspense, lazy } from 'react';

interface LineChartProps {
  data: Array<{ name: string; value: number }>;
  color?: string;
  height?: number;
}

// T21: recharts is split into an async chunk (RechartsLine.tsx) fetched only
// when a chart actually renders. The empty-state branch stays synchronously
// available so "no data" panels never pull the recharts payload.
const RechartsLine = lazy(() => import('./RechartsLine'));

export function LineChart({ data, color = '#22c55e', height = 200 }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ height }}>
          <p className="text-xs text-gray-400">Loading chart…</p>
        </div>
      }
    >
      <RechartsLine data={data} color={color} height={height} />
    </Suspense>
  );
}