import 'server-only'

import type { AdminClient } from '@/lib/supabase/admin'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { fetchEngineContext } from '@/lib/queries/db'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import { toTheme } from '@/ai/generation/to-theme'
import { performResearch } from '@/ai/research/research-orchestrator'
import { distillStyleMemo } from '@/ai/learning/distill-style-memo'
import { insertDraftPosts } from '@/lib/generation/draft-posts'
import {
  finishGenerationRun,
  startGenerationRun,
  trackGenerationTheme,
} from '@/lib/generation/runs'
import type { AgencyBudgets } from '@/lib/generation/scheduled-budget'
import { runAsSpender } from '@/lib/billing/spend-context'
import { allowanceUsedUp } from '@/lib/billing/copy'
import type { Entitlement } from '@/lib/billing/entitlement'
import type { AllowanceKind } from '@/lib/billing/plans'
import { toPostType, visualSlots } from '@/lib/visual/visual-backlog'
import { notify, NOTIFY_EVERY_TIME } from '@/lib/notifications/notify'
import { clamp } from '@/lib/canvas/clamp'
import {
  DEFAULT_CAROUSEL_SLIDES,
  MAX_CAROUSEL_SLIDES,
  MIN_CAROUSEL_SLIDES,
  STYLE_MEMO_REFRESH_DAYS,
} from '@/utils/constants'
import type { BrandProfileRow, ClientRow, PostingScheduleRow } from '@/types'

/** What one due client's scheduled batch came to, for the tick's report. */
type ScheduledOutcome =
  | { kind: 'processed'; posts: number }
  | { kind: 'skipped_for_time' }
  | { kind: 'slot_taken' }
  | { kind: 'over_allowance' }
  | { kind: 'error'; error: string }
  /** Research found no topics; logged here and not reported. */
  | { kind: 'nothing' }

interface ScheduledRunInput {
  schedule: Pick<PostingScheduleRow, 'client_id' | 'frequency_value'>
  client: Pick<ClientRow, 'id' | 'agency_id' | 'name'>
  /** The instant of the slot this batch belongs to — the run's dedup key. */
  scheduledAt: Date
  entitlement: Entitlement
  brandProfile: Pick<BrandProfileRow, 'default_post_type' | 'default_carousel_slides'> | null
  budgets: AgencyBudgets
  /** Past this instant no new client is started, so in-flight work finishes before `maxDuration`. */
  deadline: number
}

/** The client's format, which decides what one post costs in pictures. */
interface BatchFormat {
  postType: ReturnType<typeof toPostType>
  slideCount: number
  slotsPerPost: number
}

/** A claimed run: its id and how many posts it reserved. */
interface OpenRun {
  id: string
  total: number
}

/**
 * The one bell for a pool a scheduled run cannot be paid from: once per workspace, period, pool and
 * pool size (`allowance_reached:<period>:<kind>:<quota>`), however many clients and ticks find it
 * empty — the pool is the workspace's, and the first client it stopped is the one named. The size
 * is in the key because a charged slot raise grows the pool mid-period (`setClientSlots`,
 * src/lib/billing/client-slots.ts) and nothing shrinks it (`paidQuantity`,
 * src/lib/billing/subscription-store.ts), so each bigger pool rings once. The sentence is the
 * caller's, because the two who raise it know different things — the budget knows which pool ran
 * out, the reservation race is handed the refusal itself — and both come from `allowanceUsedUp`,
 * so a workspace stopped by its pictures is never told it is out of drafts.
 */
async function notifyAllowanceExhausted(
  supabase: AdminClient,
  input: {
    agencyId: string
    clientId: string
    entitlement: Pick<Entitlement, 'periodKey' | 'limits'>
    kind: AllowanceKind
    message: string
  }
): Promise<void> {
  const { entitlement, kind } = input
  await notify(supabase, {
    agencyId: input.agencyId,
    clientId: input.clientId,
    type: 'allowance_reached',
    message: input.message,
    dedupKey: `allowance_reached:${entitlement.periodKey}:${kind}:${entitlement.limits[kind]}`,
  })
}

/**
 * The format a scheduled batch is written in: the brand profile's default, where a stored post
 * type other than 'carousel' is a single (`toPostType`, src/lib/visual/visual-backlog.ts).
 */
function batchFormat(brandProfile: ScheduledRunInput['brandProfile']): BatchFormat {
  const postType = toPostType(brandProfile?.default_post_type)
  const slideCount = clamp(
    brandProfile?.default_carousel_slides ?? DEFAULT_CAROUSEL_SLIDES,
    MIN_CAROUSEL_SLIDES,
    MAX_CAROUSEL_SLIDES
  )
  return { postType, slideCount, slotsPerPost: visualSlots(postType, slideCount) }
}

/**
 * How many posts the batch may be: the schedule's ask, trimmed to the workspace's budget for the
 * tick (`AgencyBudgets`, src/lib/generation/scheduled-budget.ts). When not one post fits, the
 * workspace gets the empty pool's one bell (`notifyAllowanceExhausted`), worded on what that post
 * lacks (`ScheduledBatch.short`).
 */
async function sizeBatch(
  supabase: AdminClient,
  input: ScheduledRunInput,
  slotsPerPost: number
): Promise<number> {
  const { client, entitlement, budgets } = input
  const batch = budgets.plan(client.agency_id, input.schedule.frequency_value || 1, slotsPerPost)
  if (batch.total > 0 || !batch.short) return batch.total
  const budget = budgets.of(client.agency_id)
  const { kind, needed } = batch.short
  await notifyAllowanceExhausted(supabase, {
    agencyId: client.agency_id,
    clientId: client.id,
    entitlement,
    kind,
    message: allowanceUsedUp(
      kind,
      budget.committed[kind],
      budget.limits[kind],
      needed,
      entitlement,
      budget.owed
    ),
  })
  return 0
}

/**
 * Claim the slot (`startGenerationRun`) before any model call, so a lost race costs two reads
 * rather than a duplicate batch: the run's id, or the outcome when there is none. A lost race is
 * `slot_taken`, not an error; a failed claim defers the client to the next tick; a claim the
 * reservation refuses (a race with a wizard run) rings the same bell with the refusal's sentence.
 */
async function claimSlot(
  supabase: AdminClient,
  input: ScheduledRunInput,
  total: number
): Promise<string | ScheduledOutcome> {
  const { client, entitlement } = input
  const claim = await startGenerationRun(supabase, {
    clientId: client.id,
    agencyId: client.agency_id,
    entitlement,
    targetCount: total,
    kind: 'cron',
    slotKey: input.scheduledAt,
  })
  if ('refused' in claim) {
    await notifyAllowanceExhausted(supabase, {
      agencyId: client.agency_id,
      clientId: client.id,
      entitlement,
      kind: claim.refused.kind,
      message: claim.refused.message,
    })
    return { kind: 'over_allowance' }
  }
  if (claim.runId !== null) return claim.runId
  return claim.slotTaken
    ? { kind: 'slot_taken' }
    : { kind: 'error', error: 'could not open a generation run — deferred to next tick' }
}

/**
 * Close the run with what landed and give the rest back to the tick's budget. A cron run never
 * watches research, so it reports no skipped pillars.
 */
async function closeRun(
  supabase: AdminClient,
  input: ScheduledRunInput,
  run: OpenRun,
  slotsPerPost: number,
  status: 'complete' | 'failed',
  landed: number
): Promise<void> {
  const agencyId = input.client.agency_id
  await finishGenerationRun(supabase, run.id, {
    status,
    agencyId,
    entitlement: input.entitlement,
    reserved: run.total,
    landed,
    skipped: null,
  })
  input.budgets.giveBack(agencyId, run.total - landed, slotsPerPost)
}

/**
 * The follow-ups of a saved batch — the posts-ready bell and the style-memo distiller, which skips
 * on its own when the memo is fresh. A failure is logged and never touches the closed run.
 */
async function announceBatch(
  supabase: AdminClient,
  input: ScheduledRunInput,
  client: { language: string; languageNotes: string },
  posts: number
): Promise<void> {
  const { id: clientId, agency_id: agencyId, name } = input.client
  try {
    await notify(supabase, {
      agencyId,
      clientId,
      type: 'posts_ready',
      message: `${posts} post${posts === 1 ? '' : 's'} ready to review for ${name}`,
      cooldownDays: NOTIFY_EVERY_TIME,
    })
    await runAsSpender({ agencyId, flow: 'style_memo' }, () =>
      distillStyleMemo(supabase, clientId, {
        language: client.language,
        languageNotes: client.languageNotes,
        skipIfFresherThanDays: STYLE_MEMO_REFRESH_DAYS,
      })
    )
  } catch (err) {
    console.error(`[cron] post-save follow-ups failed for client ${clientId}:`, err)
  }
}

/**
 * One due client's scheduled batch, from its budget to its bell — the generate cron's per-client
 * pipeline (src/app/api/cron/generate/route.ts), each client in its own try so one failure never
 * stops the tick: format, size (`sizeBatch`), deadline, client read, slot claim (`claimSlot`),
 * research, generation, save, close (`closeRun`), follow-ups (`announceBatch`).
 *
 * The drafts are saved as `pending_review`, each carrying the run. A run that saved nothing closes
 * failed, never complete, since the dedup counts `complete` as "this slot produced". The run is
 * closed before the follow-ups, so a failed follow-up can never relabel a saved batch as failed
 * and trigger a duplicate next tick.
 */
export async function runScheduledBatch(
  supabase: AdminClient,
  input: ScheduledRunInput
): Promise<ScheduledOutcome> {
  const { id: clientId, agency_id: agencyId } = input.client
  const format = batchFormat(input.brandProfile)
  const spender = { agencyId, flow: 'generation' as const }
  let run: OpenRun | null = null

  try {
    const total = await sizeBatch(supabase, input, format.slotsPerPost)
    if (total === 0) return { kind: 'over_allowance' }
    if (Date.now() > input.deadline) {
      console.error(`[cron] Time budget exceeded — skipping client ${clientId} this run`)
      return { kind: 'skipped_for_time' }
    }
    const clientStartedAt = Date.now()

    const clientResult = await fetchClientData(supabase, clientId, agencyId)
    if ('error' in clientResult) return { kind: 'error', error: clientResult.error }
    const { exemplars, styleMemo } = await fetchEngineContext(supabase, clientId)
    const client = { ...clientResult.data, exemplars, styleMemo }

    const claimed = await claimSlot(supabase, input, total)
    if (typeof claimed !== 'string') return claimed
    const openRun: OpenRun = { id: claimed, total }
    run = openRun
    input.budgets.take(agencyId, total, format.slotsPerPost)

    const researchStartedAt = Date.now()
    const researchTopics = await runAsSpender(spender, () =>
      performResearch({
        supabase,
        clientId,
        niche: client.niche,
        count: total,
        preloadedClientData: client,
      })
    )
    if (researchTopics.length === 0) {
      console.error(`[cron] No research topics for client ${clientId} — skipping generation`)
      run = null
      await closeRun(supabase, input, openRun, format.slotsPerPost, 'failed', 0)
      return { kind: 'nothing' }
    }

    const researchMs = Date.now() - researchStartedAt
    const generationStartedAt = Date.now()
    const generationResults = await runAsSpender(spender, () =>
      runGenerationBatch({
        client,
        postType: format.postType,
        slideCount: format.slideCount,
        themes: researchTopics.map(toTheme),
        trackTheme: (theme, postCount) =>
          trackGenerationTheme(supabase, openRun.id, theme, postCount),
      })
    )
    const generationMs = Date.now() - generationStartedAt
    if (generationResults.length === 0) {
      console.error(`[cron] Generation produced no posts for client ${clientId}`)
      run = null
      await closeRun(supabase, input, openRun, format.slotsPerPost, 'failed', 0)
      return { kind: 'error', error: 'generation produced no posts' }
    }

    const saved = await insertDraftPosts(
      supabase,
      generationResults.map(({ post }) => ({ ...post, generation_run_id: openRun.id })),
      'pending_review'
    )
    run = null
    await closeRun(
      supabase,
      input,
      openRun,
      format.slotsPerPost,
      'complete',
      generationResults.length
    )
    await announceBatch(supabase, input, client, generationResults.length)

    console.info(
      `[cron] client=${clientId} done in ${Math.round((Date.now() - clientStartedAt) / 1000)}s ` +
        `(research ${Math.round(researchMs / 1000)}s, generation ${Math.round(generationMs / 1000)}s), ` +
        `${generationResults.length} posts`
    )
    return { kind: 'processed', posts: saved.length }
  } catch (err) {
    if (run) await closeRun(supabase, input, run, format.slotsPerPost, 'failed', 0)
    return { kind: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
