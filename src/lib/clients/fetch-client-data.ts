import type { SupabaseClient } from '@supabase/supabase-js'
import { toCarouselSwipeCues, toFormalityRulesData } from '@/lib/clients/language-rules'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { MAX_POST_HISTORY_COUNT } from '@/utils/constants'
import type { Json } from '@/types/database'

export interface ClientContext {
  id: string
  name: string
  niche: string
  tone: string
  targetAudience: string
  clientTestimonialVoice: string
  avoidTopics: string
  contentPillars: WeightedPillar[]
  isHealthNiche: boolean | null
  postHistory: string[]
  languageConfig: LanguageConfig
  topPerformingPosts?: string[]
}

export interface ClientData {
  client: {
    id: string
    name: string
    niche: string
    language: string
  }
  profile: {
    tone: string
    targetAudience: string
    formality: string
    avoidTopics: string
    clientTestimonialVoice: string
    contentPillars: WeightedPillar[]
    defaultCarouselSlides: number
    requireSourceGrounding: boolean
    isHealthNiche: boolean | null
    languageNotes: string
    topPerformingPosts: string[]
  }
  languageRules: {
    carouselSwipeCues: string
    formalityRules: ReturnType<typeof toFormalityRulesData>
    languageInstructions: string
  }
  postHistory: string[]
}

/** Extract brand fields from ClientContext for QualityContext. */
export function toBrandQualityFields(client: ClientContext) {
  return {
    tone: client.tone || undefined,
    targetAudience: client.targetAudience || undefined,
    niche: client.niche || undefined,
    clientTestimonialVoice: client.clientTestimonialVoice || undefined,
    isHealthClient: client.isHealthNiche ?? undefined,
  }
}

/** Build a ClientContext from fetched ClientData — used by API routes. */
export function toClientContext(data: ClientData): ClientContext {
  return {
    id: data.client.id,
    name: data.client.name,
    niche: data.client.niche,
    tone: data.profile.tone,
    targetAudience: data.profile.targetAudience,
    clientTestimonialVoice: data.profile.clientTestimonialVoice,
    avoidTopics: data.profile.avoidTopics,
    contentPillars: data.profile.contentPillars,
    isHealthNiche: data.profile.isHealthNiche,
    postHistory: data.postHistory,
    topPerformingPosts: data.profile.topPerformingPosts,
    languageConfig: {
      language: data.client.language,
      formality: data.profile.formality,
      carouselSwipeCues: data.languageRules.carouselSwipeCues,
      formalityRules: data.languageRules.formalityRules,
      languageInstructions: data.languageRules.languageInstructions,
      languageNotes: data.profile.languageNotes,
    },
  }
}

/**
 * Fetches all client context needed for AI generation and rewrite operations.
 * Runs 4 parallel queries: client, brand_profile, language_rules, post_history.
 */
export async function fetchClientData(
  supabase: SupabaseClient,
  clientId: string,
  agencyId: string,
): Promise<{ data: ClientData } | { error: string }> {
  const { data: rawClient } = await supabase
    .from('clients')
    .select('id, name, niche, language')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single()

  const client = rawClient as { id: string; name: string; niche: string | null; language: string } | null
  if (!client) return { error: 'Client not found' }

  const [profileResult, langRulesResult, historyResult, topPostsResult] = await Promise.all([
    supabase
      .from('brand_profiles')
      .select('tone, target_audience, content_pillars, avoid_topics, client_testimonial_voice, language_formality, default_carousel_slides, source_strategy, is_health_niche, language_notes')
      .eq('client_id', clientId)
      .single(),
    supabase
      .from('language_rules')
      .select('native_cta_phrases, formality_rules, language_instructions, opener_examples')
      .eq('language', client.language)
      .single(),
    supabase
      .from('post_history')
      .select('topic_summary')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(MAX_POST_HISTORY_COUNT),
    supabase
      .from('posts')
      .select('caption')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .gte('quality_score_avg', 7.5)
      .order('quality_score_avg', { ascending: false })
      .limit(20),
  ])

  const profile = profileResult.data as {
    tone: string | null
    target_audience: string | null
    content_pillars: string | null
    avoid_topics: string | null
    client_testimonial_voice: string | null
    language_formality: string
    default_carousel_slides: number
    source_strategy: { require_source_grounding?: boolean } | null
    is_health_niche: boolean | null
    language_notes: string | null
  } | null

  const langRules = langRulesResult.data as {
    native_cta_phrases: Json | null
    formality_rules: Json | null
    language_instructions: string | null
    opener_examples: Json | null
  } | null

  const postHistory = (historyResult.data as Array<{ topic_summary: string | null }> | null)
    ?.map((h) => h.topic_summary)
    .filter((s): s is string => s !== null) ?? []

  const topPerformingPosts = (topPostsResult.data as Array<{ caption: string | null }> | null)
    ?.map((p) => (p.caption ?? '').slice(0, 120))
    .filter(Boolean) ?? []

  return {
    data: {
      client: {
        id: client.id,
        name: client.name,
        niche: client.niche ?? 'General',
        language: client.language,
      },
      profile: {
        tone: profile?.tone ?? 'professional',
        targetAudience: profile?.target_audience ?? 'general audience',
        formality: profile?.language_formality ?? 'formal',
        avoidTopics: profile?.avoid_topics ?? '',
        clientTestimonialVoice: profile?.client_testimonial_voice ?? '',
        contentPillars: parsePillars(profile?.content_pillars ?? null),
        defaultCarouselSlides: profile?.default_carousel_slides ?? 7,
        requireSourceGrounding: profile?.source_strategy?.require_source_grounding ?? false,
        isHealthNiche: profile?.is_health_niche ?? null,
        languageNotes: profile?.language_notes ?? '',
        topPerformingPosts,
      },
      languageRules: {
        carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases),
        formalityRules: toFormalityRulesData(langRules?.formality_rules),
        languageInstructions: langRules?.language_instructions ?? '',
      },
      postHistory,
    },
  }
}

/** Returns the most common niche across an agency's clients, or undefined. */
export async function getAgencyNiche(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<string | undefined> {
  const { data } = await supabase.from('clients').select('niche').eq('agency_id', agencyId)
  const rows = (data as Array<{ niche: string | null }> | null) ?? []
  const freq = new Map<string, number>()
  for (const { niche } of rows) {
    if (niche) freq.set(niche, (freq.get(niche) ?? 0) + 1)
  }
  return freq.size === 0
    ? undefined
    : [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Extracts the platform name from weekly_mix_json (e.g. { "Instagram": 1 } → "Instagram"). */
export function extractPlatformFromMix(mix: Record<string, unknown>): string {
  return Object.keys(mix).find((k) => !['carousel', 'single', 'reels'].includes(k)) ?? 'Instagram'
}
