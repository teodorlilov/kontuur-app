import type { AnalyticsMetrics, InstagramMetrics, FacebookMetrics } from '@/types/api'

/** Returns the follower/fan count from the account object regardless of platform. */
export function getFollowerCount(metrics: AnalyticsMetrics): number {
  // Discriminated union doesn't narrow via property access alone
  return metrics.platform === 'instagram'
    ? (metrics as InstagramMetrics).account.followers_count
    : (metrics as FacebookMetrics).account.fan_count
}

/** Returns the net follower change for the period. */
export function getNetFollowerChange(metrics: AnalyticsMetrics): number {
  return metrics.summary.new_followers - metrics.summary.unfollowers
}

/** Calculates follower growth rate as a percentage, or null when starting count is zero. */
export function calcFollowerGrowthRate(metrics: AnalyticsMetrics): number | null {
  const total = getFollowerCount(metrics)
  const netChange = getNetFollowerChange(metrics)
  const starting = total - netChange
  if (starting <= 0) return null
  return Math.round((netChange / starting) * 1000) / 10
}
