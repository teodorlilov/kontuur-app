import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { generateBriefing } from '@/ai/intelligence/generate-briefing'
import { getAgencyNiche } from '@/lib/clients/fetch-client-data'
import { getMondayISO } from '@/utils/date-helpers'
import type { Json } from '@/types/database'

export async function POST() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:intelligence:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

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

  return NextResponse.json({ success: true, briefing })
}
