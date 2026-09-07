import { zonedTimeToInstant, shiftDateKey } from '@/utils/date-helpers'
import type { AnalyticsPeriod } from './period'

/**
 * The period's edges as INSTANTS, for the post reads both networks' report queries make
 * (instagram/report-data.ts, facebook/facebook-report-data.ts). A period is agency-calendar
 * days; a post's `posted_at` / `published_at` is an instant, so every report read crosses that
 * boundary — one off-by-one away from silently dropping the window's own final day.
 *
 * No `server-only`: this is period arithmetic, not a read. It happens to be called from inside
 * two cached server callbacks, which is not a property of the arithmetic.
 */
interface PostedWindow {
  from: string
  /** Midnight at the start of the day AFTER the window's last — an EXCLUSIVE upper bound. */
  to: string
  /** The COMPARISON window's first day: the trend draws both lines, so it needs its posts too. */
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
