/**
 * Display formatting for the comparison console. Date KEYS (YYYY-MM-DD) are
 * calendar days already resolved in the agency's timezone, so they format at
 * UTC on purpose — re-zoning them would shift a label across midnight.
 */

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function keyToDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`)
}

/** 48210 → "48,210". */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

/** "2026-08-09" → "9 Aug". */
export function formatDayMonth(dateKey: string): string {
  return DAY_MONTH.format(keyToDate(dateKey))
}

/** "19 Jul – 17 Aug 2026" — the current period, year on the end only. */
export function formatPeriodRange(start: string, end: string): string {
  return `${DAY_MONTH.format(keyToDate(start))} – ${DAY_MONTH_YEAR.format(keyToDate(end))}`
}

/** The previous period, no year: "19 Jun – 18 Jul". */
export function formatShortRange(start: string, end: string): string {
  return `${DAY_MONTH.format(keyToDate(start))} – ${DAY_MONTH.format(keyToDate(end))}`
}

/** A real instant ("last sync") in the agency's clock: "18 Aug, 03:30". */
export function formatSyncInstant(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso))
}
