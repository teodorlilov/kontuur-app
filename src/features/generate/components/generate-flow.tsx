'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UsersGroupRoundedIcon } from '@solar-icons/react/line-duotone'
import { Icon } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import { ActionLink } from '@/components/ui/action-link'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/layout/empty-state'
import { readNDJSONStream } from '@/utils/stream'
import { formatClientName, formatRelativeTime, parseTimestamp } from '@/utils/format'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import { FlowChrome } from './flow-chrome'
import { SetupView } from './setup/setup-view'
import { DoneView } from './done/done-view'
import { GeneratingView } from './generating/generating-view'
import { ReviewView } from './review/review-view'
import { stageIndex, type UnifiedStreamEvent } from '@/features/generate/lib/stream-events'
import { computeRunPlan, livePublishingPlatforms } from '@/features/generate/lib/run-plan'
import type { WaitingDrafts } from '@/features/generate/lib/waiting-drafts'
import { parseSlides } from '@/lib/posts/parse-slides'
import { useDraftVisuals } from '@/features/generate/hooks/use-draft-visuals'
import { useUnloadGuard } from '@/hooks/use-unload-guard'
import { deletePost } from '@/lib/actions/post-actions'
import { linkGeneratedPost } from '@/features/ideas/actions/idea-actions'
import { clientRefreshSchema } from '@/features/generate/schemas'
import type { ClientRow } from '@/types'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { ClientSourceSummary } from '@/lib/queries/db'
import type { PriorityPost, PostType, ClientIdea, MetaConnection, PostImage } from '@/types/api'
import type { SkippedPillars } from '@/lib/generation/runs'
import type { PostData } from '@/types/post'
import type { ValidationData } from '@/types/api'
import { toReviewDraft, type ReviewDraft } from '@/components/draft-editing/types'
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
  /** The agency zone, read on the server: this route group has no ShellProvider. */
  timeZone: string
  /** AI drafts left this period, or null for an unmetered workspace. Read on the server. */
  draftsLeft: number | null
  /** Drafts still waiting for review, per client — rows the last runs left behind. */
  waitingDrafts?: WaitingDrafts[]
  /** The server's render instant — the rows' "2h ago" keys off it so SSR and hydration agree. */
  loadedAt: string
}

/** The format a waiting group was written in — what the review header and a new run start from. */
function formatOf(group: WaitingDrafts): { postType: PostType; slideCount: number } {
  const first = group.posts[0]?.post
  const postType: PostType = first?.post_type === 'carousel' ? 'carousel' : 'single'
  const slideCount = first ? parseSlides(first.slides_json).length : 0
  return { postType, slideCount: slideCount || DEFAULT_CAROUSEL_SLIDES }
}

/**
 * The generate flow's state owner: a four-view machine (setup → generating →
 * review → done) over one generation run. Views are compositions; every
 * decision that outlives a view — selections, the stream, approve/discard —
 * lives here.
 *
 * Every draft is a `posts` row from the moment it streams (status 'draft', written by the
 * stream route), so approve, discard, edits and visuals all address the row and leaving the
 * flow loses nothing: the drafts wait on /generate. Only a run still streaming is worth a
 * warning on the way out.
 *
 * Resume: the group of waiting drafts for the selected client opens straight in review and its
 * visuals start once, on mount; a run opened from an idea is what the user came for, so that
 * client's waiting drafts are offered as setup rows instead of opened over it. Which idea a draft
 * answers is the draft's own (`client_idea_id`, written by the stream route), so approving one
 * claims the right idea whether it streamed a minute ago or was read back days later. Where an
 * approved draft can go is the networks the browser sees a live connection for; the server narrows
 * that to what this format can reach when it schedules, as it does for the queue.
 */
export function GenerateFlow({
  timeZone,
  draftsLeft,
  initialClients,
  initialClientData,
  initialTargetPostCount,
  initialIdea,
  initialClientId,
  initialSources = [],
  initialConnections = [],
  waitingDrafts = [],
  loadedAt,
}: GenerateFlowProps) {
  const router = useRouter()
  const initialClient = initialIdea?.clientId ?? initialClientId ?? initialClients[0]?.id ?? ''
  const resumedGroup = initialIdea
    ? undefined
    : waitingDrafts.find((group) => group.clientId === initialClient)
  const [step, setStep] = useState<FlowStep>(resumedGroup ? 'review' : 'setup')
  const [waiting, setWaiting] = useState<WaitingDrafts[]>(() =>
    waitingDrafts.filter((group) => group !== resumedGroup)
  )

  // Setup selections
  const [clients] = useState<Client[]>(initialClients)
  const [clientId, setClientId] = useState(initialClient)
  const [postType, setPostType] = useState<PostType>(() =>
    resumedGroup
      ? formatOf(resumedGroup).postType
      : initialClientData?.defaultPostType === 'carousel'
        ? 'carousel'
        : 'single'
  )
  const [slideCount, setSlideCount] = useState(() =>
    resumedGroup
      ? formatOf(resumedGroup).slideCount
      : (initialClientData?.defaultCarouselSlides ?? DEFAULT_CAROUSEL_SLIDES)
  )
  const [targetPostCount, setTargetPostCount] = useState(() =>
    resumedGroup ? resumedGroup.posts.length : initialIdea ? 0 : initialTargetPostCount
  )
  const [priorityPosts, setPriorityPosts] = useState<PriorityPost[]>(
    initialIdea
      ? [
          {
            title: initialIdea.ideaText,
            brief: initialIdea.extraNotes ?? '',
            targetDate: initialIdea.targetDate ?? '',
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
  const [generatedPosts, setGeneratedPosts] = useState<ReviewDraft[]>(() =>
    resumedGroup ? resumedGroup.posts.map(toReviewDraft) : []
  )
  const [streamTotal, setStreamTotal] = useState(0)
  const [researchPhase, setResearchPhase] = useState('')
  const [loadingStage, setLoadingStage] = useState(0)
  // What the run under review asked for and what it could not cover, as the run itself recorded
  // both: streamed while it runs, read off the run when its drafts are opened again later. Kept
  // apart from `targetPostCount`, which is the setup control and keeps moving after a run starts —
  // the banner has to describe the run that actually produced these drafts.
  const [skipped, setSkipped] = useState<SkippedPillars | null>(resumedGroup?.run?.skipped ?? null)
  const [requestedCount, setRequestedCount] = useState(
    () => resumedGroup?.run?.targetCount ?? resumedGroup?.posts.length ?? 0
  )

  // Review outcomes. Posts stay in generatedPosts — the review rail shows
  // approved and discarded rows greyed rather than vanishing them.
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set())
  const [confirmingNewRun, setConfirmingNewRun] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  // Monotonic ticket for client switches — only the latest switch may write state,
  // so a slow response for client A cannot overwrite a faster switch to client B.
  const clientRequestRef = useRef(0)
  // The ideas this flow has already claimed. A ref, not state: approve-all's sequential loop
  // reads one stale render, so a state-based gate fired once per draft and every draft of the run
  // sent its own request. Which one wins is settled in the database (`linkIdeaToPost` claims only
  // an idea still `new`); this only keeps the flow from asking again once it knows the answer.
  const linkedIdeasRef = useRef<Set<string>>(new Set())
  const draftVisuals = useDraftVisuals()

  const selectedClient = clients.find((c) => c.id === clientId)
  const clientName = formatClientName(selectedClient?.name)

  const destinations = useMemo(
    () => livePublishingPlatforms(clientConnections),
    [clientConnections]
  )

  const waitingRows = useMemo(
    () =>
      waiting.map((group, index) => ({
        key: index,
        clientName: formatClientName(clients.find((c) => c.id === group.clientId)?.name),
        count: group.posts.length,
        writtenAgo: formatRelativeTime(
          parseTimestamp(group.posts[0]?.post.created_at ?? loadedAt),
          new Date(loadedAt)
        ),
      })),
    [waiting, clients, loadedAt]
  )

  const liveDrafts = useMemo(
    () => generatedPosts.filter((p) => !approvedIds.has(p.post.id) && !discardedIds.has(p.post.id)),
    [generatedPosts, approvedIds, discardedIds]
  )

  useUnloadGuard(isGenerating)

  const visualsByDraft = useMemo(
    () =>
      Object.fromEntries(
        generatedPosts.map((item) => [item.post.id, draftVisuals.slotsFor(item.post)])
      ),
    [generatedPosts, draftVisuals]
  )

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
      }),
    [preloadedClientData, targetPostCount, clientSources, clientConnections]
  )

  // Abort any in-flight stream when the flow unmounts.
  useEffect(() => () => abortControllerRef.current?.abort(), [])

  /** Track a waiting group's visuals and finish whatever the interrupted run left undone. */
  const enqueueGroup = useCallback(
    (group: WaitingDrafts) => {
      for (const item of group.posts) {
        draftVisuals.enqueuePost(item.post, {
          images: item.images,
          composedPositions: item.composedPositions,
          generatingPositions: item.generatingPositions,
        })
      }
    },
    [draftVisuals]
  )

  const pendingResumeRef = useRef(resumedGroup)
  useEffect(() => {
    const group = pendingResumeRef.current
    if (!group) return
    pendingResumeRef.current = undefined
    enqueueGroup(group)
  }, [enqueueGroup])

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
        setSlideCount(clientData.defaultCarouselSlides || DEFAULT_CAROUSEL_SLIDES)
      }
      setClientSources(parsed.sources)
      setClientConnections(parsed.connections)
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

  /**
   * Open a client's waiting drafts in review, as if their run had just finished. The client switch
   * is awaited first: its refetch sets the format from the client's defaults, and the group's own
   * format has to land after it.
   */
  async function openWaitingDrafts(group: WaitingDrafts) {
    await handleClientChange(group.clientId)
    const format = formatOf(group)
    setPostType(format.postType)
    setSlideCount(format.slideCount)
    setTargetPostCount(group.posts.length)
    setSkipped(group.run?.skipped ?? null)
    setRequestedCount(group.run?.targetCount ?? group.posts.length)
    setGeneratedPosts(group.posts.map(toReviewDraft))
    setApprovedIds(new Set())
    setDiscardedIds(new Set())
    setWaiting((prev) => prev.filter((other) => other !== group))
    setStep('review')
    enqueueGroup(group)
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
    setSkipped(null)
    setRequestedCount(plannedPostCount)
    setIsGenerating(true)
    setStep('generating')
    draftVisuals.resetAll()

    try {
      const payload = {
        clientId,
        postType,
        slideCount,
        priorityPosts,
        targetPostCount,
        preloadedClientData: preloadedClientData ?? undefined,
        ideaId: initialIdea?.id,
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
          // No cast: GenerationResult already satisfies ReviewDraft. The double
          // assertion that stood here defeated the one thing UnifiedStreamEvent
          // exists for — if the two shapes ever diverge, this must fail the build
          // rather than hand the review leaves a draft they cannot render.
          // The idea goes on the browser's copy because the route just wrote it on the row this
          // event describes — approve then reads one field, live or resumed.
          const generated: ReviewDraft = initialIdea
            ? { ...event.data, post: { ...event.data.post, client_idea_id: initialIdea.id } }
            : event.data
          receivedCount++
          setGeneratedPosts((prev) => [...prev, generated])
          // Kick off visuals as each post's copy streams — images overlap the rest of the run.
          draftVisuals.enqueuePost(generated.post)
        } else if (event.type === 'skipped_pillars') {
          setSkipped(event.skipped)
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
    // The row keeps whatever visuals are still in flight; the flow just stops showing it.
    draftVisuals.abandonDraft(postId)
    // Approval is the moment the idea is fulfilled — the first approved draft of its run claims
    // it. The action sets the status too: nothing else does now that the run itself leaves the
    // idea untouched, so the link and the status can no longer disagree.
    const ideaId = generatedPosts.find((draft) => draft.post.id === postId)?.post.client_idea_id
    if (ideaId && !linkedIdeasRef.current.has(ideaId)) {
      // Claimed synchronously before the call — approve-all's loop is sequential,
      // so the next iteration must already see the claim.
      linkedIdeasRef.current.add(ideaId)
      void linkGeneratedPost(ideaId, postId).then((result) => {
        if (!result.ok) {
          // Releasing the claim lets the next approval retry; until then the idea
          // honestly stays in the inbox, which is what the toast says.
          linkedIdeasRef.current.delete(ideaId)
          toast.error(
            'Post approved, but its idea is still in the inbox — marking it generated failed'
          )
        }
      })
    }
    settleDraft(postId, 'approved')
  }

  /**
   * Discard = delete the row (`deletePost` records the wizard's discard for the source stats and
   * sweeps the files). Settled only once the row is gone, like approve: settling first would let
   * the last draft's discard end the run before the delete answered, with no way back to review
   * when it failed. Nothing to undo on the idea: it stays `new` for the whole run and only moves
   * on approval.
   */
  async function handlePostDiscarded(postId: string): Promise<boolean> {
    const result = await deletePost(postId)
    if (!result.ok) {
      toast.error('Could not discard the draft — it is still waiting for review')
      return false
    }
    draftVisuals.discardDraft(postId)
    settleDraft(postId, 'discarded')
    return true
  }

  function handleCopySaved(post: PostData) {
    draftVisuals.recomposeDraft(post)
  }

  function handleSavedImage(postId: string, image: PostImage) {
    draftVisuals.mergeImage(postId, image)
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

  /**
   * A new run for this client starts from nothing: the drafts still waiting are deleted — as
   * housekeeping, not as verdicts on their sources — and a run still streaming is aborted, or its
   * late results would repopulate the reset state and the stream's end would yank the user back
   * to review. A draft the delete could not remove resurfaces on the next visit to /generate.
   */
  function handleNewRun() {
    abortControllerRef.current?.abort()
    const liveIds = liveDrafts.map((item) => item.post.id)
    draftVisuals.resetAll()
    void Promise.all(liveIds.map((id) => deletePost(id, { countAsDiscard: false }))).then(
      (results) => {
        if (results.some((result) => !result.ok)) {
          toast.error('Some waiting drafts could not be removed — they will be back next time')
        }
      }
    )
    setGeneratedPosts([])
    setApprovedIds(new Set())
    setDiscardedIds(new Set())
    setStreamTotal(0)
    setLoadingStage(0)
    setSkipped(null)
    setStep('setup')
  }

  /** Every new-run entry point: work on the table confirms first, a clean flow restarts silently. */
  function requestNewRun() {
    if (isGenerating || liveDrafts.length > 0) setConfirmingNewRun(true)
    else handleNewRun()
  }

  /** The chrome's exit: stop listening to the stream and leave — the drafts stay on their rows. */
  function handleCancelRun() {
    abortControllerRef.current?.abort()
    router.push('/dashboard')
  }

  if (clients.length === 0) return <NoClientsState />

  const clientMeta = [selectedClient?.niche, selectedClient?.language, preloadedClientData?.tone]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FlowChrome
        step={step}
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
          ? 'This run is still going. Starting over stops it and deletes anything generated so far.'
          : `${liveDrafts.length} draft${liveDrafts.length === 1 ? ' is' : 's are'} waiting for review. Starting a new run deletes ${liveDrafts.length === 1 ? 'it' : 'them'}, along with ${liveDrafts.length === 1 ? 'its' : 'their'} visuals.`}
      </ConfirmDialog>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {step === 'setup' && (
          <SetupView
            clients={clients}
            clientId={clientId}
            clientMeta={clientMeta}
            clientLoading={clientLoading}
            postType={postType}
            slideCount={slideCount}
            postCount={targetPostCount}
            draftsLeft={draftsLeft}
            briefs={priorityPosts}
            lockedBriefCount={lockedBriefCount}
            waiting={waitingRows}
            onReviewWaiting={(key) => {
              const group = waiting[key]
              if (group) void openWaitingDrafts(group)
            }}
            runPlan={runPlan}
            sourceIdea={initialIdea}
            generating={isGenerating}
            onClientChange={(id) => void handleClientChange(id)}
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
            skipped={skipped}
            clientId={clientId}
            timeZone={timeZone}
            runContext={{
              clientName,
              postType,
              slideCount,
              requestedCount,
            }}
            destinations={destinations}
            visualsByDraft={visualsByDraft}
            onRegenerateVisual={(post, position) => draftVisuals.regenerate(post, position)}
            onReplaceVisual={(post, position, file) =>
              draftVisuals.replaceVisual(post, position, file)
            }
            onSavedImage={handleSavedImage}
            onCopySaved={handleCopySaved}
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
            skippedPillarCount={skipped?.names.length ?? 0}
            // Covered pillars the allocation gave no post: a small run leaves the
            // rest unscheduled (rotation), which is not a skip and must not read
            // like one on the tally. Counted off the allocation rather than
            // subtracting the run size — allocateByWeight can put two posts on
            // one pillar, so the subtraction disagreed with the setup panel.
            restingPillarCount={
              runPlan.allocation.filter((a) => a.coverage !== 'none' && a.count === 0).length
            }
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
      icon={<Icon glyph={UsersGroupRoundedIcon} size="hero" />}
      title="No clients yet"
      description="Add your first client before generating posts."
      action={<ActionLink href="/clients/new">Add your first client</ActionLink>}
    />
  )
}
