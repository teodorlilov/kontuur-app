'use client'

import type { InstagramMetrics } from '@/types/api'
import { MetricCard } from '@/components/ui/metric-card'
import { calcFollowerGrowthRate } from '../utils/metrics'

interface MetricCardsProps {
  metrics: InstagramMetrics
}

type CardDef = {
  label: string
  value: string
  accentColor: string
  delta?: string
  deltaType?: 'positive' | 'negative' | 'neutral'
}

function formatDelta(pct: number | null): Pick<CardDef, 'delta' | 'deltaType'> {
  if (pct == null) return {}
  const type = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral'
  return { delta: `${pct > 0 ? '+' : ''}${pct}% vs last period`, deltaType: type }
}

function formatSignedNumber(n: number): string {
  return n >= 0 ? `+${n.toLocaleString()}` : `−${Math.abs(n).toLocaleString()}`
}

/** Builds the overview metric cards from the report summary. */
function buildCards(metrics: InstagramMetrics): CardDef[] {
  const { summary } = metrics
  const followerGrowthRate = calcFollowerGrowthRate(metrics)

  return [
    {
      label: 'Reach',
      value: summary.total_reach.toLocaleString(),
      accentColor: 'var(--metric-1)',
      delta: formatDelta(summary.reach_delta_pct).delta ?? 'sum of daily reach',
      deltaType: formatDelta(summary.reach_delta_pct).deltaType ?? 'neutral',
    },
    {
      label: 'Views',
      value: summary.total_impressions.toLocaleString(),
      accentColor: 'var(--metric-2)',
      ...formatDelta(summary.views_delta_pct),
    },
    {
      label: 'Profile visits',
      value: summary.total_profile_views.toLocaleString(),
      accentColor: 'var(--metric-3)',
      ...formatDelta(summary.profile_views_delta_pct),
    },
    {
      label: 'Accounts engaged',
      value: summary.total_accounts_engaged.toLocaleString(),
      accentColor: 'var(--metric-4)',
      delta: formatDelta(summary.accounts_engaged_delta_pct).delta ?? 'sum of daily',
      deltaType: formatDelta(summary.accounts_engaged_delta_pct).deltaType ?? 'neutral',
    },
    {
      label: 'New followers',
      value: `+${summary.new_followers.toLocaleString()}`,
      accentColor: 'var(--metric-3)',
      ...formatDelta(summary.net_followers_delta_pct),
    },
    {
      label: 'Follower growth rate',
      value: followerGrowthRate !== null ? `${formatSignedNumber(followerGrowthRate)}%` : '—',
      accentColor: 'var(--metric-1)',
    },
    {
      label: 'External link taps',
      value: summary.total_website_clicks.toLocaleString(),
      accentColor: 'var(--metric-2)',
      ...formatDelta(summary.website_clicks_delta_pct),
    },
  ]
}

export function MetricCards({ metrics }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {buildCards(metrics).map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  )
}
