import type { SupabaseClient } from '@supabase/supabase-js'
import { toStringArray, toCTAPhrases, toCarouselSwipeCues } from '@/lib/clients/language-rules'
import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { MAX_POST_HISTORY_COUNT } from '@/utils/constants'
import type { Json } from '@/types/database'

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
  }
  languageRules: {
    bannedAnglicisms: string[]
    bannedCalques: string[]
    nativeCTAPhrases: string
    carouselSwipeCues: string
  }
  postHistory: string[]
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

  const [profileResult, langRulesResult, historyResult] = await Promise.all([
    supabase
      .from('brand_profiles')
      .select('tone, target_audience, content_pillars, avoid_topics, client_testimonial_voice, language_formality, default_carousel_slides, source_strategy, is_health_niche')
      .eq('client_id', clientId)
      .single(),
    supabase
      .from('language_rules')
      .select('banned_anglicisms, banned_calques, native_cta_phrases')
      .eq('language', client.language)
      .single(),
    supabase
      .from('post_history')
      .select('topic_summary')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(MAX_POST_HISTORY_COUNT),
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
  } | null

  const langRules = langRulesResult.data as {
    banned_anglicisms: Json | null
    banned_calques: Json | null
    native_cta_phrases: Json | null
  } | null

  const postHistory = (historyResult.data as Array<{ topic_summary: string | null }> | null)
    ?.map((h) => h.topic_summary)
    .filter((s): s is string => s !== null) ?? []

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
      },
      languageRules: {
        bannedAnglicisms: toStringArray(langRules?.banned_anglicisms),
        bannedCalques: toStringArray(langRules?.banned_calques),
        nativeCTAPhrases: toCTAPhrases(langRules?.native_cta_phrases),
        carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases),
      },
      postHistory,
    },
  }
}
