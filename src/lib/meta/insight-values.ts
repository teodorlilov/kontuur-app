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

/** Daily time_series points bucketed to YYYY-MM-DD from end_time, ascending; non-numeric values are dropped. */
export function dailySeriesOf(
  data: IGInsightEntry[],
  metric: string
): Array<{ date: string; value: number }> {
  const points = entryOf(data, metric)?.values ?? []
  const series: Array<{ date: string; value: number }> = []
  for (const point of points) {
    if (typeof point.value !== 'number' || !point.end_time) continue
    const date = point.end_time.split('T')[0]
    if (date) series.push({ date, value: point.value })
  }
  return series.sort((a, b) => a.date.localeCompare(b.date))
}

/** A lifetime media insight's single values[0].value, or null when absent or non-numeric. */
export function lifetimeValueOf(data: IGInsightEntry[], metric: string): number | null {
  const value = entryOf(data, metric)?.values?.[0]?.value
  return typeof value === 'number' ? value : null
}
