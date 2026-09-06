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

interface RechartsLineProps {
  data: Array<{ name: string; value: number }>;
  color?: string;
  height?: number;
}

/**
 * T21: recharts is +370KB raw and the ONLY consumer is the admin
 * SystemHealthPanel chart (via ui/LineChart). This inner component is the
 * single point that imports recharts; it is dynamically imported from
 * LineChart.tsx so Vite splits recharts into its own async chunk that is
 * only fetched when a health chart first renders — the SystemHealthPanel
 * lazy chunk itself stays well under the 300kb/js budget.
 */
export default function RechartsLine({ data, color = '#22c55e', height = 200 }: RechartsLineProps) {
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