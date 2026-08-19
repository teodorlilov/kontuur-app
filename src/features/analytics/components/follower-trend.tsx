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
import type { InstagramMetrics } from '@/types/api'
import {
  CHART_COLORS,
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
} from '@/features/analytics/lib/chart-config'

interface FollowerTrendProps {
  metrics: InstagramMetrics
}

/** Follower count over time area chart. */
export function FollowerTrend({ metrics }: FollowerTrendProps) {
  const followerSeries = metrics.daily_insights
    .filter((d) => d.follower_count != null)
    .map((d) => ({ date: d.date.slice(5), followers: d.follower_count }))

  if (followerSeries.length < 2) {
    return (
      <div className="bg-surface border border-line rounded-lg px-6 py-5">
        <p className="text-title font-medium text-ink mb-4">Follower count over time</p>
        <p className="text-body text-text3 text-center py-8">Not enough follower data available</p>
      </div>
    )
  }

  const lastPoint = followerSeries[followerSeries.length - 1]

  return (
    <div className="bg-surface border border-line rounded-lg px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-title font-medium text-ink">Follower count over time</p>
        <span
          className="text-micro flex items-center gap-[5px]"
          style={{ color: CHART_COLORS.label }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS.follower }} />
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
