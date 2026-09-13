import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getCachedClientRoster } from '@/lib/queries/cache'
import { buildChannels, isLiveChannel } from '@/features/clients/lib/roster'
import { resolvePeriod } from '@/features/analytics/lib/compute/period'
import { getAnalyticsReport, IG_METRICS_TAG } from '@/features/analytics/lib/instagram/report-data'
import {
  getFacebookAnalyticsReport,
  FB_METRICS_TAG,
} from '@/features/analytics/lib/facebook/facebook-report-data'
import { followersTile, type FollowersTile } from '@/features/dashboard/lib/followers-tile'
import type { PostPlatform } from '@/lib/meta/platforms'

/** The followers figures plus which network they speak for — the footer link opens that report. */
interface FollowersTileData extends FollowersTile {
  network: PostPlatform
}

/**
 * What the solo dashboard's account tile can say: which networks are live, and — once the first
 * nightly sync has run — the followers figures for the first of them. `followers` is null before
 * that sync, when nothing is connected, or when the metrics read failed; the live networks are
 * still worth showing, and are the truthful "Platforms connected" answer in the meantime.
 */
interface AccountTile {
  liveNetworks: PostPlatform[]
  followers: FollowersTileData | null
}

/**
 * The solo dashboard's account tile, as one cache entry — a warm render costs no query.
 *
 * The network is the client's first live channel in `POST_PLATFORMS` order (Instagram, then
 * Facebook), judged by the roster's own rule; the roster is React-cached, and the layout has
 * already loaded it for this request, so even a cold fill of this entry adds no query for it.
 * The figures come from the analytics report for the console's own 7-day period — the follower
 * ledger, reach and engagement totals are its, not a second implementation over
 * `ig_account_metrics`.
 *
 * `getAnalyticsReport` keeps its connection lookup outside its cache "so the account id is always
 * current" (report-data.ts). This entry sits above that lookup and keeps it current by tag
 * instead: 'agency-clients' is revalidated by every connect and disconnect
 * (features/clients/actions/connection-actions.ts) and by the OAuth callback
 * (app/api/meta/callback/route.ts), so a reconnect to another account cold-fills the tile on the
 * next render; the two metrics tags roll it over after each nightly sync.
 *
 * Both report readers throw on a query error where this dashboard's readers degrade; a metrics
 * outage renders the platforms-connected state, never a 500.
 */
const fetchAccountTile = unstable_cache(
  async (agencyId: string, clientId: string, timeZone: string): Promise<AccountTile> => {
    const roster = await getCachedClientRoster(agencyId)
    const connections = roster.find((client) => client.id === clientId)?.social_connections ?? []
    const live = buildChannels(connections, new Date()).filter(isLiveChannel)
    const liveNetworks = live.map((channel) => channel.platform)
    const channel = live[0]
    if (!channel) return { liveNetworks, followers: null }

    try {
      const period = resolvePeriod({ range: '7d' }, timeZone)
      if (channel.platform === 'instagram') {
        const report = await getAnalyticsReport(clientId, period, timeZone)
        if (!report.hasHistory) return { liveNetworks, followers: null }
        const tile = followersTile({
          network: 'instagram',
          total: report.followersTotal,
          net: report.followers.net.now,
          reach: report.reach.now,
          engagements: null,
        })
        return { liveNetworks, followers: tile && { ...tile, network: 'instagram' } }
      }

      const report = await getFacebookAnalyticsReport(clientId, period, timeZone)
      if (!report.hasHistory) return { liveNetworks, followers: null }
      const tile = followersTile({
        network: 'facebook',
        total: report.followersTotal,
        net: report.followers.net.now,
        reach: null,
        engagements: report.engagements.now,
      })
      return { liveNetworks, followers: tile && { ...tile, network: 'facebook' } }
    } catch (err) {
      console.error('[dashboard] account tile metrics failed:', err)
      return { liveNetworks, followers: null }
    }
  },
  ['dashboard-account-tile'],
  { revalidate: 3600, tags: [IG_METRICS_TAG, FB_METRICS_TAG, 'agency-clients'] }
)

export const getCachedAccountTile = cache(fetchAccountTile)
