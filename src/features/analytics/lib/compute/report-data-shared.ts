import { zonedTimeToInstant, shiftDateKey } from '@/utils/date-helpers'
import type { AnalyticsPeriod } from './period'

/**
 * The period's edges as INSTANTS, for the post reads both networks' report queries make.
 *
 * A period is agency-calendar days; a post's `posted_at` / `published_at` is an instant. Every
 * report read has to cross that boundary, and both did it with the same two `zonedTimeToInstant`
 * lines — one of them wrapping `shiftDateKey(end, 1)`, which is the part worth naming: the
 * window's upper bound is midnight at the START of the day after `end`, so a post published at
 * 23:59 on the last day is inside it. Written out per file, that is one off-by-one-day away from
 * a report that silently drops its own final day.
 *
 * Pure, and no `server-only`: it is period arithmetic, not a read. It happens to be called from
 * inside two cached server callbacks, which is not a property of the arithmetic.
 */
interface PostedWindow {
  /** Midnight at the start of the CURRENT window's first day. */
  from: string
  /** Midnight at the start of the day AFTER the window's last — an exclusive upper bound. */
  to: string
  /** Midnight at the start of the COMPARISON window's first day. */
  fromPrevious: string
}

export function postedWindow(period: AnalyticsPeriod, timezone: string): PostedWindow {
  const at = (dayKey: string) => zonedTimeToInstant(dayKey, '00:00', timezone).toISOString()
  return {
    from: at(period.start),
    to: at(shiftDateKey(period.end, 1)),
    fromPrevious: at(period.prevStart),
  }
}
