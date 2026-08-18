import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { getAgencyNiche } from '@/lib/clients/fetch-client-data'
import { getMondayISO } from '@/utils/date-helpers'
import { asJson } from '@/lib/queries/as-json'

/** Generate this week's agency intelligence briefing on demand (the cron writes the scheduled one). */
export async function POST() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const limited = aiRateLimitResponse('intelligence', userId)
  if (limited) return limited

  const agencyNiche = await getAgencyNiche(supabase, agencyId)
  const briefing = await generateBriefing({ agencyNiche })
  const weekStart = getMondayISO()

  // Upsert — replace if one already exists for this week
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
        trending_topics: asJson(briefing.niche_trends),
        weekly_tip: briefing.weekly_tip,
        action_nudge: briefing.action_nudge,
        sources: briefing.sources,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('intelligence_briefings').insert({
      agency_id: agencyId,
      platform_updates: briefing.platform_updates,
      trending_topics: asJson(briefing.niche_trends),
      weekly_tip: briefing.weekly_tip,
      action_nudge: briefing.action_nudge,
      sources: briefing.sources,
      week_start: weekStart,
    })
  }

  return NextResponse.json({ success: true, briefing })
}
