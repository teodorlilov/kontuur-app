'use client'

import { useMemo } from 'react'
import {
  CHART_COLORS,
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
} from '@/features/analytics/lib/chart-config'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsMetrics, IGPost, FBPost } from '@/types/api'

interface PostDayBreakdownProps {
  metrics: AnalyticsMetrics
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function PostDayBreakdown({ metrics }: PostDayBreakdownProps) {
  const { chartData, maxER, hasSufficientDays } = useMemo(() => {
    const followers =
      metrics.platform === 'instagram'
        ? metrics.account.followers_count || 1
        : metrics.account.fan_count || 1

    const dayMap: Record<number, { totalER: number; count: number }> = {}

    if (metrics.platform === 'instagram') {
      for (const post of metrics.posts as IGPost[]) {
        const day = new Date(post.timestamp).getDay()
        const er = ((post.like_count + post.comments_count) / followers) * 100
        if (!dayMap[day]) dayMap[day] = { totalER: 0, count: 0 }
        dayMap[day]!.totalER += er
        dayMap[day]!.count++
      }
    } else {
      for (const post of metrics.posts as FBPost[]) {
        const day = new Date(post.created_time).getDay()
        const er = ((post.reactions + post.comments + post.shares) / followers) * 100
        if (!dayMap[day]) dayMap[day] = { totalER: 0, count: 0 }
        dayMap[day]!.totalER += er
        dayMap[day]!.count++
      }
    }

    const data = DAY_NAMES.map((name, idx) => ({
      day: name,
      er: dayMap[idx] ? Math.round((dayMap[idx]!.totalER / dayMap[idx]!.count) * 10) / 10 : 0,
      count: dayMap[idx]?.count ?? 0,
    }))

    return {
      chartData: data,
      maxER: Math.max(...data.map((d) => d.er)),
      hasSufficientDays: Object.keys(dayMap).length >= 3,
    }
  }, [metrics])

  if (!hasSufficientDays) return null

  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-body font-medium text-text2">Best day to post</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {[
            { label: 'High', color: 'var(--spring-text)' },
            { label: 'Medium', color: 'rgba(46,158,104,0.30)' },
            { label: 'Low', color: 'rgba(15,21,18,0.09)' },
          ].map((l) => (
            <span
              key={l.label}
              className="text-micro"
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text3)' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="day"
            tick={{ ...CHART_AXIS_PROPS.tick, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ ...CHART_AXIS_PROPS.tick, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
            formatter={(value: unknown, _name: unknown, props: { payload?: { count: number } }) => {
              const count = props.payload?.count ?? 0
              return [`${value}% avg eng. · ${count} post${count !== 1 ? 's' : ''}`, '']
            }}
          />
          <Bar dataKey="er" radius={[3, 3, 0, 0]}>
            {chartData.map((entry) => {
              const ratio = maxER > 0 ? entry.er / maxER : 0
              const fill =
                ratio >= 0.8
                  ? 'var(--spring-text)'
                  : ratio >= 0.45
                    ? 'rgba(46,158,104,0.30)'
                    : 'rgba(15,21,18,0.09)'
              return <Cell key={entry.day} fill={fill} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
