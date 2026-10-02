'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UsersGroupRoundedIcon } from '@solar-icons/react/line-duotone'
import { Icon } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import { GatedAction } from '@/components/ui/gated-action'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/layout/empty-state'
import { readNDJSONStream } from '@/utils/stream'
import { readErrorMessage } from '@/utils/read-error-message'
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
import {
  committedWithOwed,
  poolLeft,
  postsAffordable,
  runCeiling,
} from '@/lib/billing/post-allowance'
import type { OwedImages } from '@/lib/billing/copy'
import type { PlanGate } from '@/lib/billing/copy'
import { toPostType, visualSlots } from '@/lib/visual/visual-backlog'
import type { Allowance } from '@/lib/billing/plans'
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
  /**
   * The period's pools, read on the server — what they buy depends on the format chosen here —
   * and the pictures posts already written still owe, set aside before a new run is measured.
   */
  allowance: { limits: Allowance; committed: Allowance; owed: OwedImages }
  /** Whether a run may start at all (`generationGate`) — the form gives way to its refusal. */
  gate: PlanGate
  /** What "Add your first client" says with no client yet (`addBrandGate`, src/lib/billing/copy.ts). */
  addClient: PlanGate
  /** Drafts still waiting for review, per client — rows the last runs left behind. */
  waitingDrafts?: WaitingDrafts[]
  /** The server's render instant — the rows' "2h ago" keys off it so SSR and hydration agree. */
  loadedAt: string
}

/** The format a waiting group was written in — what the review header and a new run start from. */
function formatOf(group: WaitingDrafts): { postType: PostType; slideCount: number } {
  const first = group.posts[0]?.post
  const postType = toPostType(first?.post_type)
  const slideCount = first ? parseSlides(first.slides_json).length : 0
  return { postType, slideCount: slideCount || DEFAULT_CAROUSEL_SLIDES }
}

/**
 * The generate flow's state owner: a four-view machine (setup → generating → review → done) over
 * one run. Every draft is a `posts` row from the moment it streams, so leaving loses nothing; the
 * client's waiting drafts reopen in review, or as setup rows on an idea's run. The asked count is
 * stored as asked and clamped to `runCeiling` (owed pictures set aside) on every render; briefs,
 * the idea's locked one included, ride on top, as generate-stream's `targetCount` sums them. The
 * run's own record (`requestedCount`, `skipped`) stays apart from that moving setup count. Pictures
 * paint while the raw image pool has any left: the owed ones are what it is kept for. Resting
 * pillars — covered ones the allocation gave no post, which a small run rotates and which are not
 * a skip — are counted off the allocation, not as pillars minus the run size, since
 * `allocateByWeight` can put two posts on one pillar. An approved draft claims the idea it carries
 * (`client_idea_id`), never this run's `initialIdea`, so a draft read back later claims the right
 * one; the claimed-ideas ref only stops asking twice, and the database settles which approval wins
 * (`linkIdeaToPost` claims only an idea still `new`, src/features/ideas/lib/ideas.ts).
 */
export function GenerateFlow({
  timeZone,
  allowance,
  gate,
  addClient,
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

  const [clients] = useState<Client[]>(initialClients)
  const [clientId, setClientId] = useState(initialClient)
  const [postType, setPostType] = useState<PostType>(() =>
    resumedGroup ? formatOf(resumedGroup).postType : toPostType(initialClientData?.defaultPostType)
  )
  const [slideCount, setSlideCount] = useState(() =>
    resumedGroup
      ? formatOf(resumedGroup).slideCount
      : (initialClientData?.defaultCarouselSlides ?? DEFAULT_CAROUSEL_SLIDES)
  )
  const affordable = postsAffordable(
    allowance.limits,
    committedWithOwed(allowance.committed, allowance.owed),
    visualSlots(postType, slideCount)
  )
  const imagesLeft = poolLeft(allowance.limits, allowance.committed, 'image')
  const pool =
    imagesLeft === null
      ? undefined
      : { left: imagesLeft, perPost: visualSlots(postType, slideCount), owed: allowance.owed }
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
  const lockedBriefCount = initialIdea ? 1 : 0
  const [preloadedClientData, setPreloadedClientData] = useState<ClientData | null>(
    initialClientData
  )
  const [clientSources, setClientSources] = useState<ClientSourceSummary[]>(initialSources)
  const [clientConnections, setClientConnections] = useState<MetaConnection[]>(initialConnections)
  const [clientLoading, setClientLoading] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosts, setGeneratedPosts] = useState<ReviewDraft[]>(() =>
    resumedGroup ? resumedGroup.posts.map(toReviewDraft) : []
  )
  const [streamTotal, setStreamTotal] = useState(0)
  const [researchPhase, setResearchPhase] = useState('')
  const [loadingStage, setLoadingStage] = useState(0)
  const [skipped, setSkipped] = useState<SkippedPillars | null>(resumedGroup?.run?.skipped ?? null)
  const [requestedCount, setRequestedCount] = useState(
    () => resumedGroup?.run?.targetCount ?? resumedGroup?.posts.length ?? 0
  )

  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set())
  const [confirmingNewRun, setConfirmingNewRun] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const clientRequestRef = useRef(0)
  const linkedIdeasRef = useRef<Set<string>>(new Set())
  const draftVisuals = useDraftVisuals({ canPaint: imagesLeft !== 0 })

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

  const postCount = Math.min(targetPostCount, runCeiling(affordable, priorityPosts.length))
  const plannedPostCount = postCount + priorityPosts.length

  const runPlan = useMemo(
    () =>
      computeRunPlan({
        pillars: preloadedClientData?.contentPillars ?? [],
        targetPostCount: postCount,
        sources: clientSources,
        connections: clientConnections,
      }),
    [preloadedClientData, postCount, clientSources, clientConnections]
  )

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

  useEffect(() => {
    if (step === 'review' && generatedPosts.length > 0 && liveDrafts.length === 0) {
      setStep('done')
    }
  }, [step, generatedPosts.length, liveDrafts.length])

  /**
   * Client switch: one user-event refetch replacing everything client-scoped. Only the latest
   * switch's ticket may write, so a slow answer cannot overwrite a faster switch.
   *
   * WHY as: `clientData` is this app's own route answering with `fetchClientData`'s result
   * (src/app/api/clients/[id]/route.ts:32), which `clientRefreshSchema` leaves unparsed on purpose
   * (src/features/generate/schemas.ts:12) while it validates the sources and connections beside it.
   */
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
        const clientData = parsed.clientData as ClientData
        setPreloadedClientData(clientData)
        setPostType(toPostType(clientData.defaultPostType))
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

  /**
   * Run the stream into the flow's state. A result leaves the last phase on screen until the next
   * replaces it, and is used uncast: `GenerationResult` satisfies `ReviewDraft`, so a drift fails
   * the build. The run's idea goes on the browser's copy, as the route already wrote it on the row.
   * The page is refreshed when the run ends unless aborted (a new run, a cancel or a departure,
   * each navigating on its own), so the counts the server reads next are the ones shown.
   */
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
        targetPostCount: postCount,
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
        toast.error((await readErrorMessage(res)) ?? 'Generation failed')
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
          setLoadingStage((prev) => Math.max(prev, stageIndex(event.stage)))
        } else if (event.type === 'result') {
          setLoadingStage((prev) => Math.max(prev, stageIndex('writing')))
          const generated: ReviewDraft = initialIdea
            ? { ...event.data, post: { ...event.data.post, client_idea_id: initialIdea.id } }
            : event.data
          receivedCount++
          setGeneratedPosts((prev) => [...prev, generated])
          draftVisuals.enqueuePost(generated.post)
        } else if (event.type === 'skipped_pillars') {
          setSkipped(event.skipped)
        } else if (event.type === 'error') {
          runFailed = true
          toast.error(event.message)
        }
      })

      setStep(runFailed && receivedCount === 0 ? 'setup' : 'review')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Generation failed — please retry')
      setStep('setup')
    } finally {
      setIsGenerating(false)
      if (!controller.signal.aborted) router.refresh()
    }
  }

  /**
   * Mark a draft's outcome; it stays in `generatedPosts`, greyed on the rail. The review→done
   * transition is derived in an effect above, since the approve/discard closures go stale across
   * approve-all's sequential loop.
   */
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
   * Once the deletes settle the page is refreshed; an idea's run moves to the client's plain
   * `/generate` instead, since the page sends a generated idea back to Ideas and keys the flow on
   * the idea (src/app/(generate)/generate/page.tsx).
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
        if (initialIdea) router.replace(`/generate?client=${clientId}`)
        else router.refresh()
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

  if (clients.length === 0) return <NoClientsState addClient={addClient} />

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
            postCount={postCount}
            affordable={affordable}
            pool={pool}
            gate={gate}
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

/**
 * A workspace with no client yet. Its one action is refused in place, with the reason, when the
 * person may not add one now (`GatedAction`) — a member, or a workspace in its trial's grace —
 * rather than linking to a setup flow that would send them away.
 */
function NoClientsState({ addClient }: { addClient: PlanGate }) {
  return (
    <EmptyState
      className="flex-1"
      icon={<Icon glyph={UsersGroupRoundedIcon} size="hero" />}
      title="No clients yet"
      description="Add your first client before generating posts."
      action={
        <GatedAction
          href="/clients/new"
          label="Add your first client"
          refusal={addClient.refusal}
          refusalId="no-clients-add-refusal"
          wayOut={addClient.wayOut}
        />
      }
    />
  )
}
