import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateFromIdeaSchema } from '@/features/generate/schemas'
import { fetchClientById } from '@/lib/queries/db'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { fetchIdeaById, updateIdeaStatus } from '@/features/ideas/lib/ideas'
import { searchForIdea } from '@/ai/research/search-for-idea'
import { finishGenerationRun, startGenerationRun } from '@/lib/generation/runs'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { ClientIdea } from '@/types/api'
import type { EnrichedTheme } from '@/ai/generation/types'

export const maxDuration = 300

type StreamEvent =
  | { type: 'total'; count: number }
  | { type: 'phase'; message: string }
  | { type: 'result'; data: unknown }
  | { type: 'error'; message: string }

/** Parsed body, with preloadedClientData re-narrowed to its app type after validation. */
type RequestBody = Omit<z.infer<typeof generateFromIdeaSchema>, 'preloadedClientData'> & {
  preloadedClientData: ClientData
}

/** Generates exactly 1 post from a client idea, optionally enriched with a focused Tavily search. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:generate:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: RequestBody
  try {
    // WHY the double assertion: see generate-stream — the schema deliberately
    // leaves the pass-through config objects as `unknown`, and parsing has
    // already proven the structure this re-attaches types to.
    body = generateFromIdeaSchema.parse(await request.json()) as unknown as RequestBody
  } catch {
    return NextResponse.json(
      { error: 'ideaId, postType, and preloadedClientData are required' },
      { status: 400 }
    )
  }

  const idea = await fetchIdeaById(body.ideaId, agencyId)
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  const ownerCheck = await fetchClientById(supabase, idea.clientId, agencyId)
  if (!ownerCheck) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  await updateIdeaStatus(body.ideaId, agencyId, 'generating')

  const runId = await startGenerationRun(supabase, {
    clientId: idea.clientId,
    platform: idea.platform ?? 'Instagram',
    targetCount: 1,
  })

  const encoder = new TextEncoder()
  let hasResult = false
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: StreamEvent) =>
    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      try {
        await generateFromIdea(controller, send, idea, body, runId, supabase, (result) => {
          hasResult = true
          send(controller, { type: 'result', data: result })
        })
      } catch (err) {
        // The stream is the only channel back to the caller, so the boundary
        // both reports and logs — a thrown stream error is otherwise invisible.
        console.error(`[generate-from-idea] generation failed for idea ${body.ideaId}:`, err)
        send(controller, { type: 'error', message: err instanceof Error ? err.message : 'Generation failed' })
      } finally {
        // Left un-thrown: the stream is closing and the status is recoverable on
        // the next load, but a stuck 'generating' badge needs to be traceable.
        await updateIdeaStatus(body.ideaId, agencyId, hasResult ? 'generated' : 'new').catch(
          (statusErr: unknown) => {
            console.error(`[generate-from-idea] idea status reset failed for ${body.ideaId}:`, statusErr)
          }
        )
        if (runId) await finishGenerationRun(supabase, runId, hasResult ? 'complete' : 'failed')
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

/** Searches for sources, builds the enriched theme, and runs generation. */
async function generateFromIdea(
  controller: ReadableStreamDefaultController<Uint8Array>,
  send: (c: ReadableStreamDefaultController<Uint8Array>, e: StreamEvent) => void,
  idea: ClientIdea,
  body: RequestBody,
  runId: string | null,
  supabase: SupabaseClient,
  onResult: (result: unknown) => void,
) {
  const client = body.preloadedClientData
  const platform = idea.platform ?? 'Instagram'

  send(controller, { type: 'total', count: 1 })
  send(controller, { type: 'phase', message: 'Searching for sources...' })

  const searchResult = await searchForIdea(supabase, idea.clientId, idea.ideaText)
  if (searchResult) {
    send(controller, { type: 'phase', message: 'Found source material...' })
  }

  send(controller, { type: 'phase', message: 'Writing post...' })

  const brief = idea.ideaText + (idea.extraNotes ? `\n\nAdditional context: ${idea.extraNotes}` : '')
  const enrichedTheme: EnrichedTheme = {
    description: idea.ideaText.slice(0, 60),
    count: 1,
    isPriority: true,
    brief,
    targetDate: idea.targetDate ?? undefined,
    ...(searchResult ? {
      sourceUrl: searchResult.url,
      sourceTitle: searchResult.title,
      sourceExcerpt: searchResult.excerpt,
    } : {}),
  }

  await runGenerationBatch({
    client,
    platform,
    postType: body.postType,
    slideCount: body.slideCount || client.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES,
    requireSourceGrounding: !!searchResult || client.requireSourceGrounding,
    themes: [enrichedTheme],
    priorityPosts: [],
    trackTheme: async (theme, postCount) => {
      if (!runId) return
      await supabase.from('generation_themes').insert({
        run_id: runId,
        theme_description: theme.description,
        post_count: postCount,
        is_priority: true,
        priority_brief: theme.brief ?? null,
        target_date: theme.targetDate ?? null,
        research_used: !!searchResult,
      })
    },
    onResult,
  })
}
