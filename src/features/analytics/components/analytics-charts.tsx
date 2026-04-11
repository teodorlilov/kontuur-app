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
import { CHART_COLORS, CHART_AXIS_PROPS, CHART_TOOLTIP_STYLE, LINE_PROPS } from '@/lib/chart-config'

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
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border-1)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
        }}
      >
        <p
          style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 16 }}
        >
          Daily reach &amp; views
        </p>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--color-text-3)',
            textAlign: 'center',
            padding: '32px 0',
          }}
        >
          No daily data available
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
      }}
    >
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 16 }}>
        Daily reach &amp; views
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="date" {...CHART_AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis
            {...CHART_AXIS_PROPS}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            {...CHART_TOOLTIP_STYLE}
            formatter={(value) =>
              typeof value === 'number' ? value.toLocaleString() : String(value)
            }
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: CHART_COLORS.label }}
            formatter={(value) => (value === 'reach' ? 'Reach' : 'Views')}
          />
          <Line dataKey="reach" stroke={CHART_COLORS.primary} {...LINE_PROPS} />
          <Line dataKey="views" stroke={CHART_COLORS.secondary} {...LINE_PROPS} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
