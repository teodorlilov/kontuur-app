'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Spinner } from '@/components/ui/spinner'
import { submitApproval } from '@/features/approval-portal/actions/approval-actions'
import { ReviewHeader } from '@/features/approval-portal/components/approval-header'
import { PostList } from '@/features/approval-portal/components/post-list'
import { PostDetail } from '@/features/approval-portal/components/post-detail'
import type { ApprovalBatchData, ApprovalPostData } from '@/types/api'
import type {
  ApprovalPostStatus,
  ApprovalFilter,
} from '@/features/approval-portal/components/types'

type PageState = 'loading' | 'error' | 'review' | 'submitted'

/** Format a date range string from the posts' scheduled_at values. */
function formatWeekRange(posts: ApprovalPostData[]): string {
  const dates = posts
    .map((p) => p.scheduled_at)
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime())

  if (dates.length === 0) return ''
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }
  return `${dates[0]!.toLocaleDateString('en-US', opts)} – ${dates[dates.length - 1]!.toLocaleDateString('en-US', opts)}`
}

/** Derive the dominant platform from posts (most common). */
function derivePlatform(posts: ApprovalPostData[]): string {
  const platforms = posts.map((p) => p.platform).filter(Boolean)
  return platforms[0] ?? 'Social'
}

/** Count posts with a given status. */
function countByStatus(
  statuses: Map<string, ApprovalPostStatus>,
  target: ApprovalPostStatus
): number {
  let count = 0
  statuses.forEach((s) => {
    if (s === target) count++
  })
  return count
}

/** Initialize post statuses — all pending for fresh batches, or restored for already-submitted. */
function initStatuses(
  posts: ApprovalPostData[],
  batchStatus: string
): Map<string, ApprovalPostStatus> {
  const map = new Map<string, ApprovalPostStatus>()
  const status: ApprovalPostStatus =
    batchStatus === 'approved'
      ? 'approved'
      : batchStatus === 'changes_requested'
        ? 'changes_requested'
        : 'pending'
  posts.forEach((p) => map.set(p.id, status))
  return map
}

/** Initialize feedbacks from existing client notes. */
function initFeedbacks(posts: ApprovalPostData[]): Record<string, string> {
  const result: Record<string, string> = {}
  posts.forEach((p) => {
    result[p.id] = p.client_note ?? ''
  })
  return result
}

export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [data, setData] = useState<ApprovalBatchData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [submittedStatus, setSubmittedStatus] = useState<'approved' | 'changes_requested' | null>(
    null
  )

  // Two-panel state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>('all')
  const [postStatuses, setPostStatuses] = useState<Map<string, ApprovalPostStatus>>(new Map())
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/approval/${token}`)
        if (res.status === 410) {
          setErrorMessage('This approval link has expired. Please ask your agency for a new one.')
          setPageState('error')
          return
        }
        if (!res.ok) {
          setErrorMessage('This link is invalid or has expired.')
          setPageState('error')
          return
        }
        const result = (await res.json()) as ApprovalBatchData
        setData(result)
        setPostStatuses(initStatuses(result.posts, result.status))
        setFeedbacks(initFeedbacks(result.posts))

        if (result.posts.length > 0) {
          setSelectedPostId(result.posts[0]!.id)
        }

        if (result.status !== 'pending') {
          setSubmittedStatus(result.status as 'approved' | 'changes_requested')
          setPageState('submitted')
        } else {
          setPageState('review')
        }
      } catch {
        setErrorMessage('Something went wrong. Please try again later.')
        setPageState('error')
      }
    }
    void load()
  }, [token])

  // Derived values
  const posts = data?.posts ?? []
  const filteredPosts = posts.filter((p) => {
    if (activeFilter === 'all') return true
    return postStatuses.get(p.id) === activeFilter
  })
  const selectedPost =
    filteredPosts.find((p) => p.id === selectedPostId) ?? filteredPosts[0] ?? null
  const selectedIndex = selectedPost ? filteredPosts.findIndex((p) => p.id === selectedPost.id) : -1
  const totalPending = countByStatus(postStatuses, 'pending')

  /** Submit the batch to the server. */
  const submitBatch = useCallback(
    async (statuses: Map<string, ApprovalPostStatus>, fb: Record<string, string>) => {
      setIsSubmitting(true)
      try {
        const hasChanges = Array.from(statuses.values()).some((s) => s === 'changes_requested')
        const status: 'approved' | 'changes_requested' = hasChanges
          ? 'changes_requested'
          : 'approved'

        const notes = Object.entries(fb)
          .filter(([, note]) => note.trim().length > 0)
          .map(([postId, note]) => ({ postId, note: note.trim() }))

        const result = await submitApproval(token, status, notes.length > 0 ? notes : undefined)
        if (!result.ok) {
          setErrorMessage(result.error || 'Failed to submit response')
          setPageState('error')
          return
        }
        setSubmittedStatus(status)
        setPageState('submitted')
      } catch {
        setErrorMessage('Something went wrong. Please try again.')
        setPageState('error')
      } finally {
        setIsSubmitting(false)
      }
    },
    [token]
  )

  /** Approve a single post locally, auto-submit if it was the last pending. */
  function handleApprovePost() {
    if (!selectedPost) return
    const next = new Map(postStatuses)
    next.set(selectedPost.id, 'approved')
    setPostStatuses(next)

    const remainingPending = countByStatus(next, 'pending')
    if (remainingPending === 0) {
      void submitBatch(next, feedbacks)
      return
    }

    // Auto-advance to next pending post
    const nextPending = filteredPosts.find(
      (p) => p.id !== selectedPost.id && next.get(p.id) === 'pending'
    )
    if (nextPending) setSelectedPostId(nextPending.id)
  }

  /** Mark a post as changes_requested with its feedback. */
  function handleRequestChanges() {
    if (!selectedPost) return
    const fb = feedbacks[selectedPost.id] ?? ''
    if (!fb.trim()) return // feedback required

    const next = new Map(postStatuses)
    next.set(selectedPost.id, 'changes_requested')
    setPostStatuses(next)

    const remainingPending = countByStatus(next, 'pending')
    if (remainingPending === 0) {
      void submitBatch(next, feedbacks)
      return
    }

    const nextPending = filteredPosts.find(
      (p) => p.id !== selectedPost.id && next.get(p.id) === 'pending'
    )
    if (nextPending) setSelectedPostId(nextPending.id)
  }

  /** Approve all remaining pending posts and submit the batch. */
  function handleApproveAll() {
    const next = new Map(postStatuses)
    posts.forEach((p) => {
      if (next.get(p.id) === 'pending') next.set(p.id, 'approved')
    })
    setPostStatuses(next)
    void submitBatch(next, feedbacks)
  }

  /** Navigate to prev/next post in the filtered list. */
  function handleNavigate(dir: 1 | -1) {
    const nextIdx = selectedIndex + dir
    const next = filteredPosts[nextIdx]
    if (next) setSelectedPostId(next.id)
  }

  /** Handle filter change with auto-select. */
  function handleFilterChange(f: ApprovalFilter) {
    setActiveFilter(f)
    const firstMatch = posts.find((p) => (f === 'all' ? true : postStatuses.get(p.id) === f))
    if (firstMatch) setSelectedPostId(firstMatch.id)
  }

  // --- Render states ---

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner size="lg" />
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="max-w-[420px] rounded-[12px] border border-ink/10 bg-surface p-8 text-center">
          <div className="mb-3 text-metric">⚠️</div>
          <p className="text-body font-medium text-ink">{errorMessage}</p>
        </div>
      </div>
    )
  }

  if (pageState === 'submitted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="max-w-[420px] rounded-[12px] border border-ink/10 bg-surface p-8 text-center">
          <div className="mb-3 text-metric">{submittedStatus === 'approved' ? '✅' : '📝'}</div>
          <h2 className="mb-2 font-display text-display font-normal text-ink">
            {submittedStatus === 'approved'
              ? 'Thank you! Your posts are confirmed.'
              : 'Your feedback has been sent to the team.'}
          </h2>
          <p className="text-body text-text2">You can close this page.</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <ReviewHeader
        agencyName={data.agencyName}
        clientName={data.clientName}
        dateRange={formatWeekRange(posts)}
        platform={derivePlatform(posts)}
        totalCount={posts.length}
        pendingCount={countByStatus(postStatuses, 'pending')}
        approvedCount={countByStatus(postStatuses, 'approved')}
        changesCount={countByStatus(postStatuses, 'changes_requested')}
      />

      <div className="flex flex-1 overflow-hidden">
        <PostList
          posts={posts}
          postStatuses={postStatuses}
          selectedPostId={selectedPost?.id ?? null}
          activeFilter={activeFilter}
          onSelectPost={(id) => setSelectedPostId(id)}
          onFilterChange={handleFilterChange}
        />

        {selectedPost ? (
          <PostDetail
            post={selectedPost}
            postIndex={selectedIndex}
            totalPosts={filteredPosts.length}
            status={postStatuses.get(selectedPost.id) ?? 'pending'}
            feedback={feedbacks[selectedPost.id] ?? ''}
            onFeedbackChange={(v) => setFeedbacks((prev) => ({ ...prev, [selectedPost.id]: v }))}
            onNavigate={handleNavigate}
            onApprove={handleApprovePost}
            onRequestChanges={handleRequestChanges}
            onApproveAll={handleApproveAll}
            totalPending={totalPending}
            isSubmitting={isSubmitting}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-paper p-10">
            <div className="mb-1.5 font-display text-display font-normal text-ink">All done</div>
            <div className="text-center text-body text-text2">
              All posts have been reviewed. The agency will be notified.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
