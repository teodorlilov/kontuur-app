import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { CLIENT_LIST_COLUMNS } from '@/lib/queries/select-columns'

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

interface CreateClientBody {
  name: string
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
    language_notes?: string
  }
  posting_schedule?: {
    frequency_type?: string
    frequency_value?: number
    auto_generate_day?: string
    auto_generate_time?: string
  }
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: CreateClientBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Create client
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

  // Create brand profile — explicitly pick allowed fields
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
    language_notes: bp?.language_notes,
  })

  if (profileError) {
    return NextResponse.json({ error: 'Failed to create brand profile' }, { status: 500 })
  }

  // Create posting schedule — explicitly pick allowed fields
  const ps = body.posting_schedule
  const { error: scheduleError } = await supabase.from('posting_schedules').insert({
    client_id: clientId,
    frequency_type: ps?.frequency_type,
    frequency_value: ps?.frequency_value,
    auto_generate_day: ps?.auto_generate_day,
    auto_generate_time: ps?.auto_generate_time,
  })

  if (scheduleError) {
    return NextResponse.json({ error: 'Failed to create posting schedule' }, { status: 500 })
  }

  revalidateTag('agency-clients', 'max')
  return NextResponse.json({ client_id: clientId }, { status: 201 })
}
