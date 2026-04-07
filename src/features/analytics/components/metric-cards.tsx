import type { AnalyticsMetrics } from '@/types/api'

interface MetricCardsProps {
  metrics: AnalyticsMetrics
}

interface CardProps {
  label: string
  value: string | number
  deltaPct?: number | null
}

function Card({ label, value, deltaPct }: CardProps) {
  const showDelta = deltaPct !== null && deltaPct !== undefined
  const isUp = (deltaPct ?? 0) >= 0
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {showDelta && (
        <p className={`text-xs mt-0.5 font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
          {isUp ? '↑' : '↓'} {Math.abs(deltaPct!)}% vs last period
        </p>
      )}
    </div>
  )
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const { summary } = metrics
  const isIG = metrics.platform === 'instagram'

  const followersCount = isIG
    ? (metrics as import('@/types/api').InstagramMetrics).account.followers_count
    : (metrics as import('@/types/api').FacebookMetrics).account.fan_count
  const startingFollowers = followersCount - summary.new_followers
  const followerGrowthRate = startingFollowers > 0
    ? Math.round((summary.new_followers / startingFollowers) * 1000) / 10
    : null

  const frequency = summary.total_reach > 0 && summary.total_impressions > 0
    ? Math.round((summary.total_impressions / summary.total_reach) * 10) / 10
    : null

  const cards: CardProps[] = [
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
    {
      label: 'Frequency',
      value: frequency !== null ? `${frequency}x` : '—',
      deltaPct: null,
    },
  ]

  // For Facebook, add organic reach card only when data is available
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
        <Card key={card.label} {...card} />
      ))}
    </div>
  )
}
