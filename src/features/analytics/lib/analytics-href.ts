import type { AnalyticsPeriod, RangePreset } from './period'

/**
 * URL builders for the console's period navigation. The client id always
 * travels explicitly so a shared link shows the same client it was copied on.
 */

export function analyticsRangeHref(clientId: string, range: RangePreset): string {
  const params = new URLSearchParams({ client: clientId })
  params.set('range', range)
  return `/analytics?${params.toString()}`
}

/** A pinned window — what archive rows link to, and what Custom applies. */
export function analyticsWindowHref(clientId: string, start: string, end: string): string {
  const params = new URLSearchParams({ client: clientId, from: start, to: end })
  return `/analytics?${params.toString()}`
}

export function analyticsClientHref(clientId: string, period: AnalyticsPeriod): string {
  return period.preset === 'custom'
    ? analyticsWindowHref(clientId, period.start, period.end)
    : analyticsRangeHref(clientId, period.preset)
}
