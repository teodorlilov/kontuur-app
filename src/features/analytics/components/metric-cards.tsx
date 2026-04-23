'use client'

import type { AnalyticsMetrics } from '@/types/api'
import { MetricCard } from '@/components/dashboard/metric-card'
import { calcFollowerGrowthRate } from '../utils/metrics'

interface MetricCardsProps {
  metrics: AnalyticsMetrics
}

function formatDelta(pct: number | null): { delta?: string; deltaType?: 'positive' | 'negative' | 'neutral' } {
  if (pct == null) return {}
  const type = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral'
  return { delta: `${pct > 0 ? '+' : ''}${pct}% vs last period`, deltaType: type }
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const { summary } = metrics
  const isIG = metrics.platform === 'instagram'

  const followerGrowthRate = calcFollowerGrowthRate(metrics)

  const frequency =
    summary.total_reach > 0 && summary.total_impressions > 0
      ? Math.round((summary.total_impressions / summary.total_reach) * 10) / 10
      : null

  const cards: Array<{
    label: string
    value: string
    accentColor: string
    delta?: string
    deltaType?: 'positive' | 'negative' | 'neutral'
  }> = [
    {
      label: 'Reach',
      value: summary.total_reach.toLocaleString(),
      accentColor: 'var(--accent-m1)',
      ...formatDelta(summary.reach_delta_pct),
    },
    {
      label: 'Views',
      value: summary.total_impressions.toLocaleString(),
      accentColor: 'var(--accent-m2)',
      ...formatDelta(summary.views_delta_pct),
    },
    {
      label: 'Profile visits',
      value: isIG ? metrics.summary.total_profile_views.toLocaleString() : '—',
      accentColor: 'var(--accent-m3)',
      ...formatDelta(isIG ? metrics.summary.profile_views_delta_pct : null),
    },
    {
      label: 'New followers',
      value: `+${summary.new_followers.toLocaleString()}`,
      accentColor: 'var(--accent-m3)',
      ...formatDelta(summary.followers_delta_pct),
    },
    {
      label: 'Follower growth rate',
      value: followerGrowthRate !== null ? `+${followerGrowthRate}%` : '—',
      accentColor: 'var(--accent-m4)',
    },
    {
      label: 'Frequency',
      value: frequency !== null ? `${frequency}x` : '—',
      accentColor: 'var(--accent-m1)',
    },
  ]

  if (!isIG && metrics.summary.organic_reach_pct != null) {
    cards.push({
      label: 'Organic reach',
      value: `${metrics.summary.organic_reach_pct}%`,
      accentColor: 'var(--accent-m3)',
    })
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  )
}
