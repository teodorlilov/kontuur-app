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
 * **Readers** below take an optional IANA `timeZone`; leaving it undefined makes Intl
 * fall back to the runtime zone. That is legitimate in the few places doing arithmetic on
 * a bare calendar date rather than on an instant — the month grid builds its cells with
 * `new Date(year, month, d)`, local midnight standing for "the 6th", and reading those
 * back in an agency zone would shift them to the 5th or the 7th.
 *
 * **Writers** — `formatScheduledAt`, and `SlotPickerInput` in `lib/scheduling` — require
 * one. They turn a wall clock into a stored instant, and a runtime fallback there is not
 * a no-op: it writes the operator's zone into a column the whole app reads in the
 * agency's. Three call sites lived on that fallback for exactly as long as it was
 * allowed to exist.
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
 * The ISO form of `zonedTimeToInstant`, and the one way this app turns a wall clock into
 * an instant.
 *
 * `timeZone` is **required**. It was optional through the migration, falling back to the
 * runtime zone so unconverted callers kept their old behaviour — and three of them stayed
 * unconverted for exactly that reason, writing `scheduled_at` in the operator's zone
 * while the calendar bucketed it in the agency's. Now that every caller passes one, a
 * missing zone is a build error rather than a post an hour or two out.
 */
export function formatScheduledAt(date: string, time: string, timeZone: string): string {
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

/**
 * Map a day name (e.g. 'Monday') to the next occurrence as YYYY-MM-DD.
 *
 * `timeZone` is required, and is the agency's. This read the browser's weekday from
 * `Date.getDay()` and its date from `toDateKey(target)` with no zone, so on either side
 * of midnight an operator west of their agency asked "what is the next Monday" and got
 * the answer for a different day — one that then became a `scheduled_at` the calendar
 * bucketed somewhere else again.
 */
export function getNextDateForDay(dayName: string, timeZone: string): string {
  const targetIdx = weekdayNameToIndex(dayName)
  if (targetIdx === -1) return ''
  // Monday-first from `getZonedParts`, shifted back to `Date.getDay()`'s Sunday-first,
  // which is what WEEKDAY_NAMES indexes.
  const todayIdx = (getWeekdayIndex(new Date(), timeZone) + 1) % DAYS_PER_WEEK
  const diff = (targetIdx - todayIdx + DAYS_PER_WEEK) % DAYS_PER_WEEK || DAYS_PER_WEEK
  return shiftDateKey(toDateKey(new Date(), timeZone), diff)
}
