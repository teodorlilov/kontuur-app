'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsMetrics, InstagramMetrics, FacebookMetrics, IGDailyInsight } from '@/types/api'

interface FollowerTrendProps {
  metrics: AnalyticsMetrics
}

export function FollowerTrend({ metrics }: FollowerTrendProps) {
  const { summary } = metrics
  const isIG = metrics.platform === 'instagram'

  const totalFollowers = isIG
    ? (metrics as InstagramMetrics).account.followers_count
    : (metrics as FacebookMetrics).account.fan_count

  const netGrowth = summary.new_followers - summary.unfollowers

  // Follower count over time — only available for Instagram (FBDailyInsight has no fan_count)
  const followerSeries = isIG
    ? (metrics.daily_insights as IGDailyInsight[])
        .filter((d) => d.follower_count != null)
        .map((d) => ({ date: d.date.slice(5), followers: d.follower_count }))
    : []

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <p className="text-sm font-medium text-gray-700">Followers</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{totalFollowers.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">New</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">+{summary.new_followers.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unfollowers</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">−{summary.unfollowers.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Net growth</p>
          <p className={`text-2xl font-semibold mt-1 ${netGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {netGrowth >= 0 ? '+' : ''}{netGrowth.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Follower count over time (Instagram only) */}
      {isIG && (
        followerSeries.length > 1 ? (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Follower count over time
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={followerSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(value) => [
                    typeof value === 'number' ? value.toLocaleString() : String(value),
                    'Followers',
                  ]}
                />
                <Line dataKey="followers" stroke="#534AB7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No follower trend data available</p>
        )
      )}
    </div>
  )
}
