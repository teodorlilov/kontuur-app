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
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { generateSoloCoaching } from '@/ai/solo-coaching/generate-coaching'
import { generateBestTime } from '@/ai/best-time/generate-best-time'
import { getMondayISO } from '@/utils/date-helpers'
import { BEST_TIME_REFRESH_DAYS, DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { composePostVisuals } from '@/lib/renderer/generate-post-visuals'
import { fetchScheduleContext, shouldGenerateToday } from './helpers'
import type { CarouselSlide, PostType } from '@/types/api'
import type { Theme } from '@/ai/generation/types'
import type { Json } from '@/types/database'

export const maxDuration = 300

// Stop starting new clients past this point so in-flight work finishes cleanly
// instead of Vercel killing the function at maxDuration (300s) mid-client.
const TIME_BUDGET_MS = 240_000

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

  // Fetch all active schedules + batch-load context (clients, profiles, timezones)
  const { data: schedules } = await supabase
    .from('posting_schedules')
    .select('id, client_id, is_active, frequency_value, auto_generate_day')
    .eq('is_active', true)

  const ctx = await fetchScheduleContext(supabase, schedules ?? [])

  // Idempotency guard: skip clients that already had a generation run in the
  // last 20h, so a retried/duplicate cron fire can't create a second batch.
  const recentCutoff = new Date(Date.now() - 20 * 3_600_000).toISOString()
  const { data: recentRuns } = await supabase
    .from('generation_runs')
    .select('client_id')
    .in('client_id', (schedules ?? []).map((s) => s.client_id))
    .gte('created_at', recentCutoff)
  const recentlyGenerated = new Set(
    ((recentRuns as Array<{ client_id: string | null }> | null) ?? []).map((r) => r.client_id)
  )

  for (const schedule of schedules ?? []) {
    try {
      const clientRow = ctx.clients.get(schedule.client_id)
      if (!clientRow) continue

      const { id: clientId, agency_id: agencyId } = clientRow
      const agencyTimezone = ctx.agencyTimezones.get(agencyId) ?? 'UTC'
      if (!shouldGenerateToday(schedule, agencyTimezone)) continue
      if (recentlyGenerated.has(clientId)) continue

      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        results.skipped_for_time.push(clientId)
        console.error(`[cron] Time budget exceeded — skipping client ${clientId} this run`)
        continue
      }
      const clientStartedAt = Date.now()

      const brandProfile = ctx.brandProfiles.get(clientId) ?? null

      // Fetch full ClientData (includes top-performing posts, language config)
      const clientResult = await fetchClientData(supabase, clientId, agencyId)
      if ('error' in clientResult) continue
      const client = clientResult.data

      // 7. Determine platform, post type, slide count
      const mixJson = (brandProfile?.weekly_mix_json ?? {}) as Record<string, unknown>
      const platform = extractPlatformFromMix(mixJson)
      const postType = (brandProfile?.default_post_type ?? 'single') as PostType
      const slideCount = brandProfile?.default_carousel_slides ?? DEFAULT_CAROUSEL_SLIDES

      // 8. Create generation run (mirrors the wizard flow for dedup tracking)
      const { data: runData, error: runError } = await supabase
        .from('generation_runs')
        .insert({ client_id: clientId, platform })
        .select('id')
        .single()
      if (runError) {
        console.error(`[cron] Failed to create generation run for client ${clientId}:`, runError.message)
      }
      const runId = (runData as { id: string } | null)?.id

      // 9. Research themes via Tavily + LLM (same pipeline as wizard)
      const researchStartedAt = Date.now()
      const total = (schedule as { frequency_value: number }).frequency_value || 1
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
      }))

      // 10. Run generation pipeline (with trackTheme wired up, same as wizard)
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

      // 11. Save posts to DB as pending_review — batch insert to avoid N serial round-trips
      if (generationResults.length > 0) {
        const { data: savedPosts, error: saveError } = await supabase
          .from('posts')
          .insert(
            generationResults.map(({ post }) => ({
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
              pillar: post.pillar,
            }))
          )
          .select('id')

        // Generated posts are expensive — a silent insert failure loses the whole batch
        if (saveError) {
          throw new Error(`Failed to save generated posts: ${saveError.message}`)
        }

        if (savedPosts && savedPosts.length > 0) {
          await supabase.from('post_history').insert(
            generationResults.map(({ post }) => ({
              client_id: clientId,
              topic_summary: post.topic_summary,
            }))
          )
          results.posts_created += savedPosts.length

          // Compose designed slides for the new carousel posts so they arrive visual (best-effort — a
          // compose failure never fails the batch). Insert order matches generationResults.
          await Promise.allSettled(
            (savedPosts as Array<{ id: string }>).map((saved, i) => {
              const gp = generationResults[i]?.post
              if (!gp || gp.post_type !== 'carousel') return Promise.resolve()
              return composePostVisuals({
                postId: saved.id,
                clientId,
                agencyId,
                slides: (gp.slides_json as CarouselSlide[] | null) ?? [],
              })
            })
          )
        }
      }

      // 12. Notify agency
      await supabase.from('notifications').insert({
        agency_id: agencyId,
        message: `${generationResults.length} post${generationResults.length === 1 ? '' : 's'} ready to review for ${clientRow.name}`,
      })

      // 13. Refresh best-time if stale
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
        await supabase
          .from('brand_profiles')
          .update({
            best_time_json: bestTime as unknown as Json,
            best_time_updated_at: new Date().toISOString(),
          })
          .eq('client_id', clientId)
      }

      processedAgencyIds.add(agencyId)
      results.processed++
      console.info(
        `[cron] client=${clientId} done in ${Math.round((Date.now() - clientStartedAt) / 1000)}s ` +
          `(research ${Math.round(researchMs / 1000)}s, generation ${Math.round(generationMs / 1000)}s), ` +
          `${generationResults.length} posts`
      )
    } catch (err) {
      results.errors.push({
        clientId: schedule.client_id,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // 14. Intelligence briefing — one per agency per week
  const weekStart = getMondayISO()
  for (const agencyId of processedAgencyIds) {
    try {
      const { data: existing } = await supabase
        .from('intelligence_briefings')
        .select('id')
        .eq('agency_id', agencyId)
        .gte('week_start', weekStart)
        .maybeSingle()

      if (!existing) {
        const agencyNiche = await getAgencyNiche(supabase, agencyId)
        const briefing = await generateBriefing({ agencyNiche })

        const { data: inserted } = await supabase
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

        // Solo coaching card — only for solo-mode agencies
        if (inserted) {
          const { data: rawAgency } = await supabase
            .from('agencies')
            .select('mode')
            .eq('id', agencyId)
            .single()
          const agency = rawAgency as { mode: string } | null

          if (agency?.mode === 'solo') {
            // SECURITY: admin client bypasses RLS — must scope pending count to this agency's clients
            // agencyNiche already computed above — no extra niche query needed
            const { data: agencyClients } = await supabase
              .from('clients')
              .select('id')
              .eq('agency_id', agencyId)
            const agencyClientIds = ((agencyClients as Array<{ id: string }> | null) ?? []).map(
              (c) => c.id
            )

            const pendingCount = await countPendingPostsByClients(supabase, agencyClientIds)

            const coaching = await generateSoloCoaching({
              niche: agencyNiche ?? 'general',
              pendingCount,
            })

            await supabase
              .from('intelligence_briefings')
              .update({ coaching_points: coaching.coaching_points as unknown as Json })
              .eq('id', (inserted as { id: string }).id)
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
