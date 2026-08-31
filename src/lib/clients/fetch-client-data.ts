import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBrandProfileByClient, fetchPostHistoryByClient } from '@/lib/queries/db'
import type { ClientExemplars } from '@/lib/queries/db'
import { getCachedLanguageRules } from '@/lib/queries/cache'
import { toCarouselSwipeCues, toFormalityRulesData } from '@/lib/clients/language-rules'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { MAX_POST_HISTORY_COUNT, DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import {
  CLIENT_AI_CONTEXT_COLUMNS,
  type ClientAIContextColumns,
} from '@/lib/queries/select-columns'

export interface ClientData {
  // from clients table
  id: string
  name: string
  niche: string
  language: string
  // from brand_profiles
  tone: string
  targetAudience: string
  avoidTopics: string
  /** What a post should get someone to do. Comma-separated, like targetAudience. */
  socialGoals: string
  contentPillars: WeightedPillar[]
  isHealthNiche: boolean | null
  defaultCarouselSlides: number
  defaultPostType: string | null
  languageNotes: string
  // assembled from language_rules
  languageConfig: LanguageConfig
  // from post_history
  postHistory: string[]
  /**
   * Voice exemplars for the writer's prompt. Attached server-side at the two
   * generation entry points via fetchEngineContext — deliberately NOT assembled
   * here: this shape rides the browser round-trip on the manual path, where the
   * wire schema strips unknown keys and prompt text must not be caller-supplied.
   */
  exemplars?: ClientExemplars
  /** Distilled review-correction rules — same attach path and rationale as exemplars. */
  styleMemo?: string[]
}

/** The client identity buildClientData assembles from. */
type ClientIdentity = ClientAIContextColumns

/**
 * Assembles the generation context for a client whose agency scope the caller has already
 * proven — e.g. a row from the agency-scoped client list. Skips the ownership query
 * fetchClientData runs for callers that arrive with only an id.
 */
export async function buildClientData(
  supabase: SupabaseClient,
  client: ClientIdentity
): Promise<ClientData> {
  const [profile, langRules, postHistory] = await Promise.all([
    fetchBrandProfileByClient(supabase, client.id),
    getCachedLanguageRules(client.language),
    fetchPostHistoryByClient(supabase, client.id, MAX_POST_HISTORY_COUNT),
  ])

  return {
    id: client.id,
    name: client.name,
    niche: client.niche ?? 'General',
    language: client.language,
    tone: profile?.tone ?? 'professional',
    targetAudience: profile?.target_audience ?? 'general audience',
    avoidTopics: profile?.avoid_topics ?? '',
    socialGoals: profile?.social_goals ?? '',
    contentPillars: parsePillars(profile?.content_pillars ?? null),
    isHealthNiche: profile?.is_health_niche ?? null,
    defaultCarouselSlides: profile?.default_carousel_slides ?? DEFAULT_CAROUSEL_SLIDES,
    defaultPostType: profile?.default_post_type ?? null,
    languageNotes: profile?.language_notes ?? '',
    languageConfig: {
      language: client.language,
      formality: profile?.language_formality ?? 'formal',
      carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases),
      formalityRules: toFormalityRulesData(langRules?.formality_rules),
      languageInstructions: langRules?.language_instructions ?? '',
      languageNotes: profile?.language_notes ?? '',
    },
    postHistory,
  }
}

/**
 * Fetches all client context needed for AI generation and rewrite operations.
 * Always verifies agency ownership. When preloaded is provided, skips the
 * remaining 4 DB queries and returns the preloaded data immediately.
 *
 * @param preloaded - Optional preloaded ClientData (e.g. from the wizard server prefetch).
 *                    Ownership is still verified even when preloaded data is present.
 */
export async function fetchClientData(
  supabase: SupabaseClient,
  clientId: string,
  agencyId: string,
  preloaded?: ClientData
): Promise<{ data: ClientData } | { error: string }> {
  // maybeSingle so a genuinely missing client stays distinguishable from a
  // failed query — reporting a database error as 'Client not found' sends the
  // user hunting for a client that is actually there.
  const { data: rawClient, error } = await supabase
    .from('clients')
    .select(CLIENT_AI_CONTEXT_COLUMNS)
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (error) return { error: `Could not load the client: ${error.message}` }

  // as: explicit column projection — Supabase types from the table, not the select
  const client = rawClient as ClientIdentity | null
  if (!client) return { error: 'Client not found' }

  if (preloaded) return { data: preloaded }

  return { data: await buildClientData(supabase, client) }
}

/** Returns the most common niche across an agency's clients, or undefined. */
export async function getAgencyNiche(
  supabase: SupabaseClient,
  agencyId: string
): Promise<string | undefined> {
  const { data, error } = await supabase.from('clients').select('niche').eq('agency_id', agencyId)
  if (error) throw new Error(`agency niche query failed: ${error.message}`)
  // as: explicit column projection — Supabase types from the table, not the select
  const rows = (data as Array<{ niche: string | null }> | null) ?? []
  const freq = new Map<string, number>()
  for (const { niche } of rows) {
    if (niche) freq.set(niche, (freq.get(niche) ?? 0) + 1)
  }
  return freq.size === 0 ? undefined : [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Extracts the platform name from weekly_mix_json (e.g. { "Instagram": 1 } → "Instagram"). */
export function extractPlatformFromMix(mix: Record<string, unknown>): string {
  return Object.keys(mix).find((k) => !['carousel', 'single'].includes(k)) ?? 'Instagram'
}
