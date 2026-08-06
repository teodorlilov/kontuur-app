import { DAYS_PER_WEEK, MS_PER_DAY } from '@/utils/constants'
import { toDateKey } from '@/utils/date-helpers'
import type { DayState } from '@/lib/queries/cache'

/** Beyond this, a bare weekday stops being unambiguous and needs a date. */
const WEEKDAY_HORIZON_DAYS = 6
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

/**
 * A publish slot as the agency reads it: 24h time in the agency's zone, the
 * weekday only when it is not today, and a date once "Mon" could mean either of
 * two Mondays. Formatted on the server so the label never depends on the
 * viewer's clock.
 */
export function formatPublishSlot(
  iso: string,
  timeZone: string,
  now: Date = new Date()
): { label: string; isToday: boolean } {
  const date = new Date(iso)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)

  if (toDateKey(date, timeZone) === toDateKey(now, timeZone)) {
    return { label: `Today ${time}`, isToday: true }
  }

  const daysOut = (date.getTime() - now.getTime()) / MS_PER_DAY
  const parts: Intl.DateTimeFormatOptions =
    daysOut > WEEKDAY_HORIZON_DAYS
      ? { timeZone, day: 'numeric', month: 'short' }
      : { timeZone, weekday: 'short' }

  return {
    label: `${new Intl.DateTimeFormat('en-GB', parts).format(date)} ${time}`,
    isToday: false,
  }
}
