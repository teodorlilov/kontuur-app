import { BarChart2, Calendar, CircleCheck, Users } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import {
  getCachedAgency,
  getCachedAgencyClients,
  getCachedClientWeekCoverage,
} from '@/lib/queries/cache'
import { getMondayISO, getWeekdayIndex } from '@/utils/date-helpers'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { fetchDashboardData } from '@/features/dashboard/queries'
import { countFilledPerDay } from '@/features/dashboard/lib/metrics'
import { DAYS_PER_WEEK } from '@/utils/constants'
import { DashboardHeader } from '@/features/dashboard/components/dashboard-header'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { MiniWeek } from '@/features/dashboard/components/mini-week'
import { ClientCoverage } from '@/features/dashboard/components/client-coverage'
import { PendingReviewList } from '@/features/dashboard/components/pending-review-list'
import { BriefingBar } from '@/features/dashboard/components/briefing-bar'
import { QuickActionsStrip } from '@/features/dashboard/components/quick-actions-strip'
import { NextUpCard } from '@/features/dashboard/components/next-up-card'
import { ChangeRequestCard } from '@/features/dashboard/components/change-request-card'

export default async function DashboardPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Both calls hit React cache() populated by the dashboard layout — zero extra DB queries
  const [agency, clients] = await Promise.all([
    getCachedAgency(agencyId),
    getCachedAgencyClients(agencyId),
  ])

  const isSolo = agency?.mode === 'solo'
  const timezone = agency?.timezone ?? 'UTC'
  // The week is the agency's, not the server's — otherwise the "today" marker
  // can point at a day outside the week the data was fetched for.
  const weekStartISO = getMondayISO(new Date(), timezone)

  const [data, coverage] = await Promise.all([
    fetchDashboardData(supabase, agencyId, clients, weekStartISO, timezone),
    getCachedClientWeekCoverage(agencyId, weekStartISO, timezone),
  ])

  const { metrics } = data
  const filledPerDay = countFilledPerDay(coverage)
  const coveredDays = filledPerDay.filter((count) => count > 0).length

  return (
    <div className="@container px-4 pb-12 pt-10 md:px-8">
      <div className="rv">
        <DashboardHeader
          agencyName={agency?.name ?? ''}
          clientCount={clients.length}
          isSolo={isSolo}
          timezone={timezone}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 @lg:grid-cols-2 @4xl:grid-cols-4">
        <div className="rv [--d:60ms]">
          <StatCard
            dark
            label="Scheduled this week"
            value={metrics.scheduledThisWeek}
            icon={<Calendar size={16} />}
            pill={{
              text: `${coveredDays} of ${DAYS_PER_WEEK} days covered`,
              tone: 'positive',
            }}
          >
            <MiniWeek counts={filledPerDay} todayIndex={getWeekdayIndex(new Date(), timezone)} />
          </StatCard>
        </div>

        <div className="rv [--d:120ms]">
          <StatCard
            label={isSolo ? 'Drafts to review' : 'Pending review'}
            value={metrics.pendingCount}
            icon={<CircleCheck size={16} />}
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

        <div className="rv [--d:180ms]">
          <StatCard
            label={isSolo ? 'Platforms connected' : 'Active clients'}
            value={isSolo ? metrics.connectedClientCount : clients.length}
            icon={<Users size={16} />}
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
        </div>

        <div className="rv [--d:240ms]">
          <NextUpCard
            upcoming={data.upcomingPublishes}
            failed={data.failedPublishes}
            connectedClientCount={metrics.connectedClientCount}
            clientCount={clients.length}
            timezone={timezone}
          />
        </div>
      </div>

      {data.changeRequests.length > 0 && (
        <section className="rv mt-4 [--d:280ms]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              <span className="grid size-[27px] place-items-center rounded-sm bg-marker text-forest-deep">
                <BarChart2 size={14} />
              </span>
              Change requests
            </h2>
            <span className="rounded-full bg-marker px-2.5 py-[3px] text-[11.5px] font-semibold text-forest-deep">
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

      {/* Container queries, not viewport ones: the sidebar collapses, so how much
          room these two sections actually have is not a function of window width.
          minmax(0,…) keeps a long client name from resizing the tracks per page. */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="rv [--d:300ms]">
          <ClientCoverage
            clients={clients}
            coverage={coverage}
            clientPendingMap={metrics.clientPendingMap}
          />
        </div>
        <div className="rv [--d:360ms]">
          <PendingReviewList posts={data.pendingPosts} totalPending={metrics.pendingCount} />
        </div>
      </div>

      <div className="rv mt-4 [--d:420ms]">
        <BriefingBar briefing={data.briefing} />
      </div>

      <div className="rv mt-4 [--d:480ms]">
        <QuickActionsStrip pendingCount={metrics.pendingCount} isSolo={isSolo} />
      </div>
    </div>
  )
}
