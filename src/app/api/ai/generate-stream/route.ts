import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateStreamSchema } from '@/features/generate/schemas'
import { fetchClientById, fetchEngineContext } from '@/lib/queries/db'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { runAsSpender } from '@/lib/billing/spend-context'
import { allowanceResponse } from '@/lib/billing/usage'
import { performResearch } from '@/ai/research/research-orchestrator'
import {
  finishGenerationRun,
  startGenerationRun,
  trackGenerationTheme,
  type SkippedPillars,
} from '@/lib/generation/runs'
import { runGenerationBatch } from '@/ai/generation/generation-orchestrator'
import { persistStreamedDraft } from '@/lib/generation/draft-posts'
import { fetchIdeaById } from '@/features/ideas/lib/ideas'
import { fetchIdentityForGeneration } from '@/lib/visual/generate-visual'
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

/**
 * Stream a batch generation run as ndjson: research, then a post per theme. The run is opened
 * with no slot key — a run a human asked for is never deduped against a schedule — and the draft
 * allowance is reserved inside that claim, before any model call, so a refusal is a 402 before
 * the stream opens.
 *
 * Every draft is a `posts` row (status 'draft') BEFORE its `result` event goes out, under the id
 * the orchestrator minted (`persistStreamedDraft`, lib/generation/draft-posts.ts), so the draft the
 * browser reviews is the row — approve, discard, edits and visuals all address it, and closing the
 * tab loses nothing already written. A draft whose insert fails never reaches the browser and is
 * not billed: `produced` counts rows, and the orchestrator fails that theme alone
 * (`collectResult`, generation-orchestrator.ts).
 *
 * Once the browser is gone — the stream's `cancel`, or an enqueue that fails — nothing more is
 * written or billed: `send` goes quiet and `onResult` stops persisting. What the person saw land is
 * exactly what waits for them on /generate, and "start over" deletes exactly that; a run that kept
 * writing after the tab closed would leave billed drafts nobody saw. The model work already in
 * flight still completes on the server; that cost is accepted.
 *
 * `landing` counts drafts as they ARRIVE and `produced` drafts that WERE WRITTEN: two counters,
 * because up to five themes land concurrently and the colour offset must be taken before this
 * draft's insert awaits, while billing must count only after it succeeded.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const limited = aiRateLimitResponse('generate', userId)
  if (limited) return limited
  const refused = await requireEntitledRoute(agencyId, 'spend')
  if (refused) return refused

  let body: GenerateStreamRequestBody
  try {
    // WHY the double assertion: the schema validates the wire shape but leaves
    // formalityRules as `unknown`, on purpose — it is a large type this boundary
    // only passes through. Parsing has proven the structure, so this re-attaches
    // the domain type for the prompt builders.
    body = generateStreamSchema.parse(await request.json()) as unknown as GenerateStreamRequestBody
  } catch {
    return NextResponse.json(
      { error: 'clientId, postType and preloadedClientData are required' },
      { status: 400 }
    )
  }

  const ownerCheck = await fetchClientById(supabase, body.clientId, agencyId)
  if (!ownerCheck) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // The check above proves `body.clientId`. Generation then writes `client_id` from
  // `preloadedClientData`, which the caller supplies — so without this, a crafted
  // request could pass ownership for one client and produce a draft attributed to
  // another, written in that other client's voice, from its sources, and now
  // inserted under that client the moment it lands.
  if (body.preloadedClientData.id !== body.clientId) {
    console.error(
      `[generate-stream] client mismatch: body.clientId=${body.clientId} preloaded=${body.preloadedClientData.id}`
    )
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // The idea is verified rather than believed: it is written onto every draft of this run, and
  // approving one of them marks that idea generated. An id this agency cannot see is dropped and
  // the run proceeds — the drafts are what the person came for, and an idea deleted between
  // opening the wizard and pressing Generate must not cost them the batch.
  let clientIdeaId: string | null = null
  if (body.ideaId) {
    clientIdeaId = (await fetchIdeaById(body.ideaId, agencyId))?.id ?? null
    if (!clientIdeaId) {
      console.warn(
        `[generate-stream] idea ${body.ideaId} is not this agency's — running without it`
      )
    }
  }

  // Voice exemplars are fetched here, server-side, never trusted from the body:
  // the wizard's clientDataSchema strips unknown keys, so a ride-along field
  // would silently vanish on this path while cron kept it — and exemplar text
  // feeds the prompt, so it must not be caller-controlled anyway.
  const { exemplars, styleMemo } = await fetchEngineContext(supabase, body.clientId)
  const client = { ...body.preloadedClientData, exemplars, styleMemo }

  const targetCount = body.targetPostCount + (body.priorityPosts?.length ?? 0)
  const entitlement = await getCachedEntitlement(agencyId)
  const claim = await startGenerationRun(supabase, {
    clientId: body.clientId,
    agencyId,
    entitlement,
    targetCount,
    kind: 'manual',
  })
  if ('refused' in claim) return allowanceResponse(claim.refused)
  const { runId } = claim
  const spender = { agencyId, clientId: body.clientId, flow: 'generation' as const }
  let produced = 0
  let landing = 0
  let runSkipped: SkippedPillars | null = null
  const identity = fetchIdentityForGeneration(body.clientId).catch((err: unknown) => {
    console.error(`[generate-stream] identity read failed for client ${body.clientId}:`, err)
    return null
  })

  const encoder = new TextEncoder()
  let clientGone = false
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      clientGone = true
      console.warn(`[generate-stream] client left mid-run for client ${body.clientId}`)
    },
    async start(controller) {
      const send = (event: UnifiedStreamEvent) => {
        if (clientGone) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch (err) {
          clientGone = true
          console.warn(`[generate-stream] stream closed under client ${body.clientId}:`, err)
        }
      }

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
        await runAsSpender(spender, () =>
          performResearch({
            supabase,
            clientId: body.clientId,
            niche: client.niche,
            count: body.targetPostCount,
            briefs,
            preloadedClientData: body.preloadedClientData,
            onPhase: (message, phase) =>
              send({
                type: 'phase',
                message,
                stage: phase === 'gathering' ? 'sources' : 'research',
              }),
            onTopic: (topic) => topics.push(topic),
            onSkippedPillars: (pillars, skippedCount) => {
              // Kept as well as sent: the browser shows it now, the run carries it for whoever
              // opens these drafts tomorrow.
              runSkipped = { names: pillars.map((pillar) => pillar.name), cost: skippedCount }
              send({ type: 'skipped_pillars', skipped: runSkipped })
            },
          })
        )

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
          }
        })
        const researchThemes: Theme[] = topics
          .filter((t) => typeof t.brief_index !== 'number')
          .map(toTheme)
        const themes: Theme[] = [...briefThemes, ...researchThemes]

        await runAsSpender(spender, () =>
          runGenerationBatch({
            client,
            postType: body.postType,
            slideCount: body.slideCount || client.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES,
            themes,
            trackTheme: (theme, postCount) =>
              trackGenerationTheme(supabase, runId, theme, postCount),
            onResult: async (result) => {
              if (clientGone) return
              await persistStreamedDraft(supabase, {
                post: result.post,
                identity: await identity,
                run: { id: runId, index: landing++, clientId: body.clientId },
                clientIdeaId,
              })
              produced++
              send({ type: 'result', data: result })
            },
            // The two longest stages, each previously silent about which one it was.
            onProgress: (theme, phase) =>
              send(
                phase === 'writing'
                  ? { type: 'phase', message: `Writing: ${theme}`, stage: 'writing' }
                  : { type: 'phase', message: `Checking: ${theme}`, stage: 'quality' }
              ),
          })
        )
      } catch (err) {
        runFailed = true
        // This is the boundary: rethrowing alone only errors the ReadableStream,
        // which logs nowhere and leaves the client with a silently truncated
        // response. Report it on the stream the way every other stage does.
        console.error(`[generate-stream] run failed for client ${body.clientId}:`, err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed' })
      } finally {
        if (runId)
          await finishGenerationRun(supabase, runId, {
            status: runFailed ? 'failed' : 'complete',
            agencyId,
            entitlement,
            reserved: targetCount,
            landed: produced,
            skipped: runSkipped,
          })
        if (!clientGone) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}
