import type { AnalyticsPeriod, RangePreset } from './period'

/**
 * URL builders for the console's period navigation. The client id always
 * travels explicitly so a shared link shows the same client it was copied on.
 *
 * `network` rides the same way once a page has two: absent means Instagram (existing links
 * stay valid), 'facebook' pins the Facebook view. Every builder takes it so a period click,
 * an archive row and the partial escape hatch all stay on the network the reader is on.
 */

function withNetwork(params: URLSearchParams, network?: string): string {
  if (network && network !== 'instagram') params.set('network', network)
  return `/analytics?${params.toString()}`
}

export function analyticsRangeHref(clientId: string, range: RangePreset, network?: string): string {
  const params = new URLSearchParams({ client: clientId })
  params.set('range', range)
  return withNetwork(params, network)
}

/** A pinned window — what archive rows link to, and what Custom applies. */
export function analyticsWindowHref(
  clientId: string,
  start: string,
  end: string,
  network?: string
): string {
  const params = new URLSearchParams({ client: clientId, from: start, to: end })
  return withNetwork(params, network)
}

export function analyticsClientHref(
  clientId: string,
  period: AnalyticsPeriod,
  network?: string
): string {
  return period.preset === 'custom'
    ? analyticsWindowHref(clientId, period.start, period.end, network)
    : analyticsRangeHref(clientId, period.preset, network)
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
