import { MS_PER_DAY } from '@/utils/constants'
import { parseParam } from '@/utils/parse-param'
import { shiftDateKey, toDateKey } from '@/utils/date-helpers'

/**
 * Period math for the comparison console. Every number on the page reads
 * against the previous period, so a period is always resolved as a pair:
 * [start, end] and the equal-length window immediately before it.
 *
 * Periods end YESTERDAY in the agency's timezone — the nightly sync captures
 * yesterday's row at 03:30, so today can never have data and including it
 * would end every chart on a hole.
 */

export const RANGE_PRESETS = ['7d', '30d', '90d'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export const DEFAULT_RANGE: RangePreset = '30d'

const PRESET_DAYS: Record<RangePreset, number> = { '7d': 7, '30d': 30, '90d': 90 }
/** A custom range longer than a year is a typo, not a report. */
const CUSTOM_MAX_DAYS = 366
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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
function dayCount(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / MS_PER_DAY) + 1
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
 * pair wins as a custom range (clamped to yesterday); anything malformed
 * falls back to the range preset, and a bad preset falls back to 30 days.
 */
export function resolvePeriod(
  params: Record<string, string | string[] | undefined>,
  timezone: string
): AnalyticsPeriod {
  const yesterday = shiftDateKey(toDateKey(new Date(), timezone), -1)

  const from = typeof params.from === 'string' ? params.from : undefined
  const to = typeof params.to === 'string' ? params.to : undefined
  if (from && to && DATE_KEY_PATTERN.test(from) && DATE_KEY_PATTERN.test(to)) {
    // ISO date keys compare correctly as strings.
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
 * Rebuilds the full period pair from explicit bounds — the archive action's
 * path, where the client names the exact window it was looking at and the
 * server re-derives the previous window rather than trusting one.
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
