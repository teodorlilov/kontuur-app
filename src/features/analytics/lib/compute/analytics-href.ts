import type { AnalyticsPeriod, RangePreset } from './period'

/**
 * URL builders for the console's period navigation.
 *
 * The client id always travels explicitly: with no `?client=` the page falls back to the
 * first client alphabetically, so a link copied off one report would open on another's.
 * `network` is left off for Instagram on purpose — the page defaults an absent param to
 * Instagram, so links written before Facebook existed still resolve.
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
 * The way out of the filling state, which hides the whole document until every day of the
 * window has been asked for. A fill can stop advancing without any run saying so — days
 * written outside what `countUnfilledDays` tracks, since it skips today and the consolidation
 * tail — leaving the reader on a silhouette drawn over stored data. A plain URL, so it
 * survives a reload.
 */
export function analyticsPartialHref(
  clientId: string,
  period: AnalyticsPeriod,
  network?: string
): string {
  const params = new URLSearchParams({ client: clientId, partial: '1' })
  if (period.preset === 'custom') {
    params.set('from', period.start)
    params.set('to', period.end)
  } else {
    params.set('range', period.preset)
  }
  return withNetwork(params, network)
}
