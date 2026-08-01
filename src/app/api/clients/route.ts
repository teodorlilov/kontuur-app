import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { CLIENT_LIST_COLUMNS } from '@/lib/queries/select-columns'
import { upsertVisualIdentity } from '@/lib/visual/queries'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { createClientSchema, formatIssues } from '@/features/clients/schemas'
import type { SourceKind } from '@/types/visual'

export async function GET() {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const { data: clients, error } = await supabase
    .from('clients')
    .select(CLIENT_LIST_COLUMNS)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ clients })
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = createClientSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[clients:create] invalid body:', formatIssues(parsed.error))
    return NextResponse.json({ error: 'Invalid client data' }, { status: 400 })
  }
  const body = parsed.data

  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .insert({
      agency_id: agencyId,
      name: body.name,
      niche: body.niche,
      posts_per_week: body.posts_per_week,
      language: body.language,
      website_url: body.website_url,
      contact_email: body.contact_email ?? null,
    })
    .select('id')
    .single()

  if (clientError || !clientData) {
    return NextResponse.json(
      { error: clientError?.message ?? 'Failed to create client' },
      { status: 500 }
    )
  }

  const clientId = clientData.id

  const bp = body.brand_profile
  const { error: profileError } = await supabase.from('brand_profiles').insert({
    client_id: clientId,
    tone: bp?.tone,
    target_audience: bp?.target_audience,
    content_pillars: bp?.content_pillars,
    avoid_topics: bp?.avoid_topics,
    client_testimonial_voice: bp?.client_testimonial_voice,
    default_post_type: bp?.default_post_type,
    default_carousel_slides: bp?.default_carousel_slides,
    weekly_mix_json: bp?.weekly_mix_json,
    language_formality: bp?.language_formality,
    secondary_language: bp?.secondary_language,
    is_health_niche: bp?.is_health_niche,
    source_strategy: bp?.source_strategy,
    language_notes: bp?.language_notes,
  })

  if (profileError) {
    return NextResponse.json({ error: 'Failed to create brand profile' }, { status: 500 })
  }

  const ps = body.posting_schedule
  const { error: scheduleError } = await supabase.from('posting_schedules').insert({
    client_id: clientId,
    is_active: ps?.is_active,
    frequency_type: ps?.frequency_type,
    frequency_value: ps?.frequency_value,
    auto_generate_day: ps?.auto_generate_day,
    auto_generate_time: ps?.auto_generate_time,
  })

  if (scheduleError) {
    return NextResponse.json({ error: 'Failed to create posting schedule' }, { status: 500 })
  }

  // Create the brand visual identity (Phase 1) — non-fatal: a visuals hiccup must not block the client.
  const identity = body.visual_identity ?? buildDefaultIdentity()
  const identitySource: SourceKind = body.visual_identity
    ? (body.visual_identity_source ?? 'manual')
    : 'default'
  const { error: identityError } = await upsertVisualIdentity(clientId, identity, identitySource)
  if (identityError) console.error('[clients:create] visual identity insert failed:', identityError)

  revalidateTag('agency-clients', 'max')
  return NextResponse.json({ client_id: clientId }, { status: 201 })
}
