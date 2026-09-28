import { type NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  closeAbandonedRuns,
  fetchRecentRuns,
  lastCronRunAt,
  type RecentRun,
} from '@/lib/generation/runs'
import { createAgencyBudgets } from '@/lib/generation/scheduled-budget'
import { runScheduledBatch } from '@/lib/generation/scheduled-run'
import { writeWeeklyBriefing } from '@/features/dashboard/lib/write-briefing'
import { runAsSpender } from '@/lib/billing/spend-context'
import { NOTHING_OWED, type OwedImages } from '@/lib/billing/copy'
import { MS_PER_HOUR } from '@/utils/constants'
import { POSTING_SCHEDULE_DUE_COLUMNS } from '@/lib/queries/select-columns'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'
import { fetchOwedByAgency, fetchScheduleContext, getScheduleDue } from './helpers'

export const maxDuration = 300

/**
 * Stop starting new clients past this point, so in-flight work finishes cleanly instead of Vercel
 * killing the function at `maxDuration` (300 s) mid-client.
 */
const TIME_BUDGET_MS = 240_000

/**
 * How far back the tick reads runs: the widest slot dedup needs — a midnight slot checked at the
 * end of its local day, plus grace — and more than the abandoned-run closer's 15 minutes.
 */
const RECENT_RUNS_MS = 26 * MS_PER_HOUR

/**
 * A run this shortly before the slot counts as the slot's batch, absorbing a cron run finished
 * moments ahead of the tick. The dedup it serves is the cheap pre-filter, not the guarantee: two
 * invocations racing one tick both pass it, and the slot claim in `startGenerationRun` settles
 * that race.
 */
const GENERATION_GRACE_MS = 900_000

/**
 * Cron endpoint — generates each client's batch when its weekday+hour slot comes due in the
 * agency's timezone (per client: `runScheduledBatch`, src/lib/generation/scheduled-run.ts).
 * Order matters: the week's platform brief runs FIRST, or `maxDuration` kills its web-searched
 * model call on weeks generation spends the whole budget (a failed brief is only logged); abandoned
 * runs close (`closeAbandonedRuns`) before the slot dedup, so a killed run that landed nothing is
 * due again this tick; due clients run fewest-remaining-retries first, since a 23:00 slot has no
 * later tick in its local day. A failed schedule, run or owed-pictures read fails the tick with a
 * 500 rather than reading as empty — an empty due list would report a clean day that made nothing.
 */
export async function GET(request: NextRequest) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const supabase = createAdminSupabaseClient()
  const results = {
    processed: 0,
    posts_created: 0,
    errors: [] as Array<{ clientId: string; error: string }>,
    skipped_for_time: [] as string[],
    slot_already_claimed: [] as string[],
    skipped_unentitled: [] as string[],
    skipped_over_allowance: [] as string[],
  }

  try {
    const brief = await runAsSpender({ agencyId: null, flow: 'brief' }, () =>
      writeWeeklyBriefing(supabase)
    )
    if (brief.written) {
      console.info(
        `[cron] weekly brief written: ${brief.itemCount} items, ${brief.unverified} unverified dropped`
      )
    }
  } catch (err) {
    console.error('[cron] weekly brief failed:', err)
  }

  let runs: RecentRun[]
  try {
    runs = await fetchRecentRuns(supabase, new Date(Date.now() - RECENT_RUNS_MS))
  } catch (err) {
    console.error('[cron:generate] recent run query failed:', err)
    return NextResponse.json({ error: 'Failed to load recent runs' }, { status: 500 })
  }
  try {
    runs = await closeAbandonedRuns(supabase, runs)
  } catch (err) {
    console.error('[cron:generate] abandoned run sweep failed:', err)
  }

  const { data: schedules, error: schedulesError } = await supabase
    .from('posting_schedules')
    .select(POSTING_SCHEDULE_DUE_COLUMNS)
    .eq('is_active', true)
  if (schedulesError) {
    console.error('[cron:generate] active schedule query failed:', schedulesError.message)
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 })
  }

  const ctx = await fetchScheduleContext(supabase, schedules ?? [])
  const lastRunAt = lastCronRunAt(runs)
  const dueClients = (schedules ?? [])
    .flatMap((schedule) => {
      const clientRow = ctx.clients.get(schedule.client_id)
      if (!clientRow) return []
      const agencyTimezone = ctx.agencyTimezones.get(clientRow.agency_id) ?? 'UTC'
      const { due, scheduledAt, localHour } = getScheduleDue(schedule, agencyTimezone)
      if (!due) return []
      if ((lastRunAt.get(clientRow.id) ?? 0) >= scheduledAt.getTime() - GENERATION_GRACE_MS)
        return []
      const entitlement = ctx.entitlements.get(clientRow.agency_id)
      const committed = ctx.committed.get(clientRow.agency_id)
      if (!entitlement || !committed) {
        results.skipped_unentitled.push(clientRow.id)
        return []
      }
      return [{ schedule, clientRow, localHour, scheduledAt, entitlement, committed }]
    })
    .sort((a, b) => b.localHour - a.localHour)

  const dueAgencyIds = [...new Set(dueClients.map((due) => due.clientRow.agency_id))]
  let owedByAgency: Map<string, OwedImages>
  try {
    owedByAgency = await fetchOwedByAgency(supabase, dueAgencyIds)
  } catch (err) {
    console.error('[cron:generate] owed images read failed:', err)
    return NextResponse.json({ error: 'Failed to load owed images' }, { status: 500 })
  }
  const budgets = createAgencyBudgets(
    new Map(
      dueClients.map(({ clientRow, entitlement, committed }) => [
        clientRow.agency_id,
        {
          limits: entitlement.limits,
          committed,
          owed: owedByAgency.get(clientRow.agency_id) ?? NOTHING_OWED,
        },
      ])
    )
  )

  for (const { schedule, clientRow, scheduledAt, entitlement } of dueClients) {
    const outcome = await runScheduledBatch(supabase, {
      schedule,
      client: clientRow,
      scheduledAt,
      entitlement,
      brandProfile: ctx.brandProfiles.get(clientRow.id) ?? null,
      budgets,
      deadline: startedAt + TIME_BUDGET_MS,
    })
    if (outcome.kind === 'processed') {
      results.processed++
      results.posts_created += outcome.posts
    } else if (outcome.kind === 'skipped_for_time') results.skipped_for_time.push(clientRow.id)
    else if (outcome.kind === 'slot_taken') results.slot_already_claimed.push(clientRow.id)
    else if (outcome.kind === 'over_allowance') results.skipped_over_allowance.push(clientRow.id)
    else if (outcome.kind === 'error') {
      results.errors.push({ clientId: clientRow.id, error: outcome.error })
    }
  }

  const elapsedS = Math.round((Date.now() - startedAt) / 1000)
  console.info(
    `[cron] run complete: ${results.processed} clients, ${results.posts_created} posts, ` +
      `${results.errors.length} errors, ${results.skipped_for_time.length} skipped for time — ` +
      `${elapsedS}s of ${maxDuration}s budget`
  )

  return NextResponse.json(results)
}
