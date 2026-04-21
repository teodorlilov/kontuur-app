'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { qualityScoreBadgeClass } from '@/components/ui/colors/score-colors'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SlopDetector } from '@/components/posts/slop-detector'
import { PostContentDisplay } from '@/components/posts/post-content-display'
import type { CarouselSlide } from '@/types/api'
import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import { useScheduleModal } from '@/components/scheduling/use-schedule-modal'
import { ScheduleModal } from '@/components/scheduling/schedule-modal'
import type { ReviewPost } from '@/lib/review/filter-review-posts'
import type { SlopDetection, BestTimePlatform } from '@/types/api'
import { deriveSlopFromQuality as computeSlop } from '@/ai/validation/content-rules/compute-scores'

/** Derive slop data from carousel_quality_json if available (avoids a separate API call) */
function deriveSlopFromQuality(post: ReviewPost): SlopDetection | null {
  const q = post.carousel_quality_json as {
    human_score?: number
    ai_tells?: string[]
    worst_offending_phrase?: string | null
  } | null
  if (!q || typeof q.human_score !== 'number') return null
  return computeSlop({
    human_score: q.human_score,
    ai_tells: Array.isArray(q.ai_tells) ? q.ai_tells : [],
    worst_offending_phrase: q.worst_offending_phrase ?? null,
  })
}

interface ReviewPostCardProps {
  post: ReviewPost
  bestTimeData: BestTimePlatform[] | null
  onApprove: (postId: string) => void
  onDelete: (postId: string) => void
}

export function ReviewPostCard({ post, bestTimeData, onApprove, onDelete }: ReviewPostCardProps) {
  const {
    caption,
    slidesJson,
    slopResult,
    slopLoading,
    approving,
    deleting,
    rewriting,
    runSlopDetection,
    approve,
    deletePost,
    saveCaption,
    saveSlidesJson,
    rewrite,
  } = useReviewActions({
    postId: post.id,
    clientId: post.client_id,
    initialCaption: post.caption ?? '',
    initialSlidesJson: post.slides_json,
    postType: post.post_type,
    rewriteCount: post.rewrite_count ?? 0,
    initialSlop: deriveSlopFromQuality(post),
  })

  const scheduleModal = useScheduleModal()
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isCarousel = post.post_type === 'carousel'
  const slides = Array.isArray(slidesJson) ? (slidesJson as CarouselSlide[]) : []

  // Run slop detection on first expand
  useEffect(() => {
    if (!expanded) return
    const textForSlop = isCarousel
      ? `${caption}\n\n${slides.map((s) => `${s.headline}\n${s.body}`).join('\n\n')}`
      : caption
    runSlopDetection(textForSlop)
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleApproveClick() {
    scheduleModal.openModal()
  }

  async function handleScheduleDecision(scheduledAt: string | null) {
    scheduleModal.closeModal()
    await approve(() => onApprove(post.id), scheduledAt ?? undefined)
  }

  async function handleDelete() {
    await deletePost(() => onDelete(post.id))
    setConfirmDelete(false)
  }

  function handleCaptionChange(newCaption: string) {
    void saveCaption(newCaption)
  }

  function handleSlidesChange(newSlides: CarouselSlide[]) {
    void saveSlidesJson(newSlides)
  }

  async function handleRewrite() {
    await rewrite()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Health warning banner */}
      {post.is_health_niche && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2">
          <p className="text-xs text-amber-700 font-medium">Health content — review carefully</p>
        </div>
      )}

      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors flex-wrap"
      >
        <svg
          className={cn(
            'w-3.5 h-3.5 text-gray-400 transition-transform shrink-0',
            expanded && 'rotate-90'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {post.priority && <Badge variant="priority">Priority</Badge>}
        {post.pillar &&
          (() => {
            const pc = getPillarColor(post.pillar)
            return (
              <span className={cn('text-xs px-2 py-0.5 rounded-full', pc.bg, pc.text)}>
                {post.pillar}
              </span>
            )
          })()}
        <span className="text-xs font-medium text-gray-700">{post.client_name}</span>
        {post.platform && <Badge variant="info">{post.platform}</Badge>}
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            isCarousel ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'
          )}
        >
          {isCarousel ? `Carousel · ${slides.length} slides` : 'Single image'}
        </span>
        {post.quality_score_avg !== null && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              qualityScoreBadgeClass(post.quality_score_avg)
            )}
          >
            Score: {post.quality_score_avg}
          </span>
        )}
        <p className="text-sm text-gray-600 truncate ml-2 flex-1 min-w-0">{caption}</p>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 flex flex-col gap-5">
          {/* Post content — editable caption + slides */}
          <PostContentDisplay
            caption={caption}
            platform={post.platform}
            postType={post.post_type}
            slidesJson={slidesJson}
            priority={false}
            qualityScoreAvg={null}
            editable
            onCaptionChange={handleCaptionChange}
            onSlidesChange={handleSlidesChange}
          />

          {/* Slop detection */}
          {slopLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              Checking authenticity…
            </div>
          )}
          {slopResult && <SlopDetector result={slopResult} />}

          {/* Actions */}
          <div className="flex gap-2 pt-1 border-t border-gray-100 flex-wrap">
            <Button onClick={handleApproveClick} loading={approving} size="sm">
              Approve
            </Button>
            <Button
              onClick={() => {
                void handleRewrite()
              }}
              loading={rewriting}
              variant="secondary"
              size="sm"
            >
              {rewriting ? 'Rewriting...' : 'Rewrite'}
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-gray-500">Delete this post?</span>
                <Button
                  onClick={() => {
                    void handleDelete()
                  }}
                  loading={deleting}
                  variant="danger"
                  size="sm"
                >
                  Confirm
                </Button>
                <Button onClick={() => setConfirmDelete(false)} variant="ghost" size="sm">
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmDelete(true)}
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-red-600 ml-auto"
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      <ScheduleModal
        open={scheduleModal.isOpen}
        onClose={scheduleModal.closeModal}
        onSchedule={(scheduledAt) => {
          void handleScheduleDecision(scheduledAt)
        }}
        bestTimeData={bestTimeData}
        platform={post.platform}
        loading={approving}
        selectedDate={scheduleModal.selectedDate}
        setSelectedDate={scheduleModal.setSelectedDate}
        selectedTime={scheduleModal.selectedTime}
        setSelectedTime={scheduleModal.setSelectedTime}
      />
    </div>
  )
}
