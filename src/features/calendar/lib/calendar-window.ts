import { getMondayISO, getWeekRange, shiftDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'

/**
 * How far the calendar's one query reaches around its anchor week. Wide enough
 * that every step in a normal session stays inside the loaded range; the
 * archive beyond it stays in the database until navigation actually walks
 * there and the view recenters.
 */
export const WINDOW_WEEKS_BACK = 8
export const WINDOW_WEEKS_FORWARD = 12

export interface CalendarWindow {
  /** Monday date-key of the first loaded week. */
  startKey: string
  /** Sunday date-key of the last loaded week. */
  endKey: string
  /** Half-open [from, to) query instants for the agency's zone. */
  from: string
  to: string
}

/**
 * Snap any date-key to the Monday of its week. Zone-free on purpose — a
 * date-key already names a calendar day, so its weekday is absolute.
 */
export function mondayOfKey(dateKey: string): string {
  return getMondayISO(new Date(`${dateKey}T12:00:00Z`), 'UTC')
}

/**
 * The loaded range around an anchor Monday. The page derives its query bounds
 * from this and the view derives its recenter check from it — one function, so
 * the two can never disagree about where the window ends.
 */
export function getCalendarWindow(anchorMondayISO: string, timeZone: string): CalendarWindow {
  const startWeek = shiftDateKey(anchorMondayISO, -WINDOW_WEEKS_BACK * DAYS_PER_WEEK)
  const endWeek = shiftDateKey(anchorMondayISO, WINDOW_WEEKS_FORWARD * DAYS_PER_WEEK)
  return {
    startKey: startWeek,
    endKey: shiftDateKey(endWeek, DAYS_PER_WEEK - 1),
    from: getWeekRange(startWeek, timeZone).from,
    to: getWeekRange(endWeek, timeZone).to,
  }
}
