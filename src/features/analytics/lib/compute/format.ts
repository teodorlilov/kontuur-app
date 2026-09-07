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

/**
 * A count with its direction stated: "+1,204", "−37".
 *
 * The minus is U+2212, not a hyphen — every caller (DeltaChip, the strip's net cell, the flow
 * chart's totals, the comparison card) renders it in tabular figures, where only the true minus
 * shares the digits' advance width.
 */
export function signedCount(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatCount(Math.abs(value))}`
}

/**
 * A share as a whole percent, never rounding a real value down to "0%".
 *
 * Rounding is right for the numbers this document shows — nobody needs 23.4% of followers — but
 * `Math.round` turns every share under half a percent into a measured zero, which is a different
 * claim entirely. A true zero still says "0%"; format.test.ts pins both halves.
 */
export function formatSharePct(pct: number): string {
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
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

/**
 * Splits prose into its opening sentence and the rest, so the narrative block can set the lead
 * at headline scale with the remainder beside it. A sentence end is a period followed by
 * whitespace AND a capital or quote, which is what keeps "0.34 percent across 62,372 views"
 * from splitting mid-number (pinned in format.test.ts).
 */
export function splitLeadSentence(text: string): { lead: string; rest: string } {
  const match = /(?<=[.!?][”"']?)\s+(?=[A-Z“"'])/.exec(text)
  if (!match || match.index === undefined) return { lead: text, rest: '' }
  return {
    lead: text.slice(0, match.index).trim(),
    rest: text.slice(match.index).trim(),
  }
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
