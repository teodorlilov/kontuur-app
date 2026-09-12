import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
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
 * Create a client and everything a client must have to work. The ONE way that happens, and
 * `createClient` (features/clients/actions/client-actions.ts) is its one caller in both modes.
 *
 * The contract every client relies on, in one place so it cannot drift:
 *  - always a `brand_visual_identity` row, so the first generation runs against
 *    `buildDefaultIdentity()` rather than whatever the read path falls back to;
 *  - always the web-research row, because `shouldSearchWeb` is `!!tavilyRow` and a client without
 *    one silently never researches (migration 20260814 backfilled the ones that predate this);
 *  - rollback on a failed child insert, so a retry does not add a second client of the same name.
 *
 * Everything past the `clients` row is defaulted, so a caller that knows nothing but a name gets a
 * complete, working client. The onboarding form passes what the user typed.
 *
 * Takes the Supabase client rather than creating one: the caller runs user-scoped under RLS.
 */
export async function provisionClient(
  supabase: SupabaseClient,
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

  const clientId = (created as { id: string }).id
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
      // Web research is a per-client capability, not a source someone adds, so it has no "add"
      // button and needs a creation moment of its own. Created here so absence is impossible and
      // the toggle always has a row to bind to.
      supabase.from('client_sources').insert(webResearchSourceRow(clientId)),
    ])

  if (profileError || scheduleError || webResearchError) {
    console.error(
      '[clients:provision] child insert failed:',
      profileError ?? scheduleError ?? webResearchError
    )
    // Roll the client back rather than leave a half-built row behind: the user's retry would
    // otherwise add a second client with the same name. This deletes the client row alone and lets
    // the cascade take whichever children did land — which is only true as of 20260820. Before it,
    // every child FK was NO ACTION, so this rollback raised 23503 in exactly the case it exists for.
    const { error: rollbackError } = await supabase.from('clients').delete().eq('id', clientId)
    if (rollbackError) {
      console.error(
        '[clients:provision] rollback failed, client is orphaned:',
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

  // Non-fatal: a visuals hiccup must not lose a client the user just filled in by hand. It is still
  // attempted for every caller — a client with no identity row is the drift this function removes.
  const identity = input.identity ?? buildDefaultIdentity()
  const identitySource: SourceKind = input.identity ? (input.identitySource ?? 'manual') : 'default'
  const { error: identityError } = await upsertVisualIdentity(clientId, identity, identitySource)
  if (identityError) {
    console.error('[clients:provision] visual identity insert failed:', identityError)
  }

  return { ok: true, clientId }
}
