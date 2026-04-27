'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { AnalyticsMetrics, InstagramMetrics, IGDailyInsight } from '@/types/api'
import { CHART_COLORS, CHART_AXIS_PROPS, CHART_TOOLTIP_STYLE } from '@/features/analytics/lib/chart-config'

interface FollowerTrendProps {
  metrics: AnalyticsMetrics
}

/** Follower count over time area chart (Instagram only). */
export function FollowerTrend({ metrics }: FollowerTrendProps) {
  const isIG = metrics.platform === 'instagram'

  const followerSeries = isIG
    ? (metrics.daily_insights as IGDailyInsight[])
        .filter((d) => d.follower_count != null)
        .map((d) => ({ date: d.date.slice(5), followers: d.follower_count }))
    : []

  if (followerSeries.length < 2) {
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
          Follower count over time
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-3)', textAlign: 'center', padding: '32px 0' }}>
          {isIG ? 'Not enough follower data available' : 'Follower trend is only available for Instagram'}
        </p>
      </div>
    )
  }

  const lastPoint = followerSeries[followerSeries.length - 1]

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
          Follower count over time
        </p>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: CHART_COLORS.label }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS.follower }} />
          Followers
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={followerSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="followerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.follower} stopOpacity={0.14} />
              <stop offset="100%" stopColor={CHART_COLORS.follower} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="date" {...CHART_AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis
            {...CHART_AXIS_PROPS}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            {...CHART_TOOLTIP_STYLE}
            formatter={(value) => [
              typeof value === 'number' ? value.toLocaleString() : String(value),
              'Followers',
            ]}
          />
          <Area
            dataKey="followers"
            stroke={CHART_COLORS.follower}
            strokeWidth={2}
            fill="url(#followerGradient)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.follower }}
          />
          {lastPoint && (
            <ReferenceDot
              x={lastPoint.date}
              y={lastPoint.followers}
              r={4}
              fill={CHART_COLORS.follower}
              stroke="none"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
