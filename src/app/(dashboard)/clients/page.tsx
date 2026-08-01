import { requireSessionUser } from '@/lib/auth/session'
import {
  getCachedAgency,
  getCachedClientRoster,
  getCachedPendingApprovalsByClient,
  getCachedUpcomingByClient,
} from '@/lib/queries/cache'
import {
  type RosterFilter,
  type RosterSort,
  buildRoster,
  matchesFilter,
  sortRoster,
  summariseRoster,
} from '@/features/clients/lib/roster'
// Deep imports rather than the re-export index: this is a server component, and
// the index forwards Segmented and SelectControl, which this page never renders.
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { RosterPagination } from '@/features/clients/components/roster/roster-pagination'
import { RosterSort as RosterSortControl } from '@/features/clients/components/roster/roster-sort'
import { RosterTable } from '@/features/clients/components/roster/roster-table'
import { ActionLink } from '@/components/ui/action-link'
import { formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'

const FILTERS: readonly RosterFilter[] = ['attention', 'approval', 'connection', 'empty', 'all']
const SORTS: readonly RosterSort[] = ['attention', 'name']

const DEFAULT_FILTER: RosterFilter = 'attention'
const DEFAULT_SORT: RosterSort = 'attention'

function parseParam<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.find((value) => value === raw) ?? fallback
}

/** Only non-default state reaches the URL, so /clients stays the canonical view. */
function buildHref(filter: RosterFilter, sort: RosterSort): string {
  const params = new URLSearchParams()
  if (filter !== DEFAULT_FILTER) params.set('filter', filter)
  if (sort !== DEFAULT_SORT) params.set('sort', sort)
  const query = params.toString()
  return query ? `/clients?${query}` : '/clients'
}

interface ClientsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const [{ agencyId }, params] = await Promise.all([requireSessionUser(), searchParams])

  const filter = parseParam(params.filter, FILTERS, DEFAULT_FILTER)
  const sort = parseParam(params.sort, SORTS, DEFAULT_SORT)

  // None of these depends on another's result — one round trip, not a waterfall.
  const [agency, clients, upcoming, approvals] = await Promise.all([
    getCachedAgency(agencyId),
    getCachedClientRoster(agencyId),
    getCachedUpcomingByClient(agencyId),
    getCachedPendingApprovalsByClient(agencyId),
  ])

  const timezone = agency?.timezone ?? 'UTC'
  // Derivation is in-memory because status is computed, not stored. Bounded by
  // the agency's client count; past roughly 200 the connections embed is what
  // would need splitting first.
  const roster = buildRoster(clients, upcoming, approvals, new Date())
  const summary = summariseRoster(roster)
  const visible = sortRoster(
    roster.filter((entry) => matchesFilter(entry, filter)),
    sort
  )

  // Every roster figure is a count on one of these tabs, so no summary strip
  // repeats them elsewhere on the page.
  const tabs: Array<TabItem<RosterFilter>> = [
    {
      id: 'attention',
      label: 'Needs attention',
      count: summary.attention,
      flag: summary.attention > 0,
      href: buildHref('attention', sort),
    },
    {
      id: 'approval',
      label: 'Awaiting approval',
      count: summary.approval,
      href: buildHref('approval', sort),
    },
    {
      id: 'connection',
      label: 'Connection expiring',
      count: summary.connection,
      href: buildHref('connection', sort),
    },
    { id: 'empty', label: 'Queue empty', count: summary.empty, href: buildHref('empty', sort) },
    { id: 'all', label: 'All clients', count: summary.total, href: buildHref('all', sort) },
  ]

  return (
    <>
      <PageHeader
        crumb={[{ label: 'Clients' }]}
        title="Clients"
        count={summary.total}
        meta={
          <HeaderMeta
            parts={[
              summary.attention > 0 ? (
                <MetaFlag>
                  {summary.attention} need{summary.attention === 1 ? 's' : ''} you today
                </MetaFlag>
              ) : (
                'Every client is on schedule'
              ),
              // Posts, not clients — six can be waiting on a single brand.
              summary.awaitingApprovalPosts > 0 &&
                `${summary.awaitingApprovalPosts} post${summary.awaitingApprovalPosts === 1 ? '' : 's'} awaiting approval`,
              summary.oldestApprovalAt &&
                `oldest sent ${formatRelativeTime(new Date(summary.oldestApprovalAt))}`,
            ]}
          />
        }
        actions={
          <>
            <RosterSortControl
              value={sort}
              hrefs={{
                attention: buildHref(filter, 'attention'),
                name: buildHref(filter, 'name'),
              }}
            />
            <ActionLink href="/clients/new">
              Add client
              <span aria-hidden="true">&rarr;</span>
            </ActionLink>
          </>
        }
        tabs={<TabRail items={tabs} active={filter} label="Filter clients" />}
      />

      <div className={cn(PAGE_SHELL, 'pb-10 pt-5')}>
        <RosterTable
          entries={visible}
          timezone={timezone}
          footer={
            <RosterPagination
              remaining={summary.total - visible.length}
              total={summary.total}
              showAllHref={buildHref('all', sort)}
              showingAll={filter === 'all'}
            />
          }
        />
      </div>
    </>
  )
}
