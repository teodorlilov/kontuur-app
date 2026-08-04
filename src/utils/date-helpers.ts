import { DAYS_PER_WEEK } from '@/utils/constants'

/** Weekday names in the order the app renders a week. */
const MONDAY_FIRST_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/**
 * Every helper below takes an optional IANA `timeZone`. Leaving it undefined
 * makes Intl fall back to the runtime zone, which is what the callers that
 * predate agency timezones already relied on — so omitting it is a no-op.
 */

/**
 * Formatters are cached per zone: toDateKey runs once per post and once per
 * cell on the calendar grid, and constructing an Intl.DateTimeFormat is orders
 * of magnitude more expensive than formatting with one.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(cacheKey: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let formatter = formatterCache.get(cacheKey)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', options)
    formatterCache.set(cacheKey, formatter)
  }
  return formatter
}

/** Format a Date as 'YYYY-MM-DD' in the given zone (runtime zone when omitted). */
export function toDateKey(date: Date, timeZone?: string): string {
  const parts = getFormatter(`key:${timeZone ?? ''}`, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** Weekday name (lowercase), hour and minute of an instant in `timezone`, from one formatter pass. */
export function getZonedParts(
  date: Date,
  timezone = 'UTC'
): { weekday: string; hour: number; minute: number } {
  const parts = getFormatter(`zoned:${timezone}`, {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    weekday: value('weekday').toLowerCase(),
    // hour12:false reports midnight as 24 in some ICU builds.
    hour: Number(value('hour')) % 24,
    minute: Number(value('minute')),
  }
}

/** Monday-first index (0–6) of a date's weekday in the given zone. */
export function getWeekdayIndex(date: Date = new Date(), timeZone?: string): number {
  const name = getFormatter(`weekday:${timeZone ?? ''}`, { weekday: 'long', timeZone }).format(date)
  return Math.max(MONDAY_FIRST_WEEKDAYS.indexOf(name), 0)
}

/** Shift a 'YYYY-MM-DD' calendar date by whole days, without touching a clock. */
function shiftDateKey(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number)
  // UTC arithmetic on a bare calendar date: no local midnight, so no DST edge.
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10)
}

/**
 * Returns the ISO date string (YYYY-MM-DD) of the Monday of the week containing
 * the given date, as that week falls in `timeZone`. Both the weekday lookup and
 * the subtraction happen on the zone's calendar date, so a caller east or west
 * of the server never gets the neighbouring week.
 */
export function getMondayISO(date: Date = new Date(), timeZone?: string): string {
  return shiftDateKey(toDateKey(date, timeZone), -getWeekdayIndex(date, timeZone))
}

/** The seven 'YYYY-MM-DD' keys of the week starting at `weekStartISO`. */
export function getWeekDayKeys(weekStartISO: string): string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => shiftDateKey(weekStartISO, index))
}

/** How far `timeZone` sits from UTC at a given instant, in milliseconds. */
function getZoneOffsetMs(date: Date, timeZone?: string): number {
  const parts = getFormatter(`offset:${timeZone ?? ''}`, {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  // hour12:false reports midnight as 24 in some ICU builds.
  const asUTC = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second')
  )
  return asUTC - date.getTime()
}

/** The instant at which a calendar date begins in `timeZone`. */
function getZonedDayStart(dateISO: string, timeZone?: string): Date {
  const asIfUTC = new Date(`${dateISO}T00:00:00Z`)
  // Two passes: the first offset is sampled at the wrong instant when the guess
  // lands on the far side of a DST transition, the second corrects it.
  let instant = asIfUTC
  for (let pass = 0; pass < 2; pass++) {
    instant = new Date(asIfUTC.getTime() - getZoneOffsetMs(instant, timeZone))
  }
  return instant
}

/**
 * Half-open [from, to) instants covering the week that starts on `weekStartISO`
 * in `timeZone`. Query bounds and day bucketing must both come from here, or a
 * post near midnight lands in a column the range never fetched.
 */
export function getWeekRange(
  weekStartISO: string,
  timeZone?: string
): { from: string; to: string } {
  return {
    from: getZonedDayStart(weekStartISO, timeZone).toISOString(),
    to: getZonedDayStart(shiftDateKey(weekStartISO, DAYS_PER_WEEK), timeZone).toISOString(),
  }
}

/**
 * Instants at which the current and previous calendar month begin in
 * `timeZone`. "Published this month" is a claim about the reader's month, not
 * the server's.
 */
export function getMonthBoundaries(timeZone?: string): {
  monthStart: string
  lastMonthStart: string
} {
  const [year = 0, month = 1] = toDateKey(new Date(), timeZone).split('-').map(Number)
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const firstOf = (y: number, m: number) =>
    `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`

  return {
    monthStart: getZonedDayStart(firstOf(year, month), timeZone).toISOString(),
    lastMonthStart: getZonedDayStart(
      firstOf(previous.year, previous.month),
      timeZone
    ).toISOString(),
  }
}

/** Combine a date string (YYYY-MM-DD) and time string (HH:MM) into an ISO timestamp. */
export function formatScheduledAt(date: string, time: string): string {
  return new Date(`${date}T${time || '12:00'}:00`).toISOString()
}

/**
 * Clamp an 'HH:MM' string to the top of its hour. Generation slots are
 * day + hour — minutes would be stored but never honoured, so they are
 * dropped at every write and hydration site. Invalid input falls back to
 * '09:00', the historical fire time.
 */
export function snapTimeToHour(time: string | null | undefined): string {
  const hour = Number.parseInt(time ?? '', 10)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return '09:00'
  return `${String(hour).padStart(2, '0')}:00`
}

/** Map a day name (e.g. 'Monday') to the next occurrence as YYYY-MM-DD. */
export function getNextDateForDay(dayName: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = days.indexOf(dayName.toLowerCase())
  if (targetIdx === -1) return ''
  const today = new Date()
  const todayIdx = today.getDay()
  const diff = (targetIdx - todayIdx + 7) % 7 || 7
  const target = new Date(today)
  target.setDate(today.getDate() + diff)
  return toDateKey(target)
}
