'use client'

import type { AnalyticsMetrics } from '@/types/api'
import { StatCard } from '@/components/ui/stat-card'

interface MetricCardsProps {
  metrics: AnalyticsMetrics
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const { summary } = metrics
  const isIG = metrics.platform === 'instagram'

  const followersCount = isIG
    ? (metrics as import('@/types/api').InstagramMetrics).account.followers_count
    : (metrics as import('@/types/api').FacebookMetrics).account.fan_count
  const startingFollowers = followersCount - summary.new_followers
  const followerGrowthRate =
    startingFollowers > 0
      ? Math.round((summary.new_followers / startingFollowers) * 1000) / 10
      : null

  const frequency =
    summary.total_reach > 0 && summary.total_impressions > 0
      ? Math.round((summary.total_impressions / summary.total_reach) * 10) / 10
      : null

  const cards = [
    {
      label: 'Reach',
      value: summary.total_reach.toLocaleString(),
      deltaPct: summary.reach_delta_pct,
    },
    {
      label: 'Views',
      value: summary.total_impressions.toLocaleString(),
      deltaPct: summary.views_delta_pct,
    },
    {
      label: 'Profile visits',
      value: isIG ? metrics.summary.total_profile_views.toLocaleString() : '—',
      deltaPct: isIG ? metrics.summary.profile_views_delta_pct : null,
    },
    {
      label: 'New followers',
      value: `+${summary.new_followers.toLocaleString()}`,
      deltaPct: summary.followers_delta_pct,
    },
    {
      label: 'Follower growth rate',
      value: followerGrowthRate !== null ? `+${followerGrowthRate}%` : '—',
      deltaPct: null,
    },
    { label: 'Frequency', value: frequency !== null ? `${frequency}x` : '—', deltaPct: null },
  ]

  if (!isIG && metrics.summary.organic_reach_pct != null) {
    cards.push({
      label: 'Organic reach',
      value: `${metrics.summary.organic_reach_pct}%`,
      deltaPct: null,
    })
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  )
}
