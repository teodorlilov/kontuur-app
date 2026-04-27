'use server'

import { revalidatePath } from 'next/cache'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { generateBriefing as generateBriefingAI } from '@/ai/intelligence/generate-briefing'
import { getAgencyNiche } from '@/lib/clients/fetch-client-data'
import { getMondayISO } from '@/utils/date-helpers'
import type { Json } from '@/types/database'
import type { ActionResult } from '@/lib/actions/types'

/** Generate (or refresh) this week's intelligence briefing. */
export async function generateBriefing(): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:intelligence:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return { ok: false, error: 'Too many requests. Please wait a moment.' }
  }

  const agencyNiche = await getAgencyNiche(supabase, agencyId)
  const briefing = await generateBriefingAI({ agencyNiche })
  const weekStart = getMondayISO()

  const { data: existing } = await supabase
    .from('intelligence_briefings')
    .select('id')
    .eq('agency_id', agencyId)
    .gte('week_start', weekStart)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('intelligence_briefings')
      .update({
        platform_updates: briefing.platform_updates,
        trending_topics: briefing.niche_trends as unknown as Json,
        weekly_tip: briefing.weekly_tip,
        action_nudge: briefing.action_nudge,
        sources: briefing.sources,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('intelligence_briefings').insert({
      agency_id: agencyId,
      platform_updates: briefing.platform_updates,
      trending_topics: briefing.niche_trends as unknown as Json,
      weekly_tip: briefing.weekly_tip,
      action_nudge: briefing.action_nudge,
      sources: briefing.sources,
      week_start: weekStart,
    })
  }

  revalidatePath('/dashboard')
  return { ok: true, data: undefined }
}
