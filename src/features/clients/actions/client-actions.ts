'use server'

import 'server-only'
import { revalidateTag, revalidatePath } from 'next/cache'
import {
  fetchClientWithOwnership,
  resolveActionAuth,
  verifyClientOwnership,
  type SupabaseServerClient,
} from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { removeStoragePrefix } from '@/features/assets/lib/storage'
import { IG_METRICS_TAG } from '@/features/analytics/lib/report-data'
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
import {
  CLIENT_FILES_BUCKET,
  POST_IMAGES_BUCKET,
  WEB_RESEARCH_SOURCE_LABEL,
} from '@/utils/constants'
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

  const [{ error: profileError }, { error: scheduleError }, { error: webResearchError }] =
    await Promise.all([
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
      // Web research is a per-client capability, not a source someone adds, so it has
      // no "add" button and needs a creation moment of its own. It used to be written
      // lazily during the sources page render, which made "has a human opened that
      // page?" an input to the generation pipeline — `shouldSearchWeb` is `!!tavilyRow`.
      // Created here so absence is impossible and the toggle always has a row to bind
      // to; `is_active: true` because web research is the useful default. Only the
      // toggle changes it afterwards.
      supabase.from('client_sources').insert({
        client_id: clientId,
        type: 'tavily',
        label: WEB_RESEARCH_SOURCE_LABEL,
        url: '',
        is_active: true,
      }),
    ])

  if (profileError || scheduleError || webResearchError) {
    console.error(
      '[clients:create] child insert failed:',
      profileError ?? scheduleError ?? webResearchError
    )
    // Roll the client back rather than leave a half-built row behind: the user's retry would
    // otherwise add a second client with the same name. This deletes the client row alone and
    // lets the cascade take whichever children did land — which is only true as of 20260820.
    // Before it, every child FK was NO ACTION, so this rollback raised 23503 in exactly the
    // case it exists for: one insert already succeeded.
    const { error: rollbackError } = await supabase.from('clients').delete().eq('id', clientId)
    if (rollbackError) {
      console.error(
        '[clients:create] rollback failed, client is orphaned:',
        clientId,
        rollbackError
      )
    }
    return {
      ok: false,
      error: profileError
        ? 'Failed to create brand profile'
        : scheduleError
          ? 'Failed to create posting schedule'
          : 'Failed to create client sources',
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
  if (clientError) return failedUpdate(clientId, 'client fields', clientError)

  const [profileError, scheduleError, identityError] = await Promise.all([
    data.brand_profile ? updateBrandProfile(supabase, clientId, data.brand_profile) : null,
    data.posting_schedule ? updateSchedule(supabase, clientId, data.posting_schedule) : null,
    data.visual_identity
      ? upsertVisualIdentity(clientId, data.visual_identity, 'manual').then((r) => r.error ?? null)
      : null,
  ])
  if (profileError) return failedUpdate(clientId, 'brand profile', profileError)
  if (scheduleError) return failedUpdate(clientId, 'posting schedule', scheduleError)
  if (identityError) return failedUpdate(clientId, 'visual identity', identityError)

  revalidateTag('agency-clients', 'max')
  revalidatePath('/generate')
  return { ok: true, data: undefined }
}

/**
 * Permanently delete a client, every row that belongs to it, and its stored files.
 *
 * Rows go by database cascade (20260820) rather than by a delete-per-table here: the FK graph
 * reaches ~18 tables and any list maintained in TypeScript would drift from it silently.
 *
 * KNOWN LIMITATION, deliberate: a post already in `publishing` holds an open Instagram Graph
 * call and still reaches the account after this returns. The publish run's follow-up write then
 * updates zero rows, which Supabase does not report as an error, so nothing surfaces. Guarding
 * it would mean refusing the delete for up to one cron tick; that trade was declined.
 */
export async function deleteClient(clientId: string): Promise<ActionResult> {
  // Auth before validation, matching createClient and updateClient above.
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const parsed = parseActionId(clientId, 'clientId')
  if (!parsed.ok) return parsed.result

  // Ownership on the user-scoped client, and it returns the name in the same round trip —
  // the audit line below is the only record this client ever existed.
  const client = await fetchClientWithOwnership(supabase, parsed.id, agencyId)
  if (!client) return { ok: false, error: 'Not found' }

  // Admin because the cascade reaches tables with RLS on and no policies (post_images,
  // discarded_drafts, client_ideas, idea_form_tokens, brand_visual_identity,
  // client_style_memos). The agency_id predicate stays precisely because admin bypasses
  // RLS: it is the last check standing between this statement and another agency's client.
  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('clients')
    .delete()
    .eq('id', parsed.id)
    .eq('agency_id', agencyId)

  if (error) {
    console.error(`[clients:delete] failed for ${parsed.id}:`, error.message)
    // 23503 means a child FK is still NO ACTION — i.e. 20260820 has not reached this
    // database. The generic message makes that indistinguishable from a transient fault.
    if (error.code === '23503') {
      return { ok: false, error: 'Cannot delete: the database is missing migration 20260820.' }
    }
    return { ok: false, error: 'Could not delete the client. Please try again.' }
  }

  // After the rows, never before: sweeping first would strip a live client's images if the
  // delete then failed. Best-effort by contract — the client is already gone either way.
  const [imageCount, fileCount] = await Promise.all([
    removeStoragePrefix(POST_IMAGES_BUCKET, parsed.id),
    removeStoragePrefix(CLIENT_FILES_BUCKET, parsed.id),
  ])

  // warn, not error: nothing failed. An irreversible action needs a trace, and this codebase
  // has no info level.
  console.warn(
    `[clients:delete] removed "${client.name}" (${parsed.id}) — ` +
      `${imageCount} images, ${fileCount} files`
  )

  revalidateTag('agency-clients', 'max')
  revalidateTag('client-post-stats', 'max')
  // The cascade took the analytics rows with the client, but the report and its
  // narrative are cached for an hour and a day respectively — built from rows
  // that no longer exist, and naming a client that no longer exists. Every other
  // writer of those tables busts this tag; this was the one that did not.
  revalidateTag(IG_METRICS_TAG, 'max')
  revalidatePath('/generate')
  revalidatePath('/clients')
  return { ok: true, data: undefined }
}

// ── Internal helpers ──

/**
 * Log the database's reason at the boundary and hand the user a plain one.
 * Raw Supabase messages name columns and constraints, which belong in the log
 * rather than in a form error.
 */
function failedUpdate(clientId: string, part: string, reason: string): ActionResult {
  console.error(`[clients:update] ${part} write failed for ${clientId}:`, reason)
  return { ok: false, error: `Could not save the ${part}. Please try again.` }
}

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
  // An unread previous pillar set looks like "nothing was deleted", which leaves
  // orphaned pillar ids on posts instead of clearing them.
  const { data: oldProfile, error } = await supabase
    .from('brand_profiles')
    .select('content_pillars')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new Error(`pillar sync read failed: ${error.message}`)

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
