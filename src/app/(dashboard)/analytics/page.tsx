import { requireSessionUser } from '@/lib/auth/session'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCachedAgency, getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchConnectionsByClient } from '@/lib/queries/db'
import { PageHeader } from '@/components/layout/page-header/page-header'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { Card } from '@/components/ui/card'
import { ActionLink } from '@/components/ui/action-link'
import { cn } from '@/utils/cn'
import { parseParam } from '@/utils/parse-param'
import { AnalyticsNavProvider, PendingVeil } from '@/features/analytics/components/analytics-nav'
import { AnalyticsView, ConnectPrompt } from '@/features/analytics/components/analytics-view'
import { MastheadControls } from '@/features/analytics/components/masthead-controls'
import type { ArchiveEntry } from '@/features/analytics/components/report-archive'
import { buildFallbackNarrative } from '@/features/analytics/lib/narrative'
import { getNarrative } from '@/features/analytics/lib/narrative'
import { resolvePeriod } from '@/features/analytics/lib/period'
import { countUnfilledDays } from '@/features/analytics/lib/refresh-window'
import { getAnalyticsReport } from '@/features/analytics/lib/report-data'
import { toDateKey } from '@/utils/date-helpers'

// The regenerate action runs under this segment: a full window refresh is
// up to ~200 bounded Graph calls plus one model call, well past the default.
export const maxDuration = 90

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The comparison console. URL-driven like every other dashboard page:
 * ?client= scopes, ?range= or ?from=/?to= pins the period — which is also
 * what makes archive rows plain links and print reproducible.
 */
export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const [{ agencyId }, params] = await Promise.all([requireSessionUser(), searchParams])
  const [cachedClients, agency] = await Promise.all([
    getCachedAgencyClients(agencyId),
    getCachedAgency(agencyId),
  ])
  const timezone = agency?.timezone ?? 'UTC'
  const clients = cachedClients
    .map((client) => ({ id: client.id, name: client.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (clients.length === 0) {
    return (
      <>
        <PageHeader crumb={[{ label: 'Analytics' }]} title="Analytics" />
        <div className={cn(PAGE_SHELL, 'pb-10 pt-5')}>
          <Card className="mx-auto mt-10 max-w-lg px-8 py-10 text-center">
            <h2 className="text-title text-ink">No clients yet</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-caption text-text2">
              Analytics reads from a client&rsquo;s connected Instagram account — add a client
              first.
            </p>
            <div className="mt-5 flex justify-center">
              <ActionLink href="/clients" variant="primary">
                Go to clients
              </ActionLink>
            </div>
          </Card>
        </div>
      </>
    )
  }

  // Roster ids as the allowed values: validation and ownership in one move.
  const clientId = parseParam(
    params.client,
    clients.map((client) => client.id),
    clients[0]!.id
  )
  const client = clients.find((entry) => entry.id === clientId)!
  const period = resolvePeriod(params, timezone)

  const supabase = await createServerSupabaseClient()
  // The connection comes first: its account id scopes every read below —
  // archive rows and fill markers may only ever belong to the account this
  // client is connected to right now.
  const connections = await fetchConnectionsByClient(supabase, clientId)
  const accountId = connections[0]?.account_id ?? null
  const [data, archiveResult, unfilledDays] = await Promise.all([
    getAnalyticsReport(clientId, period, timezone),
    accountId
      ? supabase
          .from('analytics_reports')
          .select('id, period_start, period_end, created_at')
          .eq('client_id', clientId)
          .eq('ig_account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [], error: null }),
    // Uncached on purpose: this is the auto-fill trigger AND its terminator —
    // a stale count would either re-pull forever or never pull at all.
    accountId
      ? countUnfilledDays(supabase, clientId, accountId, period, toDateKey(new Date(), timezone))
      : Promise.resolve(0),
  ])
  if (archiveResult.error) {
    console.error('[analytics] archive list failed', archiveResult.error)
  }
  // WHY as: the server client is untyped for this projection, so it does not infer.
  const archive = (archiveResult.data ?? []) as ArchiveEntry[]
  const hasConnection = connections.length > 0
  const handle = connections[0]?.account_name?.replace(/^@/, '') ?? null

  const narrativeResult = data.hasHistory
    ? await getNarrative(clientId, client.name, period, timezone, data.lastSyncAt)
    : null
  const narrative = narrativeResult?.text ?? (data.hasHistory ? buildFallbackNarrative(data) : null)

  return (
    <AnalyticsNavProvider>
      <div className="print-hide">
        <PageHeader
          crumb={[{ label: 'Analytics' }]}
          title="Analytics"
          actions={
            <MastheadControls
              clientId={clientId}
              clients={clients}
              period={period}
              hasHistory={data.hasHistory}
            />
          }
        />
      </div>
      <div className={cn(PAGE_SHELL, 'pb-12 pt-5')}>
        {!hasConnection && !data.hasHistory ? (
          <ConnectPrompt clientId={clientId} clientName={client.name} />
        ) : (
          <PendingVeil>
            <AnalyticsView
              data={data}
              narrative={narrative}
              narrativeArchived={narrativeResult?.archived ?? false}
              unfilledDays={unfilledDays}
              clientId={clientId}
              clientName={client.name}
              handle={handle}
              hasConnection={hasConnection}
              timezone={timezone}
              archive={archive}
            />
          </PendingVeil>
        )}
      </div>
    </AnalyticsNavProvider>
  )
}
