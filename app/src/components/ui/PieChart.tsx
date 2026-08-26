import React from 'react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface PieChartProps {
  data: Array<{ name: string; value: number }>;
  colors?: string[];
  height?: number;
}

const DEFAULT_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function PieChart({ data, colors = DEFAULT_COLORS, height = 200 }: PieChartProps) {
  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '11px' }}
          formatter={(value) => <span className="text-gray-600">{value}</span>}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
