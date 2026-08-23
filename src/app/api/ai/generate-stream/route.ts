import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateStreamSchema } from '@/features/generate/schemas'
import { fetchClientById, fetchEngineContext } from '@/lib/queries/db'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { performResearch } from '@/ai/research/research-orchestrator'
import {
  finishGenerationRun,
  startGenerationRun,
  trackGenerationTheme,
} from '@/lib/generation/runs'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import { toTheme, toThemeTitle } from '@/ai/generation/to-theme'
import type { ResearchTopic, TopicBrief } from '@/ai/research/types'
import type { UnifiedStreamEvent } from '@/features/generate/lib/stream-events'
import type { EnrichedTheme as Theme } from '@/ai/generation/types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

export const maxDuration = 300

/**
 * Parsed body. preloadedClientData is re-narrowed to its app type after
 * validation: the schema proves the shape, this keeps the downstream prompt
 * builders working against the richer domain type. priorityPosts no longer
 * needs the treatment — its schema is the real shape.
 */
type GenerateStreamRequestBody = Omit<
  z.infer<typeof generateStreamSchema>,
  'preloadedClientData'
> & {
  preloadedClientData: ClientData
}

/** Stream a batch generation run as ndjson: research, then a post per theme. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const limited = aiRateLimitResponse('generate', userId)
  if (limited) return limited

  let body: GenerateStreamRequestBody
  try {
    // WHY the double assertion: the schema validates the wire shape but leaves
    // formalityRules as `unknown`, on purpose — it is a large type this boundary
    // only passes through. Parsing has proven the structure, so this re-attaches
    // the domain type for the prompt builders.
    body = generateStreamSchema.parse(await request.json()) as unknown as GenerateStreamRequestBody
  } catch {
    return NextResponse.json(
      { error: 'clientId, platform, postType and preloadedClientData are required' },
      { status: 400 }
    )
  }

  const ownerCheck = await fetchClientById(supabase, body.clientId, agencyId)
  if (!ownerCheck) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // The check above proves `body.clientId`. Generation then writes `client_id` from
  // `preloadedClientData`, which the caller supplies — so without this, a crafted
  // request could pass ownership for one client and produce a draft attributed to
  // another, written in that other client's voice, from its sources. Approve
  // re-verifies at POST /api/posts, so the blast radius stayed inside the agency;
  // it was still silent and unlogged.
  if (body.preloadedClientData.id !== body.clientId) {
    console.error(
      `[generate-stream] client mismatch: body.clientId=${body.clientId} preloaded=${body.preloadedClientData.id}`
    )
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Voice exemplars are fetched here, server-side, never trusted from the body:
  // the wizard's clientDataSchema strips unknown keys, so a ride-along field
  // would silently vanish on this path while cron kept it — and exemplar text
  // feeds the prompt, so it must not be caller-controlled anyway.
  const { exemplars, styleMemo } = await fetchEngineContext(supabase, body.clientId)
  const client = { ...body.preloadedClientData, exemplars, styleMemo }

  const targetCount = body.targetPostCount + (body.priorityPosts?.length ?? 0)
  // No slot key: a run a human asked for is never deduped against a schedule.
  const { runId } = await startGenerationRun(supabase, {
    clientId: body.clientId,
    platform: body.platform,
    targetCount,
    kind: 'manual',
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

        // Priority briefs are planned in the same call as the researched topics, so
        // the model assigns each a source and cannot hand the same article to both.
        // They used to bypass research entirely and reach generation with no source
        // at all — the identical gap client ideas had.
        const priorityPosts = body.priorityPosts ?? []
        // The composed request — title plus any notes — is ONE text with two
        // consumers: the planner's REQUESTED POSTS block and the theme's brief
        // (the writer's PRIORITY BRIEF block). theme.brief used to carry only
        // the notes, so an idea with no notes reached the writer with no trace
        // of the client's words — a planner topic that drifted off the request
        // went uncorrected ("scale our meta ads" shipped as an attribution post).
        const briefTexts = priorityPosts.map((pp) =>
          pp.brief ? `${pp.title}\n\n${pp.brief}` : pp.title
        )
        const briefs: TopicBrief[] = briefTexts.map((text) => ({ text }))

        // Run research — phase messages stream; topics collected for generation
        const topics: ResearchTopic[] = []
        await performResearch({
          supabase,
          clientId: body.clientId,
          niche: client.niche,
          count: body.targetPostCount,
          briefs,
          preloadedClientData: body.preloadedClientData,
          onPhase: (message, phase) =>
            send({ type: 'phase', message, stage: phase === 'gathering' ? 'sources' : 'research' }),
          onTopic: (topic) => topics.push(topic),
          onSkippedPillars: (pillars, skippedCount) =>
            send({ type: 'skipped_pillars', pillars, skippedCount }),
        })

        if (topics.length === 0 && priorityPosts.length === 0) {
          runFailed = true
          send({
            type: 'error',
            message: 'Research found no topics. Check your client sources or try again.',
          })
          return
        }

        // A brief keeps its own instruction and target date whether or not planning
        // found it a source; an unsourced brief is still a post the user asked for.
        // First claim wins, matching partitionByBrief's own rule — the orchestrator
        // clears duplicate indices, but that invariant lives in another module, and
        // a Map constructor here would silently let the last duplicate replace the
        // brief's planned theme.
        const byBriefIndex = new Map<number, ResearchTopic>()
        for (const t of topics) {
          if (typeof t.brief_index === 'number' && !byBriefIndex.has(t.brief_index)) {
            byBriefIndex.set(t.brief_index, t)
          }
        }
        const briefThemes: Theme[] = priorityPosts.map((pp, i) => {
          const planned = byBriefIndex.get(i + 1)
          return {
            ...(planned ? toTheme(planned) : { description: toThemeTitle(pp.title), count: 1 }),
            isPriority: true,
            brief: briefTexts[i],
            targetDate: pp.targetDate,
            // '' inherits the run platform — only a real override rides the theme.
            ...(pp.platform ? { platform: pp.platform } : {}),
          }
        })
        const researchThemes: Theme[] = topics
          .filter((t) => typeof t.brief_index !== 'number')
          .map(toTheme)
        const themes: Theme[] = [...briefThemes, ...researchThemes]

        await runGenerationBatch({
          client,
          platform: body.platform,
          postType: body.postType,
          slideCount: body.slideCount || client.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES,
          themes,
          trackTheme: (theme, postCount) => trackGenerationTheme(supabase, runId, theme, postCount),
          onResult: (result) => send({ type: 'result', data: result }),
          // The two longest stages, each previously silent about which one it was.
          onProgress: (theme, phase) =>
            send(
              phase === 'writing'
                ? { type: 'phase', message: `Writing: ${theme}`, stage: 'writing' }
                : { type: 'phase', message: `Checking: ${theme}`, stage: 'quality' }
            ),
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
