import { type NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  fetchClientData,
  getAgencyNiche,
  extractPlatformFromMix,
} from '@/lib/clients/fetch-client-data'
import { countPendingPostsByClients } from '@/lib/queries/db'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import { performResearch } from '@/ai/research/research-orchestrator'
import { finishGenerationRun, startGenerationRun } from '@/lib/generation/runs'
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { generateSoloCoaching } from '@/ai/solo-coaching/generate-coaching'
import { generateBestTime } from '@/ai/best-time/generate-best-time'
import { getMondayISO } from '@/utils/date-helpers'
import { BEST_TIME_REFRESH_DAYS, DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { fetchScheduleContext, getScheduleDue } from './helpers'
import type { PostType } from '@/types/api'
import type { Theme } from '@/ai/generation/types'
import type { Database, Json } from '@/types/database'

export const maxDuration = 300

// Stop starting new clients past this point so in-flight work finishes cleanly
// instead of Vercel killing the function at maxDuration (300s) mid-client.
const TIME_BUDGET_MS = 240_000

/** Cron endpoint — generates each client's batch when its weekday+hour slot comes due in the agency's timezone. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const supabase = createAdminSupabaseClient()
  const results = {
    processed: 0,
    posts_created: 0,
    errors: [] as Array<{ clientId: string; error: string }>,
    skipped_for_time: [] as string[],
  }
  const processedAgencyIds = new Set<string>()

  const { data: schedules, error: schedulesError } = await supabase
    .from('posting_schedules')
    .select('id, client_id, is_active, frequency_value, auto_generate_day, auto_generate_time')
    .eq('is_active', true)
  // No schedules and a failed schedule query both produce an empty due list, so
  // without this the cron reports a clean run on the day it generated nothing.
  if (schedulesError) {
    console.error('[cron:generate] active schedule query failed:', schedulesError.message)
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 })
  }

  const ctx = await fetchScheduleContext(supabase, schedules ?? [])

  // One slot, one batch: each client's latest generation run decides below
  // whether today's slot already produced. 'failed' runs are excluded — a
  // failed run saved nothing, and counting it would cancel the same-day
  // retries the due-since check exists for. 'running' stays in so an
  // in-flight invocation is not doubled. 26h covers the widest case — a
  // midnight slot checked at the end of its local day, plus grace.
  const recentCutoff = new Date(Date.now() - 26 * 3_600_000).toISOString()
  const { data: recentRuns, error: recentRunsError } = await supabase
    .from('generation_runs')
    .select('client_id, created_at')
    .in(
      'client_id',
      (schedules ?? []).map((s) => s.client_id)
    )
    .in('status', ['running', 'complete'])
    .gte('created_at', recentCutoff)
  // This is the whole dedup guard: an unread failure reads as "nothing ran
  // recently" and regenerates a batch every client already has.
  if (recentRunsError) {
    console.error('[cron:generate] recent run query failed:', recentRunsError.message)
    return NextResponse.json({ error: 'Failed to load recent runs' }, { status: 500 })
  }
  const lastRunAt = new Map<string, number>()
  for (const run of (recentRuns as Array<{
    client_id: string | null
    created_at: string
  }> | null) ?? []) {
    if (!run.client_id) continue
    const at = new Date(run.created_at).getTime()
    if (at > (lastRunAt.get(run.client_id) ?? 0)) lastRunAt.set(run.client_id, at)
  }

  // A run shortly before the slot counts as the slot's batch, absorbing a
  // manual batch finished moments ahead of the tick. Kept narrow on purpose:
  // single-post idea runs land in generation_runs too, and a wide grace would
  // let a morning idea post silently cancel the weekly batch. Runs at or
  // after the slot dedup later ticks and sequential re-fires; two invocations
  // racing the same tick are NOT covered (no unique constraint on
  // generation_runs — pre-existing, see docs/TECH-DEBT.md).
  const GENERATION_GRACE_MS = 900_000

  // Fewest remaining retry ticks first: a 23:00 slot has no next-hour tick
  // inside its local day, so a time-budget skip must not land on it merely
  // because it sorted last in table order.
  const dueClients = (schedules ?? [])
    .flatMap((schedule) => {
      const clientRow = ctx.clients.get(schedule.client_id)
      if (!clientRow) return []
      const agencyTimezone = ctx.agencyTimezones.get(clientRow.agency_id) ?? 'UTC'
      const { due, scheduledAt, localHour } = getScheduleDue(schedule, agencyTimezone)
      if (!due) return []
      if ((lastRunAt.get(clientRow.id) ?? 0) >= scheduledAt.getTime() - GENERATION_GRACE_MS)
        return []
      return [{ schedule, clientRow, localHour }]
    })
    .sort((a, b) => b.localHour - a.localHour)

  for (const { schedule, clientRow } of dueClients) {
    // Declared outside the try so the catch can mark an interrupted run failed.
    let runId: string | null = null
    try {
      const { id: clientId, agency_id: agencyId } = clientRow

      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        results.skipped_for_time.push(clientId)
        console.error(`[cron] Time budget exceeded — skipping client ${clientId} this run`)
        continue
      }
      const clientStartedAt = Date.now()

      const brandProfile = ctx.brandProfiles.get(clientId) ?? null

      const clientResult = await fetchClientData(supabase, clientId, agencyId)
      if ('error' in clientResult) continue
      const client = clientResult.data

      const mixJson = (brandProfile?.weekly_mix_json ?? {}) as Record<string, unknown>
      const platform = extractPlatformFromMix(mixJson)
      const postType = (brandProfile?.default_post_type ?? 'single') as PostType
      const slideCount = brandProfile?.default_carousel_slides ?? DEFAULT_CAROUSEL_SLIDES

      // Under hourly ticks the run row IS the slot's dedup key: a batch
      // generated without one would be regenerated every remaining tick
      // today. Skip instead — the next tick retries the insert.
      const total = (schedule as { frequency_value: number }).frequency_value || 1
      runId = await startGenerationRun(supabase, { clientId, platform, targetCount: total })
      if (!runId) {
        results.errors.push({
          clientId,
          error: 'could not open a generation run — deferred to next tick',
        })
        continue
      }

      const researchStartedAt = Date.now()
      const researchTopics = await performResearch({
        supabase,
        agencyId,
        clientId,
        niche: client.niche,
        language: client.language,
        count: total,
        preloadedClientData: client,
      })

      if (researchTopics.length === 0) {
        console.error(`[cron] No research topics for client ${clientId} — skipping generation`)
        if (runId) await finishGenerationRun(supabase, runId, 'failed')
        continue
      }

      const themes: Theme[] = researchTopics.map((t) => ({
        description: t.suggested_theme,
        count: 1,
        pillar: t.pillar,
        sourceUrl: t.source_url,
        sourceTitle: t.source_title,
        sourceType: t.source_type ?? undefined,
        sourceExcerpt: t.source_excerpt,
        sourceFullText: t.source_full_text,
        clientSourceId: t.client_source_id ?? null,
      }))

      const researchMs = Date.now() - researchStartedAt
      const generationStartedAt = Date.now()
      const generationResults = await runGenerationBatch({
        client,
        platform,
        postType,
        slideCount,
        requireSourceGrounding: client.requireSourceGrounding,
        themes,
        priorityPosts: [],
        trackTheme: async (theme, postCount) => {
          if (!runId) return
          await supabase.from('generation_themes').insert({
            run_id: runId,
            theme_description: theme.description,
            post_count: postCount,
            is_priority: theme.isPriority ?? false,
            priority_brief: theme.brief ?? null,
            target_date: theme.targetDate ?? null,
            research_used: !!theme.sourceExcerpt,
          })
        },
      })
      const generationMs = Date.now() - generationStartedAt

      // Batch insert rather than N serial round-trips.
      if (generationResults.length > 0) {
        const { data: savedPosts, error: saveError } = await supabase
          .from('posts')
          .insert(
            generationResults.map(
              ({ post }) =>
                ({
                  client_id: clientId,
                  caption: post.caption,
                  platform: post.platform,
                  post_type: post.post_type,
                  slides_json: post.slides_json as Json,
                  validation_json: post.validation_json as Json,
                  status: 'pending_review',
                  priority: false,
                  quality_score_avg: post.quality_score_avg,
                  source_url: post.source_url,
                  source_title: post.source_title,
                  source_type: post.source_type,
                  source_excerpt: post.source_excerpt,
                  client_source_id: post.client_source_id,
                  pillar: post.pillar,
                  topic_summary: post.topic_summary,
                  // WHY as: topic_summary lands with migration 20260806 and is not
                  // yet in the generated types — regenerate database.ts after
                  // applying it, then drop this cast.
                }) as Database['public']['Tables']['posts']['Insert']
            )
          )
          .select('id')

        // Generated posts are expensive — a silent insert failure loses the whole batch
        if (saveError) {
          throw new Error(`Failed to save generated posts: ${saveError.message}`)
        }

        if (savedPosts && savedPosts.length > 0) {
          const { error: historyError } = await supabase.from('post_history').insert(
            generationResults.map(({ post }) => ({
              client_id: clientId,
              topic_summary: post.topic_summary,
            }))
          )
          // Logged, not thrown: the batch is already saved, and the run must not
          // be relabelled 'failed' past this point. History only feeds topic
          // de-duplication, so the cost of losing it is a repeated topic later.
          if (historyError) {
            console.error(
              `[cron] post history insert failed for client ${clientId}:`,
              historyError.message
            )
          }
          results.posts_created += savedPosts.length
        }
      }

      // The batch is on disk — close the run before the follow-ups. The retry
      // guard trusts 'failed' to mean "nothing saved", so a notify or
      // best-time error past this point must not relabel a saved batch and
      // trigger a duplicate next tick.
      if (runId) await finishGenerationRun(supabase, runId, 'complete')

      try {
        const { error: notifyError } = await supabase.from('notifications').insert({
          agency_id: agencyId,
          message: `${generationResults.length} post${generationResults.length === 1 ? '' : 's'} ready to review for ${clientRow.name}`,
        })
        if (notifyError) throw new Error(`notification insert failed: ${notifyError.message}`)

        const updatedAt = brandProfile?.best_time_updated_at
        const isStale =
          !updatedAt ||
          Date.now() - new Date(updatedAt).getTime() > BEST_TIME_REFRESH_DAYS * 86_400_000
        if (isStale) {
          const bestTime = await generateBestTime({
            niche: clientRow.niche ?? 'General',
            targetAudience: client.targetAudience,
            language: client.language,
            platforms: platform,
          })
          const { error: bestTimeError } = await supabase
            .from('brand_profiles')
            .update({
              best_time_json: bestTime as unknown as Json,
              best_time_updated_at: new Date().toISOString(),
            })
            .eq('client_id', clientId)
          // Unwritten best_time_updated_at leaves the profile permanently stale,
          // so every later tick pays for a fresh LLM best-time call.
          if (bestTimeError) throw new Error(`best time write failed: ${bestTimeError.message}`)
        }
      } catch (err) {
        console.error(`[cron] post-save follow-ups failed for client ${clientId}:`, err)
      }

      processedAgencyIds.add(agencyId)
      results.processed++
      console.info(
        `[cron] client=${clientId} done in ${Math.round((Date.now() - clientStartedAt) / 1000)}s ` +
          `(research ${Math.round(researchMs / 1000)}s, generation ${Math.round(generationMs / 1000)}s), ` +
          `${generationResults.length} posts`
      )
    } catch (err) {
      if (runId) await finishGenerationRun(supabase, runId, 'failed')
      results.errors.push({
        clientId: schedule.client_id,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // One briefing per agency per week.
  const weekStart = getMondayISO()
  for (const agencyId of processedAgencyIds) {
    try {
      // This read is the once-per-week guard; an unread failure regenerates a
      // briefing the agency already has, at LLM cost.
      const { data: existing, error: existingError } = await supabase
        .from('intelligence_briefings')
        .select('id')
        .eq('agency_id', agencyId)
        .gte('week_start', weekStart)
        .maybeSingle()
      if (existingError) throw new Error(`briefing lookup failed: ${existingError.message}`)

      if (!existing) {
        const agencyNiche = await getAgencyNiche(supabase, agencyId)
        const briefing = await generateBriefing({ agencyNiche })

        const { data: inserted, error: insertError } = await supabase
          .from('intelligence_briefings')
          .insert({
            agency_id: agencyId,
            platform_updates: briefing.platform_updates,
            trending_topics: briefing.niche_trends as unknown as Json,
            weekly_tip: briefing.weekly_tip,
            action_nudge: briefing.action_nudge,
            sources: briefing.sources,
            week_start: weekStart,
          })
          .select('id')
          .single()
        if (insertError || !inserted) {
          throw new Error(`briefing insert failed: ${insertError?.message ?? 'no row returned'}`)
        }

        // Solo coaching card — only for solo-mode agencies
        const { data: rawAgency, error: agencyError } = await supabase
          .from('agencies')
          .select('mode')
          .eq('id', agencyId)
          .maybeSingle()
        if (agencyError) throw new Error(`agency mode lookup failed: ${agencyError.message}`)
        // as: explicit column projection — Supabase types from the table, not the select
        const agency = rawAgency as { mode: string } | null

        if (agency?.mode === 'solo') {
          // SECURITY: admin client bypasses RLS — must scope pending count to this agency's clients
          // agencyNiche already computed above — no extra niche query needed
          const { data: agencyClients, error: clientsError } = await supabase
            .from('clients')
            .select('id')
            .eq('agency_id', agencyId)
          // An empty list would read as "nothing pending" and coach the opposite advice.
          if (clientsError) throw new Error(`agency client query failed: ${clientsError.message}`)
          const agencyClientIds = ((agencyClients as Array<{ id: string }> | null) ?? []).map(
            (c) => c.id
          )

          const pendingCount = await countPendingPostsByClients(supabase, agencyClientIds)

          const coaching = await generateSoloCoaching({
            niche: agencyNiche ?? 'general',
            pendingCount,
          })

          const { error: coachingError } = await supabase
            .from('intelligence_briefings')
            .update({ coaching_points: coaching.coaching_points as unknown as Json })
            .eq('id', (inserted as { id: string }).id)
          if (coachingError) {
            throw new Error(`coaching write failed: ${coachingError.message}`)
          }
        }
      }
    } catch (err) {
      console.error('[cron] Briefing generation failed for agency', agencyId, err)
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
