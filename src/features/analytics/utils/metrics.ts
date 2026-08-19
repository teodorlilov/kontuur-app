import type { InstagramMetrics } from '@/types/api'

/** Returns the follower count from the account object. */
export function getFollowerCount(metrics: InstagramMetrics): number {
  return metrics.account.followers_count
}

/** Returns the net follower change for the period. */
export function getNetFollowerChange(metrics: InstagramMetrics): number {
  return metrics.summary.new_followers - metrics.summary.unfollowers
}

/** Calculates follower growth rate as a percentage, or null when starting count is zero. */
export function calcFollowerGrowthRate(metrics: InstagramMetrics): number | null {
  const total = getFollowerCount(metrics)
  const netChange = getNetFollowerChange(metrics)
  const starting = total - netChange
  if (starting <= 0) return null
  return Math.round((netChange / starting) * 1000) / 10
}
