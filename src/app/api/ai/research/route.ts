import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { performResearch } from '@/ai/research/pipeline'
import type { ResearchStreamEvent, PreloadedClientData } from '@/ai/research/types'
import type { SourceStrategy } from '@/types/api'
 
interface ResearchRequestBody {
  clientId: string
  niche: string
  language: string
  count?: number
  brandProfile?: {
    content_pillars: string | null
    source_strategy: Record<string, boolean> | null
    language_formality: string | null
    language_notes: string | null
    language_instructions?: string | null
    post_history?: string[]
  }
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:research:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: ResearchRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.niche) return NextResponse.json({ error: 'niche is required' }, { status: 400 })

  const preloaded: PreloadedClientData | undefined = body.brandProfile
    ? {
        contentPillars:       body.brandProfile.content_pillars,
        sourceStrategy:       body.brandProfile.source_strategy as SourceStrategy | null,
        languageFormality:    body.brandProfile.language_formality,
        languageNotes:        body.brandProfile.language_notes,
        languageInstructions: body.brandProfile.language_instructions ?? null,
        postHistory:          body.brandProfile.post_history,
      }
    : undefined

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ResearchStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        await performResearch({
          supabase,
          agencyId,
          clientId: body.clientId,
          niche: body.niche,
          language: body.language || 'English',
          count: body.count ?? 5,
          preloaded,
          onPhase: (message) => send({ type: 'phase', message }),
          onTopic: (topic) => send({ type: 'topic', data: topic }),
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
