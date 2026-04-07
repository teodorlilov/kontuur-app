'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsMetrics } from '@/types/api'

interface AnalyticsChartsProps {
  metrics: AnalyticsMetrics
}

export function AnalyticsCharts({ metrics }: AnalyticsChartsProps) {
  const dailyData = metrics.daily_insights.map((d) => ({
    date: d.date.slice(5), // MM-DD
    reach: d.reach ?? 0,
    views: d.impressions ?? 0,
  }))

  if (dailyData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-medium text-gray-700 mb-4">Daily reach &amp; views</p>
        <p className="text-sm text-gray-400 text-center py-8">No daily data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-700 mb-4">Daily reach &amp; views</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(value) => (typeof value === 'number' ? value.toLocaleString() : String(value))}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => value === 'reach' ? 'Reach' : 'Views'}
          />
          <Line dataKey="reach" stroke="#534AB7" strokeWidth={2} dot={false} />
          <Line dataKey="views" stroke="#1D9E75" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
