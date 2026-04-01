import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ClientEditForm } from '@/features/clients/components/client-edit-form'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single()

  const userData = rawUserData as { agency_id: string } | null
  if (!userData) redirect('/login')

  // Verify ownership
  const { data: rawClientCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', id)
    .eq('agency_id', userData.agency_id)
    .single()

  if (!rawClientCheck) notFound()

  const { data: rawClient } = await supabase
    .from('clients')
    .select('id, name, niche, posts_per_week, language, website_url, created_at')
    .eq('id', id)
    .single()

  const { data: rawProfile } = await supabase
    .from('brand_profiles')
    .select(
      'id, tone, target_audience, content_pillars, avoid_topics, client_testimonial_voice, default_post_type, default_carousel_slides, weekly_mix_json, language_formality, secondary_language, is_health_niche, best_time_json, best_time_updated_at, source_strategy'
    )
    .eq('client_id', id)
    .single()

  const { data: rawSchedule } = await supabase
    .from('posting_schedules')
    .select('id, is_active, frequency_type, frequency_value, auto_generate_day, auto_generate_time')
    .eq('client_id', id)
    .single()

  const { count: sourceCount } = await supabase
    .from('client_sources')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', id)
    .eq('is_active', true)

  const client = rawClient as {
    id: string
    name: string
    niche: string | null
    posts_per_week: number
    language: string
    website_url: string | null
    created_at: string
  } | null

  const profile = rawProfile as {
    id: string
    tone: string | null
    target_audience: string | null
    content_pillars: string | null
    avoid_topics: string | null
    client_testimonial_voice: string | null
    default_post_type: string
    default_carousel_slides: number
    weekly_mix_json: unknown
    language_formality: string
    secondary_language: string | null
    is_health_niche: boolean
    best_time_json: unknown
    best_time_updated_at: string | null
    source_strategy: unknown
  } | null

  const schedule = rawSchedule as {
    id: string
    is_active: boolean
    frequency_type: string
    frequency_value: number
    auto_generate_day: string
    auto_generate_time: string
  } | null

  if (!client) notFound()

  return <ClientEditForm clientId={id} sourceCount={sourceCount ?? 0} client={client} profile={profile} schedule={schedule} />
}
