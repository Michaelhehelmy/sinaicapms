import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface LineChartProps {
  data: Array<{ name: string; value: number }>;
  color?: string;
  height?: number;
}

export function LineChart({ data, color = '#22c55e', height = 200 }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
