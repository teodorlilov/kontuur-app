import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generateStreamSchema } from '@/features/generate/schemas'
import { fetchClientById, fetchEngineContext } from '@/lib/queries/db'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { getCachedAgencyClients, getCachedEntitlement } from '@/lib/queries/cache'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { runAsSpender } from '@/lib/billing/spend-context'
import { AllowanceError, allowanceResponse, readUsage } from '@/lib/billing/usage'
import { committedWithOwed, postsAffordable, runShortfall } from '@/lib/billing/post-allowance'
import { NOTHING_OWED, OWED_IMAGES_UNKNOWN } from '@/lib/billing/copy'
import { meteredLimit } from '@/lib/billing/plans'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchWorkspaceOwed } from '@/lib/visual/owed-images'
import { visualSlots } from '@/lib/visual/visual-backlog'
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
 * builders working against the richer domain type. priorityPosts keeps its
 * schema type, which is the real shape.
 */
type GenerateStreamRequestBody = Omit<
  z.infer<typeof generateStreamSchema>,
  'preloadedClientData'
> & {
  preloadedClientData: ClientData
}

/**
 * Stream a batch generation run as ndjson: research, then a post per theme.
 *
 * The body is checked, not believed. `preloadedClientData.id` must equal the owned `clientId`
 * (else 404), because drafts take their `client_id`, voice and sources from it. An `ideaId` the
 * agency cannot see is dropped with a warning: it is written on every draft, and approving one
 * marks the idea generated. Exemplars and the style memo are read here (`fetchEngineContext`):
 * their text feeds the prompt, and `clientDataSchema` (features/generate/schemas.ts) strips keys
 * it does not name.
 *
 * WHY as: the schema leaves `formalityRules` as `unknown` on purpose (`clientDataSchema`) — a
 * large type this boundary only passes through — so the parsed body is re-typed for the prompt
 * builders.
 *
 * Before anything is reserved the run must fit as asked, with the pictures earlier posts still owe
 * set aside (`runShortfall`, `committedWithOwed`), or it is a 402; owed pictures that cannot be
 * read — the posts, or the client list they are read for — are unknown, not zero, so a 500. The
 * run is opened with no slot key (a human's run is never deduped against a schedule) and reserves
 * its drafts inside that claim, so every refusal comes before the stream opens. The kit read runs
 * as the spender too: describing a missing palette is a paid call (`fetchIdentityForGeneration`).
 *
 * A brief's text is its title then its notes, for planner and writer alike: with the notes alone,
 * a planned topic that drifts off the request goes uncorrected. When two topics claim one brief
 * the first wins, as in `partitionByBrief` (ai/research/research-orchestrator.ts); a Map
 * constructor would keep the last.
 *
 * Each draft is a `posts` row BEFORE its `result` event (`persistStreamedDraft`), so the browser
 * reviews the row itself. Once the browser is gone (`cancel`, or a failed enqueue) no new draft is
 * written or billed: `onResult` checks on entry, so a draft whose insert was already under way
 * still lands, billed and unseen, and model work in flight still completes — costs accepted. `landing` counts arrivals and `produced` rows written: up to
 * five themes land at once, the colour offset is taken before the insert awaits, and billing
 * counts only after it succeeds. `start` is the error boundary: a rethrow would only error the
 * ReadableStream, logged nowhere and a silently truncated response in the browser.
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
    body = generateStreamSchema.parse(await request.json()) as unknown as GenerateStreamRequestBody
  } catch {
    return NextResponse.json(
      { error: 'clientId, postType and preloadedClientData are required' },
      { status: 400 }
    )
  }

  const ownerCheck = await fetchClientById(supabase, body.clientId, agencyId)
  if (!ownerCheck) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  if (body.preloadedClientData.id !== body.clientId) {
    console.error(
      `[generate-stream] client mismatch: body.clientId=${body.clientId} preloaded=${body.preloadedClientData.id}`
    )
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  let clientIdeaId: string | null = null
  if (body.ideaId) {
    clientIdeaId = (await fetchIdeaById(body.ideaId, agencyId))?.id ?? null
    if (!clientIdeaId) {
      console.warn(
        `[generate-stream] idea ${body.ideaId} is not this agency's — running without it`
      )
    }
  }

  const { exemplars, styleMemo } = await fetchEngineContext(supabase, body.clientId)
  const client = { ...body.preloadedClientData, exemplars, styleMemo }

  const targetCount = body.targetPostCount + (body.priorityPosts?.length ?? 0)
  const slideCount = body.slideCount || client.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES
  const entitlement = await getCachedEntitlement(agencyId)
  const read = await Promise.all([
    readUsage(agencyId, entitlement.periodKey),
    meteredLimit(entitlement.limits.image) === null
      ? NOTHING_OWED
      : getCachedAgencyClients(agencyId).then((clients) =>
          fetchWorkspaceOwed(
            createAdminSupabaseClient(),
            clients.map((row) => row.id)
          )
        ),
  ]).catch((err: unknown) => {
    console.error(`[generate-stream] allowance read failed for agency ${agencyId}:`, err)
    return null
  })
  if (!read) return NextResponse.json({ error: OWED_IMAGES_UNKNOWN }, { status: 500 })
  const [usage, owed] = read
  const slides = visualSlots(body.postType, slideCount)
  const short = runShortfall(
    postsAffordable(entitlement.limits, committedWithOwed(usage.committed, owed), slides),
    targetCount,
    slides
  )
  if (short) {
    return allowanceResponse(
      new AllowanceError(
        short.kind,
        usage.committed[short.kind],
        entitlement.limits[short.kind],
        short.needed,
        entitlement,
        owed
      )
    )
  }

  const claim = await startGenerationRun(supabase, {
    clientId: body.clientId,
    agencyId,
    entitlement,
    targetCount,
    kind: 'manual',
  })
  if ('refused' in claim) return allowanceResponse(claim.refused)
  const { runId } = claim
  if (runId === null) {
    return NextResponse.json(
      { error: 'Could not start the run. Please try again.' },
      { status: 500 }
    )
  }
  const spender = { agencyId, flow: 'generation' as const }
  let produced = 0
  let landing = 0
  let runSkipped: SkippedPillars | null = null
  const identity = runAsSpender(spender, () => fetchIdentityForGeneration(body.clientId)).catch(
    (err: unknown) => {
      console.error(`[generate-stream] identity read failed for client ${body.clientId}:`, err)
      return null
    }
  )

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
        send({ type: 'total', count: targetCount })

        const priorityPosts = body.priorityPosts ?? []
        const briefTexts = priorityPosts.map((pp) =>
          pp.brief ? `${pp.title}\n\n${pp.brief}` : pp.title
        )
        const briefs: TopicBrief[] = briefTexts.map((text) => ({ text }))

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
            slideCount,
            themes,
            trackTheme: (theme, postCount) =>
              trackGenerationTheme(supabase, runId, theme, postCount),
            onResult: async (result) => {
              if (clientGone) return
              await persistStreamedDraft(supabase, {
                post: result.post,
                identity: await identity,
                run: { id: runId, index: landing++ },
                clientIdeaId,
              })
              produced++
              send({ type: 'result', data: result })
            },
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
        console.error(`[generate-stream] run failed for client ${body.clientId}:`, err)
        send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed' })
      } finally {
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
