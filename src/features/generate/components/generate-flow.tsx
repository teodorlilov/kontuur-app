'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { ActionLink } from '@/components/ui/action-link'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/layout/empty-state'
import { readNDJSONStream } from '@/utils/stream'
import { formatClientName } from '@/utils/format'
import { FlowChrome } from './flow-chrome'
import { SetupView } from './setup/setup-view'
import { DoneView } from './done/done-view'
import { GeneratingView } from './generating/generating-view'
import { ReviewView } from './review/review-view'
import { stageIndex, type UnifiedStreamEvent } from '@/features/generate/lib/stream-events'
import { computeRunPlan } from '@/features/generate/lib/run-plan'
import { useDraftVisuals } from '@/features/generate/hooks/use-draft-visuals'
import { useUnloadGuard } from '@/hooks/use-unload-guard'
import { logDiscardedDraft } from '@/features/generate/actions/discard-actions'
import { linkGeneratedPost } from '@/features/ideas/actions/idea-actions'
import { clientRefreshSchema } from '@/features/generate/schemas'
import type { ClientRow } from '@/types'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { ClientSourceSummary } from '@/lib/queries/db'
import type { PriorityPost, PostType, ClientIdea, MetaConnection } from '@/types/api'
import type { SkippedPillar } from '@/ai/research/types'
import type { PostData, ValidationData } from '@/types/post'
import type { ReviewDraft } from '@/components/posts/review/types'
import type { FlowStep } from './flow-stepper'

type Client = Pick<ClientRow, 'id' | 'name' | 'niche' | 'language' | 'posts_per_week'>

interface GenerateFlowProps {
  initialClients: Client[]
  initialClientData: ClientData | null
  initialTargetPostCount: number
  initialIdea?: ClientIdea
  initialClientId?: string
  initialSources?: ClientSourceSummary[]
  initialConnections?: MetaConnection[]
}

/**
 * The generate flow's state owner: a four-view machine (setup → generating →
 * review → done) over one generation run. Views are compositions; every
 * decision that outlives a view — selections, the stream, approve/discard —
 * lives here.
 */
export function GenerateFlow({
  initialClients,
  initialClientData,
  initialTargetPostCount,
  initialIdea,
  initialClientId,
  initialSources = [],
  initialConnections = [],
}: GenerateFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<FlowStep>('setup')
  const [sourceIdea] = useState<ClientIdea | undefined>(initialIdea)

  // Setup selections
  const [clients] = useState<Client[]>(initialClients)
  const [clientId, setClientId] = useState(
    initialIdea?.clientId ?? initialClientId ?? initialClients[0]?.id ?? ''
  )
  const [platform, setPlatform] = useState(initialIdea?.platform ?? 'Instagram')
  const [postType, setPostType] = useState<PostType>(
    initialClientData?.defaultPostType === 'carousel' ? 'carousel' : 'single'
  )
  const [slideCount, setSlideCount] = useState(initialClientData?.defaultCarouselSlides ?? 6)
  const [targetPostCount, setTargetPostCount] = useState(initialIdea ? 0 : initialTargetPostCount)
  const [priorityPosts, setPriorityPosts] = useState<PriorityPost[]>(
    initialIdea
      ? [
          {
            title: initialIdea.ideaText,
            brief: initialIdea.extraNotes ?? '',
            targetDate: initialIdea.targetDate ?? '',
            // The client's ask rides the brief, so the run platform stays free
            // for the researched posts alongside — the whole-flow lock is gone.
            platform: initialIdea.platform ?? '',
          },
        ]
      : []
  )
  // The client's own words are not the agency's to edit or drop.
  const lockedBriefCount = initialIdea ? 1 : 0
  const [preloadedClientData, setPreloadedClientData] = useState<ClientData | null>(
    initialClientData
  )
  const [clientSources, setClientSources] = useState<ClientSourceSummary[]>(initialSources)
  const [clientConnections, setClientConnections] = useState<MetaConnection[]>(initialConnections)
  const [clientLoading, setClientLoading] = useState(false)

  // Stream state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosts, setGeneratedPosts] = useState<ReviewDraft[]>([])
  const [streamTotal, setStreamTotal] = useState(0)
  const [researchPhase, setResearchPhase] = useState('')
  const [loadingStage, setLoadingStage] = useState(0)
  const [skippedPillars, setSkippedPillars] = useState<SkippedPillar[]>([])

  // Review outcomes. Posts stay in generatedPosts — the review rail shows
  // approved and discarded rows greyed rather than vanishing them.
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set())
  const [confirmingNewRun, setConfirmingNewRun] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  // Monotonic ticket for client switches — only the latest switch may write state,
  // so a slow response for client A cannot overwrite a faster switch to client B.
  const clientRequestRef = useRef(0)
  // Whether this flow session has already linked the idea to an approved post. A
  // ref, not state: approve-all's sequential loop reads `approvedIds` from one
  // stale render, so a state-based "first approval" gate fired once per draft and
  // the LAST post won the link. Never reset on a new run — the idea was fulfilled
  // by the first approval, and a second run must not overwrite generated_post_id.
  const ideaLinkedRef = useRef(false)
  const draftVisuals = useDraftVisuals()

  const selectedClient = clients.find((c) => c.id === clientId)
  const clientName = formatClientName(selectedClient?.name)

  const liveDrafts = useMemo(
    () => generatedPosts.filter((p) => !approvedIds.has(p.post.id) && !discardedIds.has(p.post.id)),
    [generatedPosts, approvedIds, discardedIds]
  )

  // Drafts exist nowhere but this tab until they are approved — closing it
  // mid-run or mid-review loses them. Guarded only while that is true, so
  // setup and the done screen leave silently.
  useUnloadGuard(isGenerating || liveDrafts.length > 0)

  // The run's true size: researched posts plus briefs, the same sum the server
  // writes (generate-stream's targetCount). The allocation preview keeps using
  // targetPostCount alone — briefs are extra, not part of the mix. An idea is one
  // of those briefs, so it adds to the run rather than replacing it.
  const plannedPostCount = targetPostCount + priorityPosts.length

  const runPlan = useMemo(
    () =>
      computeRunPlan({
        pillars: preloadedClientData?.contentPillars ?? [],
        targetPostCount,
        sources: clientSources,
        connections: clientConnections,
        platform,
      }),
    [preloadedClientData, targetPostCount, clientSources, clientConnections, platform]
  )

  // Abort any in-flight stream when the flow unmounts.
  useEffect(() => () => abortControllerRef.current?.abort(), [])

  // The run closes itself: when the last live draft is settled, review becomes
  // done. Derived here rather than in the approve/discard handlers, whose
  // closures go stale across approve-all's sequential loop.
  useEffect(() => {
    if (step === 'review' && generatedPosts.length > 0 && liveDrafts.length === 0) {
      setStep('done')
    }
  }, [step, generatedPosts.length, liveDrafts.length])

  /** Client switch: one user-event refetch replacing everything client-scoped. */
  async function handleClientChange(nextClientId: string) {
    if (nextClientId === clientId) return
    const requestId = ++clientRequestRef.current
    setClientId(nextClientId)
    setPreloadedClientData(null)
    setClientSources([])
    setClientConnections([])
    setClientLoading(true)
    try {
      const res = await fetch(`/api/clients/${nextClientId}`)
      const parsed = clientRefreshSchema.parse(await res.json())
      if (requestId !== clientRequestRef.current) return
      if (parsed.clientData) {
        // Trusted from our own API, as today — the schema validates the new fields.
        const clientData = parsed.clientData as ClientData
        setPreloadedClientData(clientData)
        setPostType(clientData.defaultPostType === 'carousel' ? 'carousel' : 'single')
        setSlideCount(clientData.defaultCarouselSlides || 6)
      }
      setClientSources(parsed.sources)
      setClientConnections(parsed.connections as MetaConnection[])
      const changedClient = clients.find((c) => c.id === nextClientId)
      if (changedClient && changedClient.posts_per_week > 0) {
        setTargetPostCount(changedClient.posts_per_week)
      }
    } catch (err) {
      if (requestId !== clientRequestRef.current) return
      console.error('[generate] client refresh failed:', err)
      toast.error('Could not load that client — try again')
    } finally {
      if (requestId === clientRequestRef.current) setClientLoading(false)
    }
  }

  function handlePlatformChange(nextPlatform: string) {
    setPlatform(nextPlatform)
    if (nextPlatform !== 'Instagram' && postType === 'carousel') setPostType('single')
  }

  async function startGeneration() {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStreamTotal(0)
    setGeneratedPosts([])
    setApprovedIds(new Set())
    setDiscardedIds(new Set())
    setResearchPhase('')
    setLoadingStage(0)
    setSkippedPillars([])
    setIsGenerating(true)
    setStep('generating')
    draftVisuals.resetAll()

    try {
      const payload = {
        clientId,
        platform,
        postType,
        slideCount,
        priorityPosts,
        targetPostCount,
        preloadedClientData: preloadedClientData ?? undefined,
      }

      const res = await fetch('/api/ai/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        toast.error(err.error ?? 'Generation failed')
        setStep('setup')
        return
      }

      let runFailed = false
      let receivedCount = 0
      await readNDJSONStream<UnifiedStreamEvent>(res, (event) => {
        if (event.type === 'total') {
          setStreamTotal(event.count)
        } else if (event.type === 'phase') {
          setResearchPhase(event.message)
          // The server states its stage now; it used to be guessed from this same
          // prose, and the first wrong guess stuck because of the Math.max below.
          setLoadingStage((prev) => Math.max(prev, stageIndex(event.stage)))
        } else if (event.type === 'result') {
          // Deliberately NOT clearing researchPhase: blanking it here left the
          // view mute between results — the last activity stays up until the
          // next phase replaces it.
          setLoadingStage((prev) => Math.max(prev, stageIndex('writing')))
          const generated = event.data as unknown as ReviewDraft
          receivedCount++
          setGeneratedPosts((prev) => [...prev, generated])
          // Kick off visuals as each post's copy streams — images overlap the rest of the run.
          draftVisuals.enqueuePost(generated.post)
        } else if (event.type === 'skipped_pillars') {
          setSkippedPillars(event.pillars)
        } else if (event.type === 'error') {
          runFailed = true
          toast.error(event.message)
        }
      })

      // A failed run with nothing to show returns to setup; a failure after
      // drafts landed still gets its partial review — the toast said why.
      setStep(runFailed && receivedCount === 0 ? 'setup' : 'review')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Generation failed — please retry')
      setStep('setup')
    } finally {
      setIsGenerating(false)
    }
  }

  /** Mark a draft's outcome; the review→done transition is derived above. */
  function settleDraft(postId: string, kind: 'approved' | 'discarded') {
    const setOutcome = kind === 'approved' ? setApprovedIds : setDiscardedIds
    setOutcome((prev) => new Set(prev).add(postId))
  }

  function handlePostApproved(postId: string) {
    // Completed visuals were attached by POST /api/posts; stop any still-pending jobs.
    draftVisuals.abandonDraft(postId)
    // Approval is the moment the idea is fulfilled — the first approved post claims it.
    // The action sets the status too: nothing else does now that the run itself leaves
    // the idea untouched, so the link and the status can no longer disagree.
    if (sourceIdea && !ideaLinkedRef.current) {
      // Claimed synchronously before the call — approve-all's loop is sequential,
      // so the next iteration must already see the claim.
      ideaLinkedRef.current = true
      void linkGeneratedPost(sourceIdea.id, postId).then((result) => {
        if (!result.ok) {
          // Releasing the claim lets the next approval retry; until then the idea
          // honestly stays in the inbox, which is what the toast says.
          ideaLinkedRef.current = false
          toast.error('Post approved, but its idea is still in the inbox — marking it generated failed')
        }
      })
    }
    settleDraft(postId, 'approved')
  }

  function handlePostDiscarded(postId: string) {
    const removed = generatedPosts.find((p) => p.post.id === postId)
    if (removed) {
      draftVisuals.discardDraft(postId, removed.post.client_id)
      // Outcome telemetry: explicit discards feed per-source usefulness stats
      void logDiscardedDraft({
        clientId: removed.post.client_id,
        clientSourceId: removed.post.client_source_id ?? null,
        pillar: removed.post.pillar ?? null,
        sourceUrl: removed.post.source_url ?? null,
        sourceType: removed.post.source_type ?? null,
        platform: removed.post.platform ?? null,
      })
    }
    // Nothing to undo on the idea: it stays `new` for the whole run and only moves on
    // approval. The reset that used to live here now actively hurt — discarding a
    // second draft after approving a first would clear the fulfilled status while
    // leaving generated_post_id pointing at the approved post.
    settleDraft(postId, 'discarded')
  }

  function handlePostRegenerated(
    postId: string,
    updatedPost: PostData,
    updatedValidation: ValidationData
  ) {
    setGeneratedPosts((prev) =>
      prev.map((p) => (p.post.id === postId ? { post: updatedPost, ...updatedValidation } : p))
    )
    // Rewrites never re-roll the AI art — composed slides re-flatten with the new copy instead.
    draftVisuals.recomposeDraft(updatedPost)
  }

  function handleNewRun() {
    // A run may still be streaming (the stepper's step 1 is clickable mid-run) —
    // without the abort its late results would repopulate the reset state and
    // the stream's end would yank the user back to review.
    abortControllerRef.current?.abort()
    // Remaining live drafts are implicitly discarded — clean their stored visuals up too.
    for (const item of liveDrafts) draftVisuals.discardDraft(item.post.id, item.post.client_id)
    setGeneratedPosts([])
    setApprovedIds(new Set())
    setDiscardedIds(new Set())
    setStreamTotal(0)
    setLoadingStage(0)
    setSkippedPillars([])
    setStep('setup')
  }

  /** Every new-run entry point: work on the table confirms first, a clean flow restarts silently. */
  function requestNewRun() {
    if (isGenerating || liveDrafts.length > 0) setConfirmingNewRun(true)
    else handleNewRun()
  }

  /** The chrome's exit: abort the stream, drop unsaved work, leave. */
  function handleCancelRun() {
    abortControllerRef.current?.abort()
    for (const item of liveDrafts) draftVisuals.discardDraft(item.post.id, item.post.client_id)
    router.push('/dashboard')
  }

  if (clients.length === 0) return <NoClientsState />

  const clientMeta = [
    selectedClient?.niche,
    selectedClient?.language,
    preloadedClientData?.tone,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FlowChrome
        step={step}
        liveDraftCount={liveDrafts.length}
        isGenerating={isGenerating}
        onStepOneClick={requestNewRun}
        onCancelConfirmed={handleCancelRun}
      />
      <ConfirmDialog
        open={confirmingNewRun}
        title="Start a new run?"
        confirmLabel="Discard and start over"
        cancelLabel="Keep working"
        onConfirm={() => {
          setConfirmingNewRun(false)
          handleNewRun()
        }}
        onClose={() => setConfirmingNewRun(false)}
      >
        {isGenerating
          ? 'This run is still going. Starting over stops it and discards anything generated so far.'
          : `${liveDrafts.length} draft${liveDrafts.length === 1 ? ' is' : 's are'} not saved yet. Starting a new run discards ${liveDrafts.length === 1 ? 'it' : 'them'}, along with the visuals composed for ${liveDrafts.length === 1 ? 'it' : 'them'}.`}
      </ConfirmDialog>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {step === 'setup' && (
          <SetupView
            clients={clients}
            clientId={clientId}
            clientMeta={clientMeta}
            clientLoading={clientLoading}
            platform={platform}
            postType={postType}
            slideCount={slideCount}
            postCount={targetPostCount}
            briefs={priorityPosts}
            lockedBriefCount={lockedBriefCount}
            runPlan={runPlan}
            sourceIdea={sourceIdea}
            generating={isGenerating}
            onClientChange={(id) => void handleClientChange(id)}
            onPlatformChange={handlePlatformChange}
            onPostTypeChange={setPostType}
            onSlideCountChange={setSlideCount}
            onPostCountChange={setTargetPostCount}
            onBriefsChange={setPriorityPosts}
            onGenerate={() => void startGeneration()}
          />
        )}

        {step === 'generating' && (
          <GeneratingView
            clientName={clientName}
            postType={postType}
            stage={loadingStage}
            researchPhase={researchPhase}
            streamTotal={streamTotal}
            targetPostCount={plannedPostCount}
            posts={generatedPosts}
          />
        )}

        {step === 'review' && (
          <ReviewView
            posts={generatedPosts}
            approvedIds={approvedIds}
            discardedIds={discardedIds}
            skippedPillars={skippedPillars}
            allocation={runPlan.allocation}
            clientId={clientId}
            runContext={{
              clientName,
              platform,
              postType,
              slideCount,
              targetPostCount: plannedPostCount,
            }}
            visualsByDraft={draftVisuals.visualsByDraft}
            onRegenerateVisual={(post, position) => draftVisuals.regenerate(post, position)}
            onReplaceVisual={(post, position, file) =>
              draftVisuals.replaceVisual(post, position, file)
            }
            onEditedVisual={draftVisuals.applyEditedVisual}
            onApplyStyleToAll={draftVisuals.applyStyleAcrossDraft}
            onApproved={handlePostApproved}
            onDiscarded={handlePostDiscarded}
            onRewritten={handlePostRegenerated}
            onNewRun={requestNewRun}
          />
        )}

        {step === 'done' && (
          <DoneView
            approvedCount={approvedIds.size}
            discardedCount={discardedIds.size}
            skippedPillarCount={skippedPillars.length}
            clientName={clientName}
            clientId={clientId}
            onNewRun={requestNewRun}
          />
        )}
      </main>
    </div>
  )
}

function NoClientsState() {
  return (
    <EmptyState
      className="flex-1"
      icon={<Users aria-hidden className="size-8" strokeWidth={1.4} />}
      title="No clients yet"
      description="Add your first client before generating posts."
      action={<ActionLink href="/clients/new">Add your first client</ActionLink>}
    />
  )
}
