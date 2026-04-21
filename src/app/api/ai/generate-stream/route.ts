import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientById } from '@/lib/queries/db'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { performResearch } from '@/ai/research/research-orchestrator'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import type { ResearchTopic, SkippedPillar } from '@/ai/research/types'
import type { Theme } from '@/ai/generation/types'
import type { PriorityPost } from '@/types/api'
import type { ClientData } from '@/lib/clients/fetch-client-data'

export const maxDuration = 300

type UnifiedStreamEvent =
  | { type: 'total'; count: number }
  | { type: 'phase'; message: string }
  | { type: 'result'; data: unknown }
  | { type: 'skipped_pillars'; pillars: SkippedPillar[]; skippedCount: number }
  | { type: 'error'; message: string }

interface GenerateStreamRequestBody {
  clientId: string
  platform: string
  postType: 'single' | 'carousel'
  slideCount: number
  priorityPosts: PriorityPost[]
  targetPostCount: number
  preloadedClientData: ClientData
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:generate:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: GenerateStreamRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.clientId || !body.platform || !body.postType) {
    return NextResponse.json(
      { error: 'clientId, platform, and postType are required' },
      { status: 400 }
    )
  }

  if (!body.preloadedClientData) {
    return NextResponse.json({ error: 'preloadedClientData is required' }, { status: 400 })
  }

  const ownerCheck = await fetchClientById(supabase, body.clientId, agencyId)
  if (!ownerCheck) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const client = body.preloadedClientData

  const { data: runData } = await supabase
    .from('generation_runs')
    .insert({ client_id: body.clientId, platform: body.platform })
    .select('id')
    .single()

  const runId = (runData as { id: string } | null)?.id

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: UnifiedStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      try {
        // Emit total upfront so the UI shows skeletons immediately
        send({ type: 'total', count: body.targetPostCount + (body.priorityPosts?.length ?? 0) })

        // Run research — phase messages stream; topics collected for generation
        const topics: ResearchTopic[] = []
        await performResearch({
          supabase,
          agencyId,
          clientId: body.clientId,
          niche: client.niche ?? 'general',
          language: client.language ?? 'English',
          count: body.targetPostCount,
          preloadedClientData: body.preloadedClientData,
          onPhase: (message) => send({ type: 'phase', message }),
          onTopic: (topic) => topics.push(topic),
          onSkippedPillars: (pillars, skippedCount) =>
            send({ type: 'skipped_pillars', pillars, skippedCount }),
        })

        if (topics.length === 0 && (body.priorityPosts?.length ?? 0) === 0) {
          send({ type: 'error', message: 'Research found no topics. Check your client sources or try again.' })
          return
        }

        const themes: Theme[] = topics.map((t) => ({
          description: t.suggested_theme,
          count: 1,
          pillar: t.pillar ?? undefined,
          sourceUrl: t.source_url,
          sourceTitle: t.source_title,
          sourceType: t.source_type ?? undefined,
          sourceExcerpt: t.source_excerpt,
          sourceFullText: t.source_full_text,
        }))

        await runGenerationBatch({
          client,
          platform: body.platform,
          postType: body.postType,
          slideCount: body.slideCount || client.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES,
          requireSourceGrounding: client.requireSourceGrounding,
          themes,
          priorityPosts: body.priorityPosts ?? [],
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
          onResult: (result) => send({ type: 'result', data: result }),
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
