import { NextResponse, type NextRequest } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchEntitledClients } from '@/lib/billing/entitled-clients'
import { clearStaleVisualJobs } from '@/lib/visual/visual-jobs'
import { paintBacklog, ringImagesWaiting, selectPaintableBacklog } from '@/lib/visual/paint-backlog'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'

export const maxDuration = 300

/** Stop launching generations past this point, so the ones in flight finish before `maxDuration`. */
const TIME_BUDGET_MS = 240_000

/**
 * Drop the claims of invocations that were killed, before deciding what still owes a picture.
 *
 * Every reader already ignores them by age, so this frees the position for a retry instead of
 * making the reviewer wait the window out, and stops the table keeping a row per dead generation.
 * Housekeeping, never a precondition: the sweep throws on a failed delete, and a tick that painted
 * nothing because a cleanup query hiccuped is a worse outcome than a claim living an hour longer.
 */
async function releaseAbandonedClaims(admin: ReturnType<typeof createAdminSupabaseClient>) {
  try {
    const released = await clearStaleVisualJobs(admin)
    if (released > 0) console.info(`[cron/visuals] released ${released} abandoned claim(s)`)
  } catch (err) {
    console.error('[cron/visuals] stale claim sweep failed:', err)
  }
}

/**
 * Paint the missing visuals for pending_review posts so they arrive in the queue as finished
 * creatives. Runs ten minutes after the generate cron (vercel.json); text composition stays
 * browser-side — the review queue bakes copy onto these clean images on first open
 * (src/features/review/components/review-queue.tsx). Picking, painting and the bell live in
 * src/lib/visual/paint-backlog.ts. `skipped_allowance` sums the posts the pools refused whole and
 * the positions a race refused at the reservation (`reserveUsage`, src/lib/billing/usage.ts).
 */
export async function GET(request: NextRequest) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const admin = createAdminSupabaseClient()
  await releaseAbandonedClaims(admin)

  const entitled = await fetchEntitledClients(admin, 'spend')
  let backlog: Awaited<ReturnType<typeof selectPaintableBacklog>>
  try {
    backlog = await selectPaintableBacklog(admin, entitled, new Date())
  } catch (err) {
    console.error('[cron/visuals] failed to load the backlog:', err)
    return NextResponse.json({ error: 'Failed to load the backlog' }, { status: 500 })
  }
  if (backlog.refusedByAgency) await ringImagesWaiting(admin, backlog.refusedByAgency)
  const outcome = await paintBacklog(admin, backlog, entitled, startedAt + TIME_BUDGET_MS)

  return NextResponse.json({
    posts: backlog.jobs.length,
    generated: outcome.generated,
    failed: outcome.failed,
    skipped_no_copy: outcome.skippedNoCopy,
    skipped_in_flight: outcome.skippedInFlight,
    skipped_allowance:
      outcome.skippedAllowance +
      [...(backlog.refusedByAgency?.values() ?? [])].reduce((sum, { posts }) => sum + posts, 0),
    skipped_for_time: outcome.skippedForTime,
    duration_ms: Date.now() - startedAt,
  })
}
