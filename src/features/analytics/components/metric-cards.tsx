'use client'

import type { AnalyticsMetrics, InstagramMetrics, FacebookMetrics } from '@/types/api'
import { MetricCard } from '@/components/ui/metric-card'
import { calcFollowerGrowthRate } from '../utils/metrics'

interface MetricCardsProps {
  metrics: AnalyticsMetrics
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

/** Builds metric cards for Instagram. */
function buildIGCards(metrics: InstagramMetrics): CardDef[] {
  const { summary } = metrics
  const followerGrowthRate = calcFollowerGrowthRate(metrics)

  return [
    { label: 'Reach', value: summary.total_reach.toLocaleString(), accentColor: 'var(--accent-m1)',
      delta: formatDelta(summary.reach_delta_pct).delta ?? 'sum of daily reach',
      deltaType: formatDelta(summary.reach_delta_pct).deltaType ?? 'neutral' },
    { label: 'Views', value: summary.total_impressions.toLocaleString(), accentColor: 'var(--accent-m2)',
      ...formatDelta(summary.views_delta_pct) },
    { label: 'Profile visits', value: summary.total_profile_views.toLocaleString(), accentColor: 'var(--accent-m3)',
      ...formatDelta(summary.profile_views_delta_pct) },
    { label: 'Accounts engaged', value: summary.total_accounts_engaged.toLocaleString(), accentColor: 'var(--accent-m4)',
      delta: formatDelta(summary.accounts_engaged_delta_pct).delta ?? 'sum of daily',
      deltaType: formatDelta(summary.accounts_engaged_delta_pct).deltaType ?? 'neutral' },
    { label: 'New followers', value: `+${summary.new_followers.toLocaleString()}`, accentColor: 'var(--accent-m3)',
      ...formatDelta(summary.net_followers_delta_pct) },
    { label: 'Follower growth rate', value: followerGrowthRate !== null ? `${formatSignedNumber(followerGrowthRate)}%` : '—',
      accentColor: 'var(--accent-m1)' },
    { label: 'External link taps', value: summary.total_website_clicks.toLocaleString(), accentColor: 'var(--accent-m2)',
      ...formatDelta(summary.website_clicks_delta_pct) },
  ]
}

/** Builds metric cards for Facebook. */
function buildFBCards(metrics: FacebookMetrics): CardDef[] {
  const { summary } = metrics
  const followerGrowthRate = calcFollowerGrowthRate(metrics)
  const frequency =
    summary.total_reach > 0 && summary.total_impressions > 0
      ? Math.round((summary.total_impressions / summary.total_reach) * 10) / 10
      : null

  const cards: CardDef[] = [
    { label: 'Reach', value: summary.total_reach.toLocaleString(), accentColor: 'var(--accent-m1)',
      ...formatDelta(summary.reach_delta_pct) },
    { label: 'Views', value: summary.total_impressions.toLocaleString(), accentColor: 'var(--accent-m2)',
      ...formatDelta(summary.views_delta_pct) },
    { label: 'Engaged users', value: summary.total_engaged_users.toLocaleString(), accentColor: 'var(--accent-m3)' },
    { label: 'New followers', value: `+${summary.new_followers.toLocaleString()}`, accentColor: 'var(--accent-m3)',
      ...formatDelta(summary.followers_delta_pct) },
    { label: 'Follower growth rate', value: followerGrowthRate !== null ? `+${followerGrowthRate}%` : '—',
      accentColor: 'var(--accent-m4)' },
    { label: 'Frequency', value: frequency !== null ? `${frequency}x` : '—', accentColor: 'var(--accent-m1)' },
  ]
  if (summary.organic_reach_pct != null) {
    cards.push({ label: 'Organic reach', value: `${summary.organic_reach_pct}%`, accentColor: 'var(--accent-m3)' })
  }
  return cards
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const cards = metrics.platform === 'instagram'
    ? buildIGCards(metrics as InstagramMetrics)
    : buildFBCards(metrics as FacebookMetrics)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  )
}
