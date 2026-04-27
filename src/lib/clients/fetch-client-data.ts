import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchBrandProfileByClient,
  fetchLanguageRulesByLanguage,
  fetchPostHistoryByClient,
  fetchTopPostsByClient,
} from '@/lib/queries/db'
import { toCarouselSwipeCues, toFormalityRulesData } from '@/lib/clients/language-rules'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { SourceStrategy } from '@/types/api'
import { MAX_POST_HISTORY_COUNT } from '@/utils/constants'

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
  clientTestimonialVoice: string
  contentPillars: WeightedPillar[]
  isHealthNiche: boolean | null
  topPerformingPosts: string[]
  defaultCarouselSlides: number
  defaultPostType: string | null
  requireSourceGrounding: boolean
  sourceStrategy: SourceStrategy | null
  languageNotes: string
  // assembled from language_rules
  languageConfig: LanguageConfig
  // from post_history
  postHistory: string[]
}

function parseRequireSourceGrounding(strategy: unknown): boolean {
  return (
    (strategy as { require_source_grounding?: boolean } | null)?.require_source_grounding ?? false
  )
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
  const { data: rawClient } = await supabase
    .from('clients')
    .select('id, name, niche, language')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single()

  const client = rawClient as {
    id: string
    name: string
    niche: string | null
    language: string
  } | null
  if (!client) return { error: 'Client not found' }

  if (preloaded) return { data: preloaded }

  const [profile, langRules, postHistory, topPerformingPosts] = await Promise.all([
    fetchBrandProfileByClient(supabase, clientId),
    fetchLanguageRulesByLanguage(supabase, client.language),
    fetchPostHistoryByClient(supabase, clientId, MAX_POST_HISTORY_COUNT),
    fetchTopPostsByClient(supabase, clientId),
  ])

  return {
    data: {
      id: client.id,
      name: client.name,
      niche: client.niche ?? 'General',
      language: client.language,
      tone: profile?.tone ?? 'professional',
      targetAudience: profile?.target_audience ?? 'general audience',
      avoidTopics: profile?.avoid_topics ?? '',
      clientTestimonialVoice: profile?.client_testimonial_voice ?? '',
      contentPillars: parsePillars(profile?.content_pillars ?? null),
      isHealthNiche: profile?.is_health_niche ?? null,
      topPerformingPosts,
      defaultCarouselSlides: profile?.default_carousel_slides ?? 7,
      defaultPostType: profile?.default_post_type ?? null,
      requireSourceGrounding: parseRequireSourceGrounding(profile?.source_strategy),
      sourceStrategy: (profile?.source_strategy as SourceStrategy | null) ?? null,
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
    },
  }
}

/** Returns the most common niche across an agency's clients, or undefined. */
export async function getAgencyNiche(
  supabase: SupabaseClient,
  agencyId: string
): Promise<string | undefined> {
  const { data } = await supabase.from('clients').select('niche').eq('agency_id', agencyId)
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
