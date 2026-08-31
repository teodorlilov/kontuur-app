import { DAYS_PER_WEEK } from '@/utils/constants'
import type { DayState } from '@/lib/queries/cache'

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
