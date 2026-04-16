import { type NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  fetchClientData,
  getAgencyNiche,
  extractPlatformFromMix,
} from '@/lib/clients/fetch-client-data'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import { performResearch } from '@/ai/research/research-orchestrator'
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { generateSoloCoaching } from '@/ai/solo-coaching/generate-coaching'
import { generateBestTime } from '@/ai/best-time/generate-best-time'
import { getTodayWeekday, getMondayISO } from '@/utils/date-helpers'
import { BEST_TIME_REFRESH_DAYS, DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import type { PostType } from '@/types/api'
import type { Theme } from '@/ai/generation/types'
import type { Json } from '@/types/database'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  // 1. Auth gate — must have CRON_SECRET set and match
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const results = {
    processed: 0,
    posts_created: 0,
    errors: [] as Array<{ clientId: string; error: string }>,
  }
  const processedAgencyIds = new Set<string>()
  const agencyTimezoneCache = new Map<string, string>()

  // 2. Fetch all active schedules
  const { data: schedules } = await supabase
    .from('posting_schedules')
    .select('id, client_id, is_active, frequency_value, auto_generate_day')
    .eq('is_active', true)

  for (const schedule of schedules ?? []) {
    try {
      // 3. Fetch client row (need agency_id for timezone lookup + admin scoping)
      const { data: clientRow } = await supabase
        .from('clients')
        .select('id, agency_id, name, niche, language')
        .eq('id', schedule.client_id)
        .single()
      if (!clientRow) continue

      const { id: clientId, agency_id: agencyId } = clientRow as {
        id: string
        agency_id: string
        name: string
        niche: string | null
        language: string
      }

      // 4. Resolve agency timezone (cached) and check if today matches the configured day
      let agencyTimezone = agencyTimezoneCache.get(agencyId)
      if (!agencyTimezone) {
        const { data: tzData } = await supabase
          .from('agencies')
          .select('timezone')
          .eq('id', agencyId)
          .single()
        agencyTimezone = (tzData as { timezone: string | null } | null)?.timezone ?? 'UTC'
        agencyTimezoneCache.set(agencyId, agencyTimezone)
      }
      const todayWeekday = getTodayWeekday(agencyTimezone)
      if (schedule.auto_generate_day.toLowerCase() !== todayWeekday) continue

      // 5. Fetch brand profile
      const { data: rawBrandProfile } = await supabase
        .from('brand_profiles')
        .select('weekly_mix_json, default_post_type, default_carousel_slides, best_time_updated_at')
        .eq('client_id', clientId)
        .single()

      const brandProfile = rawBrandProfile as {
        weekly_mix_json: unknown
        default_post_type: string | null
        default_carousel_slides: number | null
        best_time_updated_at: string | null
      } | null

      // 6. Fetch full ClientData (includes top-performing posts)
      const clientResult = await fetchClientData(supabase, clientId, agencyId)
      if ('error' in clientResult) continue
      const client = clientResult.data

      // 7. Determine platform, post type, slide count
      const mixJson = (brandProfile?.weekly_mix_json ?? {}) as Record<string, unknown>
      const platform = extractPlatformFromMix(mixJson)
      const postType = (brandProfile?.default_post_type ?? 'single') as PostType
      const slideCount = brandProfile?.default_carousel_slides ?? DEFAULT_CAROUSEL_SLIDES

      // 8. Research themes via Tavily + LLM (same pipeline as wizard)
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

      // 9. Run generation pipeline
      const generationResults = await runGenerationBatch({
        client,
        platform,
        postType,
        slideCount,
        requireSourceGrounding: client.requireSourceGrounding,
        themes,
        priorityPosts: [],
        trackTheme: async () => {},
      })

      // 10. Save posts to DB as pending_review
      for (const result of generationResults) {
        const { post } = result
        const { data: saved } = await supabase
          .from('posts')
          .insert({
            client_id: clientId,
            caption: post.caption,
            platform: post.platform,
            post_type: post.post_type,
            slides_json: post.slides_json as Json,
            carousel_quality_json: post.carousel_quality_json as Json,
            status: 'pending_review',
            priority: false,
            quality_score_avg: post.quality_score_avg,
            source_url: post.source_url,
            source_title: post.source_title,
            source_type: post.source_type,
            source_excerpt: post.source_excerpt,
            pillar: post.pillar,
          })
          .select('id')
          .single()

        if (saved) {
          await supabase.from('post_history').insert({
            client_id: clientId,
            topic_summary: post.topic_summary,
          })
          results.posts_created++
        }
      }

      // 11. Notify agency
      await supabase.from('notifications').insert({
        agency_id: agencyId,
        message: `${generationResults.length} post${generationResults.length === 1 ? '' : 's'} ready to review for ${(clientRow as { name: string }).name}`,
      })

      // 12. Refresh best-time if stale
      const updatedAt = brandProfile?.best_time_updated_at
      const isStale =
        !updatedAt ||
        Date.now() - new Date(updatedAt).getTime() > BEST_TIME_REFRESH_DAYS * 86_400_000
      if (isStale) {
        const bestTime = await generateBestTime({
          niche: (clientRow as { niche: string | null }).niche ?? 'General',
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
    } catch (err) {
      results.errors.push({
        clientId: schedule.client_id,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  // 13. Intelligence briefing — one per agency per week
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

            let pendingCount = 0
            if (agencyClientIds.length > 0) {
              const { count } = await supabase
                .from('posts')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pending_review')
                .in('client_id', agencyClientIds)
              pendingCount = count ?? 0
            }

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

  return NextResponse.json(results)
}
