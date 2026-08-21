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

/**
 * The window as it is, mid-fill. The filling state hides the whole document,
 * so any condition that stops the fill advancing — a rate limit, a dead token,
 * a run that writes days the unfilled count does not track — would otherwise
 * leave the reader on a silhouette over data that is already stored. This is
 * the way out, and it is a plain URL so it survives a reload.
 */
export function analyticsPartialHref(clientId: string, period: AnalyticsPeriod): string {
  const params = new URLSearchParams({ client: clientId, partial: '1' })
  if (period.preset === 'custom') {
    params.set('from', period.start)
    params.set('to', period.end)
  } else {
    params.set('range', period.preset)
  }
  return `/analytics?${params.toString()}`
}
