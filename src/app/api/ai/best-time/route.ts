import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateBestTime } from '@/ai/best-time/generate-best-time'
import { extractPlatformFromMix } from '@/lib/clients/fetch-client-data'
import type { Json } from '@/types/database'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'

interface BestTimeRequestBody {
  client_id: string
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:best-time:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: BestTimeRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

  // Verify client belongs to this agency
  const { data: rawClientData } = await supabase
    .from('clients')
    .select('id, name, niche, language')
    .eq('id', body.client_id)
    .eq('agency_id', agencyId)
    .single()

  const clientData = rawClientData as {
    id: string
    name: string
    niche: string | null
    language: string
  } | null
  if (!clientData) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data: rawProfile } = await supabase
    .from('brand_profiles')
    .select('target_audience, weekly_mix_json')
    .eq('client_id', body.client_id)
    .single()

  const profile = rawProfile as { target_audience: string | null; weekly_mix_json: unknown } | null

  const platformsStr = profile?.weekly_mix_json
    ? extractPlatformFromMix(profile.weekly_mix_json as Record<string, unknown>)
    : 'Instagram'

  try {
    const bestTime = await generateBestTime({
      niche: clientData.niche ?? 'General',
      targetAudience: profile?.target_audience ?? 'General audience',
      language: clientData.language ?? 'English',
      platforms: platformsStr,
    })

    // Save to brand_profiles
    await supabase
      .from('brand_profiles')
      .update({
        best_time_json: bestTime as unknown as Json,
        best_time_updated_at: new Date().toISOString(),
      })
      .eq('client_id', body.client_id)

    return NextResponse.json({ best_time: bestTime })
  } catch {
    return NextResponse.json({ error: 'Failed to generate best time analysis' }, { status: 500 })
  }
}
