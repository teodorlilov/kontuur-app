import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  // Single query: agency_id filter enforces ownership at DB level
  const { data: clientData } = await supabase
    .from('clients')
    .select('id, name, niche, posts_per_week, language, website_url, contact_email, created_at')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single()

  if (!clientData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch brand_profiles and posting_schedules in parallel — independent queries
  const [{ data: profileData }, { data: scheduleData }] = await Promise.all([
    supabase
      .from('brand_profiles')
      .select('id, tone, target_audience, content_pillars, avoid_topics, client_testimonial_voice, default_post_type, default_carousel_slides, weekly_mix_json, language_formality, secondary_language, is_health_niche, best_time_json, best_time_updated_at, source_strategy, language_notes')
      .eq('client_id', id)
      .single(),
    supabase
      .from('posting_schedules')
      .select('id, is_active, frequency_type, frequency_value, auto_generate_day, auto_generate_time')
      .eq('client_id', id)
      .single(),
  ])

  return NextResponse.json({ client: clientData, brand_profile: profileData, posting_schedule: scheduleData })
}

interface UpdateClientBody {
  name?: string
  niche?: string
  posts_per_week?: number
  language?: string
  website_url?: string
  contact_email?: string | null
  brand_profile?: {
    tone?: string
    target_audience?: string
    content_pillars?: string
    avoid_topics?: string
    client_testimonial_voice?: string
    default_post_type?: string
    default_carousel_slides?: number
    weekly_mix_json?: Record<string, number>
    language_formality?: string
    secondary_language?: string
    is_health_niche?: boolean
    source_strategy?: Record<string, boolean>
    language_notes?: string
  }
  posting_schedule?: {
    is_active?: boolean
    frequency_type?: string
    frequency_value?: number
    auto_generate_day?: string
    auto_generate_time?: string
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, id, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: UpdateClientBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Update client fields
  const clientUpdates: Record<string, unknown> = {}
  if (body.name !== undefined) clientUpdates.name = body.name
  if (body.niche !== undefined) clientUpdates.niche = body.niche
  if (body.posts_per_week !== undefined) clientUpdates.posts_per_week = body.posts_per_week
  if (body.language !== undefined) clientUpdates.language = body.language
  if (body.website_url !== undefined) clientUpdates.website_url = body.website_url
  if (body.contact_email !== undefined) clientUpdates.contact_email = body.contact_email

  if (Object.keys(clientUpdates).length > 0) {
    const { error } = await supabase.from('clients').update(clientUpdates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update brand profile — explicitly pick allowed fields
  if (body.brand_profile) {
    const bp = body.brand_profile
    const profileUpdates: Record<string, unknown> = {}
    if (bp.tone !== undefined) profileUpdates.tone = bp.tone
    if (bp.target_audience !== undefined) profileUpdates.target_audience = bp.target_audience
    if (bp.content_pillars !== undefined) profileUpdates.content_pillars = bp.content_pillars
    if (bp.avoid_topics !== undefined) profileUpdates.avoid_topics = bp.avoid_topics
    if (bp.client_testimonial_voice !== undefined) profileUpdates.client_testimonial_voice = bp.client_testimonial_voice
    if (bp.default_post_type !== undefined) profileUpdates.default_post_type = bp.default_post_type
    if (bp.default_carousel_slides !== undefined) profileUpdates.default_carousel_slides = bp.default_carousel_slides
    if (bp.weekly_mix_json !== undefined) profileUpdates.weekly_mix_json = bp.weekly_mix_json
    if (bp.language_formality !== undefined) profileUpdates.language_formality = bp.language_formality
    if (bp.secondary_language !== undefined) profileUpdates.secondary_language = bp.secondary_language
    if (bp.is_health_niche !== undefined) profileUpdates.is_health_niche = bp.is_health_niche
    if (bp.source_strategy !== undefined) profileUpdates.source_strategy = bp.source_strategy
    if (bp.language_notes !== undefined) profileUpdates.language_notes = bp.language_notes

    if (Object.keys(profileUpdates).length > 0) {
      const { error } = await supabase.from('brand_profiles').update(profileUpdates).eq('client_id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Update posting schedule — explicitly pick allowed fields
  if (body.posting_schedule) {
    const ps = body.posting_schedule
    const scheduleUpdates: Record<string, unknown> = {}
    if (ps.is_active !== undefined) scheduleUpdates.is_active = ps.is_active
    if (ps.frequency_type !== undefined) scheduleUpdates.frequency_type = ps.frequency_type
    if (ps.frequency_value !== undefined) scheduleUpdates.frequency_value = ps.frequency_value
    if (ps.auto_generate_day !== undefined) scheduleUpdates.auto_generate_day = ps.auto_generate_day
    if (ps.auto_generate_time !== undefined) scheduleUpdates.auto_generate_time = ps.auto_generate_time

    if (Object.keys(scheduleUpdates).length > 0) {
      const { error } = await supabase.from('posting_schedules').update(scheduleUpdates).eq('client_id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  revalidateTag('agency-clients', 'max')
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, id, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag('agency-clients', 'max')
  return NextResponse.json({ success: true })
}
