import { getCachedPendingRows, getCachedUpcomingByClient } from '@/lib/queries/cache'
import { getMonthBoundaries } from '@/utils/date-helpers'
import { getCachedBriefing } from './briefing'
import { getCachedChangeRequests } from './change-requests'
import {
  getCachedConnectedClientCount,
  getCachedScheduledThisWeek,
  summarisePending,
} from './metrics'
import { getCachedFailedPublishes, PUBLISH_PREVIEW_LIMIT } from './publishes'
import { getCachedReviewQueue } from './review-queue'
import type { DashboardData, FailedPublish, UpcomingPublish } from '@/features/dashboard/types'
import type { PostSummary } from '@/types/post'

interface ClientSummary {
  id: string
  name: string
  created_at: string | null
}

/**
 * What the dashboard shows for an agency with no clients yet.
 *
 * Every figure is genuinely zero rather than unknown, so this is real data, not a fallback — the
 * only thing measured without a query is how many clients were added this month.
 */
function emptyDashboard(clientsAddedThisMonth: number): DashboardData {
  return {
    metrics: {
      scheduledThisWeek: 0,
      pendingCount: 0,
      oldestPendingAt: null,
      clientPendingMap: {},
      clientsAddedThisMonth,
      connectedClientCount: 0,
    },
    briefing: null,
    pendingPosts: [],
    changeRequests: [],
    upcomingPublishes: [],
    failedPublishes: [],
  }
}

/**
 * Everything the dashboard renders.
 *
 * A composer, not a query: each figure comes from its own cached reader in `./`, and this only
 * issues them together and attaches client names. Names stay here on purpose — `clientNames` is a
 * Map, and `unstable_cache` derives its key from the arguments, so passing one into a reader would
 * defeat caching entirely.
 *
 * The readers are still awaited in one wave. They are decoupled and individually cached, but
 * running them in sequence would turn a single round trip into six for no gain.
 */
export async function fetchDashboardData(
  agencyId: string,
  clients: ClientSummary[],
  weekStartISO: string,
  timeZone: string
): Promise<DashboardData> {
  const clientNames = new Map(clients.map((client) => [client.id, client.name]))

  // The agency's month boundary, not the server's — the same range the coverage grid uses, so the
  // two halves of a card always agree.
  const { monthStart } = getMonthBoundaries(timeZone)
  const clientsAddedThisMonth = clients.filter(
    (client) => client.created_at !== null && client.created_at >= monthStart
  ).length

  // No clients means every read below would return empty. Skipping them is the one place on this
  // page where a query genuinely is not needed.
  if (clients.length === 0) return emptyDashboard(clientsAddedThisMonth)

  const [
    scheduledThisWeek,
    connectedClientCount,
    pendingRows,
    upcoming,
    failed,
    briefing,
    queue,
    changeRequests,
  ] = await Promise.all([
    getCachedScheduledThisWeek(agencyId, weekStartISO, timeZone),
    getCachedConnectedClientCount(agencyId),
    getCachedPendingRows(agencyId),
    // Shared with the clients roster, which reads the same cached entry.
    getCachedUpcomingByClient(agencyId),
    getCachedFailedPublishes(agencyId),
    getCachedBriefing(agencyId),
    getCachedReviewQueue(agencyId),
    getCachedChangeRequests(agencyId),
  ])

  const { clientPendingMap, oldestPendingAt } = summarisePending(pendingRows)

  const nameFor = (clientId: string | null) => (clientId && clientNames.get(clientId)) || 'Unknown'

  const toPublish = (row: PostSummary) => ({
    id: row.id,
    clientName: nameFor(row.client_id),
    platform: row.platform,
    scheduledAt: row.scheduled_at,
  })

  return {
    metrics: {
      scheduledThisWeek,
      pendingCount: pendingRows.length,
      oldestPendingAt,
      clientPendingMap,
      clientsAddedThisMonth,
      connectedClientCount,
    },
    briefing,
    pendingPosts: queue.map((row) => ({
      id: row.id,
      caption: row.caption,
      platform: row.platform,
      pillar: row.pillar ?? '',
      createdAt: row.created_at,
      clientName: nameFor(row.client_id),
      imageUrl: row.imageUrl,
    })),
    changeRequests: changeRequests.map((request) => ({
      ...request,
      clientName: nameFor(request.clientId),
    })),
    // The roster's entry is unbounded; the card shows only what is imminent.
    upcomingPublishes: upcoming
      .slice(0, PUBLISH_PREVIEW_LIMIT)
      .map(toPublish)
      // scheduled_at drives the whole card, so a null one has nothing to say.
      .filter((row): row is UpcomingPublish => row.scheduledAt !== null),
    failedPublishes: failed.map(toPublish) satisfies FailedPublish[],
  }
}
