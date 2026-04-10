import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientData, toClientContext, type ClientData } from '@/lib/clients/fetch-client-data'
import { toFormalityRulesData } from '@/lib/clients/language-rules'
import { parsePillars } from '@/lib/clients/content-pillars'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { runGenerationBatch } from '@/ai/generation/generation-run'
import type { PriorityPost } from '@/types/api'
import type { Theme } from '@/ai/generation/types'

export const maxDuration = 300 // 5 minutes — each carousel/reels theme needs ~15-25s

/**
 * Flat, JSON-safe wire type for preloaded client data sent from the wizard.
 * Decoupled from the internal ClientData type — mapped in the route handler.
 */
interface PreloadedGenerateData {
  client: { id: string; name: string; niche: string; language: string }
  profile: {
    tone: string
    target_audience: string
    formality: string
    avoid_topics: string
    client_testimonial_voice: string
    content_pillars: string | null
    default_carousel_slides: number
    require_source_grounding: boolean
    is_health_niche: boolean | null
    language_notes: string
    top_performing_posts: string[]
  }
  language_rules: {
    carousel_swipe_cues: string
    formality_rules: unknown | null
    language_instructions: string
  }
  post_history: string[]
}

interface GenerateRequestBody {
  clientId: string
  platform: string
  themes: Theme[]
  postType: 'single' | 'carousel' | 'reels'
  slideCount: number
  priorityPosts: PriorityPost[]
  /** Optional — wizard passes server-prefetched client data to skip DB queries. */
  preloadedClientData?: PreloadedGenerateData
}

/** Map the wire type to the internal ClientData shape. */
function mapToClientData(wire: PreloadedGenerateData): ClientData {
  return {
    client: wire.client,
    profile: {
      tone: wire.profile.tone,
      targetAudience: wire.profile.target_audience,
      formality: wire.profile.formality,
      avoidTopics: wire.profile.avoid_topics,
      clientTestimonialVoice: wire.profile.client_testimonial_voice,
      contentPillars: parsePillars(wire.profile.content_pillars),
      defaultCarouselSlides: wire.profile.default_carousel_slides,
      defaultPostType: null,
      requireSourceGrounding: wire.profile.require_source_grounding,
      sourceStrategy: null,
      isHealthNiche: wire.profile.is_health_niche,
      languageNotes: wire.profile.language_notes,
      topPerformingPosts: wire.profile.top_performing_posts,
    },
    languageRules: {
      carouselSwipeCues: wire.language_rules.carousel_swipe_cues,
      formalityRules: toFormalityRulesData(wire.language_rules.formality_rules as never),
      languageInstructions: wire.language_rules.language_instructions,
    },
    postHistory: wire.post_history,
  }
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:generate:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: GenerateRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.clientId || !body.platform || !body.postType) {
    return NextResponse.json({ error: 'clientId, platform, and postType are required' }, { status: 400 })
  }

  if (!body.themes?.length && !body.priorityPosts?.length) {
    return NextResponse.json({ error: 'At least one theme or priority post is required' }, { status: 400 })
  }

  const preloaded = body.preloadedClientData ? mapToClientData(body.preloadedClientData) : undefined
  const result = await fetchClientData(supabase, body.clientId, agencyId, preloaded)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 })

  const client = toClientContext(result.data)

  // Track generation run
  const { data: runData } = await supabase
    .from('generation_runs')
    .insert({ client_id: body.clientId, platform: body.platform })
    .select('id')
    .single()

  const runId = (runData as { id: string } | null)?.id

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runGenerationBatch({
          client,
          platform: body.platform,
          postType: body.postType,
          slideCount: body.slideCount || result.data.profile.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES,
          requireSourceGrounding: result.data.profile.requireSourceGrounding,
          themes: body.themes,
          priorityPosts: body.priorityPosts,
          trackTheme: async (theme, postCount) => {
            if (!runId) return
            await supabase.from('generation_themes').insert({
              run_id: runId,
              theme_description: theme.description,
              post_count: postCount,
              is_priority: theme.isPriority ?? false,
              priority_brief: theme.brief ?? null,
              target_date: theme.targetDate ?? null,
              research_used: !!theme.sourceExcerpt,
            })
          },
          onResult: (generationResult) => {
            controller.enqueue(encoder.encode(JSON.stringify(generationResult) + '\n'))
          },
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}
