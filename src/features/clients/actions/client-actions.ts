'use server'

import { revalidateTag, revalidatePath } from 'next/cache'
import {
  resolveActionAuth,
  verifyClientOwnership,
  type SupabaseServerClient,
} from '@/lib/auth/helpers'
import { parsePillars } from '@/lib/clients/content-pillars'
import { removeDeletedPillarIds } from '@/lib/clients/sync-source-pillars'
import { upsertVisualIdentity } from '@/lib/visual/queries'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import {
  createClientSchema,
  formatIssues,
  updateClientSchema,
  type BrandProfileInput,
  type CreateClientInput,
  type ScheduleInput,
  type UpdateClientInput,
} from '@/features/clients/schemas'
import type { SourceKind } from '@/types/visual'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Create a client with its brand profile, posting schedule and visual identity.
 *
 * Replaces `POST /api/clients`, which was this app's last create-by-route-handler — docs/CLAUDE.md
 * puts mutations behind server actions, and `updateClient` below was already one. Both paths
 * still share `createClientSchema`/`updateClientSchema`, so the write shape is declared once.
 */
export async function createClient(input: CreateClientInput): Promise<ActionResult<string>> {
  // Auth before validation, for the same reason updateClient does it: parsing first lets an
  // unauthenticated caller fill the log with issues from input we never intended to act on.
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const parsed = createClientSchema.safeParse(input)
  if (!parsed.success) {
    console.error('[clients:create] invalid input:', formatIssues(parsed.error))
    return { ok: false, error: 'Invalid client data' }
  }
  const data = parsed.data

  const { data: created, error: clientError } = await supabase
    .from('clients')
    .insert({
      agency_id: agencyId,
      name: data.name,
      niche: data.niche,
      posts_per_week: data.posts_per_week,
      language: data.language,
      website_url: data.website_url,
      contact_email: data.contact_email ?? null,
    })
    .select('id')
    .single()

  if (clientError || !created) {
    console.error('[clients:create] client insert failed:', clientError)
    return { ok: false, error: 'Failed to create client' }
  }

  const clientId = created.id
  const bp = data.brand_profile
  const ps = data.posting_schedule

  const [{ error: profileError }, { error: scheduleError }] = await Promise.all([
    supabase.from('brand_profiles').insert({
      client_id: clientId,
      tone: bp?.tone,
      target_audience: bp?.target_audience,
      social_goals: bp?.social_goals,
      content_pillars: bp?.content_pillars,
      avoid_topics: bp?.avoid_topics,
      default_post_type: bp?.default_post_type,
      default_carousel_slides: bp?.default_carousel_slides,
      weekly_mix_json: bp?.weekly_mix_json,
      language_formality: bp?.language_formality,
      secondary_language: bp?.secondary_language,
      is_health_niche: bp?.is_health_niche,
      source_strategy: bp?.source_strategy,
      language_notes: bp?.language_notes,
    }),
    supabase.from('posting_schedules').insert({
      client_id: clientId,
      is_active: ps?.is_active,
      frequency_type: ps?.frequency_type,
      frequency_value: ps?.frequency_value,
      auto_generate_day: ps?.auto_generate_day,
      auto_generate_time: ps?.auto_generate_time,
    }),
  ])

  if (profileError || scheduleError) {
    console.error('[clients:create] child insert failed:', profileError ?? scheduleError)
    // Roll the client back rather than leave a half-built row behind: the user's retry would
    // otherwise add a second client with the same name. Children cascade — DELETE
    // /api/clients/[id] deletes the client row alone and relies on the same behaviour.
    const { error: rollbackError } = await supabase.from('clients').delete().eq('id', clientId)
    if (rollbackError) {
      console.error('[clients:create] rollback failed, client is orphaned:', clientId, rollbackError)
    }
    return {
      ok: false,
      error: profileError ? 'Failed to create brand profile' : 'Failed to create posting schedule',
    }
  }

  // Non-fatal: a visuals hiccup must not lose a client the user just filled in by hand.
  const identity = data.visual_identity ?? buildDefaultIdentity()
  const identitySource: SourceKind = data.visual_identity
    ? (data.visual_identity_source ?? 'manual')
    : 'default'
  const { error: identityError } = await upsertVisualIdentity(clientId, identity, identitySource)
  if (identityError) console.error('[clients:create] visual identity insert failed:', identityError)

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: clientId }
}

/** Update a client's core fields, brand profile, posting schedule and visual identity. */
export async function updateClient(
  clientId: string,
  input: UpdateClientInput
): Promise<ActionResult> {
  // Auth before validation: parsing first let an unauthenticated caller reach the
  // logging branch below and fill the log with issues from input we never intended
  // to act on.
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const parsed = updateClientSchema.safeParse(input)
  if (!parsed.success) {
    console.error(`[clients:update] invalid input for ${clientId}:`, formatIssues(parsed.error))
    return { ok: false, error: 'Invalid client data' }
  }
  const data = parsed.data

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const clientError = await updateClientFields(supabase, clientId, data)
  if (clientError) return { ok: false, error: clientError }

  const [profileError, scheduleError, identityError] = await Promise.all([
    data.brand_profile ? updateBrandProfile(supabase, clientId, data.brand_profile) : null,
    data.posting_schedule ? updateSchedule(supabase, clientId, data.posting_schedule) : null,
    data.visual_identity
      ? upsertVisualIdentity(clientId, data.visual_identity, 'manual').then((r) => r.error ?? null)
      : null,
  ])
  if (profileError) return { ok: false, error: profileError }
  if (scheduleError) return { ok: false, error: scheduleError }
  if (identityError) return { ok: false, error: identityError }

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
  if (bp.social_goals !== undefined) updates.social_goals = bp.social_goals
  if (bp.content_pillars !== undefined) updates.content_pillars = bp.content_pillars
  if (bp.avoid_topics !== undefined) updates.avoid_topics = bp.avoid_topics
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

  const { error } = await supabase
    .from('posting_schedules')
    .update(updates)
    .eq('client_id', clientId)
  return error?.message ?? null
}
