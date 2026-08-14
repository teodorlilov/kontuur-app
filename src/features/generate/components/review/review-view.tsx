'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/layout/page-header/segmented'
import { useBestTime } from '@/components/posts/use-best-time'
import { SkippedBanner } from './skipped-banner'
import { ReviewGrid } from '@/components/posts/review/review-grid'
import { DraftRail } from '@/components/posts/review/draft-rail'
import { WorkColumn } from '@/components/posts/review/work-column'
import { InsightPanel } from '@/components/posts/review/insight-panel'
import { CommitmentBar } from '@/components/posts/review/commitment-bar'
import { ScheduleDialog } from '@/components/posts/review/schedule-dialog'
import { useDraftEdits } from '@/components/posts/review/use-draft-edits'
import { useReviewKeyboard } from '@/components/posts/review/use-review-keyboard'
import type { ReviewDraft } from '@/components/posts/review/types'
import { approveDraft } from '@/features/generate/lib/approve-draft'
import { rewriteDraft } from '@/lib/rewrite-draft'
import {
  completedDraftImages,
  countVisualsByStatus,
  type DraftVisual,
} from '@/lib/visual/draft-visuals'
import type { PillarAllocation } from '@/features/generate/lib/run-plan'
import type { SkippedPillar } from '@/ai/research/types'
import type { CanvasDoc } from '@/types/canvas'
import type { CarouselSlide } from '@/types/api'
import type { PostData, ValidationData } from '@/types/post'

type ReviewLayout = 'all' | 'focus'

/** The run's fixed facts, threaded into the header meta and the work column. */
interface RunContext {
  clientName: string
  platform: string
  postType: string
  slideCount: number
  targetPostCount: number
}

interface ReviewViewProps {
  posts: ReviewDraft[]
  approvedIds: Set<string>
  discardedIds: Set<string>
  skippedPillars: SkippedPillar[]
  allocation: PillarAllocation[]
  clientId: string
  /**
   * The agency zone, arriving as a prop rather than from `useShell`.
   *
   * This flow renders under `(generate)/layout.tsx`, which has AuthProvider and the
   * contour field and no ShellProvider — so the hook every other surface uses is simply
   * not available here. That is why the scheduling path in this route group kept
   * resolving wall-clock times in the browser's zone.
   */
  timeZone: string
  runContext: RunContext
  visualsByDraft: Record<string, DraftVisual[]>
  onRegenerateVisual: (post: PostData, position: number) => void
  onReplaceVisual: (post: PostData, position: number, file: File) => Promise<boolean>
  onEditedVisual: (draftId: string, visual: DraftVisual) => void
  onApplyStyleToAll: (post: PostData, sourcePosition: number, doc: CanvasDoc) => void
  /** Post-POST bookkeeping — the POST itself happens here, where edits live. */
  /** `savedPostId` is the row the POST created — the draft id does not exist in `posts`. */
  onApproved: (postId: string, savedPostId: string) => void
  onDiscarded: (postId: string) => void
  onRewritten: (postId: string, updatedPost: PostData, validation: ValidationData) => void
  onNewRun: () => void
}

/**
 * Step 3 — the review shell and everything review-scoped: the All|Focus
 * layout, the focused draft, per-draft edits, the schedule dialog, and the
 * approve execution (single and bulk — both go through approveDraft, with
 * edits riding along).
 */
export function ReviewView({
  posts,
  approvedIds,
  discardedIds,
  skippedPillars,
  allocation,
  clientId,
  timeZone,
  runContext,
  visualsByDraft,
  onRegenerateVisual,
  onReplaceVisual,
  onEditedVisual,
  onApplyStyleToAll,
  onApproved,
  onDiscarded,
  onRewritten,
  onNewRun,
}: ReviewViewProps) {
  // A one-draft run opens straight in Focus: the All grid's job is comparison
  // and triage, and one post has nothing to compare. The toggle stays — this
  // is a default, not a wall.
  const [layout, setLayout] = useState<ReviewLayout>(posts.length === 1 ? 'focus' : 'all')
  const [focusedId, setFocusedId] = useState(posts[0]?.post.id ?? '')
  const [slideIdx, setSlideIdx] = useState(0)
  const { editsFor, setEdits } = useDraftEdits()
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  const { bestTimeData } = useBestTime(clientId)

  const liveDrafts = useMemo(
    () => posts.filter((p) => !approvedIds.has(p.post.id) && !discardedIds.has(p.post.id)),
    [posts, approvedIds, discardedIds]
  )

  const focused = liveDrafts.find((p) => p.post.id === focusedId) ?? liveDrafts[0]
  const focusedIndex = focused ? liveDrafts.indexOf(focused) : -1

  // Keep the focused id valid as drafts settle — clamp to the nearest live one.
  /* eslint-disable react-hooks/set-state-in-effect -- `focused` already falls back for
     render; this persists the clamp so the id stops pointing at a draft that is gone. */
  useEffect(() => {
    if (focused && focused.post.id !== focusedId) {
      setFocusedId(focused.post.id)
      setSlideIdx(0)
    }
  }, [focused, focusedId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Averaged over scored posts only: an unjudged post has no number to contribute,
  // and `?? 0` would drag the run's average down with a score nobody assigned.
  const scores = posts
    .map((p) => p.scores.overall_score)
    .filter((s): s is number => s !== null)
  const averageQuality =
    scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null

  const visualTallies = useMemo(() => {
    let failed = 0
    let composing = 0
    for (const item of liveDrafts) {
      const counts = countVisualsByStatus(visualsByDraft[item.post.id])
      failed += counts.failed
      composing += counts.composing
    }
    return { failed, composing }
  }, [liveDrafts, visualsByDraft])

  function focusDraft(postId: string) {
    setFocusedId(postId)
    setSlideIdx(0)
  }

  function focusNeighbour(offset: 1 | -1) {
    if (focusedIndex < 0) return
    const next = liveDrafts[focusedIndex + offset]
    if (next) focusDraft(next.post.id)
  }

  /** The one approve execution: POST with edits, then the owner's bookkeeping. */
  async function executeApprove(postId: string, scheduledAt: string | null): Promise<boolean> {
    const item = posts.find((p) => p.post.id === postId)
    if (!item) return false
    const edits = editsFor(item)
    const savedPostId = await approveDraft({
      post: item.post,
      caption: edits.caption,
      slidesJson: edits.slidesJson,
      scheduledAt,
      images: completedDraftImages(visualsByDraft[postId]),
    })
    if (savedPostId) {
      onApproved(postId, savedPostId)
    } else {
      toast.error('Failed to approve post')
    }
    return savedPostId !== null
  }

  async function handleScheduleConfirm(scheduledAt: string | null) {
    if (!scheduleTarget) return
    setApproving(true)
    const ok = await executeApprove(scheduleTarget, scheduledAt)
    setApproving(false)
    if (ok) {
      toast.success(scheduledAt ? 'Approved · scheduled' : 'Post approved')
      setScheduleTarget(null)
    }
  }

  async function handleApproveAll() {
    const remaining = [...liveDrafts]
    setApproving(true)
    let approved = 0
    for (const item of remaining) {
      if (await executeApprove(item.post.id, null)) approved++
    }
    setApproving(false)
    if (approved > 0) toast.success(`${approved} post${approved === 1 ? '' : 's'} approved`)
  }

  function handleRewritten(postId: string, updatedPost: PostData, validation: ValidationData) {
    // The rewrite replaces the working copy too — stale edits would resurrect
    // the pre-rewrite text on approve.
    setEdits(postId, { caption: updatedPost.caption ?? '', slidesJson: updatedPost.slides_json })
    onRewritten(postId, updatedPost, validation)
  }

  /** Rewrite the focused draft's working copy — triggered from the insight panel. */
  async function handleRewrite() {
    if (!focused) return
    const edits = editsFor(focused)
    setRewriting(true)
    const outcome = await rewriteDraft({
      post: focused.post,
      caption: edits.caption,
      slidesJson: edits.slidesJson,
      aiTells: focused.slop.ai_tells_found,
      qualityIssues: focused.criteria.issues.map((i) => `${i.type}: ${i.description}`),
    })
    setRewriting(false)
    if (!outcome) {
      toast.error('Failed to rewrite post')
      return
    }
    toast.success('Post rewritten')
    handleRewritten(focused.post.id, outcome.updatedPost, outcome.validation)
  }

  useReviewKeyboard({
    enabled: layout === 'focus' && !!focused && !scheduleTarget,
    onPrev: () => focusNeighbour(-1),
    onNext: () => focusNeighbour(1),
    onApprove: () => focused && setScheduleTarget(focused.post.id),
    onDiscard: () => focused && onDiscarded(focused.post.id),
  })

  const focusedEdits = focused ? editsFor(focused) : null

  return (
    <div className="rv mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline font-semibold text-ink">
            {liveDrafts.length === 0
              ? 'Everything reviewed'
              : `${liveDrafts.length} draft${liveDrafts.length === 1 ? '' : 's'} ready`}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text2">
            {[
              runContext.clientName,
              runContext.platform,
              runContext.postType === 'carousel'
                ? `Carousel · ${runContext.slideCount} slides`
                : 'Single image',
              // The denominator matters: one scored post among five unjudged
              // must not present itself as the run's average.
              averageQuality === null
                ? null
                : `Average quality ${averageQuality.toFixed(1)}${
                    scores.length < posts.length ? ` (${scores.length} of ${posts.length} scored)` : ''
                  }`,
            ]
              .filter((part): part is string => part !== null)
              .map((part, i) => (
                <span key={part} className="flex items-center gap-2">
                  {i > 0 && <i aria-hidden className="size-[3px] rounded-full bg-line2" />}
                  {part}
                </span>
              ))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<ReviewLayout>
            label="Review layout"
            value={layout}
            options={[
              { value: 'all', label: 'All' },
              { value: 'focus', label: 'Focus' },
            ]}
            onChange={setLayout}
          />
          <Button variant="secondary" size="sm" onClick={onNewRun}>
            New run
          </Button>
          {/* In Focus the bar carries Approve all and never scrolls away — a
              second copy here would be two buttons for one action. */}
          {layout === 'all' && liveDrafts.length > 0 && (
            <Button size="sm" disabled={approving} onClick={() => void handleApproveAll()}>
              Approve all {liveDrafts.length}
            </Button>
          )}
        </div>
      </div>

      <SkippedBanner
        skippedPillars={skippedPillars}
        allocation={allocation}
        requested={runContext.targetPostCount}
        received={posts.length}
        clientId={clientId}
      />

      {/* ── Layouts ── */}
      {layout === 'all' || !focused || !focusedEdits ? (
        <ReviewGrid
          drafts={liveDrafts}
          visualsByDraft={visualsByDraft}
          approvedCount={approvedIds.size}
          discardedCount={discardedIds.size}
          onOpen={(postId) => {
            focusDraft(postId)
            setLayout('focus')
          }}
          onApprove={setScheduleTarget}
        />
      ) : (
        <>
          <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_320px] min-[1200px]:grid-cols-[240px_minmax(0,1fr)_320px]">
            <div className="max-[1199px]:hidden">
              <DraftRail
                posts={posts}
                approvedIds={approvedIds}
                discardedIds={discardedIds}
                visualsByDraft={visualsByDraft}
                focusedId={focused.post.id}
                onFocus={focusDraft}
              />
            </div>
            <WorkColumn
              key={focused.post.id}
              post={focused.post}
              visuals={visualsByDraft[focused.post.id]}
              positionInRun={`${focusedIndex + 1} of ${liveDrafts.length}`}
              // The draft's own platform, not the run's — a brief can override it.
              // Requested posts carry no pillar; their origin is the label.
              metaLine={[
                focused.post.priority ? 'Client idea' : focused.post.pillar,
                focused.post.platform ?? runContext.platform,
                runContext.postType,
              ]
                .filter(Boolean)
                .join(' · ')}
              workingCaption={focusedEdits.caption}
              workingSlidesJson={focusedEdits.slidesJson}
              slideIdx={slideIdx}
              canPrev={focusedIndex > 0}
              canNext={focusedIndex < liveDrafts.length - 1}
              onPrev={() => focusNeighbour(-1)}
              onNext={() => focusNeighbour(1)}
              onSlideIdx={setSlideIdx}
              onCaptionChange={(caption) =>
                setEdits(focused.post.id, { ...focusedEdits, caption })
              }
              onSlidesChange={(slides: CarouselSlide[]) =>
                setEdits(focused.post.id, { ...focusedEdits, slidesJson: slides })
              }
              onRegenerateVisual={(position) => onRegenerateVisual(focused.post, position)}
              onReplaceVisual={(position, file) => onReplaceVisual(focused.post, position, file)}
              onEditedVisual={onEditedVisual}
              onApplyStyleToAll={onApplyStyleToAll}
            />
            {/* Stacks under the work column below 900px — never hidden: the
                quality and source panel is the reason this screen is a review. */}
            <InsightPanel
              // Keyed like the work column so disclosure state resets per
              // draft — prefixed, because the sibling WorkColumn already
              // holds the bare post id and sibling keys must be unique.
              key={`insight-${focused.post.id}`}
              post={focused.post}
              validation={focused}
              rewriting={rewriting}
              onRewrite={() => void handleRewrite()}
            />
          </div>
          <CommitmentBar
            approvedCount={approvedIds.size}
            totalCount={posts.length}
            liveCount={liveDrafts.length}
            failedVisuals={visualTallies.failed}
            composingVisuals={visualTallies.composing}
            approving={approving}
            onSkip={() => focusNeighbour(1)}
            onDiscard={() => onDiscarded(focused.post.id)}
            onApproveAll={() => void handleApproveAll()}
            onApproveNext={() => setScheduleTarget(focused.post.id)}
          />
        </>
      )}

      <ScheduleDialog
        open={scheduleTarget !== null}
        // Resolved from the target draft like requestedDate — its brief may have
        // overridden the run platform.
        platform={
          posts.find((p) => p.post.id === scheduleTarget)?.post.platform ?? runContext.platform
        }
        bestTimeData={bestTimeData}
        approving={approving}
        requestedDate={posts.find((p) => p.post.id === scheduleTarget)?.post.target_date ?? null}
        timeZone={timeZone}
        onConfirm={(scheduledAt) => void handleScheduleConfirm(scheduledAt)}
        onClose={() => setScheduleTarget(null)}
      />
    </div>
  )
}
