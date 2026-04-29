'use client'

import type { AnalyticsMetrics, InstagramMetrics, FacebookMetrics, IGDailyInsight } from '@/types/api'
import { MetricCard } from '@/components/ui/metric-card'
import { getFollowerCount, getNetFollowerChange, calcFollowerGrowthRate } from '../utils/metrics'
import { AudienceSummary } from './audience-summary'
import { FollowerTrend } from './follower-trend'
import { AudienceSection } from './audience-section'

interface AudienceTabProps {
  metrics: AnalyticsMetrics
}

function getDeltaPct(metrics: AnalyticsMetrics): number | null {
  return metrics.platform === 'instagram'
    ? (metrics as InstagramMetrics).summary.net_followers_delta_pct
    : (metrics as FacebookMetrics).summary.followers_delta_pct
}

/** Audience tab — follower summary, trend chart, growth metrics, demographics. */
export function AudienceTab({ metrics }: AudienceTabProps) {
  const { summary } = metrics
  const totalFollowers = getFollowerCount(metrics)
  const netChange = getNetFollowerChange(metrics)
  const days = metrics.daily_insights.length || 1
  const avgDailyNew = Math.round((summary.new_followers / days) * 10) / 10
  const peakDay = findPeakAcquisitionDay(metrics)
  const growthRate = calcFollowerGrowthRate(metrics)

  return (
    <div className="space-y-6">
      <AudienceSummary
        total={totalFollowers}
        newCount={summary.new_followers}
        unfollows={summary.unfollowers}
        netGrowth={netChange}
        followersDeltaPct={getDeltaPct(metrics)}
      />
      <FollowerTrend metrics={metrics} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          label="Avg daily new followers"
          value={String(avgDailyNew)}
          delta={avgDailyNew > 0 ? `~${avgDailyNew}/day this period` : 'no new followers'}
          deltaType={avgDailyNew > 0 ? 'positive' : 'neutral'}
          accentColor="var(--accent-m2)"
        />
        <MetricCard
          label="Peak acquisition day"
          value={peakDay.count > 0 ? String(peakDay.count) : '—'}
          delta={peakDay.label}
          deltaType="neutral"
          accentColor="var(--accent-m1)"
        />
        <MetricCard
          label="Growth rate"
          value={growthRate !== null ? `+${growthRate}%` : '—'}
          delta={growthRate !== null && growthRate >= 2 ? '↑ Strong period' : 'vs starting count'}
          deltaType={growthRate !== null && growthRate > 0 ? 'positive' : 'neutral'}
          accentColor="var(--accent-m3)"
        />
      </div>
      <AudienceSection metrics={metrics} />
    </div>
  )
}

function findPeakAcquisitionDay(metrics: AnalyticsMetrics): { count: number; label: string } {
  // Only Instagram daily insights include follower_count
  if (metrics.platform !== 'instagram') return { count: 0, label: '' }
  const insights = metrics.daily_insights as IGDailyInsight[]
  let maxDelta = 0
  let peakDate = ''
  for (let i = 1; i < insights.length; i++) {
    const prev = insights[i - 1]?.follower_count ?? 0
    const curr = insights[i]?.follower_count ?? 0
    const delta = curr - prev
    if (delta > maxDelta) {
      maxDelta = delta
      peakDate = insights[i]!.date
    }
  }
  if (maxDelta === 0) return { count: 0, label: '' }
  const d = new Date(peakDate)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { count: maxDelta, label }
}
