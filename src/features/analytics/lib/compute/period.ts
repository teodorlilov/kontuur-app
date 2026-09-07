import { MS_PER_DAY } from '@/utils/constants'
import { parseParam } from '@/utils/parse-param'
import { minDateKey, shiftDateKey, toDateKey } from '@/utils/date-helpers'

/**
 * Period math for the comparison console. Every number on the page reads against the previous
 * period, so a period is always resolved as a pair: [start, end] and the equal-length window
 * immediately before it.
 *
 * Periods end YESTERDAY in the agency's timezone. /api/cron/metrics runs at 03:30 (vercel.json)
 * and captures the day that just closed, so today can never hold a full day's data and
 * including it would end every chart on a hole.
 */

export const RANGE_PRESETS = ['7d', '30d', '90d'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

const DEFAULT_RANGE: RangePreset = '30d'

const PRESET_DAYS: Record<RangePreset, number> = { '7d': 7, '30d': 30, '90d': 90 }
/** A custom range longer than a year is a typo, not a report. */
export const CUSTOM_MAX_DAYS = 366
/** A calendar day key. Exported so schemas.ts validates the action against the same shape
 * `resolvePeriod` accepts from a URL, rather than keeping a second copy of the regex. */
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface AnalyticsPeriod {
  /** 'custom' when from/to came from the URL; otherwise the pressed preset. */
  preset: RangePreset | 'custom'
  start: string
  end: string
  prevStart: string
  prevEnd: string
  /** Inclusive length of each window, in days. */
  days: number
}

/** Inclusive day count between two date keys. */
export function dayCount(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / MS_PER_DAY) + 1
}

/**
 * An inclusive [start, end] span cut into consecutive chunks of at most `chunkDays`, the last
 * one clamped to `end`.
 *
 * Meta caps how much of a series one insights call may span, and the cap differs per network —
 * 30 days for an Instagram series (refresh-window.ts), 90 for a Facebook Page one, where 120
 * answered `Invalid parameter` when probed (sync-facebook-metrics.ts). The WALK does not
 * differ, which is why it lives here and takes the cap as an argument.
 *
 * Day keys out, not timestamps: a caller that wants Graph's `since`/`until` converts with
 * `dayKeyToUnixSeconds`, and a caller that writes a row per day already has the keys.
 */
export function dayChunks(
  start: string,
  end: string,
  chunkDays: number
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = []
  let cursor = start
  while (cursor <= end) {
    const chunkEnd = minDateKey(shiftDateKey(cursor, chunkDays - 1), end)
    chunks.push({ start: cursor, end: chunkEnd })
    cursor = shiftDateKey(chunkEnd, 1)
  }
  return chunks
}

function withPreviousPeriod(
  preset: AnalyticsPeriod['preset'],
  start: string,
  end: string
): AnalyticsPeriod {
  const days = dayCount(start, end)
  const prevEnd = shiftDateKey(start, -1)
  return { preset, start, end, prevStart: shiftDateKey(prevEnd, -(days - 1)), prevEnd, days }
}

/**
 * Resolves the reporting period from untrusted URL params. A valid from/to
 * pair wins as a custom range, clamped to yesterday by string comparison —
 * ISO date keys order correctly as strings. Anything malformed falls back to
 * the range preset, and a bad preset falls back to 30 days.
 */
export function resolvePeriod(
  params: Record<string, string | string[] | undefined>,
  timezone: string
): AnalyticsPeriod {
  const yesterday = shiftDateKey(toDateKey(new Date(), timezone), -1)

  const from = typeof params.from === 'string' ? params.from : undefined
  const to = typeof params.to === 'string' ? params.to : undefined
  if (from && to && DATE_KEY_PATTERN.test(from) && DATE_KEY_PATTERN.test(to)) {
    const end = to > yesterday ? yesterday : to
    if (from <= end && dayCount(from, end) <= CUSTOM_MAX_DAYS) {
      return withPreviousPeriod('custom', from, end)
    }
  }

  const preset = parseParam(params.range, RANGE_PRESETS, DEFAULT_RANGE)
  const start = shiftDateKey(yesterday, -(PRESET_DAYS[preset] - 1))
  return withPreviousPeriod(preset, start, yesterday)
}

/**
 * Rebuilds the full period pair from explicit bounds. Every report action takes this path: the
 * client names the exact window it was looking at, and the server re-derives the comparison
 * window rather than trusting one off the wire.
 */
export function periodFromBounds(
  preset: AnalyticsPeriod['preset'],
  start: string,
  end: string
): AnalyticsPeriod {
  return withPreviousPeriod(preset, start, end)
}

/** Every date key of the window, start → end, for aligning rows to day indexes. */
export function periodDayKeys(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => shiftDateKey(start, index))
}
