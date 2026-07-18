'use server'

import { revalidateTag, revalidatePath } from 'next/cache'
import { resolveActionAuth, verifyClientOwnership, type SupabaseServerClient } from '@/lib/auth/helpers'
import { parsePillars } from '@/lib/clients/content-pillars'
import { removeDeletedPillarIds } from '@/lib/clients/sync-source-pillars'
import type { SourceStrategy } from '@/types/sources'
import type { ActionResult } from '@/lib/actions/types'

interface UpdateClientInput {
  name?: string
  niche?: string | null
  posts_per_week?: number
  language?: string
  website_url?: string | null
  contact_email?: string | null
  brand_profile?: BrandProfileInput
  posting_schedule?: ScheduleInput
}

interface BrandProfileInput {
  tone?: string | null
  target_audience?: string | null
  content_pillars?: string | null
  avoid_topics?: string | null
  client_testimonial_voice?: string | null
  default_post_type?: string
  default_carousel_slides?: number
  weekly_mix_json?: Record<string, number>
  language_formality?: string
  secondary_language?: string | null
  is_health_niche?: boolean
  source_strategy?: SourceStrategy
  language_notes?: string | null
}

interface ScheduleInput {
  is_active?: boolean
  frequency_type?: string
  frequency_value?: number
  auto_generate_day?: string
  auto_generate_time?: string
}

/** Update a client's core fields, brand profile, and posting schedule. */
export async function updateClient(
  clientId: string,
  data: UpdateClientInput
): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const clientError = await updateClientFields(supabase, clientId, data)
  if (clientError) return { ok: false, error: clientError }

  const [profileError, scheduleError] = await Promise.all([
    data.brand_profile ? updateBrandProfile(supabase, clientId, data.brand_profile) : null,
    data.posting_schedule ? updateSchedule(supabase, clientId, data.posting_schedule) : null,
  ])
  if (profileError) return { ok: false, error: profileError }
  if (scheduleError) return { ok: false, error: scheduleError }

  revalidateTag('agency-clients', 'max')
  revalidatePath('/generate')
  return { ok: true, data: undefined }
}

// ── Internal helpers ──

async function updateClientFields(
  supabase: SupabaseServerClient,
  clientId: string,
  data: UpdateClientInput
): Promise<string | null> {
  const updates: Record<string, unknown> = {}
  if (data.name !== undefined) updates.name = data.name
  if (data.niche !== undefined) updates.niche = data.niche
  if (data.posts_per_week !== undefined) updates.posts_per_week = data.posts_per_week
  if (data.language !== undefined) updates.language = data.language
  if (data.website_url !== undefined) updates.website_url = data.website_url
  if (data.contact_email !== undefined) updates.contact_email = data.contact_email

  if (Object.keys(updates).length === 0) return null

  const { error } = await supabase.from('clients').update(updates).eq('id', clientId)
  return error?.message ?? null
}

async function updateBrandProfile(
  supabase: SupabaseServerClient,
  clientId: string,
  bp: BrandProfileInput
): Promise<string | null> {
  const updates: Record<string, unknown> = {}
  if (bp.tone !== undefined) updates.tone = bp.tone
  if (bp.target_audience !== undefined) updates.target_audience = bp.target_audience
  if (bp.content_pillars !== undefined) updates.content_pillars = bp.content_pillars
  if (bp.avoid_topics !== undefined) updates.avoid_topics = bp.avoid_topics
  if (bp.client_testimonial_voice !== undefined)
    updates.client_testimonial_voice = bp.client_testimonial_voice
  if (bp.default_post_type !== undefined) updates.default_post_type = bp.default_post_type
  if (bp.default_carousel_slides !== undefined)
    updates.default_carousel_slides = bp.default_carousel_slides
  if (bp.weekly_mix_json !== undefined) updates.weekly_mix_json = bp.weekly_mix_json
  if (bp.language_formality !== undefined) updates.language_formality = bp.language_formality
  if (bp.secondary_language !== undefined) updates.secondary_language = bp.secondary_language
  if (bp.is_health_niche !== undefined) updates.is_health_niche = bp.is_health_niche
  if (bp.source_strategy !== undefined) updates.source_strategy = bp.source_strategy
  if (bp.language_notes !== undefined) updates.language_notes = bp.language_notes

  if (Object.keys(updates).length === 0) return null

  if (bp.content_pillars !== undefined) {
    await syncDeletedPillars(supabase, clientId, bp.content_pillars)
  }

  const { error } = await supabase.from('brand_profiles').update(updates).eq('client_id', clientId)
  return error?.message ?? null
}

async function syncDeletedPillars(
  supabase: SupabaseServerClient,
  clientId: string,
  newPillarsJson: string | null
): Promise<void> {
  const { data: oldProfile } = await supabase
    .from('brand_profiles')
    .select('content_pillars')
    .eq('client_id', clientId)
    .single()

  const oldPillars = parsePillars(
    (oldProfile as { content_pillars: string | null } | null)?.content_pillars ?? null
  )
  const newPillars = parsePillars(newPillarsJson)
  const newIds = new Set(newPillars.map((p) => p.id))
  const deletedIds = oldPillars.map((p) => p.id).filter((pid) => !newIds.has(pid))

  if (deletedIds.length > 0) {
    await removeDeletedPillarIds(supabase, clientId, deletedIds)
  }
}

async function updateSchedule(
  supabase: SupabaseServerClient,
  clientId: string,
  ps: ScheduleInput
): Promise<string | null> {
  const updates: Record<string, unknown> = {}
  if (ps.is_active !== undefined) updates.is_active = ps.is_active
  if (ps.frequency_type !== undefined) updates.frequency_type = ps.frequency_type
  if (ps.frequency_value !== undefined) updates.frequency_value = ps.frequency_value
  if (ps.auto_generate_day !== undefined) updates.auto_generate_day = ps.auto_generate_day
  if (ps.auto_generate_time !== undefined) updates.auto_generate_time = ps.auto_generate_time

  if (Object.keys(updates).length === 0) return null

  const { error } = await supabase.from('posting_schedules').update(updates).eq('client_id', clientId)
  return error?.message ?? null
}
