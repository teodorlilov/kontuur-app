import type { AnalyticsMetrics, InstagramMetrics, FacebookMetrics } from '@/types/api'

/** Capitalizes the first letter of a platform name (e.g. "instagram" → "Instagram"). */
export function capitalizePlatform(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

/** Returns the follower/fan count from the account object regardless of platform. */
export function getFollowerCount(metrics: AnalyticsMetrics): number {
  // AnalyticsMetrics is a discriminated union on `platform` but the type
  // doesn't narrow via property access alone, so we assert after checking.
  return metrics.platform === 'instagram'
    ? (metrics as InstagramMetrics).account.followers_count
    : (metrics as FacebookMetrics).account.fan_count
}

/** Calculates follower growth rate as a percentage, or null when starting count is zero. */
export function calcFollowerGrowthRate(metrics: AnalyticsMetrics): number | null {
  const total = getFollowerCount(metrics)
  const starting = total - metrics.summary.new_followers
  if (starting <= 0) return null
  return Math.round((metrics.summary.new_followers / starting) * 1000) / 10
}
