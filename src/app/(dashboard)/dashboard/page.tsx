import { BarChart2, Calendar, CircleCheck, Send, Users } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import {
  getCachedAgency,
  getCachedAgencyClients,
  getCachedClientWeekCoverage,
  type DayState,
} from '@/lib/queries/cache'
import { getMondayISO } from '@/utils/date-helpers'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { fetchDashboardData, type DashboardMetrics } from '@/features/dashboard/queries'
import { DashboardHeader } from '@/features/dashboard/components/dashboard-header'
import { StatCard, type StatPillTone } from '@/features/dashboard/components/stat-card'
import { MiniWeek } from '@/features/dashboard/components/mini-week'
import { ClientCoverage } from '@/features/dashboard/components/client-coverage'
import { ReviewStack } from '@/features/dashboard/components/review-stack'
import { BriefingBar } from '@/features/dashboard/components/briefing-bar'
import { QuickActionsStrip } from '@/features/dashboard/components/quick-actions-strip'
import { ChangeRequestCard } from '@/features/dashboard/components/change-request-card'

const DAYS_PER_WEEK = 7
const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Filled slots per weekday across every client, Monday first. */
function countFilledPerDay(coverage: Record<string, DayState[]>): number[] {
  const counts = Array<number>(DAYS_PER_WEEK).fill(0)
  for (const week of Object.values(coverage)) {
    week.forEach((day, index) => {
      if (day !== 'open') counts[index] = (counts[index] ?? 0) + 1
    })
  }
  return counts
}

/** Monday-first index of today in the agency's timezone. */
function resolveTodayIndex(timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(
    new Date()
  )
  return Math.max(WEEKDAY_ORDER.indexOf(weekday), 0)
}

/** Month-over-month movement, phrased only when there is something to compare. */
function describePublishedDelta(metrics: DashboardMetrics): { text: string; tone: StatPillTone } {
  const delta = metrics.publishedThisMonth - metrics.publishedLastMonth
  if (metrics.publishedLastMonth === 0 && metrics.publishedThisMonth === 0) {
    return { text: 'Nothing published yet', tone: 'muted' }
  }
  if (delta === 0) return { text: 'Same as last month', tone: 'muted' }
  return {
    text: `${delta > 0 ? '+' : ''}${delta} vs last month`,
    tone: delta > 0 ? 'positive' : 'attention',
  }
}

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
  const weekStartISO = getMondayISO()

  const [data, coverage] = await Promise.all([
    fetchDashboardData(supabase, agencyId, clients, weekStartISO),
    getCachedClientWeekCoverage(agencyId, weekStartISO),
  ])

  const { metrics } = data
  const filledPerDay = countFilledPerDay(coverage)
  const coveredDays = filledPerDay.filter((count) => count > 0).length
  const publishedDelta = describePublishedDelta(metrics)

  return (
    <div className="px-4 pb-12 pt-1 md:px-8">
      <div className="rv">
        <DashboardHeader
          agencyName={agency?.name ?? ''}
          clientCount={clients.length}
          isSolo={isSolo}
          timezone={timezone}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
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
            <MiniWeek counts={filledPerDay} todayIndex={resolveTodayIndex(timezone)} />
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
          <StatCard
            label="Published this month"
            value={metrics.publishedThisMonth}
            icon={<Send size={16} />}
            pill={publishedDelta}
            footer={
              metrics.publishedLastMonth > 0
                ? `${metrics.publishedLastMonth} last month`
                : 'First publishes are still ahead'
            }
          />
        </div>
      </div>

      {data.changeRequests.length > 0 && (
        <section className="rv mt-4 [--d:280ms]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              <span className="grid size-[27px] place-items-center rounded-sm bg-marker text-forest-deep">
                <BarChart2 size={14} />
              </span>
              Change requests
            </span>
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

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="rv [--d:300ms]">
          <ClientCoverage
            clients={clients}
            coverage={coverage}
            clientPendingMap={metrics.clientPendingMap}
          />
        </div>
        <div className="rv [--d:360ms]">
          <ReviewStack posts={data.pendingPosts} totalPending={metrics.pendingCount} />
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
