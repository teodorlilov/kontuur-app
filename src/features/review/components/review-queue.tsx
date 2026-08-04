'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { useShell } from '@/components/layout/shell-context'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { BatchScheduleModal } from '@/components/scheduling/batch-schedule-modal'
import { DraftRail } from '@/components/posts/review/draft-rail'
import { WorkColumn } from '@/components/posts/review/work-column'
import { InsightPanel } from '@/components/posts/review/insight-panel'
import { CommitmentBar } from '@/components/posts/review/commitment-bar'
import { ScheduleDialog } from '@/components/posts/review/schedule-dialog'
import { useDraftEdits } from '@/components/posts/review/use-draft-edits'
import { useReviewKeyboard } from '@/components/posts/review/use-review-keyboard'
import { parseSlides } from '@/components/posts/parse-slides'
import { updatePost, deletePost, savePostCopy } from '@/lib/actions/post-actions'
import { slideCopyAt } from '@/features/canvas-editor/lib/slide-copy'
import { rewriteDraft } from '@/lib/rewrite-draft'
import { buildStoredValidation } from '@/lib/validation/stored-validation-schema'
import { countVisualsByStatus, type DraftVisual } from '@/lib/visual/draft-visuals'
import { upsertImageAtPosition } from '@/features/publishing/lib/image-list'
import { TriageBuckets } from './triage-buckets'
import { DiscardToast, DISCARD_TOAST_MS } from './discard-toast'
import { QueueInsightSections } from './queue-insight-sections'
import { SendToClientDialog } from './send-to-client-dialog'
import { useQueueAutosave } from '@/features/review/hooks/use-queue-autosave'
import { useQueueVisuals } from '@/features/review/hooks/use-queue-visuals'
import {
  fallbackValidationData,
  needsSlopFallback,
  toValidationData,
} from '@/features/review/lib/adapt-validation'
import { totalVisualSlots } from '@/lib/visual/visual-backlog'
import { computeTriage, type TriageBucket, type TriagedPost } from '@/features/review/lib/triage'
import { toVisualSlots } from '@/features/review/lib/visual-slots'
import { isoToDateTimeFields, pickNextOpenSlot } from '@/features/review/lib/slot-picker'
import { getMondayISO, getWeekDayKeys, toDateKey } from '@/utils/date-helpers'
import { APPROVAL_TOKEN_EXPIRY_HOURS } from '@/utils/constants'
import type { WeekScheduledPost } from '@/features/review/lib/week-schedule'
import type { DiscardReason } from '@/features/review/lib/discard-reasons'
import type { QueuePost } from '@/features/review/lib/queue-post'
import type { ReviewDraft } from '@/components/posts/review/types'
import type { CanvasDoc } from '@/types/canvas'
import type { CarouselSlide, BestTimePlatform, PostImage, SlopDetection } from '@/types/api'
import type { ValidationData } from '@/types/post'

interface ReviewQueueProps {
  initialPosts: QueuePost[]
  clients: Array<{ id: string; name: string }>
  bestTimeMap: Record<string, BestTimePlatform[] | null>
  /** Slots the clients hold this week and next — the slot picker's occupancy. */
  weekSchedule: WeekScheduledPost[]
  postsPerWeekByClient: Record<string, number>
  /** The server's render instant — triage ages and relative times key off this
   *  so SSR and hydration render identical text. */
  loadedAt: string
}

const EMPTY_ID_SET = new Set<string>()

function toDraft(t: TriagedPost): ReviewDraft {
  return { post: t.post, ...t.validation }
}

/**
 * The queue's state owner: triaged buckets over persisted pending_review
 * posts, with the shared review leaves as the judging surface. Approve and
 * discard are status transitions on real rows — edits autosave, discards get
 * an undo window, and every outcome updates the local list optimistically.
 */
export function ReviewQueue({
  initialPosts,
  clients,
  bestTimeMap,
  weekSchedule,
  postsPerWeekByClient,
  loadedAt,
}: ReviewQueueProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [activeBucket, setActiveBucket] = useState<TriageBucket>('needs_attention')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [view, setView] = useState<'buckets' | 'focus'>('buckets')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [slideIdx, setSlideIdx] = useState(0)
  const { editsFor, setEdits } = useDraftEdits()
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)
  const [batch, setBatch] = useState<{
    posts: QueuePost[]
    assignments: Record<string, { date: string; time: string }>
  } | null>(null)
  const [sendTarget, setSendTarget] = useState<QueuePost | null>(null)
  // Slots taken during this session — the picker must not offer them twice.
  const [sessionScheduled, setSessionScheduled] = useState<WeekScheduledPost[]>([])
  const [slopOverrides, setSlopOverrides] = useState<Record<string, SlopDetection>>({})

  // Triage ages are computed against the server's render instant — a ticking
  // "now" would reshuffle buckets under the reviewer's hands, and a client
  // clock would render different text at hydration than the server did.
  const [now] = useState(() => new Date(loadedAt))

  // The sidebar badge is a per-hard-load server snapshot; this queue owns the
  // live truth, so it keeps the badge honest as posts settle.
  const { setPendingCount } = useShell()
  useEffect(() => {
    setPendingCount(posts.length)
  }, [posts.length, setPendingCount])

  const postsRef = useRef(posts)
  useEffect(() => {
    postsRef.current = posts
  })
  const composeRequestedRef = useRef(new Set<string>())
  // Written by the effect below the visuals hook; read only inside async callbacks.
  const focusedPostIdRef = useRef('')
  const recomposeRef = useRef<
    (source: { post_type: string; slides_json: unknown; caption: string | null }, images: PostImage[]) => void
  >(() => {})
  const slopRequestedRef = useRef(new Set<string>())
  // Discards pending their undo window: id → commit. Unmount commits them all —
  // leaving the tab must not resurrect a post the reviewer already dismissed.
  const pendingDiscardsRef = useRef(new Map<string, () => void>())
  useEffect(() => {
    const pending = pendingDiscardsRef.current
    return () => {
      for (const commit of pending.values()) commit()
      pending.clear()
    }
  }, [])

  const validationFor = useCallback(
    (post: QueuePost): ValidationData => {
      const base =
        toValidationData(post.validation_json) ?? fallbackValidationData(post.quality_score_avg)
      const slop = slopOverrides[post.id]
      return slop ? { ...base, slop } : base
    },
    [slopOverrides]
  )

  const triaged = useMemo(() => {
    const scoped = selectedClientId
      ? posts.filter((p) => p.client_id === selectedClientId)
      : posts
    return computeTriage(
      scoped.map((post) => ({ post, validation: validationFor(post) })),
      now
    )
  }, [posts, selectedClientId, validationFor, now])

  const bucketItems = useMemo(
    () => triaged.filter((t) => t.bucket === activeBucket),
    [triaged, activeBucket]
  )
  const counts = useMemo(() => {
    const byBucket = { needs_attention: 0, ready: 0, waiting_on_client: 0 }
    for (const t of triaged) byBucket[t.bucket] += 1
    return byBucket
  }, [triaged])

  const focused = bucketItems.find((t) => t.post.id === focusedId) ?? bucketItems[0]
  const focusedIndex = focused ? bucketItems.indexOf(focused) : -1
  const focusedPostId = focused?.post.id ?? ''

  // Keep the focused id valid as posts settle; an emptied bucket exits focus.
  // Adjusted during render (the documented pattern), not in an effect.
  if (view === 'focus') {
    if (!focused && focusedId !== null) {
      setView('buckets')
      setFocusedId(null)
    } else if (focused && focused.post.id !== focusedId) {
      setFocusedId(focused.post.id)
      setSlideIdx(0)
    }
  }

  // ── Persistence ──
  const autosave = useQueueAutosave(async (postId, edits) => {
    const result = await savePostCopy(postId, {
      caption: edits.caption,
      slides_json: edits.slidesJson,
    })
    if (!result.ok) {
      toast.error('Failed to save edits')
      return
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, caption: edits.caption, slides_json: edits.slidesJson } : p
      )
    )
    // Re-bake composed slides with the fresh copy — only while the visuals
    // hook is still bound to this post; a text-only save is the safe fallback.
    const post = postsRef.current.find((p) => p.id === postId)
    if (post && postId === focusedPostIdRef.current) {
      recomposeRef.current(
        { post_type: post.post_type, slides_json: edits.slidesJson, caption: edits.caption },
        post.images
      )
    }
  })

  // ── Visuals (bound to the focused post) ──
  // Captured per render: a late response after a focus switch still lands on
  // the post whose closure requested it.
  function mergeImage(image: PostImage) {
    const targetId = focusedPostId
    setPosts((prev) =>
      prev.map((p) =>
        p.id === targetId ? { ...p, images: upsertImageAtPosition(p.images, image) } : p
      )
    )
  }

  const focusedEdits = focused ? editsFor(toDraft(focused)) : null
  const copySource = focused
    ? {
        post_type: focused.post.post_type,
        slides_json: focusedEdits?.slidesJson ?? focused.post.slides_json,
        caption: focusedEdits?.caption ?? focused.post.caption,
      }
    : null

  const visuals = useQueueVisuals({ postId: focusedPostId, copySource, onImage: mergeImage })
  const visualsRecompose = visuals.recompose
  useEffect(() => {
    focusedPostIdRef.current = focusedPostId
    recomposeRef.current = visualsRecompose
  }, [focusedPostId, visualsRecompose])

  const visualsByPost = useMemo(() => {
    const map: Record<string, DraftVisual[]> = {}
    for (const t of triaged) {
      const isFocused = t.post.id === focusedPostId
      map[t.post.id] = toVisualSlots(
        t.post.images,
        isFocused ? visuals.generatingPositions : [],
        isFocused ? visuals.composingPositions : [],
        totalVisualSlots(t.post)
      )
    }
    return map
  }, [triaged, focusedPostId, visuals.generatingPositions, visuals.composingPositions])

  // Cron art arrives clean — bake the copy onto it on first open, once per
  // post per session. Only AI-generated files (visual-*.jpg) without a canvas
  // doc qualify: a user-uploaded creative is finished work, never painted over.
  useEffect(() => {
    const target = focused?.post
    if (!target || composeRequestedRef.current.has(target.id)) return
    const composed = new Set(target.composedPositions)
    const pending = target.images.filter(
      (image) => image.fileName?.startsWith('visual-') && !composed.has(image.position)
    )
    if (pending.length === 0) return
    composeRequestedRef.current.add(target.id)
    const source = {
      post_type: target.post_type,
      slides_json: target.slides_json,
      caption: target.caption,
    }
    void (async () => {
      const { composePersistedPosition } = await import('@/features/canvas-editor/lib/auto-compose')
      for (const image of pending) {
        try {
          const result = await composePersistedPosition({
            postId: target.id,
            position: image.position,
            image,
            slideCopy: slideCopyAt(source, image.position),
          })
          if (result) {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === target.id ? { ...p, images: upsertImageAtPosition(p.images, result) } : p
              )
            )
          }
        } catch (err) {
          console.error(
            `[review] compose-on-open for post ${target.id} position ${image.position} failed:`,
            err
          )
        }
      }
    })()
  }, [focused])

  // Legacy rows without a stored human score get one detect-slop pass on focus.
  useEffect(() => {
    const post = focused?.post
    if (!post || !needsSlopFallback(post.validation_json)) return
    if (slopRequestedRef.current.has(post.id)) return
    slopRequestedRef.current.add(post.id)
    const slides = parseSlides(post.slides_json)
    const text =
      post.post_type === 'carousel'
        ? `${post.caption ?? ''}\n\n${slides.map((s) => `${s.headline}\n${s.body}`).join('\n\n')}`
        : (post.caption ?? '')
    void fetch('/api/ai/detect-slop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(async (res) => {
        if (!res.ok) return
        const slop = (await res.json()) as SlopDetection
        setSlopOverrides((prev) => ({ ...prev, [post.id]: slop }))
      })
      .catch(() => {
        // Authenticity stays unmeasured — non-critical.
      })
  }, [focused])

  // ── Navigation ──
  function focusDraft(postId: string) {
    void autosave.flush()
    setFocusedId(postId)
    setSlideIdx(0)
    setView('focus')
  }

  function focusNeighbour(offset: 1 | -1) {
    if (focusedIndex < 0) return
    const next = bucketItems[focusedIndex + offset]
    if (next) {
      void autosave.flush()
      setFocusedId(next.post.id)
      setSlideIdx(0)
    }
  }

  // ── Scheduling context ──
  const weekStart = useMemo(() => getMondayISO(now), [now])

  const occupiedSlotsByClient = useMemo(() => {
    const byClient = new Map<string, string[]>()
    for (const slot of [...weekSchedule, ...sessionScheduled]) {
      const list = byClient.get(slot.client_id) ?? []
      list.push(slot.scheduled_at)
      byClient.set(slot.client_id, list)
    }
    return byClient
  }, [weekSchedule, sessionScheduled])

  function nextSlotFor(post: QueuePost, occupied: string[]): string | null {
    return pickNextOpenSlot({
      platform: post.platform,
      bestTimes: bestTimeMap[post.client_id] ?? null,
      postsPerWeek: postsPerWeekByClient[post.client_id] ?? 0,
      occupiedSlots: occupied,
      now: new Date(),
    })
  }

  // ── Approve ──
  async function executeApprove(postId: string, scheduledAt: string | null): Promise<boolean> {
    const target = triaged.find((t) => t.post.id === postId)
    if (!target) return false
    const edits = editsFor(toDraft(target))
    autosave.cancel()
    const result = await updatePost(postId, {
      caption: edits.caption,
      slides_json: edits.slidesJson,
      status: scheduledAt ? 'scheduled' : 'approved',
      scheduled_at: scheduledAt,
    })
    if (!result.ok) {
      toast.error('Failed to approve post')
      return false
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    setApprovedCount((c) => c + 1)
    if (scheduledAt) {
      setSessionScheduled((prev) => [
        ...prev,
        { client_id: target.post.client_id, scheduled_at: scheduledAt },
      ])
    }
    return true
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

  function openBatch(items: QueuePost[]) {
    if (items.length === 0) return
    // Prefill each row with the picker's suggestion, consuming slots per
    // client as it goes — every row stays editable in the modal.
    const occupiedCopy = new Map<string, string[]>()
    const assignments: Record<string, { date: string; time: string }> = {}
    for (const post of items) {
      const occupied =
        occupiedCopy.get(post.client_id) ??
        [...(occupiedSlotsByClient.get(post.client_id) ?? [])]
      const iso = nextSlotFor(post, occupied)
      if (iso) {
        occupied.push(iso)
        assignments[post.id] = isoToDateTimeFields(iso)
      }
      occupiedCopy.set(post.client_id, occupied)
    }
    setBatch({ posts: items, assignments })
  }

  function handleBatchComplete() {
    if (!batch) return
    const scheduledIds = new Set(batch.posts.map((p) => p.id))
    setPosts((prev) => prev.filter((p) => !scheduledIds.has(p.id)))
    setApprovedCount((c) => c + batch.posts.length)
    // Best-effort occupancy: the prefilled slots stand in for whatever the
    // reviewer confirmed — the server's truth returns on the next load.
    setSessionScheduled((prev) => [
      ...prev,
      ...batch.posts.flatMap((post) => {
        const assignment = batch.assignments[post.id]
        return assignment
          ? [{ client_id: post.client_id, scheduled_at: `${assignment.date}T${assignment.time}` }]
          : []
      }),
    ])
    setBatch(null)
  }

  // ── Discard (undo window, then commit) ──
  function discardPost(postId: string) {
    const post = postsRef.current.find((p) => p.id === postId)
    if (!post || pendingDiscardsRef.current.has(postId)) return
    autosave.cancel()
    setPosts((prev) => prev.filter((p) => p.id !== postId))

    let settled = false
    const commit = (reason?: DiscardReason) => {
      if (settled) return
      settled = true
      pendingDiscardsRef.current.delete(postId)
      void deletePost(postId, reason ? { reason } : undefined).then((result) => {
        if (!result.ok) {
          toast.error('Failed to delete post')
          setPosts((prev) => (prev.some((p) => p.id === postId) ? prev : [...prev, post]))
        }
      })
    }
    const restore = () => {
      if (settled) return
      settled = true
      pendingDiscardsRef.current.delete(postId)
      setPosts((prev) => (prev.some((p) => p.id === postId) ? prev : [...prev, post]))
    }
    pendingDiscardsRef.current.set(postId, commit)

    const toastId = toast.custom(
      () => (
        <DiscardToast
          title="Post deleted"
          onUndo={() => {
            toast.dismiss(toastId)
            restore()
          }}
          onReason={(reason) => {
            toast.dismiss(toastId)
            commit(reason)
          }}
        />
      ),
      { duration: DISCARD_TOAST_MS, onAutoClose: () => commit() }
    )
  }

  // ── Rewrite (persisted) ──
  async function handleRewrite() {
    if (!focused || !focusedEdits) return
    const draft = toDraft(focused)
    setRewriting(true)
    const outcome = await rewriteDraft({
      post: draft.post,
      caption: focusedEdits.caption,
      slidesJson: focusedEdits.slidesJson,
      aiTells: focused.validation.slop.ai_tells_found,
      qualityIssues: focused.validation.criteria.issues.map((i) => `${i.type}: ${i.description}`),
    })
    if (!outcome) {
      setRewriting(false)
      toast.error('Failed to rewrite post')
      return
    }
    const postId = focused.post.id
    const storedValidation = buildStoredValidation(outcome.validation)
    const persisted = await updatePost(postId, {
      caption: outcome.updatedPost.caption ?? '',
      slides_json: outcome.updatedPost.slides_json,
      quality_score_avg: outcome.updatedPost.quality_score_avg ?? undefined,
      was_rewritten: true,
      rewrite_count: outcome.updatedPost.rewrite_count ?? 1,
      validation_json: storedValidation,
    })
    setRewriting(false)
    if (!persisted.ok) {
      toast.error('Failed to save the rewrite')
      return
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              caption: outcome.updatedPost.caption,
              slides_json: outcome.updatedPost.slides_json,
              quality_score_avg: outcome.updatedPost.quality_score_avg ?? p.quality_score_avg,
              was_rewritten: true,
              rewrite_count: outcome.updatedPost.rewrite_count ?? p.rewrite_count + 1,
              validation_json: storedValidation,
            }
          : p
      )
    )
    // The rewrite replaces the working copy too — stale edits would resurrect
    // the pre-rewrite text on approve. Fresh slop is stored, so drop overrides.
    setEdits(postId, {
      caption: outcome.updatedPost.caption ?? '',
      slidesJson: outcome.updatedPost.slides_json,
    })
    setSlopOverrides((prev) => {
      const next = { ...prev }
      delete next[postId]
      return next
    })
    toast.success('Post rewritten')
    const post = postsRef.current.find((p) => p.id === postId)
    if (post) {
      visuals.recompose(
        {
          post_type: post.post_type,
          slides_json: outcome.updatedPost.slides_json,
          caption: outcome.updatedPost.caption,
        },
        post.images
      )
    }
  }

  useReviewKeyboard({
    enabled: view === 'focus' && !!focused && !scheduleTarget,
    onPrev: () => focusNeighbour(-1),
    onNext: () => focusNeighbour(1),
    onApprove: () => focused && setScheduleTarget(focused.post.id),
    onDiscard: () => focused && discardPost(focused.post.id),
  })

  function handleSent(postId: string) {
    const expiresAt = new Date(Date.now() + APPROVAL_TOKEN_EXPIRY_HOURS * 3_600_000).toISOString()
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, approval: { status: 'pending', expiresAt } } : p))
    )
    setSendTarget(null)
  }

  // ── Render ──
  const scheduleTargetPost = scheduleTarget
    ? (posts.find((p) => p.id === scheduleTarget) ?? null)
    : null

  const scheduleWeekContext = useMemo(() => {
    if (!scheduleTargetPost) return undefined
    const occupied = occupiedSlotsByClient.get(scheduleTargetPost.client_id) ?? []
    const countsByDay = getWeekDayKeys(weekStart).map(
      (dayKey) => occupied.filter((iso) => toDateKey(new Date(iso)) === dayKey).length
    )
    return {
      weekStart,
      countsByDay,
      target: postsPerWeekByClient[scheduleTargetPost.client_id] ?? 0,
      nextOpenSlot: pickNextOpenSlot({
        platform: scheduleTargetPost.platform,
        bestTimes: bestTimeMap[scheduleTargetPost.client_id] ?? null,
        postsPerWeek: postsPerWeekByClient[scheduleTargetPost.client_id] ?? 0,
        occupiedSlots: occupied,
        now: new Date(),
      }),
    }
  }, [scheduleTargetPost, occupiedSlotsByClient, weekStart, bestTimeMap, postsPerWeekByClient])
  const visualTallies = useMemo(() => {
    let failed = 0
    let composing = 0
    for (const t of bucketItems) {
      const tally = countVisualsByStatus(visualsByPost[t.post.id])
      failed += tally.failed
      composing += tally.composing
    }
    return { failed, composing }
  }, [bucketItems, visualsByPost])

  const tabs: Array<TabItem<TriageBucket>> = [
    {
      id: 'needs_attention',
      label: 'Needs attention',
      count: counts.needs_attention,
      warn: counts.needs_attention > 0,
    },
    { id: 'ready', label: 'Ready to ship', count: counts.ready },
    { id: 'waiting_on_client', label: 'Waiting on client', count: counts.waiting_on_client },
  ]
  const readyPosts = triaged.filter((t) => t.bucket === 'ready').map((t) => t.post)
  const clientOptions = [
    { value: '', label: 'All clients' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Review queue' }]}
        title="Review"
        count={triaged.length}
        meta={
          <HeaderMeta
            parts={[
              triaged.length === 0 ? 'Nothing waiting on you' : null,
              counts.needs_attention > 0 && (
                <MetaFlag>{counts.needs_attention} need your judgment</MetaFlag>
              ),
              approvedCount > 0 && `${approvedCount} approved this session`,
            ]}
          />
        }
        actions={
          <>
            {clients.length > 1 && (
              <SelectControl
                label="Client"
                value={selectedClientId ?? ''}
                options={clientOptions}
                onChange={(id) => setSelectedClientId(id || null)}
              />
            )}
            <Button
              size="sm"
              disabled={readyPosts.length === 0}
              onClick={() => openBatch(readyPosts)}
            >
              Schedule {readyPosts.length} ready
            </Button>
          </>
        }
        tabs={
          <TabRail
            items={tabs}
            active={activeBucket}
            onSelect={(bucket) => {
              setActiveBucket(bucket)
              setView('buckets')
            }}
            label="Review buckets"
          />
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
          {view === 'buckets' || !focused || !focusedEdits ? (
            <TriageBuckets
              bucket={activeBucket}
              items={bucketItems}
              visualsByPost={visualsByPost}
              now={now}
              onOpen={focusDraft}
              onApprove={setScheduleTarget}
              onScheduleAll={() => openBatch(readyPosts)}
              onRemind={(postId) =>
                setSendTarget(posts.find((p) => p.id === postId) ?? null)
              }
            />
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-text2"
                  onClick={() => setView('buckets')}
                >
                  <ChevronLeft aria-hidden className="mr-1 size-3.5" strokeWidth={1.8} />
                  All posts
                </Button>
                <span className="text-caption text-text3">
                  {focused.post.client_name} · reviewing {focusedIndex + 1} of {bucketItems.length}
                </span>
              </div>
              <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_320px] min-[1200px]:grid-cols-[240px_minmax(0,1fr)_320px]">
                <div className="max-[1199px]:hidden">
                  <DraftRail
                    posts={bucketItems.map(toDraft)}
                    approvedIds={EMPTY_ID_SET}
                    discardedIds={EMPTY_ID_SET}
                    visualsByDraft={visualsByPost}
                    focusedId={focused.post.id}
                    onFocus={focusDraft}
                  />
                </div>
                <WorkColumn
                  key={focused.post.id}
                  post={toDraft(focused).post}
                  visuals={visualsByPost[focused.post.id]}
                  positionInRun={`${focusedIndex + 1} of ${bucketItems.length}`}
                  metaLine={[
                    focused.post.client_name,
                    focused.post.pillar,
                    focused.post.platform,
                    focused.post.post_type,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  workingCaption={focusedEdits.caption}
                  workingSlidesJson={focusedEdits.slidesJson}
                  slideIdx={slideIdx}
                  canPrev={focusedIndex > 0}
                  canNext={focusedIndex < bucketItems.length - 1}
                  onPrev={() => focusNeighbour(-1)}
                  onNext={() => focusNeighbour(1)}
                  onSlideIdx={setSlideIdx}
                  onCaptionChange={(caption) => {
                    const edits = { ...focusedEdits, caption }
                    setEdits(focused.post.id, edits)
                    autosave.schedule(focused.post.id, edits)
                  }}
                  onSlidesChange={(slides: CarouselSlide[]) => {
                    const edits = { ...focusedEdits, slidesJson: slides }
                    setEdits(focused.post.id, edits)
                    autosave.schedule(focused.post.id, edits)
                  }}
                  onRegenerateVisual={(position) => void visuals.generate([position])}
                  onReplaceVisual={(position, file) => visuals.replaceImage(position, file)}
                  onEditedVisual={() => {
                    // Post-target saves come back through onSavedImage; nothing draft-side.
                  }}
                  onApplyStyleToAll={(post, sourcePosition, doc: CanvasDoc) =>
                    void visuals.applyStyle(
                      doc,
                      sourcePosition,
                      {
                        post_type: post.post_type,
                        slides_json: post.slides_json,
                        caption: post.caption,
                      },
                      postsRef.current.find((p) => p.id === focused.post.id)?.images ?? []
                    )
                  }
                  editorTarget={(position) => ({
                    kind: 'post',
                    postId: focused.post.id,
                    position,
                  })}
                  onSavedImage={mergeImage}
                />
                <InsightPanel
                  key={`insight-${focused.post.id}`}
                  post={toDraft(focused).post}
                  validation={focused.validation}
                  rewriting={rewriting}
                  onRewrite={() => void handleRewrite()}
                  extraSections={<QueueInsightSections triaged={focused} now={now} />}
                />
              </div>
              <CommitmentBar
                approvedCount={approvedCount}
                totalCount={approvedCount + bucketItems.length}
                liveCount={bucketItems.length}
                failedVisuals={visualTallies.failed}
                composingVisuals={visualTallies.composing}
                approving={approving}
                leadingActions={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-text2"
                    onClick={() => setSendTarget(focused.post)}
                  >
                    Send to client
                  </Button>
                }
                onSkip={() => focusNeighbour(1)}
                onDiscard={() => discardPost(focused.post.id)}
                onApproveAll={() => openBatch(bucketItems.map((t) => t.post))}
                onApproveNext={() => setScheduleTarget(focused.post.id)}
              />
            </>
          )}
        </div>
      </main>

      <ScheduleDialog
        open={scheduleTarget !== null}
        platform={scheduleTargetPost?.platform ?? null}
        bestTimeData={scheduleTargetPost ? (bestTimeMap[scheduleTargetPost.client_id] ?? null) : null}
        approving={approving}
        weekContext={scheduleWeekContext}
        onConfirm={(scheduledAt) => void handleScheduleConfirm(scheduledAt)}
        onClose={() => setScheduleTarget(null)}
      />

      <BatchScheduleModal
        open={batch !== null}
        onClose={() => setBatch(null)}
        posts={(batch?.posts ?? []).map((p) => ({
          id: p.id,
          client_name: p.client_name,
          caption: p.caption,
          platform: p.platform,
        }))}
        initialAssignments={batch?.assignments}
        onComplete={handleBatchComplete}
      />

      <SendToClientDialog
        post={sendTarget}
        onClose={() => setSendTarget(null)}
        onSent={handleSent}
      />
    </div>
  )
}
