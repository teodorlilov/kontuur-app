import { DAYS_PER_WEEK } from '@/utils/constants'
import type { WeekDay } from '@/lib/queries/week-coverage'

/** Filled slots per weekday across every client, Monday first. */
export function countFilledPerDay(coverage: Record<string, WeekDay[]>): number[] {
  const counts = Array<number>(DAYS_PER_WEEK).fill(0)
  for (const week of Object.values(coverage)) {
    week.forEach((day, index) => {
      if (day.state !== 'open') counts[index] = (counts[index] ?? 0) + 1
    })
  }
  return counts
}

/** How many of a week's days are published, scheduled, or still open. */
export function countWeek(week: WeekDay[]): { published: number; scheduled: number; open: number } {
  let published = 0
  let scheduled = 0
  for (const day of week) {
    if (day.state === 'published') published += 1
    else if (day.state === 'scheduled') scheduled += 1
  }
  return { published, scheduled, open: week.length - published - scheduled }
}

/**
 * A week's chips stated once in words, for anyone who cannot see them — the spoken equivalent
 * DESIGN.md requires beside every coverage graphic.
 */
export function describeWeek(week: WeekDay[]): string {
  const { published, scheduled, open } = countWeek(week)
  return `${published} published, ${scheduled} scheduled, ${open} open`
}
