import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import type { AdminClient } from '@/lib/supabase/admin'
import { webResearchSourceRow } from '@/lib/sources/web-research-source'
import { upsertVisualIdentity } from '@/lib/visual/queries'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import type { SourceKind, VisualIdentity } from '@/types/visual'
import type { BrandProfileInput, ScheduleInput } from '@/features/clients/schemas'

interface ProvisionClientInput {
  agencyId: string
  name: string
  niche?: string | null
  postsPerWeek?: number
  language?: string
  websiteUrl?: string | null
  contactEmail?: string | null
  brandProfile?: BrandProfileInput
  postingSchedule?: ScheduleInput
  identity?: VisualIdentity
  identitySource?: SourceKind
}

type ProvisionClientResult = { ok: true; clientId: string } | { ok: false; error: string }

/**
 * Create a client and everything a client must have to work — the one way that happens, called
 * only by `createClient` (features/clients/actions/client-actions.ts); past `agencyId` and `name`,
 * all is defaulted. Always writes the web-research row (`shouldSearchWeb` is `!!tavilyRow`, so a
 * client without it silently never searches the web; migration 20260814 backfilled older clients)
 * and tries a visual identity, the one non-fatal step, so a hiccup there cannot lose a client just
 * filled in by hand. A failed child insert rolls the client back, so a retry adds no second
 * client of the same name. Takes the admin client (the tenant role cannot insert into `clients`,
 * migration 20260854) and the agency `resolveActionAuth` returned, never one from the form.
 */
export async function provisionClient(
  supabase: AdminClient,
  input: ProvisionClientInput
): Promise<ProvisionClientResult> {
  const { data: created, error: clientError } = await supabase
    .from('clients')
    .insert({
      agency_id: input.agencyId,
      name: input.name,
      niche: input.niche,
      posts_per_week: input.postsPerWeek,
      language: input.language,
      website_url: input.websiteUrl,
      contact_email: input.contactEmail ?? null,
    })
    .select('id')
    .single()

  if (clientError || !created) {
    console.error('[clients:provision] client insert failed:', clientError)
    return { ok: false, error: 'Failed to create client' }
  }

  const clientId = created.id
  const bp = input.brandProfile
  const ps = input.postingSchedule

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
      supabase.from('client_sources').insert(webResearchSourceRow(clientId)),
    ])

  if (profileError || scheduleError || webResearchError) {
    console.error(
      '[clients:provision] child insert failed:',
      profileError ?? scheduleError ?? webResearchError
    )
    await takeBackClient(supabase, clientId, input.agencyId)
    return {
      ok: false,
      error: profileError
        ? 'Failed to create brand profile'
        : scheduleError
          ? 'Failed to create posting schedule'
          : 'Failed to create client sources',
    }
  }

  const identity = input.identity ?? buildDefaultIdentity()
  const identitySource: SourceKind = input.identity ? (input.identitySource ?? 'manual') : 'default'
  const { error: identityError } = await upsertVisualIdentity(clientId, identity, identitySource)
  if (identityError) {
    console.error('[clients:provision] visual identity insert failed:', identityError)
  }

  return { ok: true, clientId }
}

/**
 * Delete one client row — the one delete of a client, behind `deleteClient`'s admin check and
 * `takeBackClient`. The row alone: the cascade (migration 20260820) takes every child row with it,
 * so no table list is kept here to drift. The `agency_id` predicate is the last check between this
 * admin-client statement and another agency's client. The error is handed back, not thrown.
 */
export async function unprovisionClient(
  admin: AdminClient,
  clientId: string,
  agencyId: string
): Promise<PostgrestError | null> {
  const { error } = await admin
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('agency_id', agencyId)
  return error
}

/**
 * Remove a client made moments ago that must not stay — a failed provision, or a create the plan
 * then refused (`createClient`). One that cannot be removed is logged as orphaned; nothing else can
 * be done for it here.
 */
export async function takeBackClient(
  admin: AdminClient,
  clientId: string,
  agencyId: string
): Promise<void> {
  const error = await unprovisionClient(admin, clientId, agencyId)
  if (error)
    console.error(
      `[clients:create] client ${clientId} could not be removed and is orphaned:`,
      error
    )
}
