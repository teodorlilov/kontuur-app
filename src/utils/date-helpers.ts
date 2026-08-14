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
export function shiftDateKey(dateISO: string, days: number): string {
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

/**
 * The instant at which a wall-clock time occurs in `timeZone`.
 *
 * The inverse of `toDateKey`/`getZonedParts`: those read an instant in a zone, this
 * one resolves a zone's wall clock back to an instant. Writing a scheduled time needs
 * this direction, and until now nothing exported it — every writer built
 * `new Date('YYYY-MM-DDTHH:MM:00')`, which the engine resolves in the *runtime* zone
 * (the browser on the client, UTC on Vercel) and never in the agency's.
 *
 * DST edges, both asserted in the tests so the behaviour is recorded rather than
 * rediscovered: a wall clock inside the spring-forward gap does not exist and resolves
 * forward past the transition; one inside the fall-back overlap occurs twice and
 * resolves to the *second* (later, post-transition) occurrence, because the second pass
 * samples the offset after the shift. Either occurrence would be defensible — what
 * matters is that scheduling 03:30 on a fall-back day is not a coin flip.
 */
export function zonedTimeToInstant(dateISO: string, time: string, timeZone?: string): Date {
  const asIfUTC = new Date(`${dateISO}T${time}:00Z`)
  // Two passes: the first offset is sampled at the wrong instant when the guess
  // lands on the far side of a DST transition, the second corrects it.
  let instant = asIfUTC
  for (let pass = 0; pass < 2; pass++) {
    instant = new Date(asIfUTC.getTime() - getZoneOffsetMs(instant, timeZone))
  }
  return instant
}

/** The instant at which a calendar date begins in `timeZone`. */
function getZonedDayStart(dateISO: string, timeZone?: string): Date {
  return zonedTimeToInstant(dateISO, '00:00', timeZone)
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

/**
 * Combine a date string (YYYY-MM-DD) and time string (HH:MM) into an ISO timestamp,
 * reading the pair as wall-clock time in `timeZone`.
 *
 * The ISO form of `zonedTimeToInstant`, which is what every existing writer wants.
 * Omitting the zone reproduces the old bare-string parse exactly — Intl falls back to
 * the runtime zone — so callers that predate agency timezones are unaffected.
 */
export function formatScheduledAt(date: string, time: string, timeZone?: string): string {
  return zonedTimeToInstant(date, time || '12:00', timeZone).toISOString()
}

/**
 * An ISO instant as the date/time input pair the scheduling forms edit, in `timeZone`.
 *
 * Lives here rather than in the review feature because it is the read side of
 * `formatScheduledAt` and shares its zone contract; keeping the pair together is what
 * stops one of them growing a zone the other lacks.
 *
 * `timeZone` is required, unlike its siblings above. Those default to the runtime zone,
 * which is wrong but at least matches what their callers already did; this function is
 * new to every caller, and a form prefilled in the wrong zone is invisible until someone
 * notices a post went out an hour early. A missing argument should be a build error.
 */
export function isoToDateTimeFields(iso: string, timeZone: string): { date: string; time: string } {
  const instant = new Date(iso)
  const { hour, minute } = getZonedParts(instant, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: toDateKey(instant, timeZone), time: `${pad(hour)}:${pad(minute)}` }
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

/**
 * Sunday-first, because these map onto `Date.getDay()`'s 0–6.
 *
 * Deliberately not WEEKDAY_OPTIONS, which is Monday-first and carries display
 * labels — that list orders a picker, this one indexes a JS date.
 */
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** A day name's `Date.getDay()` index, or -1 when it is not one. Case-insensitive. */
export function weekdayNameToIndex(dayName: string): number {
  return WEEKDAY_NAMES.indexOf(dayName.toLowerCase())
}

/** Map a day name (e.g. 'Monday') to the next occurrence as YYYY-MM-DD. */
export function getNextDateForDay(dayName: string): string {
  const targetIdx = weekdayNameToIndex(dayName)
  if (targetIdx === -1) return ''
  const today = new Date()
  const todayIdx = today.getDay()
  const diff = (targetIdx - todayIdx + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK
  const target = new Date(today)
  target.setDate(today.getDate() + diff)
  return toDateKey(target)
}
