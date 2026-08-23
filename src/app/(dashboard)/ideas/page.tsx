import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { countIdeasByStatus, fetchIdeasForAgency } from '@/features/ideas/lib/ideas'
import { IdeasView } from '@/features/ideas/components/ideas-view'
import {
  DEFAULT_IDEA_TAB,
  IDEA_TABS,
  IDEAS_PAGE_SIZE,
  pagesShown,
  statusesForTab,
} from '@/features/ideas/lib/idea-filters'

import { parseParam } from '@/utils/parse-param'

interface IdeasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function IdeasPage({ searchParams }: IdeasPageProps) {
  const [{ agencyId }, params] = await Promise.all([requireSessionUser(), searchParams])

  const tab = parseParam(params.tab, IDEA_TABS, DEFAULT_IDEA_TAB)

  // Awaited before the reads because it is what validates the client param: an id
  // outside the agency's roster falls back to "all clients" rather than filtering
  // to an empty list the header would still describe as one client's.
  const cachedClients = await getCachedAgencyClients(agencyId)
  const clients = cachedClients.map((client) => ({ id: client.id, name: client.name }))
  const clientId =
    parseParam(
      params.client,
      clients.map((client) => client.id),
      ''
    ) || undefined

  // How many pages the visitor has asked to see. Grows one page per "Show older" press
  // and rides the URL, so the depth survives a reload and a tab switch resets it — the
  // same posture as every other filter on this page.
  const pages = pagesShown(params.pages)
  const pageSize = pages * IDEAS_PAGE_SIZE

  // Neither depends on the other's result — one round trip, not a waterfall. The
  // tally is its own query because the list is scoped to one tab, so counting the
  // other tabs from it would report whatever the current filter happened to keep.
  //
  // One row over the page is fetched and dropped: it is how the page knows whether there
  // is anything older without a second count query, and the count query it already runs
  // is per-status, not per-tab-and-page.
  const [pageAndProbe, countsByStatus] = await Promise.all([
    fetchIdeasForAgency(agencyId, {
      clientId,
      statuses: statusesForTab(tab),
      limit: pageSize + 1,
    }),
    countIdeasByStatus({ agencyId, clientId }),
  ])
  const hasOlder = pageAndProbe.length > pageSize
  const ideas = hasOlder ? pageAndProbe.slice(0, pageSize) : pageAndProbe

  return (
    <IdeasView
      initialIdeas={ideas}
      countsByStatus={countsByStatus}
      tab={tab}
      clientId={clientId}
      clients={clients}
      pages={pages}
      hasOlder={hasOlder}
      loadedAt={new Date().toISOString()}
    />
  )
}
