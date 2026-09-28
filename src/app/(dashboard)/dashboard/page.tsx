import {
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  UsersGroupRoundedIcon,
} from '@solar-icons/react/line-duotone'
import { Icon } from '@/components/ui/icon'
import { requireSessionUser } from '@/lib/auth/session'
import {
  getCachedAgency,
  getCachedAgencyClients,
  getCachedClientWeekCoverage,
  getCachedEntitlement,
} from '@/lib/queries/cache'
import { readUsage } from '@/lib/billing/usage'
import { generationGate } from '@/lib/billing/post-allowance'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchWorkspaceOwed } from '@/lib/visual/owed-images'
import { addBrandGate } from '@/lib/billing/copy'
import { getMondayISO, getWeekdayIndex } from '@/utils/date-helpers'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { fetchDashboardData } from '@/features/dashboard/queries/dashboard-data'
import { getCachedBriefing } from '@/features/dashboard/queries/briefing'
import { countFilledPerDay } from '@/features/dashboard/lib/metrics'
import { DAYS_PER_WEEK } from '@/utils/constants'
import { emptyWeek } from '@/lib/queries/week-coverage'
import { cn } from '@/utils/cn'
import { SectionHeading } from '@/components/ui/section-heading'
// Deep import, not the re-export index: that file forwards four 'use client'
// components, and pulling it in for one string constant put TabRail, Segmented
// and SelectControl in this route's client bundle for nothing.
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { DashboardHeader } from '@/features/dashboard/components/dashboard-header'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { MiniWeek } from '@/features/dashboard/components/mini-week'
import { ClientCoverage } from '@/features/dashboard/components/client-coverage'
import { MyWeek } from '@/features/dashboard/components/my-week'
import { FollowersStat } from '@/features/dashboard/components/followers-stat'
import { PendingReviewList } from '@/features/dashboard/components/pending-review-list'
import { BriefingBar } from '@/features/dashboard/components/briefing-bar'
import { QuickActionsStrip } from '@/features/dashboard/components/quick-actions-strip'
import { NextUpCard } from '@/features/dashboard/components/next-up-card'
import { ChangeRequestCard } from '@/features/dashboard/components/change-request-card'

/**
 * One page, two compositions: a solo user gets the Followers tile and My week where an agency gets
 * its client count and coverage roster. The layout's `requireBusinessSetup` sends a clientless solo
 * workspace to /clients/new only while it can create, so a locked one may have no client: keep the
 * `business ?` checks. "Today" is
 * decided once, in the agency's timezone, so MiniWeek and My week agree on it and it stays inside
 * the fetched week. Every Generate call to action is checked first (`generationGate`,
 * lib/billing/post-allowance.ts). The owed-pictures read is uncached, beside the fresh usage read,
 * so both are of one moment and no picture is set aside twice; a failed read passes null, unknown
 * rather than zero. The lower band uses container queries because the sidebar collapses, and
 * `minmax(0,…)` so a long client name cannot resize its tracks.
 */
export default async function DashboardPage() {
  const { agencyId, role } = await requireSessionUser()

  const [agency, clients, entitlement] = await Promise.all([
    getCachedAgency(agencyId),
    getCachedAgencyClients(agencyId),
    getCachedEntitlement(agencyId),
  ])

  const isSolo = agency?.mode === 'solo'
  const business = isSolo ? clients[0] : undefined
  const timezone = agency?.timezone ?? 'UTC'
  const weekStartISO = getMondayISO(new Date(), timezone)
  const todayIndex = getWeekdayIndex(new Date(), timezone)

  const [data, coverage, briefing, usage, owed] = await Promise.all([
    fetchDashboardData(agencyId, clients, weekStartISO, timezone),
    getCachedClientWeekCoverage(agencyId, weekStartISO, timezone),
    getCachedBriefing(),
    readUsage(agencyId, entitlement.periodKey),
    fetchWorkspaceOwed(
      createAdminSupabaseClient(),
      clients.map((client) => client.id)
    ).catch((err: unknown) => {
      console.error(`[dashboard] owed images read failed for ${agencyId}:`, err)
      return null
    }),
  ])

  const generate = generationGate(entitlement, usage.committed, owed)

  const addClient = addBrandGate(entitlement, clients.length, role)
  const { metrics } = data
  const filledPerDay = countFilledPerDay(coverage)
  const coveredDays = filledPerDay.filter((count) => count > 0).length

  return (
    <>
      <DashboardHeader
        agencyName={agency?.name ?? ''}
        clientCount={clients.length}
        isSolo={isSolo}
        timezone={timezone}
        pendingCount={metrics.pendingCount}
        oldestPendingAt={metrics.oldestPendingAt}
        failedCount={data.failedPublishes.length}
        generate={generate}
        addClient={addClient}
      />

      <div className={cn(PAGE_SHELL, '@container pb-12 pt-6')}>
        <div className="grid grid-cols-1 gap-3.5 @lg:grid-cols-2 @4xl:grid-cols-4">
          <div className="rv [--d:0ms]">
            <StatCard
              dark
              label="Scheduled this week"
              value={metrics.scheduledThisWeek}
              icon={<Icon glyph={CalendarIcon} size="lg" />}
              pill={{
                text: `${coveredDays} of ${DAYS_PER_WEEK} days covered`,
                tone: 'positive',
              }}
            >
              <MiniWeek counts={filledPerDay} todayIndex={todayIndex} />
            </StatCard>
          </div>

          <div className="rv [--d:35ms]">
            <StatCard
              label={isSolo ? 'Drafts to review' : 'Pending review'}
              value={metrics.pendingCount}
              icon={<Icon glyph={CheckCircleIcon} size="lg" />}
              pill={
                metrics.pendingCount > 0
                  ? { text: 'Needs attention', tone: 'attention' }
                  : { text: 'All clear', tone: 'positive' }
              }
              footer={
                metrics.oldestPendingAt
                  ? `Oldest waiting since ${formatRelativeTime(parseTimestamp(metrics.oldestPendingAt))}`
                  : 'Nothing waiting on you'
              }
            />
          </div>

          <div className="rv [--d:70ms]">
            {business ? (
              <FollowersStat agencyId={agencyId} clientId={business.id} timeZone={timezone} />
            ) : (
              <StatCard
                label="Active clients"
                value={clients.length}
                icon={<Icon glyph={UsersGroupRoundedIcon} size="lg" />}
                pill={
                  metrics.clientsAddedThisMonth > 0
                    ? { text: `+${metrics.clientsAddedThisMonth} this month`, tone: 'positive' }
                    : { text: 'No change this month', tone: 'muted' }
                }
                footer={
                  clients.length === 0
                    ? 'Add a client to get started'
                    : `${metrics.connectedClientCount} of ${clients.length} connected to a platform`
                }
              />
            )}
          </div>

          <div className="rv [--d:105ms]">
            <NextUpCard
              upcoming={data.upcomingPublishes}
              failed={data.failedPublishes}
              connectedClientCount={metrics.connectedClientCount}
              clientCount={clients.length}
              timezone={timezone}
              generateRefusal={generate.refusal}
            />
          </div>
        </div>

        {data.changeRequests.length > 0 && (
          <section className="rv mt-4 [--d:140ms]">
            <div className="flex items-center justify-between gap-3">
              <SectionHeading icon={<Icon glyph={ChartIcon} size="sm" />} tone="marker">
                Change requests
              </SectionHeading>
              <span className="rounded-full bg-marker px-2.5 py-[3px] text-caption font-semibold text-forest-deep">
                {data.changeRequests.length} {data.changeRequests.length === 1 ? 'post' : 'posts'}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {data.changeRequests.map((changeRequest) => (
                <ChangeRequestCard key={changeRequest.id} changeRequest={changeRequest} />
              ))}
            </div>
          </section>
        )}

        <div
          className={cn(
            'mt-4 grid grid-cols-1 items-start gap-4',
            business
              ? '@2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'
              : '@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'
          )}
        >
          <div className="rv [--d:170ms]">
            {business ? (
              <MyWeek
                clientName={business.name}
                week={coverage[business.id] ?? emptyWeek()}
                weekStartISO={weekStartISO}
                timeZone={timezone}
                todayIndex={todayIndex}
              />
            ) : (
              <ClientCoverage
                clients={clients}
                coverage={coverage}
                clientPendingMap={metrics.clientPendingMap}
                addClientRefusal={addClient.refusal}
                generateRefusal={generate.refusal}
              />
            )}
          </div>
          <div className="rv [--d:200ms]">
            <PendingReviewList posts={data.pendingPosts} totalPending={metrics.pendingCount} />
          </div>
        </div>

        <div className="rv mt-4 [--d:240ms]">
          <BriefingBar briefing={briefing} />
        </div>

        <div className="rv mt-4 [--d:280ms]">
          <QuickActionsStrip
            pendingCount={metrics.pendingCount}
            isSolo={isSolo}
            generateRefusal={generate.refusal}
            addClient={addClient}
          />
        </div>
      </div>
    </>
  )
}
