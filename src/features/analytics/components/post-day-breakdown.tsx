'use client'

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

  // Need at least 3 different days to make the chart meaningful
  if (Object.keys(dayMap).length < 3) return null

  const chartData = DAY_NAMES.map((name, idx) => ({
    day: name,
    er: dayMap[idx] ? Math.round((dayMap[idx]!.totalER / dayMap[idx]!.count) * 10) / 10 : 0,
    count: dayMap[idx]?.count ?? 0,
  }))

  const maxER = Math.max(...chartData.map((d) => d.er))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-700 mb-4">Best day to post</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(value: unknown, _name: unknown, props: { payload?: { count: number } }) => {
              const count = props.payload?.count ?? 0
              return [`${value}% avg eng. · ${count} post${count !== 1 ? 's' : ''}`, '']
            }}
          />
          <Bar dataKey="er" radius={[3, 3, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.day}
                fill={entry.er === maxER && maxER > 0 ? '#534AB7' : '#c4bff0'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
