import { DAYS_PER_WEEK } from '@/utils/constants'
import type { DayState } from '@/lib/queries/cache'
import type { StatPillTone } from '@/features/dashboard/components/stat-card'
import type { DashboardMetrics } from '@/features/dashboard/queries'

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Filled slots per weekday across every client, Monday first. */
export function countFilledPerDay(coverage: Record<string, DayState[]>): number[] {
  const counts = Array<number>(DAYS_PER_WEEK).fill(0)
  for (const week of Object.values(coverage)) {
    week.forEach((day, index) => {
      if (day !== 'open') counts[index] = (counts[index] ?? 0) + 1
    })
  }
  return counts
}

/** Monday-first index of today in the agency's timezone. */
export function resolveTodayIndex(timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(
    new Date()
  )
  return Math.max(WEEKDAY_ORDER.indexOf(weekday), 0)
}

/** Month-over-month movement, phrased only when there is something to compare. */
export function describePublishedDelta(metrics: DashboardMetrics): {
  text: string
  tone: StatPillTone
} {
  const delta = metrics.publishedThisMonth - metrics.publishedLastMonth
  if (metrics.publishedLastMonth === 0 && metrics.publishedThisMonth === 0) {
    return { text: 'Nothing published yet', tone: 'muted' }
  }
  if (delta === 0) return { text: 'Same as last month', tone: 'muted' }
  return {
    text: `${delta > 0 ? '+' : ''}${delta} vs last month`,
    tone: delta > 0 ? 'positive' : 'attention',
  }
}
