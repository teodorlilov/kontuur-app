import type { IGInsightEntry } from './schemas'

/**
 * Extraction helpers for the insights envelope, encoding the probe's core
 * lesson (memory: project_meta_probe_results): the Graph API's failure mode is
 * absence — a silent-empty `{"data":[]}`, a total_value without `value`, a
 * breakdown without `results` — and absence maps to null, never 0. A stored 0
 * must mean the API said 0.
 */

function entryOf(data: IGInsightEntry[], metric: string): IGInsightEntry | null {
  return data.find((entry) => entry.name === metric) ?? null
}

/** total_value.value for one metric, or null when the metric or its value is absent. */
export function totalValueOf(data: IGInsightEntry[], metric: string): number | null {
  return entryOf(data, metric)?.total_value?.value ?? null
}

/** One metric's breakdown results as a dimension→value map, or null when absent or empty. */
export function breakdownMapOf(
  data: IGInsightEntry[],
  metric: string
): Record<string, number> | null {
  const results = entryOf(data, metric)?.total_value?.breakdowns?.[0]?.results
  if (!results || results.length === 0) return null
  const map: Record<string, number> = {}
  for (const result of results) {
    // The probe recorded single-element dimension_values (plain keys, never the
    // docs' compound `F.25-34`); joining keeps a multi-dimension response readable.
    map[result.dimension_values.join('.')] = result.value
  }
  return map
}

/**
 * The day a daily bucket describes, as YYYY-MM-DD.
 *
 * Meta labels a bucket by the instant its window ENDED, and the date in that stamp is the
 * day it covers — verified 2026-09-08 against Instagram's own `media.timestamp`: on an
 * account publishing every two to three days, reach spikes land on the publish day under
 * this reading, and one day BEFORE the publish under the alternative (subtract a second,
 * re-read in America/Los_Angeles). A spike the day before a post is impossible, which is
 * what settles it.
 *
 * One function because the answer is one decision. `fetchOnlineFollowers` used to re-derive
 * it, and re-derived it wrongly: it could not reuse `dailySeriesOf` — its values are hourly
 * MAPS, not numbers — so a second loop was written, and the date rule was rewritten along
 * with the value rule that was the only thing that actually differed. Every hourly map was
 * then filed one day early for as long as the feature existed.
 */
function bucketDate(endTime: string | undefined): string | null {
  return endTime?.split('T')[0] || null
}

/**
 * One metric's daily points, ascending by date, with the value shape as a parameter.
 *
 * `readValue` returns null to drop a point, which is how each caller states what it counts
 * as data: a scalar series drops anything non-numeric, and the hourly maps drop an empty
 * `{}` because that is the Graph API being silent rather than a day with nobody online.
 * Only the value shape is a caller's business — the date never is.
 */
export function dailyPointsOf<Value>(
  data: IGInsightEntry[],
  metric: string,
  readValue: (raw: unknown) => Value | null
): Array<{ date: string; value: Value }> {
  const series: Array<{ date: string; value: Value }> = []
  for (const point of entryOf(data, metric)?.values ?? []) {
    const date = bucketDate(point.end_time)
    const value = readValue(point.value)
    if (date !== null && value !== null) series.push({ date, value })
  }
  return series.sort((a, b) => a.date.localeCompare(b.date))
}

/** Daily time_series points for a scalar metric; non-numeric values are dropped. */
export function dailySeriesOf(
  data: IGInsightEntry[],
  metric: string
): Array<{ date: string; value: number }> {
  return dailyPointsOf(data, metric, (raw) => (typeof raw === 'number' ? raw : null))
}

/** A lifetime media insight's single values[0].value, or null when absent or non-numeric. */
export function lifetimeValueOf(data: IGInsightEntry[], metric: string): number | null {
  const value = entryOf(data, metric)?.values?.[0]?.value
  return typeof value === 'number' ? value : null
}
