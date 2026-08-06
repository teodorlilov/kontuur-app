import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateStreamSchema } from '@/features/generate/schemas'
import { fetchClientById } from '@/lib/queries/db'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { performResearch } from '@/ai/research/research-orchestrator'
import { finishGenerationRun, startGenerationRun } from '@/lib/generation/runs'
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

/**
 * Parsed body. priorityPosts and preloadedClientData are re-narrowed to their
 * app types after validation: the schema proves the shape, these keep the
 * downstream prompt builders working against the richer domain types.
 */
type GenerateStreamRequestBody = Omit<
  z.infer<typeof generateStreamSchema>,
  'priorityPosts' | 'preloadedClientData'
> & {
  priorityPosts?: PriorityPost[]
  preloadedClientData: ClientData
}

/** Stream a batch generation run as ndjson: research, then a post per theme. */
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
    // WHY the double assertion: the schema validates the wire shape but leaves
    // formalityRules/priorityPosts as `unknown`, on purpose — they are large types
    // this boundary only passes through. Parsing has proven the structure, so this
    // re-attaches the domain types for the prompt builders.
    body = generateStreamSchema.parse(
      await request.json()
    ) as unknown as GenerateStreamRequestBody
  } catch {
    return NextResponse.json(
      { error: 'clientId, platform, postType and preloadedClientData are required' },
      { status: 400 }
    )
  }

  const ownerCheck = await fetchClientById(supabase, body.clientId, agencyId)
  if (!ownerCheck) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const client = body.preloadedClientData

  const targetCount = body.targetPostCount + (body.priorityPosts?.length ?? 0)
  const runId = await startGenerationRun(supabase, {
    clientId: body.clientId,
    platform: body.platform,
    targetCount,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: UnifiedStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      let runFailed = false
      try {
        // Emit total upfront so the UI shows skeletons immediately
        send({ type: 'total', count: targetCount })

        // Run research — phase messages stream; topics collected for generation
        const topics: ResearchTopic[] = []
        await performResearch({
          supabase,
          agencyId,
          clientId: body.clientId,
          niche: client.niche,
          language: client.language,
          count: body.targetPostCount,
          preloadedClientData: body.preloadedClientData,
          onPhase: (message) => send({ type: 'phase', message }),
          onTopic: (topic) => topics.push(topic),
          onSkippedPillars: (pillars, skippedCount) =>
            send({ type: 'skipped_pillars', pillars, skippedCount }),
        })

        if (topics.length === 0 && (body.priorityPosts?.length ?? 0) === 0) {
          runFailed = true
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
          clientSourceId: t.client_source_id ?? null,
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
          // The writing stage is the run's longest and was silent — surface
          // each theme as its generation starts, through the same phase event.
          onProgress: (theme) => send({ type: 'phase', message: `Writing: ${theme}` }),
        })
      } catch (err) {
        runFailed = true
        // This is the boundary: rethrowing alone only errors the ReadableStream,
        // which logs nowhere and leaves the client with a silently truncated
        // response. Report it on the stream the way every other stage does.
        console.error(`[generate-stream] run failed for client ${body.clientId}:`, err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed' })
      } finally {
        if (runId) await finishGenerationRun(supabase, runId, runFailed ? 'failed' : 'complete')
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}
