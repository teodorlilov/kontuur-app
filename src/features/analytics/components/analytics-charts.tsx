'use client'

import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { AnalyticsMetrics } from '@/types/api'
import { CHART_COLORS, CHART_AXIS_PROPS, CHART_TOOLTIP_STYLE, LINE_PROPS } from '@/features/analytics/lib/chart-config'

interface AnalyticsChartsProps {
  metrics: AnalyticsMetrics
}

export function AnalyticsCharts({ metrics }: AnalyticsChartsProps) {
  const dailyData = metrics.daily_insights.map((d) => ({
    date: d.date.slice(5),
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
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 16 }}>
          Daily reach over time
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-3)', textAlign: 'center', padding: '32px 0' }}>
          No daily data available
        </p>
      </div>
    )
  }

  const lastPoint = dailyData[dailyData.length - 1]

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)' }}>
          Daily reach over time
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: CHART_COLORS.label }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS.reach }} />
            Reach
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: CHART_COLORS.label }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(44,94,138,0.35)' }} />
            Views
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="reachGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.reach} stopOpacity={0.18} />
              <stop offset="100%" stopColor={CHART_COLORS.reach} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="date" {...CHART_AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis
            {...CHART_AXIS_PROPS}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            {...CHART_TOOLTIP_STYLE}
            formatter={(value) => (typeof value === 'number' ? value.toLocaleString() : String(value))}
          />
          <Line dataKey="views" stroke="rgba(44,94,138,0.35)" {...LINE_PROPS} />
          <Area
            dataKey="reach"
            stroke={CHART_COLORS.reach}
            strokeWidth={2.5}
            fill="url(#reachGradient)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.reach }}
          />
          {lastPoint && (
            <ReferenceDot
              x={lastPoint.date}
              y={lastPoint.reach}
              r={4}
              fill={CHART_COLORS.reach}
              stroke="none"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
