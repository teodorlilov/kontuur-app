import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientData, type ClientData } from '@/lib/clients/fetch-client-data'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { runGenerationBatch } from '@/ai/generation/generation-run'
import type { PriorityPost } from '@/types/api'
import type { Theme, GenerateStreamEvent } from '@/ai/generation/types'

export const maxDuration = 300 // 5 minutes — each carousel/reels theme needs ~15-25s

interface GenerateRequestBody {
  clientId: string
  platform: string
  themes: Theme[]
  postType: 'single' | 'carousel' | 'reels'
  slideCount: number
  priorityPosts: PriorityPost[]
  /** Optional — wizard passes server-prefetched client data to skip DB queries. */
  preloadedClientData?: ClientData
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
    return NextResponse.json(
      { error: 'clientId, platform, and postType are required' },
      { status: 400 }
    )
  }

  if (!body.themes?.length && !body.priorityPosts?.length) {
    return NextResponse.json(
      { error: 'At least one theme or priority post is required' },
      { status: 400 }
    )
  }

  const result = await fetchClientData(supabase, body.clientId, agencyId, body.preloadedClientData)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 })

  const client = result.data

  // Track generation run
  const { data: runData } = await supabase
    .from('generation_runs')
    .insert({ client_id: body.clientId, platform: body.platform })
    .select('id')
    .single()

  const runId = (runData as { id: string } | null)?.id

  const encoder = new TextEncoder()
  const send = (event: GenerateStreamEvent, controller: ReadableStreamDefaultController<Uint8Array>) =>
    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runGenerationBatch({
          client,
          platform: body.platform,
          postType: body.postType,
          slideCount: body.slideCount || client.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES,
          requireSourceGrounding: client.requireSourceGrounding,
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
          onProgress: (theme) => {
            send({ type: 'progress', theme }, controller)
          },
          onResult: (generationResult) => {
            send({ type: 'result', data: generationResult }, controller)
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
