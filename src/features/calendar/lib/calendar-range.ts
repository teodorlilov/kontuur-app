import { getMondayISO, getWeekdayIndex, shiftDateKey, toDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * What range the calendar is showing, and how to step it.
 *
 * Both units are pure and both are stepped by a pure updater, because React
 * double-invokes state updaters under StrictMode to surface impurity. An earlier month
 * updater called `setYear` from inside itself: it fired twice and skipped a whole year.
 */

// ---- Month ----

/** The month a calendar is showing. Year and month move together, so they are one value. */
export interface MonthView {
  year: number
  month: number
}

/**
 * Which month "today" falls in, for the given zone.
 *
 * Resolved through `toDateKey` rather than `getMonth()`: either side of midnight the browser's
 * month and the agency's differ, which opens the wrong grid on the first or last of a month — and
 * differs between the server render and the client one.
 */
export function monthViewIn(timeZone: string): MonthView {
  const [year, month] = toDateKey(new Date(), timeZone).split('-').map(Number)
  return { year: year!, month: month! - 1 }
}

/** Steps a month view backwards, carrying the year. */
export function prevMonthView({ year, month }: MonthView): MonthView {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

/** Steps a month view forwards, carrying the year. */
export function nextMonthView({ year, month }: MonthView): MonthView {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
}

/** What a month view is called. */
export function formatMonthLabel({ year, month }: MonthView): string {
  return `${MONTH_NAMES[month]} ${year}`
}

export function isSameMonth(date: Date, month: number, year: number): boolean {
  return date.getMonth() === month && date.getFullYear() === year
}

/**
 * Returns an array of Date objects for rendering a full month grid.
 * Includes padding days from the previous/next month to fill complete weeks.
 * Week starts on Monday.
 */
export function getDaysInMonth(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday = 0, Sunday = 6
  const startDow = (firstDay.getDay() + 6) % 7
  const endDow = (lastDay.getDay() + 6) % 7

  const days: Date[] = []

  // Padding from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i))
  }

  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }

  // Padding to fill last week (up to Sunday)
  const remaining = 6 - endDow
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i))
  }

  return days
}

// ---- Week ----

/**
 * The week a calendar is showing: the Monday of it, as a 'YYYY-MM-DD' key.
 *
 * A bare date key rather than a `{ year, week }` pair, because a week number is not a
 * thing any of the data speaks — `getWeekRange`, `getWeekDayKeys` and
 * `createApprovalBatch` all take a Monday key, so this is the value that already
 * travels end to end.
 */
export type WeekView = string

/** The Monday of the week "today" falls in, for the given zone. */
export function weekViewIn(timeZone: string): WeekView {
  return getMondayISO(new Date(), timeZone)
}

/** Steps a week view backwards. Pure, for the same StrictMode reason as the month. */
export function prevWeekView(weekStartISO: WeekView): WeekView {
  return shiftDateKey(weekStartISO, -DAYS_PER_WEEK)
}

/** Steps a week view forwards. */
export function nextWeekView(weekStartISO: WeekView): WeekView {
  return shiftDateKey(weekStartISO, DAYS_PER_WEEK)
}

/**
 * What a week view is called: "3 – 9 August 2026".
 *
 * The month is named once when both ends share it and twice when they do not; the year
 * likewise. Five weeks a year straddle a month and one straddles a year, and the naive
 * form ("3 August – 9 August 2026") reads as clutter on the other forty-six.
 *
 * String arithmetic on the key, never `Date`: this is a label for a bare date range, and
 * parsing it into an instant would let a zone offset move the day the header prints.
 */
export function formatWeekRange(weekStartISO: WeekView): string {
  const end = shiftDateKey(weekStartISO, DAYS_PER_WEEK - 1)
  const [startYear, startMonth, startDay] = weekStartISO.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)

  const startPart =
    startMonth === endMonth ? `${startDay}` : `${startDay} ${MONTH_NAMES[startMonth! - 1]}`
  const yearPart = startYear === endYear ? `${endYear}` : `${startYear} – ${endYear}`
  return `${startPart} – ${endDay} ${MONTH_NAMES[endMonth! - 1]} ${yearPart}`
}

// ---- Moving between the two ----
//
// Switching views keeps the reader where they were. Landing on today's month after
// browsing September loses the place they navigated to, which is the only reason they
// switched.

/**
 * The month a viewed week sits in.
 *
 * The week's *Monday* decides it, so a week straddling two months resolves to the one it
 * opens in. Either answer is arbitrary for those five weeks a year; picking the start is
 * at least consistent with how the range is labelled.
 */
export function monthViewOfWeek(weekStartISO: WeekView): MonthView {
  const [year, month] = weekStartISO.split('-').map(Number)
  return { year: year!, month: month! - 1 }
}

/** The week a viewed month opens in — the week grid's landing place when views swap. */
export function weekViewOfMonth({ year, month }: MonthView): WeekView {
  const firstOfMonth = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`
  // Resolved in UTC deliberately: this is calendar arithmetic on a bare date, not an
  // instant, so involving a zone here would shift the month's first day by the offset.
  const weekday = getWeekdayIndex(new Date(`${firstOfMonth}T00:00:00Z`), 'UTC')
  return shiftDateKey(firstOfMonth, -weekday)
}
